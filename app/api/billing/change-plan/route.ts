import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlanKey, PLANS, razorpayPlanId, razorpayRequest } from "@/lib/billing";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const body = await request.json();
  const plan = String(body.plan || "").toUpperCase();
  if (!isPlanKey(plan) || plan === "FREE") return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });

  const business = member.business;
  if (!business.razorpaySubscriptionId || business.plan === "FREE") return NextResponse.json({ error: "No active paid subscription found." }, { status: 400 });
  if (business.plan === plan) return NextResponse.json({ error: "This is already your current plan." }, { status: 400 });
  if (business.subscriptionCancelAtEnd) return NextResponse.json({ error: "Your subscription is scheduled for cancellation. Plan changes are disabled until cancellation is resolved." }, { status: 409 });

  const planId = razorpayPlanId(plan);
  if (!planId) return NextResponse.json({ error: `Razorpay ${plan} plan is not configured.` }, { status: 503 });

  const currentPrice = isPlanKey(business.plan) ? PLANS[business.plan].price : 0;
  const isUpgrade = PLANS[plan].price > currentPrice;

  try {
    const subscription = await razorpayRequest(`/subscriptions/${business.razorpaySubscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ plan_id: planId, quantity: 1, schedule_change_at: isUpgrade ? "now" : "cycle_end" }),
    });

    if (isUpgrade) {
      await prisma.business.update({
        where: { id: business.id },
        data: {
          plan,
          razorpayPlanId: planId,
          monthlyConversationLimit: PLANS[plan].conversations,
          subscriptionStatus: String(subscription.status || business.subscriptionStatus),
        },
      });
    }

    return NextResponse.json({ ok: true, effective: isUpgrade ? "now" : "cycle_end", plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to change plan." }, { status: 500 });
  }
}
