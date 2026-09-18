import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { featureError, hasFeature } from "@/lib/plan-entitlements";
import { isShopifyConfigured, normalizeShopDomain, shopifyAuthorizationUrl } from "@/lib/shopify";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.redirect(new URL("/login", request.url));

    if (!isShopifyConfigured()) {
      return NextResponse.redirect(new URL("/dashboard/integrations?shopify=not-configured", request.url));
    }

    const member = await prisma.businessMember.findFirst({
      where: { userId: session.userId },
      include: { business: { select: { id: true, plan: true } } },
    });
    if (!member) return NextResponse.redirect(new URL("/onboarding", request.url));
    if (!hasFeature(member.business.plan, "shopifyIntegration")) {
      const url = new URL("/dashboard/integrations", request.url);
      url.searchParams.set("shopify", "upgrade");
      url.searchParams.set("message", featureError("shopifyIntegration"));
      return NextResponse.redirect(url);
    }

    const shopParam = new URL(request.url).searchParams.get("shop") || "";
    const shop = normalizeShopDomain(shopParam);
    const authorizationUrl = shopifyAuthorizationUrl({
      businessId: member.business.id,
      userId: session.userId,
      shop,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const url = new URL("/dashboard/integrations", request.url);
    url.searchParams.set("shopify", "error");
    url.searchParams.set("message", error instanceof Error ? error.message : "Unable to connect Shopify.");
    return NextResponse.redirect(url);
  }
}
