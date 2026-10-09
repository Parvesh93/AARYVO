import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRIDGE_PATH = "/api/internal/shopify-bridge/status";
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

function bridgeResponse(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function verifySignedRequest(request: Request, shop: string) {
  const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
  if (secret.length < 32) return false;

  const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
  const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
  const signature = request.headers.get("x-aaryvo-bridge-signature") || "";

  if (!/^\d{13}$/.test(timestamp) || !/^[0-9a-f-]{36}$/i.test(nonce)) {
    return false;
  }
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || Math.abs(Date.now() - time) > MAX_CLOCK_SKEW_MS) {
    return false;
  }

  const canonical = [timestamp, nonce, shop, "POST", BRIDGE_PATH].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Read-only bridge for the separately authenticated Shopify Admin frontend.
 *
 * Shopify itself is authenticated by the frontend SDK. This endpoint only
 * trusts requests signed by the *server*, not the browser. It never accepts
 * a workspace ID, returns tokens, or changes subscription/catalog state.
 */
export async function POST(request: Request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return bridgeResponse({ error: "Invalid content type." }, 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bridgeResponse({ error: "Invalid JSON." }, 400);
  }

  const candidate = (typeof body === "object" && body !== null && !Array.isArray(body) &&
    "shop" in body) ? (body as { shop: unknown }).shop : null;
  const shop = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return bridgeResponse({ error: "Invalid Shopify domain." }, 400);
  }

  if (!verifySignedRequest(request, shop)) {
    return bridgeResponse({ error: "Unauthorized." }, 401);
  }

  try {
    const store = await prisma.shopifyStore.findUnique({
      where: { shopDomain: shop },
      select: {
        shopDomain: true,
        status: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        _count: { select: { products: true } },
        business: {
          select: {
            name: true,
            billingChannel: true,
            plan: true,
            subscriptionStatus: true,
            monthlyConversationLimit: true,
          },
        },
      },
    });

    if (!store || store.business.billingChannel !== "SHOPIFY" || store.status !== "CONNECTED") {
      return bridgeResponse({ connected: false, shop });
    }

    return bridgeResponse({
      connected: true,
      shop: store.shopDomain,
      workspace: {
        name: store.business.name,
        plan: store.business.plan,
        subscriptionStatus: store.business.subscriptionStatus,
        billingChannel: store.business.billingChannel,
        monthlyConversationLimit: store.business.monthlyConversationLimit,
      },
      catalog: {
        productCount: store._count.products,
        lastSyncAt: store.lastSyncAt?.toISOString() ?? null,
        lastSyncStatus: store.lastSyncStatus,
      },
    });
  } catch (error) {
    console.error("Shopify bridge status lookup failed:", error);
    return bridgeResponse({ error: "Unable to load store status." }, 500);
  }
}
