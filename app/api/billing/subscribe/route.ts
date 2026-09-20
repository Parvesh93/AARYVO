import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlanKey, PLANS, razorpayConfigured, razorpayPlanId, razorpayRequest } from "@/lib/billing";
import { sanitizeBillingProfile, saveBillingProfile, taxBreakdownExclusive, validateBillingProfile } from "@/lib/billing-profile";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: { user: true, business: { include: { shopifyStore: { select: { id: true } } } } },
  });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (member.business.shopifyStore) {
    return NextResponse.json(
      { error: "This workspace is connected to Shopify. Manage your AARYVO subscription through Shopify." },
      { status: 409 },
    );
  }
  if (!razorpayConfigured()) return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });

  const body = await request.json();
  const plan = String(body.plan || "").toUpperCase();
  if (!isPlanKey(plan) || plan === "FREE") return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });

  const profile = sanitizeBillingProfile(body.profile);
  const profileError = validateBillingProfile(profile);
  if (profileError) return NextResponse.json({ error: profileError }, { status: 400 });

  const business = member.business;
  const paidOrPendingStatuses = ["created", "authenticated", "active", "pending", "halted"];
  if (business.razorpaySubscriptionId && business.plan !== "FREE" && paidOrPendingStatuses.includes(String(business.subscriptionStatus).toLowerCase())) {
    return NextResponse.json({ error: "A paid subscription already exists. Use Change plan instead of creating another subscription." }, { status: 409 });
  }

  const planId = razorpayPlanId(plan);
  if (!planId) return NextResponse.json({ error: `Razorpay ${plan} plan is not configured.` }, { status: 503 });

  try {
    await saveBillingProfile(member.businessId, profile);
    const tax = taxBreakdownExclusive(PLANS[plan].price * 100, profile.state, profile.country);
    const subscription = await razorpayRequest("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120,
        quantity: 1,
        customer_notify: 1,
        notes: {
          businessId: member.businessId,
          plan,
          billingLegalName: profile.legalName,
          billingEmail: profile.email,
          billingPhone: profile.phone,
          billingState: profile.state,
          billingCountry: profile.country,
          gstin: profile.gstin || "",
          baseAmountPaise: String(tax.subtotalPaise),
          gstAmountPaise: String(tax.taxPaise),
          totalAmountPaise: String(tax.totalPaise),
        },
      }),
    });

    await prisma.business.update({
      where: { id: member.businessId },
      data: { razorpaySubscriptionId: subscription.id, razorpayPlanId: planId, subscriptionStatus: subscription.status || "created", subscriptionCancelAtEnd: false },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      name: profile.legalName || business.name,
      email: profile.email || member.user.email,
      phone: profile.phone,
      plan,
      pricingMode: "tax_exclusive",
      tax,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start subscription." }, { status: 500 });
  }
}
