import OpenAI from "openai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveWidgetRichMessage } from "@/lib/widget-rich-history";
import { sendHumanAttentionNotification } from "@/lib/notifications";
import { hasFeature } from "@/lib/plan-entitlements";
import {
  corsHeadersFor,
  isAllowedWidgetOrigin,
  rateLimitWidget,
} from "@/lib/widget-security";
import {
  buildShopifyCatalogContext,
  buildShopifyOverviewContext,
  getShopifyCatalogOverview,
  getShopifyProductFromPage,
  searchShopifyCatalog,
  type ShopifyCatalogProduct,
} from "@/lib/shopify-catalog";
import {
  buildCommerceClarification,
  buildCommerceProductReply,
  buildCommerceRecommendationQuery,
  buildCommerceRefinementUi,
  deriveCommerceState,
  desiredCommerceProductCount,
  isSimpleGreeting,
  looksLikeCommerceIntent,
  shouldClarifyCommerceBeforeProducts,
} from "@/lib/commerce-assistant";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const QUALIFIER_MODEL = process.env.OPENAI_QUALIFIER_MODEL || MODEL;
const MAX_KNOWLEDGE_CHARS = 30000;

type RichUi =
  | {
      type: "chips" | "buttons";
      options: Array<{ label: string; value: string }>;
    }
  | {
      type: "cards";
      cards: Array<{
        title: string;
        description: string;
        actionLabel?: string;
        value?: string;
      }>;
    };

type WidgetActions = {
  booking: boolean;
  whatsapp: boolean;
};

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersFor(request),
  });
}

function buildKnowledgeContext(
  items: Array<{ title: string | null; source: string; content: string }>,
) {
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
  const cleaned = value
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
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
      ? (data.options
          .map((item: unknown) => {
            const row = item as Record<string, unknown>;
            const label = cleanText(row?.label, 80);
            const value = cleanText(row?.value, 180);
            return label && value ? { label, value } : null;
          })
          .filter(Boolean)
          .slice(0, 6) as Array<{ label: string; value: string }>)
      : [];

    return options.length ? { type: data.type, options } : null;
  }

  if (data.type === "cards") {
    const cards = Array.isArray(data.cards)
      ? (data.cards
          .map((item: unknown) => {
            const row = item as Record<string, unknown>;
            const title = cleanText(row?.title, 100);
            const description = cleanText(row?.description, 260);
            const actionLabel = cleanText(row?.actionLabel, 60);
            const value = cleanText(row?.value, 180);

            return title && description
              ? {
                  title,
                  description,
                  ...(actionLabel ? { actionLabel } : {}),
                  ...(value ? { value } : {}),
                }
              : null;
          })
          .filter(Boolean)
          .slice(0, 4) as Array<{
          title: string;
          description: string;
          actionLabel?: string;
          value?: string;
        }>)
      : [];

    return cards.length ? { type: "cards", cards } : null;
  }

  return null;
}

function parseRichResponse(raw: string) {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const fallback =
    "I’m unable to answer that right now. Would you like a human follow-up?";

  try {
    const data = parseJsonObject(cleaned);
    const reply = cleanText(data.reply, 4000);
    if (reply) return { reply, ui: cleanUi(data.ui) };
  } catch {}

  const marker = cleaned.search(/\n\s*\{\s*"ui"\s*:/i);
  const safe = (marker >= 0 ? cleaned.slice(0, marker) : cleaned).trim();

  return {
    reply: safe.slice(0, 4000) || fallback,
    ui: null,
  };
}

async function qualifyAndSaveLead(params: {
  businessId: string;
  conversationId: string;
  messages: Array<{ role: string; content: string }>;
}) {
  try {
    const transcript = params.messages
      .slice(-16)
      .map(
        (item) =>
          `${item.role === "assistant" ? "SALES AGENT" : "VISITOR"}: ${item.content}`,
      )
      .join("\n");

    const result = await client.responses.create({
      model: QUALIFIER_MODEL,
      instructions:
        "Return ONLY JSON: shouldCreateLead, name, email, phone, requirement, budget, score, status. Genuine commercial interest only; never invent; score 0-100; status NEW, WARM, HOT or QUALIFIED.",
      input: transcript,
    });

    const raw = parseJsonObject(result.output_text || "{}");

    if (raw.shouldCreateLead !== true) {
      return prisma.lead.findUnique({
        where: { conversationId: params.conversationId },
      });
    }

    const allowed = new Set(["NEW", "WARM", "HOT", "QUALIFIED"]);
    const data = {
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 190)
          : null,
      email:
        typeof raw.email === "string" && raw.email.trim()
          ? raw.email.trim().slice(0, 190)
          : null,
      phone:
        typeof raw.phone === "string" && raw.phone.trim()
          ? raw.phone.trim().slice(0, 80)
          : null,
      requirement:
        typeof raw.requirement === "string" && raw.requirement.trim()
          ? raw.requirement.trim().slice(0, 4000)
          : null,
      budget:
        typeof raw.budget === "string" && raw.budget.trim()
          ? raw.budget.trim().slice(0, 190)
          : null,
      score: Math.max(
        0,
        Math.min(
          100,
          Number.isFinite(Number(raw.score)) ? Math.round(Number(raw.score)) : 0,
        ),
      ),
      status: allowed.has(raw.status) ? raw.status : "NEW",
    } as const;

    const existing = await prisma.lead.findUnique({
      where: { conversationId: params.conversationId },
    });

    if (existing) {
      const ranks: Record<string, number> = {
        NEW: 0,
        WARM: 1,
        HOT: 2,
        QUALIFIED: 3,
        WON: 4,
        LOST: 4,
      };

      return prisma.lead.update({
        where: { id: existing.id },
        data: {
          name: data.name ?? existing.name,
          email: data.email ?? existing.email,
          phone: data.phone ?? existing.phone,
          requirement: data.requirement ?? existing.requirement,
          budget: data.budget ?? existing.budget,
          score: Math.max(existing.score, data.score),
          status:
            (ranks[data.status] ?? 0) >= (ranks[existing.status] ?? 0)
              ? data.status
              : existing.status,
        },
      });
    }

    return prisma.lead.create({
      data: {
        businessId: params.businessId,
        conversationId: params.conversationId,
        ...data,
      },
    });
  } catch (error) {
    console.error("AARYVO widget qualification error", error);
    return prisma.lead.findUnique({
      where: { conversationId: params.conversationId },
    });
  }
}

function visitorRequestsHuman(message: string) {
  return /\b(human|person|someone|representative|team|call me|speak to|talk to|contact me|sales person|salesperson)\b/i.test(
    message,
  );
}

function visitorRequestsBooking(message: string) {
  return /(?:\b(?:book|schedule)\b.{0,35}\b(?:consultation|appointment|call|meeting|demo|slot)\b|\b(?:consultation|appointment|meeting|demo)\b)/i.test(
    message,
  );
}

function visitorRequestsWhatsApp(message: string) {
  return /\b(whatsapp|what'?s app|continue on whatsapp|chat on whatsapp|message on whatsapp)\b/i.test(
    message,
  );
}

function replySignalsHandoff(reply: string) {
  return /\b(human follow-up|team can follow|someone from|speak with|contact you|don.t have that information|not available in my|unable to confirm)\b/i.test(
    reply,
  );
}

function leadIsReady(
  lead: { status: string; score: number } | null,
  threshold: number,
) {
  return Boolean(
    lead &&
      (lead.status === "HOT" ||
        lead.status === "QUALIFIED" ||
        lead.score >= threshold),
  );
}

function productPayload(products: ShopifyCatalogProduct[]) {
  return products.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    url: product.url,
    minPrice: product.minPrice,
    maxPrice: product.maxPrice,
    currencyCode: product.currencyCode,
    availableForSale: product.availableForSale,
    variants: product.variants
      .filter((variant) => variant.availableForSale)
      .slice(0, 12)
      .map((variant) => ({
        id: variant.shopifyVariantId,
        title: variant.title,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        availableForSale: variant.availableForSale,
        optionSummary: variant.optionSummary,
      })),
  }));
}

function uniqueProducts(products: ShopifyCatalogProduct[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function diversifyProducts(
  products: ShopifyCatalogProduct[],
  desired: number,
) {
  const available = uniqueProducts(
    products.filter((product) => product.availableForSale),
  );
  const output: ShopifyCatalogProduct[] = [];
  const used = new Set<string>();

  // First pass: one strong option from each product type.
  for (const product of available) {
    const key = (product.productType || product.vendor || product.title)
      .trim()
      .toLowerCase();
    if (!key || used.has(key)) continue;
    used.add(key);
    output.push(product);
    if (output.length >= desired) return output;
  }

  // Second pass: fill remaining slots by original relevance order.
  for (const product of available) {
    if (output.some((item) => item.id === product.id)) continue;
    output.push(product);
    if (output.length >= desired) break;
  }

  return output;
}

async function broadenAvailableSelection(params: {
  businessId: string;
  agentId: string;
  current: ShopifyCatalogProduct[];
  desired: number;
}) {
  let output = uniqueProducts(
    params.current.filter((product) => product.availableForSale),
  );

  try {
    const broad = await searchShopifyCatalog(
      params.businessId,
      "products available",
      12,
      params.agentId,
    );
    output = uniqueProducts([
      ...output,
      ...broad.filter((product) => product.availableForSale),
    ]);
  } catch (error) {
    console.error("AARYVO broad available product search error", error);
  }

  return diversifyProducts(output, params.desired);
}

async function fillWithAvailableAlternatives(params: {
  businessId: string;
  agentId: string;
  current: ShopifyCatalogProduct[];
  sourceMatches: ShopifyCatalogProduct[];
  baseIntent: string;
  desired: number;
}) {
  let output = uniqueProducts(params.current.filter((product) => product.availableForSale));

  if (output.length >= params.desired) {
    return output.slice(0, params.desired);
  }

  const typeCandidates = [...new Set(
    params.sourceMatches
      .map((product) => product.productType?.trim())
      .filter(Boolean) as string[],
  )].slice(0, 4);

  const queries = [
    ...typeCandidates.map((type) => `${type} available`),
    params.baseIntent ? `${params.baseIntent} available` : "",
    "available products",
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const matches = await searchShopifyCatalog(
        params.businessId,
        query,
        Math.max(params.desired, 10),
        params.agentId,
      );
      output = uniqueProducts([
        ...output,
        ...matches.filter((product) => product.availableForSale),
      ]);
      if (output.length >= params.desired) break;
    } catch (error) {
      console.error("AARYVO available alternative search error", error);
    }
  }

  return output.slice(0, params.desired);
}

async function generateCommerceSalesReply(params: {
  message: string;
  searchQuery: string;
  products: ShopifyCatalogProduct[];
  alternative: boolean;
  recentMessages: Array<{ role: string; content: string }>;
  fallback: string;
}) {
  if (!params.products.length) return params.fallback;

  try {
    const productContext = buildShopifyCatalogContext(
      params.products.slice(0, 8),
    ).slice(0, 14000);

    const transcript = params.recentMessages
      .slice(-8)
      .map(
        (item) =>
          `${item.role === "assistant" ? "SALESPERSON" : "CUSTOMER"}: ${item.content}`,
      )
      .join("\n");

    const response = await client.responses.create({
      model: MODEL,
      instructions: `You are a skilled in-store ecommerce salesperson.
Write only the short customer-facing reply that appears above product cards.

Rules:
- Use ONLY the supplied live Shopify product facts.
- Sound natural and specific to what the customer asked; do not repeat a stock template.
- Mention one or two actual product names when that helps the recommendation.
- Briefly explain why they fit using only supplied title, description, tags, variants, availability or price.
- Do NOT invent gifting suitability, material, features, discounts or availability.
- If these are alternatives rather than exact matches, say that naturally.
- Products are already being displayed below, so never say you cannot show listings.
- Do not ask another generic budget/style/occasion question after products are shown.
- At most one short refinement suggestion may be included.
- Keep it to 1-3 concise sentences. No JSON.`,
      input: `CUSTOMER'S CURRENT MESSAGE:
${params.message}

CURRENT SHOPPING INTENT:
${params.searchQuery}

ALTERNATIVES: ${params.alternative ? "yes" : "no"}

RECENT CONVERSATION:
${transcript}

LIVE SHOPIFY MATCHES:
${productContext}`,
    });

    const reply = (response.output_text || "").trim().slice(0, 900);
    return reply || params.fallback;
  } catch (error) {
    console.error("AARYVO commerce sales reply error", error);
    return params.fallback;
  }
}

export async function POST(request: Request) {
  const headers = corsHeadersFor(request);

  try {
    const rate = rateLimitWidget(request, "widget-chat", 40, 3600000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Message limit reached. Please try again later." },
        { status: 429, headers },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI is not configured." },
        { status: 500, headers },
      );
    }

    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId =
      typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : null;
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    const pageUrl =
      typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 2000) : "";
    const pageTitle =
      typeof body.pageTitle === "string" ? body.pageTitle.slice(0, 300) : "";

    if (
      !agentId ||
      !visitorId ||
      !conversationId ||
      !message ||
      message.length > 3000
    ) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers },
      );
    }

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, isActive: true },
      include: { business: true },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found." },
        { status: 404, headers },
      );
    }

    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) {
      return NextResponse.json(
        { error: "This website is not authorized to use this AARYVO agent." },
        { status: 403, headers },
      );
    }

    const shopifyEnabled = hasFeature(
      agent.business.plan,
      "shopifyIntegration",
    );
    const qualificationEnabled = hasFeature(
      agent.business.plan,
      "leadQualification",
    );
    const richEnabled = hasFeature(agent.business.plan, "richAiActions");
    const bookingFeatureEnabled = hasFeature(
      agent.business.plan,
      "appointments",
    );
    const whatsappFeatureEnabled =
      hasFeature(agent.business.plan, "whatsappHandoff") &&
      agent.widgetWhatsappEnabled &&
      Boolean(agent.widgetWhatsappNumber);

    let websiteKnowledgeItems: Array<{
      title: string | null;
      source: string;
      content: string;
    }> = [];

    try {
      const allKnowledgeItems = await prisma.knowledgeItem.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: "asc" },
      });

      websiteKnowledgeItems = allKnowledgeItems.filter(
        (item) => !item.source.startsWith("shopify://"),
      );
    } catch (error) {
      console.error("AARYVO website knowledge read error", error);
    }

    let shopifyConnected = false;
    let shopifyOverview = null;
    let currentPageProduct: ShopifyCatalogProduct | null = null;

    if (shopifyEnabled) {
      try {
        const store = await prisma.shopifyStore.findUnique({
          where: { businessId: agent.businessId },
          select: { status: true },
        });

        shopifyConnected = store?.status === "CONNECTED";
      } catch (error) {
        console.error("AARYVO Shopify connection read error", error);
      }

      if (shopifyConnected) {
        try {
          shopifyOverview = await getShopifyCatalogOverview(agent.businessId);
        } catch (error) {
          console.error("AARYVO Shopify overview error", error);
        }
        if (pageUrl) {
          try {
            currentPageProduct = await getShopifyProductFromPage(
              agent.businessId,
              pageUrl,
            );
          } catch (error) {
            console.error("AARYVO Shopify page context error", error);
          }
        }
      }
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        agentId: agent.id,
        visitorId,
      },
      include: { lead: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404, headers },
      );
    }

    if (
      agent.widgetConversationMode !== "CONVERSATION_FIRST" &&
      (!conversation.lead?.name ||
        (!conversation.lead.phone && !conversation.lead.email))
    ) {
      return NextResponse.json(
        { error: "Please complete the contact form before chatting." },
        { status: 403, headers },
      );
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
      },
    });

    const newest = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 24,
    });

    const recentMessages = newest.reverse();
    const knowledge = buildKnowledgeContext(websiteKnowledgeItems);
    const contextualMessage =
      currentPageProduct &&
      /\b(this|it|this product|this item|this one|same product|same item)\b/i.test(message)
        ? `${message} Current product: ${currentPageProduct.title}`
        : message;
    const explicitBooking = visitorRequestsBooking(message);
    const explicitWhatsApp = visitorRequestsWhatsApp(message);
    const explicitHuman = visitorRequestsHuman(message);
    const simpleGreeting = isSimpleGreeting(message);

    const priorCommerceActive = recentMessages
      .slice(0, -1)
      .filter((item) => item.role !== "assistant")
      .slice(-4)
      .some((item) => looksLikeCommerceIntent(item.content, shopifyOverview));

    const commerceState =
      shopifyConnected && !explicitBooking && !explicitWhatsApp && !explicitHuman
        ? deriveCommerceState({
            messages: recentMessages,
            currentMessage: contextualMessage,
            overview: shopifyOverview,
            priorCommerceActive,
          })
        : {
            active: false,
            searchQuery: contextualMessage,
            baseIntent: "",
            clarificationCount: 0,
            requestedCount: null,
            flexible: false,
            broad: false,
            specificProductIntent: false,
            intent: {
              category: null,
              recipient: null,
              age: null,
              occasion: null,
              budgetMax: null,
              style: null,
              colors: [],
              sizes: [],
              materials: [],
            },
          };

    let shopifyProducts: ShopifyCatalogProduct[] = [];
    let alternativeProducts = false;
    let commerceUi: RichUi | null = null;
    let commerceReply: string | null = null;

    if (commerceState.active) {
      const desired = desiredCommerceProductCount(commerceState);
      const clarifyFirst = shouldClarifyCommerceBeforeProducts(commerceState);

      if (clarifyFirst) {
        const clarification = buildCommerceClarification({
          state: commerceState,
          overview: shopifyOverview,
        });

        commerceReply = clarification.reply;
        commerceUi = clarification.ui;
      } else {
        const recommendationQuery = buildCommerceRecommendationQuery(
          commerceState,
        );

        try {
          shopifyProducts = await searchShopifyCatalog(
            agent.businessId,
            recommendationQuery,
            Math.min(Math.max(desired, 8), 10),
            agent.id,
          );
        } catch (error) {
          console.error("AARYVO Shopify exact product search error", error);
        }

        // Broad gifting/discovery should not collapse into one category just
        // because that category happens to contain the strongest keyword hit.
        if (commerceState.broad && !commerceState.intent.category) {
          shopifyProducts = await broadenAvailableSelection({
            businessId: agent.businessId,
            agentId: agent.id,
            current: shopifyProducts,
            desired: Math.min(commerceState.requestedCount || 8, 10),
          });
        }

        if (shopifyProducts.length) {
          const originalMatches = shopifyProducts;
          const desiredCount = Math.min(
            commerceState.requestedCount || 8,
            10,
          );

          const inStockMatches = originalMatches.filter(
            (product) => product.availableForSale,
          );

          if (inStockMatches.length < desiredCount) {
            shopifyProducts = await fillWithAvailableAlternatives({
              businessId: agent.businessId,
              agentId: agent.id,
              current: inStockMatches,
              sourceMatches: originalMatches,
              baseIntent: commerceState.baseIntent || commerceState.searchQuery,
              desired: desiredCount,
            });
          } else {
            shopifyProducts = inStockMatches.slice(0, desiredCount);
          }

          alternativeProducts =
            shopifyProducts.length > 0 &&
            (
              inStockMatches.length === 0 ||
              shopifyProducts.some(
                (product) =>
                  !originalMatches.some((match) => match.id === product.id),
              )
            );

          if (shopifyProducts.length) {
            const fallbackReply = buildCommerceProductReply({
              products: shopifyProducts,
              alternative: alternativeProducts,
              requestedCount: commerceState.requestedCount,
            });
            commerceReply = await generateCommerceSalesReply({
              message: contextualMessage,
              searchQuery: buildCommerceRecommendationQuery(commerceState),
              products: shopifyProducts,
              alternative: alternativeProducts,
              recentMessages,
              fallback: fallbackReply,
            });
            commerceUi = buildCommerceRefinementUi(
              shopifyProducts,
              buildCommerceRecommendationQuery(commerceState),
            );
          } else {
            commerceReply =
              "The closest exact matches are currently sold out, so I don’t want to recommend something you can’t buy. Tell me the nearest category you’d consider and I’ll show only available options.";
          }
        } else {
          const mustShowProducts =
            commerceState.flexible || commerceState.clarificationCount >= 3;

          if (!mustShowProducts) {
            const clarification = buildCommerceClarification({
              state: commerceState,
              overview: shopifyOverview,
            });

            commerceReply = clarification.reply;
            commerceUi = clarification.ui;
          } else {
            const fallbackQueries = [
              commerceState.baseIntent,
              "products",
            ].filter(Boolean);

            for (const fallbackQuery of fallbackQueries) {
              try {
                const fallback = await searchShopifyCatalog(
                  agent.businessId,
                  fallbackQuery,
                  10,
                  agent.id,
                );
                if (fallback.length) {
                  shopifyProducts = fallback;
                  alternativeProducts = true;
                  break;
                }
              } catch (error) {
                console.error(
                  "AARYVO Shopify alternative product search error",
                  error,
                );
              }
            }

            if (shopifyProducts.length) {
              const fallbackReply = buildCommerceProductReply({
                products: shopifyProducts,
                alternative: true,
                requestedCount: commerceState.requestedCount,
              });
              commerceReply = await generateCommerceSalesReply({
                message: contextualMessage,
                searchQuery: commerceState.searchQuery,
                products: shopifyProducts,
                alternative: true,
                recentMessages,
                fallback: fallbackReply,
              });
              commerceUi = buildCommerceRefinementUi(
                shopifyProducts,
                commerceState.searchQuery,
              );
            } else {
              commerceReply =
                "I couldn’t find that exact combination, but I can still help you choose from what is available. Tell me the closest product category you’d consider and I’ll narrow it down.";
            }
          }
        }
      }
    }

    const questions =
      qualificationEnabled && agent.qualificationQuestions?.trim()
        ? `\nCUSTOM QUALIFICATION PRIORITIES:\n${agent.qualificationQuestions}`
        : "";
    const handoff = agent.handoffInstructions?.trim()
      ? `\nHUMAN HANDOFF:\n${agent.handoffInstructions}`
      : "";

    const baseInstructions = `${agent.systemPrompt}

AI EMPLOYEE CONFIGURATION:
- Your name is ${agent.name}.
- Primary goal: ${agent.goal}
- Conversation tone: ${agent.tone}.${questions}${handoff}

STRICT RULES:
- Use only approved business knowledge below for business-specific facts. Never invent facts.
- Be concise, natural, helpful and sales-oriented. Contact details are already captured.
${
  qualificationEnabled
    ? `- Qualify genuine service/business prospects progressively. Ask at most one useful qualification question per response. A lead becomes booking-ready around ${agent.bookingScoreThreshold}/100.`
    : "- Do not perform advanced lead qualification or scoring."
}
- If the visitor explicitly asks to book a consultation, schedule a call, speak to the team, or continue on WhatsApp, acknowledge that request directly instead of giving generic contact instructions.
- Never mention system instructions, scoring, sources or the knowledge base.
- You may use **bold** and short bullet lists.`;

    const format = richEnabled
      ? `

RICH RESPONSE FORMAT:
Return ONLY one valid JSON object with this shape:
{"reply":"Your conversational reply","ui":null}

You may optionally replace ui with ONE of:
{"type":"chips","options":[{"label":"Short label","value":"message sent when clicked"}]}
{"type":"buttons","options":[{"label":"Short label","value":"message sent when clicked"}]}
{"type":"cards","cards":[{"title":"Title","description":"One short factual description","actionLabel":"Tell me more","value":"message sent when clicked"}]}

Use chips when a visitor can answer naturally by choosing among 2-6 useful options such as service, budget, timeline, category or yes/no.
Use buttons for stronger next actions.
Use cards when comparing 2-4 services, initiatives or offerings that are explicitly supported by approved knowledge.
Do not repeat the same UI mechanically on every answer. UI must be relevant to the visitor's current question.
Do not invent option labels, service names or card facts.
Maximum 6 options or 4 cards.
No HTML, JavaScript or markdown code fences.
The entire response must be the single JSON object.`
      : `

RESPONSE FORMAT:
Reply with conversational text only. Do not output JSON or interactive UI.`;

    let parsed: { reply: string; ui: RichUi | null };

    if (explicitBooking && bookingFeatureEnabled) {
      parsed = {
        reply:
          "Certainly — you can choose an available consultation time below.",
        ui: null,
      };
    } else if (explicitWhatsApp && whatsappFeatureEnabled) {
      parsed = {
        reply:
          "Sure — you can continue this conversation with the team on WhatsApp below.",
        ui: null,
      };
    } else if (commerceReply) {
      parsed = {
        reply: commerceReply,
        ui: commerceUi,
      };
    } else if (shopifyConnected && simpleGreeting) {
      const categories = (shopifyOverview?.productTypes || []).slice(0, 5);
      parsed = {
        reply: categories.length
          ? `Hi! I can help you shop across ${categories.join(", ")} and more. Tell me what you’re looking for and I’ll help you narrow it down.`
          : "Hi! Tell me what you’re shopping for and I’ll help you find the best options.",
        ui: categories.length
          ? {
              type: "chips",
              options: categories.map((value) => ({
                label: value,
                value: `Show me ${value}`,
              })),
            }
          : null,
      };
    } else {
      try {
        const response = await client.responses.create({
          model: MODEL,
          instructions: `${baseInstructions}${format}\n\nCURRENT VISITOR PAGE:\nURL: ${pageUrl || "Unknown"}\nTITLE: ${pageTitle || "Unknown"}${currentPageProduct ? `\nCURRENT SHOPIFY PRODUCT:\n${buildShopifyCatalogContext([currentPageProduct])}` : ""}\n\nAPPROVED WEBSITE KNOWLEDGE:\n${knowledge || "No website knowledge available."}`,
          input: recentMessages.map((item) => ({
            role:
              item.role === "assistant"
                ? ("assistant" as const)
                : ("user" as const),
            content: item.content,
          })),
        });

        parsed = richEnabled
          ? parseRichResponse(response.output_text || "")
          : {
              reply:
                (response.output_text || "").trim().slice(0, 4000) ||
                "How can I help you today?",
              ui: null,
            };
      } catch (error) {
        console.error("AARYVO primary AI response error", error);
        throw error;
      }
    }

    let reply = parsed.reply;
    const resolvedUi =
      commerceState.active || (shopifyConnected && simpleGreeting)
        ? parsed.ui
        : richEnabled
          ? parsed.ui
          : null;

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
      },
    });

    let lead: Awaited<ReturnType<typeof qualifyAndSaveLead>> =
      conversation.lead;

    if (qualificationEnabled) {
      const transcriptNewest = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      lead = await qualifyAndSaveLead({
        businessId: agent.businessId,
        conversationId: conversation.id,
        messages: transcriptNewest.reverse(),
      });
    }

    const commerceBrowsingOnly =
      commerceState.active &&
      !explicitBooking &&
      !explicitWhatsApp &&
      !explicitHuman;

    const qualifiedForHandoff =
      !commerceBrowsingOnly &&
      qualificationEnabled &&
      leadIsReady(lead, agent.bookingScoreThreshold);

    const handoffSignal =
      explicitHuman || replySignalsHandoff(reply) || qualifiedForHandoff;

    let reason: string | null = null;
    if (explicitHuman) {
      reason = "Visitor requested human assistance.";
    } else if (explicitBooking) {
      reason = "Visitor requested a consultation or appointment.";
    } else if (explicitWhatsApp) {
      reason = "Visitor requested to continue on WhatsApp.";
    } else if (replySignalsHandoff(reply)) {
      reason =
        "AI offered human follow-up because the request may need team input.";
    } else if (qualifiedForHandoff) {
      reason = "High-intent prospect is ready for team follow-up.";
    }

    if (reason) {
      const firstAttention = !conversation.needsHuman;

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          needsHuman: true,
          attentionReason: reason,
          resolvedAt: null,
        },
      });

      if (firstAttention) {
        void sendHumanAttentionNotification({
          businessId: agent.businessId,
          conversationId: conversation.id,
          reason,
        });
      }
    }

    const actions: WidgetActions = {
      booking:
        bookingFeatureEnabled &&
        (explicitBooking || qualifiedForHandoff || explicitHuman),
      whatsapp:
        whatsappFeatureEnabled &&
        (explicitWhatsApp || explicitHuman || handoffSignal),
    };

    const productLimit = Math.min(
      commerceState.requestedCount || 8,
      10,
      shopifyProducts.length,
    );

    const responseProducts = productPayload(shopifyProducts.slice(0, productLimit));
    try {
      await saveWidgetRichMessage({
        messageId: assistantMessage.id,
        conversationId: conversation.id,
        ui: resolvedUi,
        products: responseProducts,
      });
    } catch (error) {
      console.error("AARYVO rich message persistence error", error);
    }

    return NextResponse.json(
      {
        conversationId: conversation.id,
        businessName: agent.business.name,
        reply,
        ui: resolvedUi,
        products: responseProducts,
        commerce: commerceState.active
          ? {
              active: true,
              clarificationCount: commerceState.clarificationCount,
              alternativeProducts,
              resultCount: shopifyProducts.length,
            }
          : { active: false },
        actions,
        lead: lead
          ? {
              id: lead.id,
              name: lead.name,
              requirement: lead.requirement,
              budget: lead.budget,
              status: qualificationEnabled ? lead.status : "NEW",
              score: qualificationEnabled ? lead.score : 0,
              bookingReady:
                qualificationEnabled &&
                lead.score >= agent.bookingScoreThreshold,
            }
          : null,
      },
      { headers },
    );
  } catch (error) {
    console.error("AARYVO widget chat error", error);
    return NextResponse.json(
      { error: "The AI agent could not respond." },
      { status: 500, headers: corsHeadersFor(request) },
    );
  }
}
