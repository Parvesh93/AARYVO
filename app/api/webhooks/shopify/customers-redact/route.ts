import { NextResponse } from "next/server";
import { verifyShopifyWebhookHmac } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  // No Shopify Customer API records are persisted by AARYVO under the current
  // read_products/read_inventory scopes, so there is no Shopify customer record
  // to redact. Do not log the payload because it can contain personal data.
  return new NextResponse(null, { status: 200 });
}
