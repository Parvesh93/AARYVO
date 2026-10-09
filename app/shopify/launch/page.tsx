import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeShopDomain } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export default async function ShopifyLaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const { shop: rawShop } = await searchParams;
  let shop: string | null = null;
  try {
    // Shopify's launch query is only a shop hint. Ownership is verified by
    // the authorization-code callback, never by this URL alone.
    if (rawShop) shop = normalizeShopDomain(rawShop);
  } catch {
    // Present an actionable error rather than redirecting to an unknown shop.
  }

  if (!shop) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold">Open AARYVO from Shopify</h1>
        <p className="mt-4 text-black/60">
          We could not identify a valid Shopify store from this launch.
          Open AARYVO under Apps in your Shopify admin and try again.
        </p>
        <Link href="/" className="mt-8 inline-block rounded-full bg-black px-6 py-3 text-white">
          AARYVO homepage
        </Link>
      </main>
    );
  }

  const launchPath = `/shopify/launch?shop=${encodeURIComponent(shop)}`;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(launchPath)}`);

  const memberships = await prisma.businessMember.findMany({
    where: { userId: session.userId },
    select: {
      businessId: true,
      business: {
        select: {
          name: true,
          slug: true,
          billingChannel: true,
          razorpaySubscriptionId: true,
          shopifyStore: { select: { shopDomain: true } },
        },
      },
    },
  });

  if (memberships.length === 0) {
    redirect(`/onboarding?next=${encodeURIComponent(launchPath)}`);
  }

  const connected = memberships.find(
    (member) => member.business.shopifyStore?.shopDomain === shop,
  );
  if (connected) redirect("/dashboard/integrations");

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-5 py-16 text-[#151515]">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-black/10 bg-white p-7 shadow-xl shadow-black/5 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-black/40">
          Shopify connection
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Connect your AARYVO workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/60">
          Shopify store: <strong className="text-black">{shop}</strong>
        </p>
        <p className="mt-2 text-sm leading-6 text-black/60">
          Choose the AARYVO workspace you want to connect. You will authorize
          this store with Shopify before any access token is saved.
        </p>
        <div className="mt-7 space-y-3">
          {memberships.map(({ businessId, business }) => {
            const blocked = Boolean(business.razorpaySubscriptionId);
            return (
              <div key={businessId} className="rounded-2xl border border-black/10 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="font-semibold">{business.name}</p>
                  <p className="mt-1 text-xs text-black/45">{business.slug}</p>
                  {blocked && (
                    <p className="mt-2 text-xs text-amber-800">
                      This workspace has a direct Razorpay subscription.
                      Contact support before moving it to Shopify billing.
                    </p>
                  )}
                  {!blocked && business.shopifyStore && business.shopifyStore.shopDomain !== shop && (
                    <p className="mt-2 text-xs text-amber-800">
                      Connecting here will replace the existing Shopify store connection.
                    </p>
                  )}
                </div>
                {blocked ? (
                  <span className="mt-3 inline-block text-xs text-black/40 sm:mt-0">Unavailable</span>
                ) : (
                  <Link
                    href={`/api/shopify/authorize?shop=${encodeURIComponent(shop)}&businessId=${encodeURIComponent(businessId)}`}
                    className="mt-3 inline-block shrink-0 rounded-full bg-black px-5 py-3 text-center text-sm font-semibold text-white sm:mt-0"
                  >
                    Connect with Shopify
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-xs text-black/45">
          Shopify merchants select and manage their AARYVO plan through Shopify App Pricing.
        </p>
      </div>
    </main>
  );
}
