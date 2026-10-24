import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { entitlementsForPlan, hasFeature } from "@/lib/plan-entitlements";
import { readShopifyFunnelSummary, countShopifyPaidClickConversions } from "@/lib/shopify-funnel";
import { listQuery, searchPage } from "@/lib/shopify-merchant-list";
import { businessUsagePeriod } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = "/api/internal/shopify-bridge/merchant";
const MAX_AGE_MS = 120_000;
const allowedResources = new Set([
  "overview", "products", "assistant", "widget", "conversations", "leads",
  "knowledge", "appointments", "analytics", "settings",
]);

type JsonRecord = Record<string, unknown>;
function response(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
function validShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}
function plain(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function safeString(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit
    ? value.trim() : null;
}
function textField(value: unknown, limit: number) {
  return typeof value === "string" && value.length <= limit ? value.trim() : null;
}
function bool(value: unknown) { return typeof value === "boolean" ? value : null; }
function integer(value: unknown, low: number, high: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= low && value <= high
    ? value : null;
}
function allowUpdate(input: JsonRecord, fields: Record<string, (v: unknown) => unknown>) {
  const updates: JsonRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in fields)) throw new Error("Unsupported setting: " + key);
    const result = fields[key](value);
    if (result === null || result === undefined) throw new Error("Invalid value for " + key);
    updates[key] = result;
  }
  if (!Object.keys(updates).length) throw new Error("No settings provided.");
  return updates;
}
function enumField(values: readonly string[]) {
  return (value: unknown) => typeof value === "string" && values.includes(value) ? value : null;
}
function verify(request: Request, shop: string, appClientId: string, resource: string,
  operation: string, data: JsonRecord) {
  const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
  const allowed = (process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS || "")
    .split(",").map(v => v.trim()).filter(Boolean);
  if (secret.length < 32 || !allowed.includes(appClientId)) return false;
  const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
  const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
  const signature = request.headers.get("x-aaryvo-bridge-signature") || "";
  if (!/^\d{13}$/.test(timestamp) || !/^[0-9a-f-]{36}$/i.test(nonce) ||
      !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || Math.abs(Date.now() - time) > MAX_AGE_MS) return false;
  const hash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const canonical = [timestamp, nonce, shop, appClientId, resource, operation, hash, "POST", PATH].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return response({ ok: false, message: "JSON required." }, 415);
  }
  const raw = await request.text();
  if (raw.length > 32_000) return response({ ok: false, message: "Request too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return response({ ok: false, message: "Invalid JSON." }, 400); }
  if (!plain(body)) return response({ ok: false, message: "Invalid request." }, 400);
  const shop = typeof body.shop === "string" ? body.shop.toLowerCase().trim() : "";
  const appClientId = typeof body.appClientId === "string" ? body.appClientId.trim() : "";
  const resource = typeof body.resource === "string" ? body.resource : "";
  const operation = typeof body.operation === "string" ? body.operation : "";
  const data = plain(body.data) ? body.data : {};
  if (!validShop(shop) || !/^[a-f0-9]{32}$/i.test(appClientId) || !allowedResources.has(resource) ||
      !/^(read|save|detail|resolve|create|delete)$/.test(operation) || !plain(body.data)) {
    return response({ ok: false, message: "Invalid resource request." }, 400);
  }
  if (!verify(request, shop, appClientId, resource, operation, data)) {
    return response({ ok: false, message: "Unauthorized." }, 401);
  }

  try {
    // Every lookup is scoped by the Shopify-authenticated shop, the allowlisted
    // Shopify app identity and the connected ShopifyStore's business ID.
    const link = await prisma.shopifyMerchantLink.findUnique({
      where: { shopDomain_appClientId: { shopDomain: shop, appClientId } },
      select: { businessId: true },
    });
    if (!link) return response({ ok: false, message: "Connect this store to AARYVO first." }, 403);
    const store = await prisma.shopifyStore.findUnique({
      where: { shopDomain: shop },
      select: { id: true, businessId: true, status: true },
    });
    if (!store || store.businessId !== link.businessId || store.status !== "CONNECTED") {
      return response({ ok: false, message: "Shopify workspace connection is not active." }, 403);
    }
    const business = await prisma.business.findUnique({
      where: { id: link.businessId },
      select: {
        id: true, name: true, plan: true, billingChannel: true, subscriptionStatus: true,
        monthlyConversationLimit: true, usagePeriodStart: true, usagePeriodEnd: true,
        notificationEmail: true, notifyNewLead: true, notifyHotLead: true,
        notifyAppointment: true, notifyHumanAttention: true,
        bookingTimeZone: true, bookingSlotMinutes: true, bookingStartHour: true,
        bookingEndHour: true, bookingDaysAhead: true, bookingWorkingDays: true,
      },
    });
    if (!business || business.billingChannel !== "SHOPIFY") {
      return response({ ok: false, message: "Not a Shopify-billed workspace." }, 403);
    }
    const businessId = business.id;
    const agent = await prisma.agent.findFirst({
      where: { businessId }, orderBy: { id: "asc" },
    });
    const eligible = business.subscriptionStatus.toUpperCase() === "ACTIVE";
    const feature = (name: Parameters<typeof hasFeature>[1]) =>
      eligible && hasFeature(business.plan, name);
    const requires = (name: Parameters<typeof hasFeature>[1]) =>
      feature(name) ? null : response({ ok: false, message: "An active eligible Shopify plan is required for this feature." }, 403);

    if (resource === "overview" && operation === "read") {
      // Match the exact period used by widget quota enforcement.
      // Previously this endpoint used a stale usagePeriodStart (which billing
      // verification could refresh to "now") and displayed 0 incorrectly.
      const period = businessUsagePeriod(business);
      const [conversationCount, monthlyUsage, leadCount, appointments, attention, recent] = await Promise.all([
        prisma.conversation.count({ where: { agent: { businessId } } }),
        prisma.conversation.count({ where: {
          agent: { businessId },
          startedAt: { gte: period.start, lt: period.end },
        } }),
        prisma.lead.count({ where: { businessId } }),
        prisma.appointment.count({ where: { businessId } }),
        prisma.conversation.count({ where: { agent: { businessId }, needsHuman: true, resolvedAt: null } }),
        prisma.conversation.findMany({
          where: { agent: { businessId } }, take: 6, orderBy: { startedAt: "desc" },
          select: { id: true, startedAt: true, needsHuman: true, lead: {
            select: { name: true, status: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
          },
        }),
      ]);
      return response({ ok: true, shop, resource, data: {
        store: shop, name: business.name, plan: business.plan, subscriptionStatus: business.subscriptionStatus,
        monthlyConversationLimit: business.monthlyConversationLimit, monthlyUsage,
        usagePeriodStart: period.start.toISOString(),
        usagePeriodEnd: period.end.toISOString(),
        conversationCount, leadCount, appointments, attention,
        agent: agent ? { name: agent.name, active: agent.isActive } : null,
        recent: recent.map(item => ({
          id: item.id, startedAt: item.startedAt.toISOString(),
          needsHuman: item.needsHuman, customer: item.lead?.name || "Shopper",
          leadStatus: item.lead?.status || null,
          preview: item.messages[0]?.content.slice(0, 250) || "",
        })),
      } });
    }

    if (resource === "products" && operation === "read") {
      const page = integer(data.page, 0, 100) ?? 0;
      const pageSize = 50;
      const query = typeof data.search === "string" ? data.search.trim().slice(0, 80) : "";
      const where = {
        storeId: store.id,
        ...(query ? { title: { contains: query } } : {}),
      };
      const [total, items] = await Promise.all([
        prisma.shopifyProduct.count({ where }),
        prisma.shopifyProduct.findMany({
          where, orderBy: { title: "asc" }, skip: page * pageSize, take: pageSize,
          select: {
            id: true, title: true, handle: true, status: true, productType: true,
            currencyCode: true, minPrice: true, maxPrice: true,
            onlineStoreUrl: true, featuredImageUrl: true, syncedAt: true,
            variants: { take: 50, select: { availableForSale: true } },
          },
        }),
      ]);
      return response({ ok: true, shop, resource, data: {
        total, page, pageSize, search: query,
        items: items.map(p => ({
          id: p.id, title: p.title, status: p.status || "UNKNOWN",
          type: p.productType || "", currencyCode: p.currencyCode || "INR",
          minPrice: p.minPrice, maxPrice: p.maxPrice,
          imageUrl: p.featuredImageUrl || null,
          url: p.onlineStoreUrl || (p.handle ? "https://" + shop + "/products/" + encodeURIComponent(p.handle) : null),
          available: p.variants.some(v => v.availableForSale),
          syncedAt: p.syncedAt.toISOString(),
        })),
      } });
    }

    if (resource === "assistant") {
      if (!agent) return response({ ok: false, message: "No AI assistant configured." }, 404);
      if (operation === "read") {
        return response({ ok: true, shop, resource, data: {
          name: agent.name, goal: agent.goal, tone: agent.tone, systemPrompt: agent.systemPrompt,
          qualificationQuestions: agent.qualificationQuestions || "",
          handoffInstructions: agent.handoffInstructions || "",
          bookingScoreThreshold: agent.bookingScoreThreshold, isActive: agent.isActive,
        } });
      }
      if (operation === "save") {
        const values = allowUpdate(data, {
          name: v => safeString(v, 90), goal: v => safeString(v, 2000),
          tone: enumField(["Professional", "Friendly", "Consultative", "Concise", "Premium"]),
          systemPrompt: v => safeString(v, 12000),
          qualificationQuestions: v => textField(v, 4000),
          handoffInstructions: v => textField(v, 4000),
          bookingScoreThreshold: v => integer(v, 20, 100),
          isActive: bool,
        });
        await prisma.agent.update({ where: { id: agent.id }, data: values });
        return response({ ok: true, shop, resource, message: "AI assistant settings saved." });
      }
    }

    if (resource === "widget") {
      if (!agent) return response({ ok: false, message: "No AI assistant configured." }, 404);
      const fields = {
        widgetTitle: "title", widgetSubtitle: "subtitle", widgetWelcomeMessage: "welcomeMessage",
        widgetStartLabel: "startLabel", widgetBookLabel: "bookLabel",
        widgetAccentColor: "accentColor", widgetTheme: "theme", widgetPosition: "position",
        widgetLauncherStyle: "launcherStyle", widgetLauncherLabel: "launcherLabel",
        widgetLauncherAnimation: "launcherAnimation", widgetLauncherLabelEnabled: "launcherLabelEnabled",
        widgetShowPoweredBy: "showPoweredBy", widgetConversationMode: "conversationMode",
        widgetWhatsappEnabled: "whatsappEnabled", widgetWhatsappNumber: "whatsappNumber",
        widgetWhatsappLabel: "whatsappLabel", widgetWhatsappMessage: "whatsappMessage",
      } as const;
      if (operation === "read") {
        const obj: JsonRecord = {};
        for (const [database, client] of Object.entries(fields)) {
          const val = agent[database as keyof typeof agent];
          obj[client] = val ?? (typeof val === "boolean" ? false : "");
        }
        return response({ ok: true, shop, resource, data: {
          ...obj, entitlements: entitlementsForPlan(business.plan),
          eligible, plan: business.plan, subscriptionStatus: business.subscriptionStatus,
          store: shop,
        } });
      }
      if (operation === "save") {
        const inputs = allowUpdate(data, {
          title: v => safeString(v, 80), subtitle: v => textField(v, 120),
          welcomeMessage: v => safeString(v, 1200),
          startLabel: v => safeString(v, 80), bookLabel: v => safeString(v, 80),
          accentColor: v => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null,
          theme: enumField(["LIGHT", "DARK"]),
          position: enumField(["RIGHT", "LEFT"]),
          launcherStyle: enumField(["SPARKLE", "CHAT", "TEXT", "BAG", "FASHION", "FOOTWEAR", "SKINCARE", "LUGGAGE", "FMCG", "ROBOT"]),
          launcherLabel: v => safeString(v, 60),
          launcherAnimation: enumField(["NONE", "PULSE", "GLOW", "BOUNCE"]),
          launcherLabelEnabled: bool,
          showPoweredBy: bool,
          conversationMode: enumField(["LEAD_FIRST", "CONVERSATION_FIRST"]),
          whatsappEnabled: bool,
          whatsappNumber: v => typeof v === "string" && /^[0-9+ -]{0,22}$/.test(v) ? v : null,
          whatsappLabel: v => safeString(v, 80),
          whatsappMessage: v => safeString(v, 1000),
        });
        if (inputs.whatsappEnabled === true) {
          const configured = typeof inputs.whatsappNumber === "string"
            ? inputs.whatsappNumber : agent.widgetWhatsappNumber;
          const digits = String(configured || "").replace(/\D/g, "");
          if (!/^[1-9][0-9]{7,14}$/.test(digits)) {
            return response({ ok: false, message: "Enter a valid WhatsApp number with country code (8–15 digits)." }, 400);
          }
        }
        const advanced = ["launcherLabel", "launcherAnimation", "launcherLabelEnabled"];
        const branding = ["title", "subtitle", "welcomeMessage", "accentColor", "theme", "position", "launcherStyle", "showPoweredBy"];
        if (!feature("advancedWidgetControls") && advanced.some(k => k in inputs)) return response({ ok: false, message: "Growth plan required for launcher controls." }, 403);
        if (!feature("customWidgetBranding") && branding.some(k => k in inputs)) return response({ ok: false, message: "Growth plan required for widget branding." }, 403);
        if (!feature("whatsappHandoff") &&
          ["whatsappEnabled", "whatsappNumber", "whatsappLabel", "whatsappMessage"].some(k => k in inputs)) {
          return response({ ok: false, message: "Starter plan required for WhatsApp handoff." }, 403);
        }
        const update: JsonRecord = {};
        for (const [database, client] of Object.entries(fields)) {
          if (client in inputs) update[database] = inputs[client];
        }
        await prisma.agent.update({ where: { id: agent.id }, data: update });
        return response({ ok: true, shop, resource, message: "Storefront widget settings saved." });
      }
    }

    if (resource === "conversations") {
      const gate = requires("conversationHistory"); if (gate) return gate;
      if (operation === "read") {
        const query = listQuery(data);
        const status = data.status === "attention" || data.status === "resolved" ? data.status : "all";
        const where = {
          agent: { businessId },
          ...(status === "attention" ? { needsHuman: true, resolvedAt: null } :
            status === "resolved" ? { resolvedAt: { not: null } } : {}),
          ...(query.search ? { OR: [
            { lead: { is: { name: { contains: query.search } } } },
            { lead: { is: { email: { contains: query.search } } } },
            { id: { contains: query.search } },
          ] } : {}),
        };
        const [total, items] = await Promise.all([
          prisma.conversation.count({ where }),
          prisma.conversation.findMany({
            where, orderBy: [{ startedAt: "desc" }, { id: "desc" }],
            skip: query.page * query.pageSize, take: query.pageSize,
            select: { id: true, channel: true, startedAt: true,
              needsHuman: true, resolvedAt: true, attentionReason: true,
              lead: { select: { name: true, email: true, score: true } },
              messages: { take: 1, orderBy: { createdAt: "desc" }, select: { content: true } },
            },
          }),
        ]);
        return response({ ok: true, shop, resource, data: searchPage(items.map(c => ({
          id: c.id, channel: c.channel, startedAt: c.startedAt.toISOString(),
          needsHuman: c.needsHuman, resolvedAt: c.resolvedAt?.toISOString() || null,
          attentionReason: c.attentionReason || "",
          customer: c.lead?.name || "Shopper", email: c.lead?.email || "",
          score: c.lead?.score || 0, preview: c.messages[0]?.content.slice(0, 220) || "",
        })), total, query, { status }) });
      }
      if (operation === "detail") {
        const id = safeString(data.id, 50);
        if (!id) return response({ ok: false, message: "Invalid conversation." }, 400);
        const c = await prisma.conversation.findFirst({
          where: { id, agent: { businessId } }, select: {
            id: true, needsHuman: true, attentionReason: true,
            _count: { select: { messages: true } },
            messages: { take: 150, orderBy: { createdAt: "desc" },
              select: { role: true, content: true, createdAt: true } },
          },
        });
        if (!c) return response({ ok: false, message: "Conversation not found." }, 404);
        return response({ ok: true, shop, resource, data: {
          id: c.id, needsHuman: c.needsHuman, attentionReason: c.attentionReason || "",
          totalMessages: c._count.messages, truncated: c._count.messages > 150,
          messages: [...c.messages].reverse().map(m => ({
            ...m, createdAt: m.createdAt.toISOString(),
          })),
        } });
      }
      if (operation === "resolve") {
        const id = safeString(data.id, 50);
        if (!id) return response({ ok: false, message: "Invalid conversation." }, 400);
        const result = await prisma.conversation.updateMany({
          where: { id, agent: { businessId } },
          data: { needsHuman: false, resolvedAt: new Date() },
        });
        if (!result.count) return response({ ok: false, message: "Conversation not found." }, 404);
        return response({ ok: true, shop, resource, message: "Conversation marked resolved." });
      }
    }

    if (resource === "leads") {
      if (operation === "read") {
        const query = listQuery(data);
        const stage = ["NEW","WARM","HOT","QUALIFIED","WON","LOST"].includes(String(data.status))
          ? String(data.status) : "all";
        const where = {
          businessId,
          ...(stage !== "all" ? { status: stage as "NEW"|"WARM"|"HOT"|"QUALIFIED"|"WON"|"LOST" } : {}),
          ...(query.search ? { OR: [
            { name: { contains: query.search } },
            { email: { contains: query.search } },
            { phone: { contains: query.search } },
            { requirement: { contains: query.search } },
          ] } : {}),
        };
        const [total, rows] = await Promise.all([
          prisma.lead.count({ where }),
          prisma.lead.findMany({
            where, skip: query.page * query.pageSize, take: query.pageSize,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, name: true, email: true, phone: true, requirement: true,
              status: true, score: true, followUpStatus: true,
              followUpNote: true, followUpDueAt: true, createdAt: true },
          }),
        ]);
        return response({ ok: true, shop, resource, data: searchPage(rows.map(row => ({
          ...row, score: feature("leadScoring") ? row.score : null,
          followUpDueAt: row.followUpDueAt?.toISOString() || null,
          createdAt: row.createdAt.toISOString(),
        })), total, query, { status: stage }) });
      }
      if (operation === "save") {
        const id = safeString(data.id, 50);
        if (!id) return response({ ok: false, message: "Invalid lead." }, 400);
        const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "id"));
        const dueAt = rest.followUpDueAt;
        const dueAtSupplied = Object.prototype.hasOwnProperty.call(rest, "followUpDueAt");
        delete rest.followUpDueAt;
        const values = allowUpdate(rest, {
          status: enumField(["NEW", "WARM", "HOT", "QUALIFIED", "WON", "LOST"]),
          followUpStatus: enumField(["PENDING", "CONTACTED", "COMPLETED", "NOT_REQUIRED"]),
          followUpNote: v => textField(v, 4000),
        });
        if ("status" in values && !feature("leadScoring")) return response({ ok: false, message: "Starter plan required for lead scoring." }, 403);
        if (("followUpStatus" in values || "followUpNote" in values || dueAtSupplied) &&
            !feature("followUpWorkflow")) {
          return response({ ok: false, message: "Growth plan required for follow-up workflow." }, 403);
        }
        if (dueAtSupplied) {
          if (dueAt === "") {
            values.followUpDueAt = null;
          } else if (typeof dueAt === "string" &&
                     /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dueAt) &&
                     Number.isFinite(Date.parse(dueAt)) &&
                     Date.parse(dueAt) > Date.UTC(2000,0,1) &&
                     Date.parse(dueAt) < Date.UTC(2100,0,1)) {
            values.followUpDueAt = new Date(dueAt);
          } else {
            return response({ ok: false, message: "Invalid follow-up date." }, 400);
          }
        }
        const result = await prisma.lead.updateMany({ where: { id, businessId }, data: values });
        if (!result.count) return response({ ok: false, message: "Lead not found." }, 404);
        return response({ ok: true, shop, resource, message: "Lead updated." });
      }
    }

    if (resource === "knowledge") {
      // Match the same active assistant used by Shopify's storefront script.
      const activeKnowledgeAgent = await prisma.agent.findFirst({
        where: { businessId, isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (!activeKnowledgeAgent) return response({ ok: false, message: "No active AI assistant configured." }, 404);
      // MariaDB installations may have mixed utf8mb4_unicode_ci and
      // utf8mb4_bin collations. Prisma "startsWith" produces LIKE, which
      // fails with error 1267 on these installations. Compare a fixed ASCII
      // source prefix as binary bytes instead (0x6d616e75616c3a = "manual:").
      // Every dynamic value remains a bound query parameter.
      const manualPrefix = "LEFT(CAST(`source` AS BINARY), 7) = 0x6d616e75616c3a";
      const countManualKnowledge = async () => {
        const counts = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(
          "SELECT COUNT(*) AS total FROM `knowledgeitem` WHERE `agentId` = ? AND " + manualPrefix,
          activeKnowledgeAgent.id,
        );
        return Number(counts[0]?.total ?? 0);
      };
      if (operation === "read") {
        const query = listQuery(data);
        const source = data.source === "manual" || data.source === "automatic" ? data.source : "all";
        const rowFields = { id: true, source: true, title: true,
          content: true, createdAt: true } as const;
        let total: number;
        let rows: Array<{id: string; source: string; title: string | null;
          content: string; createdAt: Date}>;
        if (source === "all" && !query.search) {
          // Default library stays index-friendly and uses the normal ORM.
          const result = await Promise.all([
            prisma.knowledgeItem.count({ where: {agentId: activeKnowledgeAgent.id} }),
            prisma.knowledgeItem.findMany({
              where: {agentId: activeKnowledgeAgent.id},
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              skip: query.page * query.pageSize, take: query.pageSize,
              select: rowFields,
            }),
          ]);
          total = result[0];
          rows = result[1];
        } else {
          // Avoid Prisma LIKE for source and title filtering, as it can fail
          // with collations mixed by the MariaDB adapter. SQL fragments below
          // are fixed server-side strings; the search term remains bound.
          const clauses = ["`agentId` = ?"];
          const params: Array<string | number> = [activeKnowledgeAgent.id];
          if (source !== "all") {
            clauses.push(source === "manual" ? manualPrefix : "NOT (" + manualPrefix + ")");
          }
          if (query.search) {
            clauses.push("LOCATE(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci, " +
              "CONVERT(COALESCE(`title`, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci) > 0");
            params.push(query.search);
          }
          const base = " FROM `knowledgeitem` WHERE " + clauses.join(" AND ");
          const [counts, identifiers] = await Promise.all([
            prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(
              "SELECT COUNT(*) AS total" + base, ...params,
            ),
            prisma.$queryRawUnsafe<Array<{ id: string }>>(
              "SELECT `id`" + base +
                " ORDER BY `createdAt` DESC, `id` DESC LIMIT ? OFFSET ?",
              ...params, query.pageSize, query.page * query.pageSize,
            ),
          ]);
          total = Number(counts[0]?.total ?? 0);
          const ids = identifiers.map(item => item.id);
          const fetched = ids.length ? await prisma.knowledgeItem.findMany({
            where: { agentId: activeKnowledgeAgent.id, id: { in: ids } },
            select: rowFields,
          }) : [];
          const byId = new Map(fetched.map(item => [item.id, item]));
          rows = ids.flatMap(id => { const item = byId.get(id); return item ? [item] : []; });
        }
        return response({ ok: true, shop, resource, data: searchPage(rows.map(row => ({
          id: row.id, source: row.source, title: row.title || row.source,
          // Manual content editable, Shopify-synced content read-only.
          content: row.content.slice(0, row.source.startsWith("manual:") ? 12000 : 1000),
          editable: row.source.startsWith("manual:"),
          createdAt: row.createdAt.toISOString(),
        })), total, query, { source }) });
      }
      if (operation === "create") {
        const title = safeString(data.title, 120);
        const content = safeString(data.content, 12000);
        if (!title || !content) return response({ ok: false, message: "Add a title and knowledge content." }, 400);
        const count = await countManualKnowledge();
        if (count >= 100) return response({ ok: false, message: "Maximum 100 manual knowledge items." }, 400);
        // Provide an explicit primary key for compatibility with older
        // production MySQL tables that may not match Prisma's generated ID
        // default. Never overwrite automatically synced Shopify records.
        const uniqueId = crypto.randomUUID();
        await prisma.knowledgeItem.create({ data: {
          id: uniqueId,
          agentId: activeKnowledgeAgent.id,
          title,
          content,
          source: "manual:shopify-admin:" + uniqueId,
        } });
        return response({ ok: true, shop, resource, message: "Knowledge entry added." });
      }
      if (operation === "save" || operation === "delete") {
        const id = safeString(data.id, 50);
        if (!id) return response({ ok: false, message: "Invalid knowledge entry." }, 400);
        // Check ownership and source without LIKE, then require the exact
        // immutable source in the mutation to prevent editing synced entries.
        const existing = await prisma.knowledgeItem.findFirst({
          where: { id, agentId: activeKnowledgeAgent.id }, select: { source: true },
        });
        if (!existing?.source.startsWith("manual:")) return response({
          ok: false, message: "Manual knowledge entry not found or invalid.",
        }, 404);
        const where = { id, agentId: activeKnowledgeAgent.id, source: existing.source };
        const result = operation === "delete"
          ? await prisma.knowledgeItem.deleteMany({ where })
          : await (async () => {
              const title = safeString(data.title, 120);
              const content = safeString(data.content, 12000);
              if (!title || !content) return { count: 0 };
              return prisma.knowledgeItem.updateMany({ where, data: { title, content } });
            })();
        if (!result.count) return response({ ok: false, message: "Manual knowledge entry not found or invalid." }, 404);
        return response({ ok: true, shop, resource, message: operation === "delete" ? "Entry deleted." : "Entry updated." });
      }
    }

    if (resource === "appointments") {
      const gate = requires("appointments"); if (gate) return gate;
      if (operation === "read") {
        const rows = await prisma.appointment.findMany({
          where: { businessId }, take: 100, orderBy: { startsAt: "desc" },
          select: { id: true, startsAt: true, status: true, notes: true,
            lead: { select: { name: true, email: true, phone: true } } },
        });
        return response({ ok: true, shop, resource, data: rows.map(a => ({
          id: a.id, startsAt: a.startsAt.toISOString(), status: a.status, notes: a.notes || "",
          name: a.lead?.name || "Shopper", email: a.lead?.email || "", phone: a.lead?.phone || "",
        })) });
      }
      if (operation === "save") {
        const id = safeString(data.id, 50);
        const status = enumField(["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED"])(data.status);
        if (!id || !status) return response({ ok: false, message: "Invalid appointment update." }, 400);
        const result = await prisma.appointment.updateMany({ where: { id, businessId }, data: { status } });
        if (!result.count) return response({ ok: false, message: "Appointment not found." }, 404);
        return response({ ok: true, shop, resource, message: "Appointment updated." });
      }
    }

    if (resource === "analytics" && operation === "detail") {
      const days: 7 | 30 | 90 = data.days === 7 || data.days === 90 ? data.days : 30;
      const ids = data.conversationIds;
      if (!Array.isArray(ids) || ids.length > 60 ||
          ids.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{10,80}$/.test(id))) {
        return response({ ok: false, message: "Invalid paid-order conversation references." }, 400);
      }
      const convertedConversations = await countShopifyPaidClickConversions(
        businessId, [...new Set(ids as string[])], days,
      );
      return response({ ok: true, shop, resource,
        data: { convertedConversations } });
    }

    if (resource === "analytics" && operation === "read") {
      const days: 7 | 30 | 90 = data.days === 7 || data.days === 90 ? data.days : 30;
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const [count, leads, appointments, recent, attention, won] = await Promise.all([
        prisma.conversation.count({ where: { agent: { businessId }, startedAt: { gte: since } } }),
        prisma.lead.count({ where: { businessId, createdAt: { gte: since } } }),
        prisma.appointment.count({ where: { businessId, createdAt: { gte: since } } }),
        prisma.conversation.findMany({
          where: { agent: { businessId }, startedAt: { gte: since } },
          take: 10000, select: { startedAt: true },
        }),
        prisma.conversation.count({ where: { agent: { businessId }, needsHuman: true, resolvedAt: null } }),
        prisma.lead.count({ where: { businessId, status: "WON" } }),
      ]);
      const counts = new Map<string, number>();
      for (const row of recent) {
        const date = row.startedAt.toISOString().slice(0, 10);
        counts.set(date, (counts.get(date) || 0) + 1);
      }
      const trend = Array.from({ length: days }, (_, i) => {
        const date = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
        return { date, conversations: counts.get(date) || 0 };
      });
      let funnel: Awaited<ReturnType<typeof readShopifyFunnelSummary>> |
        { available: false; message: string };
      try {
        funnel = await readShopifyFunnelSummary(businessId, store.id, days);
      } catch (error) {
        console.error("AARYVO Shopify funnel analytics unavailable",
          error instanceof Error ? error.message : "unknown");
        funnel = {
          available: false,
          message: "Recommendation funnel tracking is unavailable. Check that the latest Hostinger backend is deployed and its MySQL user can create the funnel event table.",
        };
      }
      return response({ ok: true, shop, resource, data: {
        conversations: count, leads, appointments, attention, won,
        monthlyConversationLimit: business.monthlyConversationLimit,
        days, trend, partialTrend: recent.length === 10000,
        funnel,
      } });
    }

    if (resource === "settings") {
      if (operation === "read") {
        const keys = [
          "notificationEmail", "notifyNewLead", "notifyHotLead", "notifyAppointment",
          "notifyHumanAttention", "bookingTimeZone", "bookingSlotMinutes",
          "bookingStartHour", "bookingEndHour", "bookingDaysAhead", "bookingWorkingDays",
        ] as const;
        const result: JsonRecord = {};
        for (const key of keys) result[key] = business[key];
        return response({ ok: true, shop, resource, data: result });
      }
      if (operation === "save") {
        const values = allowUpdate(data, {
          notificationEmail: v => typeof v === "string" && (v === "" ||
            (v.length <= 180 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) ? v : null,
          notifyNewLead: bool, notifyHotLead: bool, notifyAppointment: bool, notifyHumanAttention: bool,
          bookingTimeZone: v => safeString(v, 90) && (() => {
            try { new Intl.DateTimeFormat("en", { timeZone: String(v) }); return String(v); }
            catch { return null; }
          })(),
          bookingSlotMinutes: v => [15, 30, 45, 60].includes(Number(v)) ? Number(v) : null,
          bookingStartHour: v => integer(v, 0, 22),
          bookingEndHour: v => integer(v, 1, 23),
          bookingDaysAhead: v => integer(v, 1, 30),
          bookingWorkingDays: v => typeof v === "string" &&
            /^(?:[0-6])(?:,[0-6]){0,6}$/.test(v) ? v : null,
        });
        if ("bookingStartHour" in values || "bookingEndHour" in values) {
          const start = Number(values.bookingStartHour ?? business.bookingStartHour);
          const end = Number(values.bookingEndHour ?? business.bookingEndHour);
          if (end <= start) return response({ ok: false, message: "Booking end time must be after start." }, 400);
        }
        await prisma.business.update({ where: { id: businessId }, data: values });
        return response({ ok: true, shop, resource, message: "Workspace settings saved." });
      }
    }

    return response({ ok: false, message: "This operation is not available." }, 400);
  } catch (error) {
    // A production error code is actionable without disclosing SQL, private
    // knowledge, credentials, database names or internal stack traces.
    const reference = crypto.randomUUID().slice(0, 8);
    const code = typeof error === "object" && error !== null &&
      "code" in error && typeof error.code === "string"
      ? error.code : "UNKNOWN";
    console.error("Shopify merchant dashboard bridge failed", {
      resource, operation, reference, code,
      detail: error instanceof Error ? error.message : "Unknown error",
    });
    if (resource === "knowledge" && ["create", "save", "delete"].includes(operation)) {
      const known: Record<string, string> = {
        P1001: "The AARYVO database is unreachable. Check the backend database connection.",
        P1002: "The AARYVO database timed out. Please retry shortly.",
        P2000: "The knowledge entry is too large for the database. Shorten the text and retry.",
        P2002: "A duplicate knowledge entry ID was generated. Please retry.",
        P2003: "The Shopify assistant's knowledge database relationship is invalid. Contact support.",
        P2011: "A required knowledge database field is missing. Contact support.",
        P2021: "The knowledge database table is missing. Apply the production database migrations.",
        P2022: "A knowledge database column is missing. Apply the production database migrations.",
      };
      return response({ ok: false, code: "KNOWLEDGE_WRITE_FAILED",
        reference, message: (known[code] ||
          "Could not save this knowledge entry. Contact support with error reference " + reference + "."),
      }, 500);
    }
    return response({ ok: false, message: "Unable to complete this dashboard operation. Please try again." }, 500);
  }
}
