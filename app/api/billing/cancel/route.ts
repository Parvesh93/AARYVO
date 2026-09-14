import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpayRequest } from "@/lib/billing";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const business = member.business;
  if (!business.razorpaySubscriptionId || business.plan === "FREE") {
    return NextResponse.json({ error: "There is no paid subscription to cancel." }, { status: 400 });
  }

  try {
    const subscription = await razorpayRequest(`/subscriptions/${business.razorpaySubscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: true }),
    });

    await prisma.business.update({
      where: { id: business.id },
      data: {
        subscriptionCancelAtEnd: true,
        subscriptionStatus: String(subscription.status || business.subscriptionStatus),
        ...(subscription.current_end ? { subscriptionCurrentEnd: new Date(subscription.current_end * 1000), usagePeriodEnd: new Date(subscription.current_end * 1000) } : {}),
      },
    });

    return NextResponse.json({ ok: true, status: subscription.status, currentEnd: subscription.current_end || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to cancel subscription." }, { status: 500 });
  }
}
