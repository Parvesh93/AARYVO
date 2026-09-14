import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessConversationUsage } from "@/lib/billing";
import BillingClient from "./BillingClient";

export default async function BillingPage() {
  const session = await requireSession();
  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true } });
  if (!member) redirect("/onboarding");

  const b = member.business;
  const quota = await getBusinessConversationUsage(b.id);

  return <div className="mx-auto max-w-[1400px] pb-8">
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
      hasSubscription={Boolean(b.razorpaySubscriptionId)}
    />
  </div>;
}
