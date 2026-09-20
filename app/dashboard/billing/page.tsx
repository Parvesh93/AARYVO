import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessConversationUsage } from "@/lib/billing";
import BillingClient from "./BillingClient";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ shopifyPricing?: string; message?: string }>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: {
      business: {
        include: { shopifyStore: true },
      },
    },
  });
  if (!member) redirect("/onboarding");

  const b = member.business;
  const quota = await getBusinessConversationUsage(b.id);
  const shopifyManaged =
    Boolean(b.shopifyStore) &&
    !b.razorpaySubscriptionId;
  const shopifyAvailable = !b.razorpaySubscriptionId;

  return <div className="mx-auto max-w-[1400px] pb-8">
    {query.shopifyPricing === "success" && (
      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
        Your Shopify subscription is active and the matching AARYVO plan has been applied.
      </div>
    )}
    {query.shopifyPricing === "error" && (
      <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {query.message || "We could not verify the Shopify subscription. Please try again."}
      </div>
    )}
    <p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">Subscription</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Billing & plan</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Choose the AARYVO plan that matches your website conversation volume. Usage resets each billing period.</p>
    <BillingClient
      currentPlan={b.plan}
      usage={quota.usage}
      limit={quota.limit}
      subscriptionStatus={b.subscriptionStatus}
      currentPeriodEnd={b.subscriptionCurrentEnd?.toISOString() || null}
      cancelAtEnd={b.subscriptionCancelAtEnd}
      hasSubscription={Boolean(b.razorpaySubscriptionId) || shopifyManaged}
      billingProvider={shopifyManaged ? ("SHOPIFY" as const) : ("RAZORPAY" as const)}
      shopifyAvailable={shopifyAvailable}
    />
  </div>;
}
