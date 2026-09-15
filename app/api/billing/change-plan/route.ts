import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlanKey, PLANS, razorpayPlanId, razorpayRequest } from "@/lib/billing";
import { activeTransitionForBusiness, createBillingTransition } from "@/lib/billing-upgrade";

function proratedUpgradePaise(currentPrice: number, targetPrice: number, periodStart: Date | null, periodEnd: Date | null) {
  if (targetPrice <= currentPrice) return 0;
  const now = Date.now();
  const start = periodStart?.getTime() || now;
  const end = periodEnd?.getTime() || now;
  const total = Math.max(1, end - start);
  const remaining = Math.max(0, Math.min(total, end - now));
  return Math.max(0, Math.round((targetPrice - currentPrice) * 100 * (remaining / total)));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true, user: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const body = await request.json();
  const plan = String(body.plan || "").toUpperCase();
  if (!isPlanKey(plan) || plan === "FREE") return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });

  const business = member.business;
  if (!business.razorpaySubscriptionId || business.plan === "FREE") return NextResponse.json({ error: "No active paid subscription found." }, { status: 400 });
  if (business.plan === plan) return NextResponse.json({ error: "This is already your current plan." }, { status: 400 });
  if (business.subscriptionCancelAtEnd) return NextResponse.json({ error: "Your subscription is already scheduled for cancellation. Resolve that before changing plans." }, { status: 409 });
  if (await activeTransitionForBusiness(business.id)) return NextResponse.json({ error: "A plan change is already pending for this workspace." }, { status: 409 });

  const planId = razorpayPlanId(plan);
  if (!planId) return NextResponse.json({ error: `Razorpay ${plan} plan is not configured.` }, { status: 503 });

  const currentPrice = isPlanKey(business.plan) ? PLANS[business.plan].price : 0;
  const targetPrice = PLANS[plan].price;
  const isUpgrade = targetPrice > currentPrice;
  const startAt = business.subscriptionCurrentEnd && business.subscriptionCurrentEnd.getTime() > Date.now()
    ? business.subscriptionCurrentEnd
    : new Date(Date.now() + 5 * 60 * 1000);
  const upfrontPaise = isUpgrade
    ? proratedUpgradePaise(currentPrice, targetPrice, business.subscriptionCurrentStart, business.subscriptionCurrentEnd)
    : 0;

  try {
    const subscription = await razorpayRequest("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120,
        quantity: 1,
        start_at: Math.floor(startAt.getTime() / 1000),
        customer_notify: 1,
        notes: {
          aaryvo_business_id: business.id,
          aaryvo_from_plan: business.plan,
          aaryvo_to_plan: plan,
          aaryvo_change: isUpgrade ? "upgrade" : "downgrade",
        },
        ...(upfrontPaise > 0 ? {
          addons: [{ item: { name: `${PLANS[plan].name} immediate upgrade access`, amount: upfrontPaise, currency: "INR", description: `Prorated upgrade from ${business.plan} to ${plan} until the next billing date.` } }],
        } : {}),
      }),
    });

    if (!subscription?.id) throw new Error("Razorpay did not create the replacement subscription.");

    await createBillingTransition({
      id: crypto.randomUUID(),
      businessId: business.id,
      oldSubscriptionId: business.razorpaySubscriptionId,
      newSubscriptionId: String(subscription.id),
      fromPlan: business.plan,
      toPlan: plan,
      direction: isUpgrade ? "UPGRADE" : "DOWNGRADE",
      upfrontPaise,
      startAt,
      status: "CREATED",
      paymentId: null,
    });

    return NextResponse.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      subscriptionId: subscription.id,
      plan,
      planName: PLANS[plan].name,
      direction: isUpgrade ? "upgrade" : "downgrade",
      effective: isUpgrade ? "after_authorization" : "cycle_end",
      startAt: startAt.toISOString(),
      upfrontPaise,
      name: member.user.name || business.name,
      email: member.user.email,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare plan change." }, { status: 500 });
  }
}
