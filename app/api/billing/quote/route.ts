import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isPlanKey, PLANS } from "@/lib/billing";
import { sanitizeBillingProfile, taxBreakdownInclusive, validateBillingProfile } from "@/lib/billing-profile";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const plan = String(body.plan || "").toUpperCase();
  if (!isPlanKey(plan) || plan === "FREE") return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });

  const profile = sanitizeBillingProfile(body.profile);
  const error = validateBillingProfile(profile);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const totalPaise = PLANS[plan].price * 100;
  const tax = taxBreakdownInclusive(totalPaise, profile.state, profile.country);
  return NextResponse.json({
    plan,
    planName: PLANS[plan].name,
    currency: "INR",
    pricingMode: "tax_inclusive",
    ...tax,
  });
}
