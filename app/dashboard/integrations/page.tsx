import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plan-entitlements";
import { isShopifyConfigured, shopifyProductLimit } from "@/lib/shopify";
import ShopifyIntegrationCard from "./ShopifyIntegrationCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: {
      business: {
        include: {
          shopifyStore: {
            include: {
              _count: { select: { products: true } },
            },
          },
        },
      },
    },
  });
  if (!member) redirect("/onboarding");

  const params = await searchParams;
  const shopifyState = typeof params.shopify === "string" ? params.shopify : null;
  const messageParam = typeof params.message === "string" ? params.message : null;

  let notice: string | null = null;
  if (shopifyState === "connected") notice = "Shopify connected. Sync the catalogue to make product data available to AARYVO.";
  if (shopifyState === "upgrade") notice = messageParam || "Shopify integration requires Starter or higher.";
  if (shopifyState === "not-configured") notice = "Shopify app credentials are not configured on the AARYVO server.";
  if (shopifyState === "error") notice = messageParam || "Unable to connect Shopify.";

  const business = member.business;
  const shopifyEnabled = hasFeature(business.plan, "shopifyIntegration");
  const productLimit = shopifyProductLimit(business.plan);
  const store = business.shopifyStore
    ? {
        shopDomain: business.shopifyStore.shopDomain,
        status: business.shopifyStore.status,
        productCount: business.shopifyStore._count.products,
        lastSyncAt: business.shopifyStore.lastSyncAt?.toISOString() || null,
        lastSyncStatus: business.shopifyStore.lastSyncStatus,
        lastSyncError: business.shopifyStore.lastSyncError,
      }
    : null;

  return (
    <div className="mx-auto max-w-[1100px]">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">Connected apps</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Integrations</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
        Connect the systems your business already uses so AARYVO can answer with live, structured business data.
      </p>

      <div className="mt-7 space-y-4">
        <ShopifyIntegrationCard
          enabled={shopifyEnabled}
          requiredPlan="Starter"
          configured={isShopifyConfigured()}
          store={store}
          productLimit={productLimit}
          notice={notice}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-black/[.06] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf8ef] text-lg font-bold text-[#128c4b]">W</div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">Available now</span>
            </div>
            <h2 className="mt-6 text-lg font-semibold">WhatsApp handoff</h2>
            <p className="mt-2 text-sm leading-6 text-black/45">
              Let qualified website visitors continue the conversation directly with your team on WhatsApp.
            </p>
            <a href="/dashboard/widget" className="mt-6 inline-flex rounded-full bg-black px-4 py-2 text-xs font-medium text-white">
              Configure in Widget
            </a>
          </div>

          <div className="rounded-2xl border border-black/[.06] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f5f6f8] text-lg font-bold">G</div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">Available now</span>
            </div>
            <h2 className="mt-6 text-lg font-semibold">Google Calendar</h2>
            <p className="mt-2 text-sm leading-6 text-black/45">
              Connect a calendar from Settings so AARYVO can use your availability for consultation bookings.
            </p>
            <a href="/dashboard/settings" className="mt-6 inline-flex rounded-full border border-black/10 px-4 py-2 text-xs font-medium text-black/65">
              Open Settings
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
