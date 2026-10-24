import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceMailConfig } from "@/lib/email-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = "/api/internal/shopify-bridge/privacy";
const TOPICS = new Set(["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT", "SHOP_REDACT"]);

function reply(ok: boolean, status: number) {
  return NextResponse.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });
}
function validShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}
function authenticateBridge(request: Request, shop: string, appClientId: string, topic: string, data: unknown) {
  const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
  const allowed = (process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
  const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
  const signature = request.headers.get("x-aaryvo-bridge-signature") || "";
  if (secret.length < 32 || !allowed.includes(appClientId) ||
      !/^\d{13}$/.test(timestamp) || !/^[0-9a-f-]{36}$/i.test(nonce) ||
      !/^[0-9a-f]{64}$/i.test(signature) ||
      Math.abs(Date.now() - Number(timestamp)) > 120_000) return false;
  const hash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const canonical = [timestamp, nonce, shop, appClientId, topic, hash, "POST", PATH].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
type PrivacyCustomer = { email?: unknown; id?: unknown; phone?: unknown };
function customerEmail(payload: Record<string, unknown>) {
  const customer = payload.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as PrivacyCustomer).email;
  return typeof email === "string" && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.trim().toLowerCase() : null;
}

export async function POST(request: Request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json")
    return reply(false, 415);
  const raw = await request.text();
  if (raw.length > 250_000) return reply(false, 413);
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return reply(false, 400); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return reply(false, 400);
  const input = data as Record<string, unknown>;
  const shop = typeof input.shop === "string" ? input.shop.toLowerCase().trim() : "";
  const appClientId = typeof input.appClientId === "string" ? input.appClientId.trim() : "";
  const topic = typeof input.topic === "string" ? input.topic : "";
  const payload = input.payload;
  if (!validShop(shop) || !/^[a-f0-9]{32}$/i.test(appClientId) ||
      !TOPICS.has(topic) || !payload || typeof payload !== "object" || Array.isArray(payload))
    return reply(false, 400);
  if (!authenticateBridge(request, shop, appClientId, topic, payload)) return reply(false, 401);

  const event = payload as Record<string, unknown>;
  if (typeof event.shop_domain === "string" && event.shop_domain.toLowerCase() !== shop)
    return reply(false, 400);
  try {
    const link = await prisma.shopifyMerchantLink.findUnique({
      where: { shopDomain_appClientId: { shopDomain: shop, appClientId } },
      select: { businessId: true, business: { select: { billingChannel: true, notificationEmail: true } } },
    });
    // Replayed privacy webhooks must be safely idempotent after prior deletion.
    if (!link) return reply(true, 200);
    if (link.business.billingChannel !== "SHOPIFY") return reply(false, 403);
    const businessId = link.businessId;

    if (topic === "SHOP_REDACT") {
      // A Shopify-only workspace belongs to this store. Do not destroy a
      // workspace shared by a different app or other shop.
      const links = await prisma.shopifyMerchantLink.count({ where: { businessId } });
      if (links !== 1) return reply(false, 409);
      await prisma.business.delete({ where: { id: businessId } });
      return reply(true, 200);
    }

    const email = customerEmail(event);
    // AARYVO does not persist Shopify customer IDs. Only link matching
    // voluntarily submitted storefront leads using a known email address.
    if (!email) return reply(true, 200);
    const leads = await prisma.lead.findMany({
      where: { businessId, email: { equals: email } },
      select: { id: true, conversationId: true, name: true, email: true, phone: true,
        requirement: true, budget: true, status: true },
    });
    if (!leads.length) return reply(true, 200);

    if (topic === "CUSTOMERS_REDACT") {
      const leadIds = leads.map(lead => lead.id);
      const conversationIds = leads.map(lead => lead.conversationId).filter((v): v is string => Boolean(v));
      await prisma.$transaction(async tx => {
        await tx.appointment.deleteMany({ where: { businessId, leadId: { in: leadIds } } });
        await tx.lead.deleteMany({ where: { businessId, id: { in: leadIds } } });
        if (conversationIds.length) await tx.conversation.deleteMany({
          where: { id: { in: conversationIds }, agent: { businessId } },
        });
      });
      return reply(true, 200);
    }

    if (topic === "CUSTOMERS_DATA_REQUEST") {
      // Shopify doesn't consume data returned from the webhook. Send the
      // merchant's data export to the configured, verified workspace contact.
      const destination = link.business.notificationEmail;
      if (!destination || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination))
        return reply(false, 503);
      const mail = await workspaceMailConfig(businessId);
      if (!mail) return reply(false, 503);
      const ids = leads.map(lead => lead.conversationId).filter((v): v is string => Boolean(v));
      const conversations = ids.length ? await prisma.conversation.findMany({
        where: { id: { in: ids }, agent: { businessId } },
        select: { id: true, messages: { select: { role: true, content: true, createdAt: true },
          orderBy: { createdAt: "asc" }, take: 50 } },
      }) : [];
      const data = {
        shop,
        customerEmail: email,
        leads,
        conversations,
      };
      await mail.transporter.sendMail({
        from: mail.from,
        to: destination,
        subject: "AARYVO customer data access request",
        text: "Shopify customer data request. This is the AARYVO storefront information associated with the matching email address. Review and respond to the customer as required.\n\n" +
          JSON.stringify(data, null, 2),
      });
      return reply(true, 200);
    }
    return reply(false, 400);
  } catch (error) {
    // Never log a webhook payload, customer email, or other personal data.
    console.error("AARYVO privacy webhook processing failed", error instanceof Error ? error.name : "unknown");
    return reply(false, 503);
  }
}
