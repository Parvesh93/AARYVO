import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyShopifyRecommendationMarker } from "@/lib/shopify-attribution";
import { recordShopifyFunnelEvent, SHOPIFY_FUNNEL_EVENTS } from "@/lib/shopify-funnel";
import {
  corsHeadersFor,
  isAllowedWidgetOrigin,
  rateLimitWidget,
} from "@/lib/widget-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request) {
  const headers = { ...corsHeadersFor(request), "Cache-Control": "no-store" };
  try {
    const rate = rateLimitWidget(request, "shopify-funnel", 1200, 60 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ ok: false }, { status: 429, headers });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
      return NextResponse.json({ ok: false }, { status: 415, headers });
    }
    const raw = await request.text();
    if (raw.length > 2000) return NextResponse.json({ ok: false }, { status: 413, headers });
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json({ ok: false }, { status: 400, headers });
    }
    const value = data as Record<string, unknown>;
    const eventType = value.eventType;
    const agentId = value.agentId;
    if (typeof eventType !== "string" || !SHOPIFY_FUNNEL_EVENTS.includes(
      eventType as (typeof SHOPIFY_FUNNEL_EVENTS)[number],
    ) || typeof agentId !== "string" || !/^[A-Za-z0-9_-]{10,80}$/.test(agentId)) {
      return NextResponse.json({ ok: false }, { status: 400, headers });
    }
    const proof = verifyShopifyRecommendationMarker(value.token);
    if (!proof) return NextResponse.json({ ok: false }, { status: 403, headers });

    // The HMAC ties the product and conversation to this Shopify store.
    // The connection and conversation must belong to the supplied agent.
    const store = await prisma.shopifyStore.findUnique({
      where: { shopDomain: proof.shop },
      select: { businessId: true, status: true },
    });
    if (!store || store.status !== "CONNECTED") {
      return NextResponse.json({ ok: false }, { status: 403, headers });
    }
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, businessId: store.businessId, isActive: true },
      select: { id: true, businessId: true, business: { select: { websiteUrl: true } } },
    });
    if (!agent || !isAllowedWidgetOrigin(request, agent.business.websiteUrl)) {
      return NextResponse.json({ ok: false }, { status: 403, headers });
    }
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: proof.conversationId,
        agentId: agent.id,
      },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ ok: false }, { status: 403, headers });
    }
    await recordShopifyFunnelEvent({
      businessId: store.businessId,
      agentId: agent.id,
      conversationId: proof.conversationId,
      shopifyProductId: proof.productId,
      eventType: eventType as (typeof SHOPIFY_FUNNEL_EVENTS)[number],
      signedToken: value.token as string,
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("AARYVO Shopify funnel event failed",
      error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}
