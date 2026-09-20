import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeShopifyCode,
  getShopifyHostedPricingUrl,
  normalizeShopDomain,
  registerShopifyUninstallWebhook,
  saveShopifyConnection,
  shopifyAppUrl,
  syncShopifyPricingState,
  verifyShopifyCallbackHmac,
  verifyShopifyState,
} from "@/lib/shopify";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    if (!verifyShopifyCallbackHmac(url)) throw new Error("Shopify callback signature is invalid.");

    const shop = normalizeShopDomain(url.searchParams.get("shop") || "");
    const code = url.searchParams.get("code") || "";
    const state = verifyShopifyState(url.searchParams.get("state") || "");

    if (!code || !state || state.shop !== shop) {
      throw new Error("Shopify authorization session is invalid or expired.");
    }

    const membership = await prisma.businessMember.findFirst({
      where: { userId: state.userId, businessId: state.businessId },
      select: { id: true },
    });
    if (!membership) throw new Error("Workspace access could not be verified.");

    const token = await exchangeShopifyCode(shop, code);
    await saveShopifyConnection({
      businessId: state.businessId,
      shop,
      accessToken: token.accessToken,
      scope: token.scope,
      expiresIn: token.expiresIn,
      refreshToken: token.refreshToken,
      refreshTokenExpiresIn: token.refreshTokenExpiresIn,
    });

    // Register app/uninstalled immediately while the installation token is valid.
    // A failed registration should not invalidate a successful OAuth connection,
    // but it is logged so it can be corrected before App Store submission.
    try {
      await registerShopifyUninstallWebhook(shop, token.accessToken);
    } catch (webhookError) {
      console.error("Shopify uninstall webhook registration failed:", webhookError);
    }

    const business = await prisma.business.findUnique({
      where: { id: state.businessId },
      select: { razorpaySubscriptionId: true },
    });

    // Direct AARYVO customers who already pay through Razorpay can connect
    // Shopify as an integration without starting a second subscription.
    if (business?.razorpaySubscriptionId) {
      const redirectUrl = new URL("/dashboard/integrations", shopifyAppUrl());
      redirectUrl.searchParams.set("shopify", "connected");
      return NextResponse.redirect(redirectUrl);
    }

    // OAuth only proves store ownership. It must never grant a paid AARYVO
    // entitlement on its own. Ask Shopify for the real subscription state.
    const pricingState = await syncShopifyPricingState(state.businessId);

    if (pricingState.managed && pricingState.active) {
      const redirectUrl = new URL("/dashboard/integrations", shopifyAppUrl());
      redirectUrl.searchParams.set("shopify", "connected");
      return NextResponse.redirect(redirectUrl);
    }

    // No active Shopify subscription: send the merchant straight to Shopify's
    // hosted App Pricing page. AARYVO stays FREE until Shopify confirms a plan.
    const pricing = await getShopifyHostedPricingUrl(state.businessId);
    return NextResponse.redirect(pricing.url);
  } catch (error) {
    const redirectUrl = new URL("/dashboard/integrations", shopifyAppUrl());
    redirectUrl.searchParams.set("shopify", "error");
    redirectUrl.searchParams.set(
      "message",
      error instanceof Error ? error.message : "Unable to complete Shopify connection.",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
