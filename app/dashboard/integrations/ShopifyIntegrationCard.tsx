"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  enabled: boolean;
  requiredPlan: string;
  configured: boolean;
  store: null | {
    shopDomain: string;
    status: string;
    productCount: number;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
  productLimit: number;
  notice?: string | null;
  pricingConfigured?: boolean;
};

export default function ShopifyIntegrationCard({
  enabled,
  requiredPlan,
  configured,
  store,
  productLimit,
  notice,
  pricingConfigured = false,
}: Props) {
  const router = useRouter();
  const [shop, setShop] = useState("");
  const [busy, setBusy] = useState<"sync" | "disconnect" | "pricing" | null>(null);
  const [message, setMessage] = useState(notice || "");

  async function sync() {
    setBusy("sync");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/shopify/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Shopify sync failed.");
      setMessage(
        data.capped
          ? `Synced ${data.synced} products. Your current plan supports up to ${data.limit.toLocaleString()} products.`
          : `Synced ${data.synced} products successfully.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shopify sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function checkPricing() {
    setBusy("pricing");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/shopify/pricing-check", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to verify Shopify App Pricing.");
      }
      setMessage(
        `Shopify App Pricing verified: ${data.appName} (${data.appId}). Partner API authentication is working.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify Shopify App Pricing.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this Shopify store and remove its synced catalogue from AARYVO?")) return;
    setBusy("disconnect");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/shopify/disconnect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to disconnect Shopify.");
      setMessage("Shopify disconnected.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect Shopify.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-3xl border border-black/[.07] bg-white p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#95bf47] text-xl font-black text-white">
            S
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">Shopify</h2>
              {store ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-emerald-700">
                  Connected
                </span>
              ) : (
                <span className="rounded-full bg-black/[.045] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-black/45">
                  Ecommerce
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-black/45">
              Sync products, variants, pricing and stock so AARYVO can become a real shopping assistant.
            </p>
          </div>
        </div>
        <div className="rounded-full bg-[#f5f6f8] px-3 py-1.5 text-[11px] font-medium text-black/55">
          {productLimit > 0 ? `Up to ${productLimit.toLocaleString()} products` : `${requiredPlan}+ plan`}
        </div>
      </div>

      {!enabled ? (
        <div className="mt-6 rounded-2xl border border-[#eadf9f] bg-[#fff9dc] p-5">
          <p className="text-sm font-semibold">Available from {requiredPlan}</p>
          <p className="mt-1 text-xs leading-5 text-black/50">
            Upgrade to connect a Shopify store and train AARYVO on your live product catalogue.
          </p>
          <a
            href="/dashboard/billing"
            className="mt-4 inline-flex rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white"
          >
            View plans
          </a>
        </div>
      ) : !configured ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold">Shopify app credentials are not configured yet.</p>
          <p className="mt-1 text-xs leading-5 text-black/50">
            Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to the AARYVO server before connecting stores.
          </p>
        </div>
      ) : store ? (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f7f8f9] p-4">
              <p className="text-[10px] uppercase tracking-[.12em] text-black/35">Store</p>
              <p className="mt-2 truncate text-sm font-semibold">{store.shopDomain}</p>
            </div>
            <div className="rounded-2xl bg-[#f7f8f9] p-4">
              <p className="text-[10px] uppercase tracking-[.12em] text-black/35">Products synced</p>
              <p className="mt-2 text-xl font-semibold">{store.productCount.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-[#f7f8f9] p-4">
              <p className="text-[10px] uppercase tracking-[.12em] text-black/35">Last sync</p>
              <p className="mt-2 text-sm font-semibold">
                {store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleString() : "Not synced yet"}
              </p>
            </div>
          </div>

          {store.lastSyncError && (
            <div className="mt-4 rounded-2xl bg-red-50 p-4 text-xs leading-5 text-red-700">
              {store.lastSyncError}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-black/[.06] bg-[#f7f8f9] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold">Shopify App Pricing</p>
                <p className="mt-1 text-[11px] leading-5 text-black/45">
                  {pricingConfigured
                    ? "Partner API credentials are configured. Run the check before enabling App Pricing in Shopify."
                    : "Partner API credentials are incomplete on the AARYVO server."}
                </p>
              </div>
              <button
                type="button"
                onClick={checkPricing}
                disabled={!pricingConfigured || busy !== null}
                className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-semibold text-black/65 disabled:opacity-40"
              >
                {busy === "pricing" ? "Checking…" : "Verify App Pricing"}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={sync}
              disabled={busy !== null}
              className="rounded-full bg-black px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "sync" ? "Syncing catalogue…" : store.productCount ? "Sync again" : "Sync catalogue"}
            </button>
            <button
              onClick={disconnect}
              disabled={busy !== null}
              className="rounded-full border border-black/10 px-5 py-2.5 text-xs font-semibold text-black/55 disabled:opacity-50"
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <form action="/api/integrations/shopify/start" method="GET" className="mt-6 rounded-2xl bg-[#f7f8f9] p-5">
          <label className="text-sm font-semibold" htmlFor="shopify-shop">
            Shopify store domain
          </label>
          <p className="mt-1 text-xs leading-5 text-black/45">
            Enter your <span className="font-medium">.myshopify.com</span> domain. You will be taken to Shopify to approve read-only catalogue access.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              id="shopify-shop"
              name="shop"
              value={shop}
              onChange={(event) => setShop(event.target.value)}
              placeholder="your-store.myshopify.com"
              required
              className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/35"
            />
            <button className="rounded-full bg-[#151515] px-5 py-3 text-sm font-semibold text-white">
              Connect Shopify
            </button>
          </div>
          <p className="mt-3 text-[11px] text-black/35">
            AARYVO requests product and inventory read access only. It cannot edit your store in this phase.
          </p>
        </form>
      )}

      {message && (
        <p className="mt-4 rounded-2xl bg-black/[.035] px-4 py-3 text-xs leading-5 text-black/60">
          {message}
        </p>
      )}
    </section>
  );
}
