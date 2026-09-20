import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncShopifyPricingState } from "@/lib/shopify";
import DashboardShell from "./DashboardShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: { user: { select: { name: true, email: true } }, business: { select: { name: true, websiteUrl: true } } },
  });
  if (!member) redirect("/onboarding");

  // Keep Shopify App Pricing entitlements aligned with Shopify whenever a
  // merchant uses AARYVO. A temporary Partner/Admin API failure must never
  // block dashboard access or incorrectly remove the last known entitlement.
  try {
    await syncShopifyPricingState(member.businessId);
  } catch (error) {
    console.error("Shopify pricing lifecycle sync failed:", error);
  }

  return <DashboardShell user={member.user} business={member.business}>{children}</DashboardShell>;
}
