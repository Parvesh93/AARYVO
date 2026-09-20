import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isShopifyConfigured, normalizeShopDomain, shopifyAuthorizationUrl } from "@/lib/shopify";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const shopParam = requestUrl.searchParams.get("shop") || "";
    const shop = normalizeShopDomain(shopParam);
    const resumePath = `/api/integrations/shopify/start?shop=${encodeURIComponent(shop)}`;

    const session = await getSession();
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", resumePath);
      return NextResponse.redirect(loginUrl);
    }

    if (!isShopifyConfigured()) {
      return NextResponse.redirect(new URL("/dashboard/integrations?shopify=not-configured", request.url));
    }

    const member = await prisma.businessMember.findFirst({
      where: { userId: session.userId },
      include: { business: { select: { id: true, plan: true } } },
    });
    if (!member) {
      const onboardingUrl = new URL("/onboarding", request.url);
      onboardingUrl.searchParams.set("next", resumePath);
      return NextResponse.redirect(onboardingUrl);
    }
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
