import { NextResponse } from "next/server";
import { verifyShopifyWebhookHmac } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  // AARYVO currently requests only read_products/read_inventory and does not
  // ingest Shopify Customer API records. Acknowledge the mandatory compliance
  // request without logging the customer's personal payload.
  return new NextResponse(null, { status: 200 });
}
