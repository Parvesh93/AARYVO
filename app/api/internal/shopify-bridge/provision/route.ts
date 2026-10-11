import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = "/api/internal/shopify-bridge/provision";
const MAX_SKEW = 2 * 60 * 1000;

function respond(data: object, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isAuthorized(request: Request, shop: string, clientId: string) {
  const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
  const allowed = (process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (secret.length < 32 || !allowed.includes(clientId)) return false;

  const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
  const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
  const signature = request.headers.get("x-aaryvo-bridge-signature") || "";

  if (!/^\d{13}$/.test(timestamp) || !/^[0-9a-f-]{36}$/i.test(nonce) ||
      !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const ms = Number(timestamp);
  if (!Number.isSafeInteger(ms) || Math.abs(Date.now() - ms) > MAX_SKEW) return false;

  const canonical = [timestamp, nonce, shop, clientId, "POST", PATH].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function slugForShop(shop: string) {
  const label = shop.slice(0, -".myshopify.com".length);
  const base = label.replace(/[^a-z0-9-]/g, "-").slice(0, 46);
  const hash = crypto.createHash("sha256").update(shop).digest("hex").slice(0, 16);
  return `shopify-${base}-${hash}`;
}

/**
 * Shopify Dev never sends user IDs, workspace IDs or tokens to this endpoint.
 * Shopify SDK verifies its session before calling us; we independently require
 * a signed server request and an allowlisted app ID.
 *
 * Existing ShopifyStore records and their tokens are immutable in this flow.
 */
export async function POST(request: Request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return respond({ error: "Invalid content type." }, 415);
  }

  let input: unknown;
  try { input = await request.json(); }
  catch { return respond({ error: "Invalid JSON." }, 400); }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return respond({ error: "Invalid payload." }, 400);
  }
  const value = input as Record<string, unknown>;
  const shop = typeof value.shop === "string" ? value.shop.trim().toLowerCase() : "";
  const clientId = typeof value.appClientId === "string" ? value.appClientId.trim() : "";

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
      !/^[a-f0-9]{32}$/i.test(clientId)) {
    return respond({ error: "Invalid Shopify app or domain." }, 400);
  }
  if (!isAuthorized(request, shop, clientId)) {
    return respond({ error: "Unauthorized." }, 401);
  }

  try {
    const existing = await prisma.shopifyMerchantLink.findUnique({
      where: { shopDomain_appClientId: { shopDomain: shop, appClientId: clientId } },
      select: { businessId: true },
    });
    if (existing) return respond({ ok: true, shop, created: false, provisioned: true });

    // Recognize a working production connection without transferring its token
    // or modifying any of its data. A dev installation does not own that token.
    const connectedStore = await prisma.shopifyStore.findUnique({
      where: { shopDomain: shop },
      select: { businessId: true, business: { select: { billingChannel: true } } },
    });
    if (connectedStore && connectedStore.business.billingChannel !== "SHOPIFY") {
      return respond({ error: "Existing non-Shopify-billed workspace needs manual review." }, 409);
    }

    // Serialize concurrent installations of the same shop with a deterministic
    // slug. Unique constraints on shop+app prevent duplicate mappings.
    const outcome = await prisma.$transaction(async (tx) => {
      const linked = await tx.shopifyMerchantLink.findUnique({
        where: { shopDomain_appClientId: { shopDomain: shop, appClientId: clientId } },
      });
      if (linked) return { created: false };

      let businessId: string;
      if (connectedStore) {
        businessId = connectedStore.businessId;
      } else {
        // Another embedded app installation may already have provisioned this
        // shop, so reuse its workspace rather than creating a duplicate.
        const earlier = await tx.shopifyMerchantLink.findFirst({
          where: { shopDomain: shop },
          select: { businessId: true },
          orderBy: { createdAt: "asc" },
        });
        if (earlier) {
          businessId = earlier.businessId;
        } else {
          const label = shop.slice(0, -".myshopify.com".length);
          const business = await tx.business.create({
            data: {
              name: label,
              slug: slugForShop(shop),
              websiteUrl: `https://${shop}`,
              billingChannel: "SHOPIFY",
              plan: "FREE",
              subscriptionStatus: "FREE",
              monthlyConversationLimit: 50,
              agents: {
                create: {
                  name: `${label} Shopping Assistant`,
                  goal: "Help shoppers discover products and answer store questions.",
                  systemPrompt: `You are AARYVO, the shopping assistant for ${label}. Only use verified store and product information. Never invent prices, availability or policies.`,
                },
              },
            },
          });
          businessId = business.id;
        }
      }

      await tx.shopifyMerchantLink.create({
        data: { shopDomain: shop, appClientId: clientId, businessId },
      });
      return { created: !connectedStore };
    });

    return respond({ ok: true, shop, provisioned: true, created: outcome.created });
  } catch (error) {
    // Concurrent requests can hit a unique index: check if a competing request
    // finished provisioning, rather than creating a second workspace.
    const linked = await prisma.shopifyMerchantLink.findUnique({
      where: { shopDomain_appClientId: { shopDomain: shop, appClientId: clientId } },
      select: { id: true },
    }).catch(() => null);
    if (linked) return respond({ ok: true, shop, provisioned: true, created: false });

    console.error("Shopify merchant provisioning failed:", error);
    return respond({ error: "Unable to provision the merchant workspace." }, 500);
  }
}
