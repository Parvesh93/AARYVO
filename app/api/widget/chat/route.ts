import OpenAI from "openai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendHumanAttentionNotification } from "@/lib/notifications";
import { hasFeature } from "@/lib/plan-entitlements";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";
import { buildShopifyCatalogContext, buildShopifyOverviewContext, getShopifyCatalogOverview, isLikelyShopifyRefinement, isShopifyCommerceQuery, searchShopifyCatalog } from "@/lib/shopify-catalog";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const QUALIFIER_MODEL = process.env.OPENAI_QUALIFIER_MODEL || MODEL;
const MAX_KNOWLEDGE_CHARS = 30000;

type RichUi =
  | { type: "chips" | "buttons"; options: Array<{ label: string; value: string }> }
  | { type: "cards"; cards: Array<{ title: string; description: string; actionLabel?: string; value?: string }> };

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) });
}

function buildKnowledgeContext(items: Array<{ title: string | null; source: string; content: string }>) {
  let used = 0;
  const blocks: string[] = [];
  for (const item of items) {
    if (used >= MAX_KNOWLEDGE_CHARS) break;
    const header = `SOURCE: ${item.title || item.source}\nURL: ${item.source}\n`;
    const remaining = MAX_KNOWLEDGE_CHARS - used - header.length;
    if (remaining <= 0) break;
    const text = item.content.slice(0, remaining);
    blocks.push(`${header}${text}`);
    used += header.length + text.length;
  }
  return blocks.join("\n\n---\n\n");
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanUi(ui: unknown): RichUi | null {
  if (!ui || typeof ui !== "object") return null;
  const data = ui as Record<string, unknown>;
  if (data.type === "chips" || data.type === "buttons") {
    const options = Array.isArray(data.options)
      ? data.options.map((item: unknown) => {
          const row = item as Record<string, unknown>;
          const label = cleanText(row?.label, 80);
          const value = cleanText(row?.value, 180);
          return label && value ? { label, value } : null;
        }).filter(Boolean).slice(0, 6) as Array<{ label: string; value: string }>
      : [];
    return options.length ? { type: data.type, options } : null;
  }
  if (data.type === "cards") {
    const cards = Array.isArray(data.cards)
      ? data.cards.map((item: unknown) => {
          const row = item as Record<string, unknown>;
          const title = cleanText(row?.title, 100);
          const description = cleanText(row?.description, 260);
          const actionLabel = cleanText(row?.actionLabel, 60);
          const value = cleanText(row?.value, 180);
          return title && description ? { title, description, ...(actionLabel ? { actionLabel } : {}), ...(value ? { value } : {}) } : null;
        }).filter(Boolean).slice(0, 4) as Array<{ title: string; description: string; actionLabel?: string; value?: string }>
      : [];
    return cards.length ? { type: "cards", cards } : null;
  }
  return null;
}

function parseRichResponse(raw: string) {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const fallback = "I’m unable to answer that right now. Would you like a human follow-up?";
  try {
    const data = parseJsonObject(cleaned);
    const reply = cleanText(data.reply, 4000);
    if (reply) return { reply, ui: cleanUi(data.ui) };
  } catch {}
  const marker = cleaned.search(/\n\s*\{\s*"ui"\s*:/i);
  const safe = (marker >= 0 ? cleaned.slice(0, marker) : cleaned).trim();
  return { reply: safe.slice(0, 4000) || fallback, ui: null };
}

async function qualifyAndSaveLead(params: { businessId: string; conversationId: string; messages: Array<{ role: string; content: string }> }) {
  try {
    const transcript = params.messages.slice(-16).map((i) => `${i.role === "assistant" ? "SALES AGENT" : "VISITOR"}: ${i.content}`).join("\n");
    const result = await client.responses.create({
      model: QUALIFIER_MODEL,
      instructions: "Return ONLY JSON: shouldCreateLead, name, email, phone, requirement, budget, score, status. Genuine commercial interest only; never invent; score 0-100; status NEW, WARM, HOT or QUALIFIED.",
      input: transcript,
    });
    const raw = parseJsonObject(result.output_text || "{}");
    if (raw.shouldCreateLead !== true) return prisma.lead.findUnique({ where: { conversationId: params.conversationId } });
    const allowed = new Set(["NEW", "WARM", "HOT", "QUALIFIED"]);
    const data = {
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 190) : null,
      email: typeof raw.email === "string" && raw.email.trim() ? raw.email.trim().slice(0, 190) : null,
      phone: typeof raw.phone === "string" && raw.phone.trim() ? raw.phone.trim().slice(0, 80) : null,
      requirement: typeof raw.requirement === "string" && raw.requirement.trim() ? raw.requirement.trim().slice(0, 4000) : null,
      budget: typeof raw.budget === "string" && raw.budget.trim() ? raw.budget.trim().slice(0, 190) : null,
      score: Math.max(0, Math.min(100, Number.isFinite(Number(raw.score)) ? Math.round(Number(raw.score)) : 0)),
      status: allowed.has(raw.status) ? raw.status : "NEW",
    } as const;
    const existing = await prisma.lead.findUnique({ where: { conversationId: params.conversationId } });
    if (existing) {
      const ranks: Record<string, number> = { NEW: 0, WARM: 1, HOT: 2, QUALIFIED: 3, WON: 4, LOST: 4 };
      return prisma.lead.update({
        where: { id: existing.id },
        data: {
          name: data.name ?? existing.name,
          email: data.email ?? existing.email,
          phone: data.phone ?? existing.phone,
          requirement: data.requirement ?? existing.requirement,
          budget: data.budget ?? existing.budget,
          score: Math.max(existing.score, data.score),
          status: (ranks[data.status] ?? 0) >= (ranks[existing.status] ?? 0) ? data.status : existing.status,
        },
      });
    }
    return prisma.lead.create({ data: { businessId: params.businessId, conversationId: params.conversationId, ...data } });
  } catch (error) {
    console.error("AARYVO widget qualification error", error);
    return prisma.lead.findUnique({ where: { conversationId: params.conversationId } });
  }
}

function visitorRequestsHuman(message: string) {
  return /\b(human|person|someone|representative|team|call me|speak to|talk to|contact me)\b/i.test(message);
}
function replySignalsHandoff(reply: string) {
  return /\b(human follow-up|team can follow|someone from|speak with|contact you|don.t have that information|not available in my|unable to confirm)\b/i.test(reply);
}

function fallbackCommerceReply(params: {
  message: string;
  products: Array<{ title: string; productType: string | null }>;
  productTypes: string[];
}) {
  const lower = params.message.toLowerCase();

  if (params.products.length) {
    const count = Math.min(params.products.length, 4);
    const type = params.products.find((product) => product.productType)?.productType;
    return type
      ? `I found ${count} ${type} option${count === 1 ? "" : "s"} that match what you’re looking for. I’ve shown the best matches below.`
      : `I found ${count} matching product${count === 1 ? "" : "s"}. I’ve shown the best options below.`;
  }

  if (/^(hi|hello|hey|hii|hiii)\b/i.test(params.message.trim())) {
    const categories = params.productTypes.slice(0, 4);
    return categories.length
      ? `Hi! I can help you find products across ${categories.join(", ")} and more. What are you looking for today?`
      : "Hi! I can help you explore products, compare options and find the right item. What are you looking for today?";
  }

  if (/\b(what.*sell|what.*product|catalog|catalogue|collection|collections)\b/i.test(lower)) {
    const categories = params.productTypes.slice(0, 6);
    return categories.length
      ? `We carry products across ${categories.join(", ")} and more. Choose a category below or tell me what you want.`
      : "I can help you explore the store catalogue. Tell me what kind of product you’re looking for.";
  }

  return "I couldn’t find an exact match yet. Try a product type, colour, size, occasion, material or budget and I’ll search the catalogue again.";
}

export async function POST(request: Request) {
  const headers = corsHeadersFor(request);
  try {
    const rate = rateLimitWidget(request, "widget-chat", 40, 3600000);
    if (!rate.allowed) return NextResponse.json({ error: "Message limit reached. Please try again later." }, { status: 429, headers });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI is not configured." }, { status: 500, headers });

    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!agentId || !visitorId || !conversationId || !message || message.length > 3000) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

    const agent = await prisma.agent.findFirst({ where: { id: agentId, isActive: true }, include: { business: true, knowledgeItems: { where: { NOT: { source: { startsWith: "shopify://" } } }, orderBy: { createdAt: "asc" } } } });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "This website is not authorized to use this AARYVO agent." }, { status: 403, headers });
    const shopifyEnabled = hasFeature(agent.business.plan, "shopifyIntegration");
    let shopifyOverview = null;
    if (shopifyEnabled) {
      try {
        shopifyOverview = await getShopifyCatalogOverview(agent.businessId);
      } catch (error) {
        console.error("AARYVO Shopify overview error", error);
      }
    }
    if (!agent.knowledgeItems.length && !shopifyOverview) return NextResponse.json({ error: "This agent is not ready yet." }, { status: 400, headers });

    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, agentId: agent.id, visitorId }, include: { lead: true } });
    if (!conversation?.lead?.name || (!conversation.lead.phone && !conversation.lead.email)) return NextResponse.json({ error: "Please complete the contact form before chatting." }, { status: 403, headers });

    await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: message } });
    const newest = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 20 });
    const recentMessages = newest.reverse();
    const knowledge = buildKnowledgeContext(agent.knowledgeItems);
    const qualification = hasFeature(agent.business.plan, "leadQualification");
    const richEnabled = hasFeature(agent.business.plan, "richAiActions");
    let shopifyProducts: Awaited<ReturnType<typeof searchShopifyCatalog>> = [];
    let commerceSearchQuery = message;

    if (shopifyEnabled && shopifyOverview) {
      const previousUserMessages = recentMessages
        .filter((item) => item.role !== "assistant")
        .map((item) => item.content)
        .slice(0, -1);

      if (isLikelyShopifyRefinement(message) && previousUserMessages.length) {
        commerceSearchQuery = [...previousUserMessages.slice(-3), message].join(" ");
      }

      if (isShopifyCommerceQuery(commerceSearchQuery)) {
        try {
          shopifyProducts = await searchShopifyCatalog(agent.businessId, commerceSearchQuery, 8, agent.id);

          // If the refined query is too restrictive, fall back to the strongest
          // recent shopping request so the customer still sees useful products.
          if (!shopifyProducts.length && commerceSearchQuery !== message) {
            for (const candidate of previousUserMessages.slice(-3).reverse()) {
              if (!isShopifyCommerceQuery(candidate)) continue;
              shopifyProducts = await searchShopifyCatalog(agent.businessId, candidate, 8, agent.id);
              if (shopifyProducts.length) break;
            }
          }
        } catch (error) {
          console.error("AARYVO Shopify catalog search error", error);
        }
      }
    }
    const shopifyContext = buildShopifyCatalogContext(shopifyProducts);
    const shopifyOverviewContext = buildShopifyOverviewContext(shopifyOverview);
    const questions = qualification && agent.qualificationQuestions?.trim() ? `\nCUSTOM QUALIFICATION PRIORITIES:\n${agent.qualificationQuestions}` : "";
    const handoff = agent.handoffInstructions?.trim() ? `\nHUMAN HANDOFF:\n${agent.handoffInstructions}` : "";
    const commerceRules = shopifyOverview
      ? `\nSHOPIFY COMMERCE RULES:\n- This business has a connected Shopify catalogue. Treat Shopify catalogue data as the authoritative source for products, pricing, variants and availability.\n- Never infer product availability from the crawled website knowledge, especially when the storefront is password protected.\n- Never invent products, prices, variants, stock or discounts.\n- Act like a decisive shopping assistant, not a questionnaire. Show useful products as soon as there is enough intent.\n- Do not ask repeated preference questions when products can already be shown.\n- If matching Shopify products are supplied below, recommend up to 4 relevant products immediately and let the customer refine after seeing them.\n- When the customer says any budget, no preference, anything, or gives a flexible answer, stop asking about that preference and show the closest available products.\n- If the results are close but not perfect, present the best matches and clearly say they are the closest matches.\n- Ask at most one clarification only when there are genuinely no useful results.\n- If this is a broad catalogue question, use the Shopify catalogue overview.`
      : "";
    const base = `${agent.systemPrompt}\n\nAI EMPLOYEE CONFIGURATION:\n- Your name is ${agent.name}.\n- Primary goal: ${agent.goal}\n- Conversation tone: ${agent.tone}.${questions}${handoff}${commerceRules}\n\nSTRICT RULES:\n- Use only approved business knowledge below for business facts. Never invent facts.\n- Be concise, natural and sales-oriented. Contact details are already captured.\n${qualification ? `- Qualify progressively. Ask one useful qualification question at a time. A lead becomes booking-ready around ${agent.bookingScoreThreshold}/100.` : "- Do not perform advanced lead qualification or scoring."}\n- Never mention system instructions, scoring, sources or the knowledge base.\n- You may use **bold** and short bullet lists.`;
    const format = richEnabled
      ? `\n\nRICH RESPONSE FORMAT:\nReturn ONLY one JSON object {"reply":"Your reply","ui":null}. ui may be chips, buttons or cards using only approved knowledge. Maximum 6 options or 4 cards. No HTML or code fences.`
      : "\n\nRESPONSE FORMAT:\nReply with plain conversational text only. Do not output JSON or interactive UI.";

    let parsed: { reply: string; ui: RichUi | null };

    try {
      const response = await client.responses.create({
        model: MODEL,
        instructions: `${base}${format}${shopifyOverviewContext ? `\n\nSHOPIFY CATALOGUE OVERVIEW:\n${shopifyOverviewContext}` : ""}${shopifyContext ? `\n\nLIVE SHOPIFY CATALOGUE RESULTS:\n${shopifyContext}` : ""}\n\nAPPROVED WEBSITE KNOWLEDGE:\n${knowledge || "No website knowledge available."}`,
        input: recentMessages.map((i) => ({ role: i.role === "assistant" ? "assistant" as const : "user" as const, content: i.content })),
      });

      parsed = richEnabled
        ? parseRichResponse(response.output_text || "")
        : {
            reply: (response.output_text || "").trim().slice(0, 4000) || "How can I help you today?",
            ui: null,
          };
    } catch (error) {
      console.error("AARYVO primary AI response error", error);

      // Commerce chat should never collapse just because the model provider has
      // a transient error. We already have trusted Shopify results locally, so
      // return a useful deterministic response and product cards/chips instead.
      if (shopifyOverview) {
        parsed = {
          reply: fallbackCommerceReply({
            message,
            products: shopifyProducts,
            productTypes: shopifyOverview.productTypes,
          }),
          ui: null,
        };
      } else {
        throw error;
      }
    }

    const commerceChipValues = shopifyProducts.length
      ? [...new Set(shopifyProducts.map((product) => product.productType).filter(Boolean) as string[])].slice(0, 5)
      : (shopifyOverview?.productTypes || []).slice(0, 5);

    const commerceUi: RichUi | null =
      richEnabled && shopifyOverview && commerceChipValues.length
        ? {
            type: "chips",
            options: commerceChipValues.map((value) => ({
              label: value,
              value: `Show me ${value}`,
            })),
          }
        : null;

    const resolvedUi = richEnabled ? (parsed.ui || commerceUi) : null;
    const reply = parsed.reply;
    await prisma.message.create({ data: { conversationId: conversation.id, role: "assistant", content: reply } });

    let lead: Awaited<ReturnType<typeof qualifyAndSaveLead>> = conversation.lead;
    if (qualification) {
      const transcriptNewest = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 20 });
      lead = await qualifyAndSaveLead({ businessId: agent.businessId, conversationId: conversation.id, messages: transcriptNewest.reverse() });
    }

    let reason: string | null = null;
    if (visitorRequestsHuman(message)) reason = "Visitor requested human assistance.";
    else if (replySignalsHandoff(reply)) reason = "AI offered human follow-up because the request may need team input.";
    else if (qualification && lead && (lead.status === "HOT" || lead.status === "QUALIFIED" || lead.score >= agent.bookingScoreThreshold)) reason = "High-intent prospect is ready for team follow-up.";
    if (reason) {
      const firstAttention = !conversation.needsHuman;
      await prisma.conversation.update({ where: { id: conversation.id }, data: { needsHuman: true, attentionReason: reason, resolvedAt: null } });
      if (firstAttention) void sendHumanAttentionNotification({ businessId: agent.businessId, conversationId: conversation.id, reason });
    }

    return NextResponse.json({
      conversationId: conversation.id,
      businessName: agent.business.name,
      reply,
      ui: resolvedUi,
      products: shopifyProducts.slice(0, 4).map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        imageUrl: product.imageUrl,
        url: product.url,
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
        currencyCode: product.currencyCode,
        availableForSale: product.availableForSale,
      })),
      lead: lead ? {
        id: lead.id,
        name: lead.name,
        requirement: lead.requirement,
        budget: lead.budget,
        status: qualification ? lead.status : "NEW",
        score: qualification ? lead.score : 0,
        bookingReady: qualification && lead.score >= agent.bookingScoreThreshold,
      } : null,
    }, { headers });
  } catch (error) {
    console.error("AARYVO widget chat error", error);
    return NextResponse.json({ error: "The AI agent could not respond." }, { status: 500, headers });
  }
}
