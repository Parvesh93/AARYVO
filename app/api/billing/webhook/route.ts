import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLANS, planFromRazorpayPlanId, verifyWebhook } from "@/lib/billing";
import { transitionByNewSubscription, transitionByOldSubscription, updateBillingTransition } from "@/lib/billing-upgrade";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhook(raw, signature)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  try {
    const payload = JSON.parse(raw);
    const event = String(payload.event || "");
    const sub = payload.payload?.subscription?.entity;
    if (!sub?.id) return NextResponse.json({ ok: true });

    const replacement = await transitionByNewSubscription(String(sub.id));
    if (replacement) {
      const plan = planFromRazorpayPlanId(String(sub.plan_id || ""));
      const status = String(sub.status || event.replace("subscription.", ""));
      const statusLower = status.toLowerCase();
      const activated = ["subscription.activated", "subscription.charged", "subscription.resumed"].includes(event) && ["active", "authenticated", "pending"].includes(statusLower);
      const authenticated = event === "subscription.authenticated" || statusLower === "authenticated";
      const terminal = ["subscription.cancelled", "subscription.completed", "subscription.expired"].includes(event) || ["cancelled", "completed", "expired"].includes(statusLower);

      if (replacement.direction === "DOWNGRADE") {
        if (authenticated && !activated) {
          await updateBillingTransition(String(sub.id), "AUTHENTICATED");
          return NextResponse.json({ ok: true });
        }

        if (activated && plan) {
          await prisma.business.update({
            where: { id: replacement.businessId },
            data: {
              razorpaySubscriptionId: String(sub.id),
              razorpayPlanId: String(sub.plan_id || ""),
              plan,
              monthlyConversationLimit: PLANS[plan].conversations,
              subscriptionStatus: status,
              subscriptionCancelAtEnd: false,
              ...(sub.current_start ? { subscriptionCurrentStart: new Date(sub.current_start * 1000), usagePeriodStart: new Date(sub.current_start * 1000) } : {}),
              ...(sub.current_end ? { subscriptionCurrentEnd: new Date(sub.current_end * 1000), usagePeriodEnd: new Date(sub.current_end * 1000) } : {}),
            },
          });
          await updateBillingTransition(String(sub.id), "ACTIVE");
        } else if (terminal) {
          await updateBillingTransition(String(sub.id), "TERMINAL");
        }
        return NextResponse.json({ ok: true });
      }

      if (activated && plan) {
        await prisma.business.update({
          where: { id: replacement.businessId },
          data: {
            razorpaySubscriptionId: String(sub.id),
            razorpayPlanId: String(sub.plan_id || ""),
            plan,
            monthlyConversationLimit: PLANS[plan].conversations,
            subscriptionStatus: status,
            subscriptionCancelAtEnd: false,
            ...(sub.current_start ? { subscriptionCurrentStart: new Date(sub.current_start * 1000), usagePeriodStart: new Date(sub.current_start * 1000) } : {}),
            ...(sub.current_end ? { subscriptionCurrentEnd: new Date(sub.current_end * 1000), usagePeriodEnd: new Date(sub.current_end * 1000) } : {}),
          },
        });
        await updateBillingTransition(String(sub.id), "ACTIVE");
      } else if (authenticated) {
        await updateBillingTransition(String(sub.id), "AUTHENTICATED");
      } else if (terminal) {
        await updateBillingTransition(String(sub.id), "TERMINAL");
      }
      return NextResponse.json({ ok: true });
    }

    const business = await prisma.business.findUnique({ where: { razorpaySubscriptionId: sub.id } });
    if (!business) {
      const oldTransition = await transitionByOldSubscription(String(sub.id));
      if (oldTransition) return NextResponse.json({ ok: true });
      return NextResponse.json({ ok: true });
    }

    const transition = await transitionByOldSubscription(String(sub.id));
    const planId = String(sub.plan_id || business.razorpayPlanId || "");
    const plan = planFromRazorpayPlanId(planId);
    const status = String(sub.status || event.replace("subscription.", ""));
    const active = ["subscription.activated", "subscription.charged", "subscription.resumed", "subscription.updated"].includes(event) && ["active", "authenticated", "pending"].includes(status.toLowerCase());
    const terminal = ["subscription.cancelled", "subscription.completed", "subscription.expired"].includes(event) || ["cancelled", "completed", "expired"].includes(status.toLowerCase());

    await prisma.business.update({
      where: { id: business.id },
      data: {
        subscriptionStatus: status,
        razorpayPlanId: planId || null,
        ...(plan && active && !transition ? { plan, monthlyConversationLimit: PLANS[plan].conversations } : {}),
        ...(sub.current_start ? { subscriptionCurrentStart: new Date(sub.current_start * 1000), usagePeriodStart: new Date(sub.current_start * 1000) } : {}),
        ...(sub.current_end ? { subscriptionCurrentEnd: new Date(sub.current_end * 1000), usagePeriodEnd: new Date(sub.current_end * 1000) } : {}),
        ...(terminal && !transition ? { plan: "FREE", monthlyConversationLimit: PLANS.FREE.conversations, subscriptionCancelAtEnd: false } : { subscriptionCancelAtEnd: Boolean(sub.cancel_at_cycle_end) }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AARYVO billing webhook error", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
