import { NextResponse } from "next/server";
import {
  cleanupShopifyAfterUninstall,
  normalizeShopDomain,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as { shop_domain?: string };
    const headerShop = request.headers.get("x-shopify-shop-domain");
    const shop = normalizeShopDomain(headerShop || payload.shop_domain || "");

    // Idempotent: if app/uninstalled already removed the Shopify connection,
    // this becomes a safe no-op.
    await cleanupShopifyAfterUninstall(shop);
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("Shopify shop/redact webhook failed:", error);
    return new NextResponse(null, { status: 500 });
  }
}
