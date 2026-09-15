import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlanKey, PLANS, razorpayRequest } from "@/lib/billing";
import { transitionByNewSubscription, updateBillingTransition } from "@/lib/billing-upgrade";

function validSignature(paymentId: string, subscriptionId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret || !paymentId || !subscriptionId || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { return false; }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const body = await request.json();
  const paymentId = String(body.razorpay_payment_id || "");
  const subscriptionId = String(body.razorpay_subscription_id || "");
  const signature = String(body.razorpay_signature || "");
  if (!validSignature(paymentId, subscriptionId, signature)) return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });

  const transition = await transitionByNewSubscription(subscriptionId);
  if (!transition || transition.businessId !== member.business.id) return NextResponse.json({ error: "Plan change was not found." }, { status: 404 });
  if (!isPlanKey(transition.toPlan) || transition.toPlan === "FREE") return NextResponse.json({ error: "Invalid target plan." }, { status: 400 });

  try {
    const subscription = await razorpayRequest(`/subscriptions/${subscriptionId}`);
    const allowed = ["authenticated", "active", "pending"].includes(String(subscription.status || "").toLowerCase());
    if (!allowed) return NextResponse.json({ error: "The new subscription has not been authorized yet." }, { status: 409 });

    const payment = paymentId ? await razorpayRequest(`/payments/${paymentId}`) : null;
    if (transition.upfrontPaise > 0 && !["authorized", "captured"].includes(String(payment?.status || "").toLowerCase())) {
      return NextResponse.json({ error: "The upgrade payment has not been confirmed yet." }, { status: 409 });
    }

    await razorpayRequest(`/subscriptions/${transition.oldSubscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: true }),
    });

    if (transition.direction === "UPGRADE") {
      await prisma.business.update({
        where: { id: member.business.id },
        data: {
          plan: transition.toPlan,
          monthlyConversationLimit: PLANS[transition.toPlan].conversations,
          subscriptionCancelAtEnd: false,
        },
      });
    }

    await updateBillingTransition(subscriptionId, "AUTHENTICATED", paymentId || null);
    return NextResponse.json({
      ok: true,
      plan: transition.toPlan,
      effective: transition.direction === "UPGRADE" ? "now" : "cycle_end",
      startAt: transition.startAt.toISOString(),
      limit: PLANS[transition.toPlan].conversations,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to finalize plan change." }, { status: 500 });
  }
}
