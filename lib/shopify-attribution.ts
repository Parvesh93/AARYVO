import crypto from "node:crypto";

/**
 * Short-lived proof that this specific Shopify product was included in an
 * actual AARYVO chat recommendation. This does not prove AARYVO caused a sale.
 *
 * Only the Shopify Admin backend (which shares the server-only bridge secret)
 * can validate this marker after it appears on a Shopify order.
 */
export function createShopifyRecommendationMarker(params: {
  shop: string;
  conversationId: string;
  productId: string;
}): string | null {
  const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
  if (secret.length < 32 || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(params.shop) ||
      !/^gid:\/\/shopify\/Product\/\d+$/.test(params.productId) ||
      !/^[a-zA-Z0-9_-]{10,80}$/.test(params.conversationId)) return null;

  const payload = Buffer.from(JSON.stringify({
    v: 1,
    s: params.shop.toLowerCase(),
    c: params.conversationId,
    p: params.productId,
    t: Date.now(),
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret)
    .update("aaryvo-order-v1." + payload).digest("base64url");
  return payload + "." + signature;
}
