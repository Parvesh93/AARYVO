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

    // Keep the response a valid JavaScript file, but make the precise reason
    // visible when the URL is opened directly or inspected in Network tools.
    if (!store) return scriptResponse("/* AARYVO_DIAGNOSTIC: STORE_NOT_CONNECTED */");
    if (store.status !== "CONNECTED") {
      return scriptResponse("/* AARYVO_DIAGNOSTIC: STORE_CONNECTION_INACTIVE */");
    }
    if (store.business.billingChannel !== "SHOPIFY") {
      return scriptResponse("/* AARYVO_DIAGNOSTIC: SHOPIFY_WORKSPACE_MISMATCH */");
    }
    if (
      store.business.subscriptionStatus.toUpperCase() !== "ACTIVE" ||
      !hasFeature(store.business.plan, "shopifyIntegration")
    ) {
      return scriptResponse("/* AARYVO_DIAGNOSTIC: SUBSCRIPTION_NOT_ACTIVE_IN_WORKSPACE */");
    }
    if (!store.business.agents[0]) {
      return scriptResponse("/* AARYVO_DIAGNOSTIC: NO_ACTIVE_ASSISTANT */");
    }

    const agentId = store.business.agents[0].id;
    // Use the configured public HTTPS origin, never a reverse-proxy/internal
    // Host header, so Shopify storefronts do not receive mixed-content URLs.
    // The Shopify embed is installed from this production domain. Avoid
    // pointing browsers to an obsolete NEXT_PUBLIC_APP_URL or staging host.
    const widgetUrl = "https://aaryvo.ppdesigntech.com/api/widget-script?v=shopify-buy-now-attribution-20261021";

    // Both values originate from the database or this server URL and are
    // JSON-encoded, so they cannot inject code into the JavaScript response.
    return scriptResponse(`(() => {
      if (document.querySelector("[data-aaryvo-root]") || window.__aaryvoShopifyLoaded) return;
      window.__aaryvoShopifyLoaded = true;
      const widget = document.createElement("script");
      widget.src = ${JSON.stringify(widgetUrl)};
      widget.dataset.agent = ${JSON.stringify(agentId)};
      widget.defer = true;
      widget.onerror = () => { window.__aaryvoShopifyLoaded = false; console.error("AARYVO: widget script could not be loaded."); };
      (document.body || document.head).appendChild(widget);
    })();\n/* AARYVO_DIAGNOSTIC: READY */`);
  } catch (error) {
    console.error("AARYVO storefront bootstrap failed", error instanceof Error ? error.message : "Unknown error");
    return scriptResponse("/* AARYVO_DIAGNOSTIC: BACKEND_ERROR — check Hostinger logs */", 503);
  }
}
