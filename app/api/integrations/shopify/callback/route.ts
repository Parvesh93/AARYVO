import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeShopifyCode,
  getShopifyHostedPricingUrl,
  inspectShopifyPricingState,
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
      select: { razorpaySubscriptionId: true, billingChannel: true },
    });

    // A workspace with an existing direct Razorpay subscription must not be
    // silently moved to Shopify billing while that subscription is active.
    // Keep the direct subscription authoritative until it is explicitly
    // migrated/cancelled, preventing duplicate charges.
    if (business?.razorpaySubscriptionId) {
      const redirectUrl = new URL("/dashboard/integrations", shopifyAppUrl());
      redirectUrl.searchParams.set("shopify", "connected-direct-billing");
      return NextResponse.redirect(redirectUrl);
    }

    // Shopify-origin workspaces are permanently identified as Shopify-billed.
    // This prevents Razorpay from becoming available merely because a store is
    // later uninstalled or temporarily disconnected.
    if (business?.billingChannel !== "SHOPIFY") {
      await prisma.business.update({
        where: { id: state.businessId },
        data: { billingChannel: "SHOPIFY" },
      });
    }

    // OAuth only proves store ownership. It must never grant a paid AARYVO
    // entitlement on its own. Read Shopify's canonical billing state first.
    //
    // Shopify can retain an old subscription record after uninstall. If that
    // subscription is already scheduled to cancel, do not treat it as a fresh
    // paid selection during reinstall: send the merchant through App Pricing.
    const pricingState = await inspectShopifyPricingState(state.businessId);

    if (
      pricingState.managed &&
      pricingState.active &&
      !pricingState.cancelAtEnd
    ) {
      await syncShopifyPricingState(state.businessId);
      const redirectUrl = new URL("/dashboard/integrations", shopifyAppUrl());
      redirectUrl.searchParams.set("shopify", "connected");
      return NextResponse.redirect(redirectUrl);
    }

    // No renewable Shopify subscription (or only a stale/cancelling one):
    // keep AARYVO free and require a fresh Shopify plan selection.
    await prisma.business.update({
      where: { id: state.businessId },
      data: {
        plan: "FREE",
        subscriptionStatus: "FREE",
        monthlyConversationLimit: 50,
        subscriptionCurrentStart: null,
        subscriptionCurrentEnd: null,
        subscriptionCancelAtEnd: false,
        usagePeriodStart: null,
        usagePeriodEnd: null,
      },
    });

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
