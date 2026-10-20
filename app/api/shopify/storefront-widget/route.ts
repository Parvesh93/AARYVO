import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plan-entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCRIPT_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
};

function scriptResponse(script: string, status = 200) {
  return new NextResponse(script, { status, headers: SCRIPT_HEADERS });
}

/**
 * Public Shopify storefront bootstrap. The theme app embed supplies the shop's
 * permanent myshopify.com domain. This endpoint never exposes an access token
 * or lets the storefront choose a workspace or an agent ID.
 */
export async function GET(request: Request) {
  const shop = new URL(request.url).searchParams.get("shop")?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return scriptResponse("/* Invalid Shopify store. */", 400);
  }

  try {
    const store = await prisma.shopifyStore.findUnique({
      where: { shopDomain: shop },
      select: {
        status: true,
        business: {
          select: {
            billingChannel: true,
            plan: true,
            subscriptionStatus: true,
            agents: {
              where: { isActive: true },
              select: { id: true },
              take: 1,
              orderBy: { id: "asc" },
            },
          },
        },
      },
    });

    if (
      !store ||
      store.status !== "CONNECTED" ||
      store.business.billingChannel !== "SHOPIFY" ||
      store.business.subscriptionStatus.toUpperCase() !== "ACTIVE" ||
      !hasFeature(store.business.plan, "shopifyIntegration") ||
      !store.business.agents[0]
    ) {
      // A cancelled, unconnected, or free merchant does not load a chatbot.
      return scriptResponse("/* AARYVO storefront assistant is not active. */");
    }

    const agentId = store.business.agents[0].id;
    // Use the configured public HTTPS origin, never a reverse-proxy/internal
    // Host header, so Shopify storefronts do not receive mixed-content URLs.
    const publicOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://aaryvo.ppdesigntech.com";
    const widgetUrl = new URL("/api/widget-script", publicOrigin);
    if (widgetUrl.protocol !== "https:") {
      throw new Error("Public AARYVO app URL must use HTTPS.");
    }

    // Both values originate from the database or this server URL and are
    // JSON-encoded, so they cannot inject code into the JavaScript response.
    return scriptResponse(`(() => {
      if (document.querySelector("[data-aaryvo-root]") || window.__aaryvoShopifyLoaded) return;
      window.__aaryvoShopifyLoaded = true;
      const widget = document.createElement("script");
      widget.src = ${JSON.stringify(widgetUrl.toString())};
      widget.dataset.agent = ${JSON.stringify(agentId)};
      widget.defer = true;
      widget.onerror = () => { window.__aaryvoShopifyLoaded = false; };
      (document.body || document.head).appendChild(widget);
    })();`);
  } catch (error) {
    console.error("AARYVO storefront bootstrap failed", error instanceof Error ? error.message : "Unknown error");
    return scriptResponse("/* AARYVO storefront assistant temporarily unavailable. */", 503);
  }
}
