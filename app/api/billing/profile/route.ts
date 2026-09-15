import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EMPTY_BILLING_PROFILE, getBillingProfile, sanitizeBillingProfile, saveBillingProfile, validateBillingProfile } from "@/lib/billing-profile";

async function workspace() {
  const session = await getSession();
  if (!session) return null;
  return prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { user: true, business: true } });
}

export async function GET() {
  const member = await workspace();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const saved = await getBillingProfile(member.businessId);
  return NextResponse.json({ profile: saved || { ...EMPTY_BILLING_PROFILE, legalName: member.business.name, email: member.user.email } });
}

export async function PUT(request: Request) {
  const member = await workspace();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = sanitizeBillingProfile(await request.json());
  const error = validateBillingProfile(profile);
  if (error) return NextResponse.json({ error }, { status: 400 });
  await saveBillingProfile(member.businessId, profile);
  return NextResponse.json({ ok: true, profile });
}
