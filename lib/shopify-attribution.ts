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


export type VerifiedRecommendation = {
  shop: string;
  conversationId: string;
  productId: string;
  issuedAt: number;
};

/**
 * Client-side engagement is untrusted until it presents the server-issued
 * per-product proof. Accept only recent, HMAC-verified Shopify recommendations.
 * Raw signed tokens are never stored in the engagement events table.
 */
export function verifyShopifyRecommendationMarker(
  token: unknown,
  now = Date.now(),
): VerifiedRecommendation | null {
  const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
  if (secret.length < 32 || typeof token !== "string" || token.length > 900 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", secret)
    .update("aaryvo-order-v1." + payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const raw: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    if (value.v !== 1 || typeof value.s !== "string" ||
        !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value.s) ||
        typeof value.c !== "string" ||
        !/^[A-Za-z0-9_-]{10,80}$/.test(value.c) ||
        typeof value.p !== "string" ||
        !/^gid:\/\/shopify\/Product\/\d+$/.test(value.p) ||
        typeof value.t !== "number" || !Number.isSafeInteger(value.t) ||
        value.t > now + 5 * 60 * 1000 ||
        now - value.t > 7 * 24 * 60 * 60 * 1000) return null;
    return {
      shop: value.s, conversationId: value.c,
      productId: value.p, issuedAt: value.t,
    };
  } catch {
    return null;
  }
}
