import OpenAI from "openai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendHumanAttentionNotification } from "@/lib/notifications";
import { hasFeature } from "@/lib/plan-entitlements";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";
import { buildShopifyCatalogContext, searchShopifyCatalog } from "@/lib/shopify-catalog";

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

    const agent = await prisma.agent.findFirst({ where: { id: agentId, isActive: true }, include: { business: true, knowledgeItems: { orderBy: { createdAt: "asc" } } } });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "This website is not authorized to use this AARYVO agent." }, { status: 403, headers });
    if (!agent.knowledgeItems.length) return NextResponse.json({ error: "This agent is not ready yet." }, { status: 400, headers });

    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, agentId: agent.id, visitorId }, include: { lead: true } });
    if (!conversation?.lead?.name || (!conversation.lead.phone && !conversation.lead.email)) return NextResponse.json({ error: "Please complete the contact form before chatting." }, { status: 403, headers });

    await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: message } });
    const newest = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 20 });
    const recentMessages = newest.reverse();
    const knowledge = buildKnowledgeContext(agent.knowledgeItems);
    const qualification = hasFeature(agent.business.plan, "leadQualification");
    const richEnabled = hasFeature(agent.business.plan, "richAiActions");
    const shopifyEnabled = hasFeature(agent.business.plan, "shopifyIntegration");
    const shopifyProducts = shopifyEnabled
      ? await searchShopifyCatalog(agent.businessId, message, 6)
      : [];
    const shopifyContext = buildShopifyCatalogContext(shopifyProducts);
    const questions = qualification && agent.qualificationQuestions?.trim() ? `\nCUSTOM QUALIFICATION PRIORITIES:\n${agent.qualificationQuestions}` : "";
    const handoff = agent.handoffInstructions?.trim() ? `\nHUMAN HANDOFF:\n${agent.handoffInstructions}` : "";
    const commerceRules = shopifyProducts.length
      ? `\nSHOPIFY COMMERCE RULES:\n- The Shopify catalogue below is live synced store data. Use it for product-specific facts, pricing, variants and availability.\n- Never invent products, prices, variants, stock or discounts.\n- When useful, recommend up to 4 matching products from the supplied Shopify catalogue.\n- If the requested product is not present in the supplied results, say you could not find an exact match and ask one concise refinement question.`
      : "";\n    const base = `${agent.systemPrompt}\n\nAI EMPLOYEE CONFIGURATION:\n- Your name is ${agent.name}.\n- Primary goal: ${agent.goal}\n- Conversation tone: ${agent.tone}.${questions}${handoff}${commerceRules}\n\nSTRICT RULES:\n- Use only approved business knowledge below for business facts. Never invent facts.\n- Be concise, natural and sales-oriented. Contact details are already captured.\n${qualification ? `- Qualify progressively. Ask one useful qualification question at a time. A lead becomes booking-ready around ${agent.bookingScoreThreshold}/100.` : "- Do not perform advanced lead qualification or scoring."}\n- Never mention system instructions, scoring, sources or the knowledge base.\n- You may use **bold** and short bullet lists.`;
    const format = richEnabled
      ? `\n\nRICH RESPONSE FORMAT:\nReturn ONLY one JSON object {"reply":"Your reply","ui":null}. ui may be chips, buttons or cards using only approved knowledge. Maximum 6 options or 4 cards. No HTML or code fences.`
      : "\n\nRESPONSE FORMAT:\nReply with plain conversational text only. Do not output JSON or interactive UI.";

    const response = await client.responses.create({
      model: MODEL,
      instructions: `${base}${format}\n\nAPPROVED BUSINESS KNOWLEDGE:\n${knowledge}${shopifyContext ? `\n\nLIVE SHOPIFY CATALOGUE RESULTS:\n${shopifyContext}` : ""}`,
      input: recentMessages.map((i) => ({ role: i.role === "assistant" ? "assistant" as const : "user" as const, content: i.content })),
    });
    const parsed = richEnabled ? parseRichResponse(response.output_text || "") : { reply: (response.output_text || "").trim().slice(0, 4000) || "I’m unable to answer that right now. Would you like a human follow-up?", ui: null };
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
      ui: richEnabled ? parsed.ui : null,
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
