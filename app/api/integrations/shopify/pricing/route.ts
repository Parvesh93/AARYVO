import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopifyHostedPricingUrl } from "@/lib/shopify";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com"));
  }

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    select: { businessId: true },
  });

  if (!member) {
    return NextResponse.redirect(new URL("/onboarding", process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com"));
  }

  try {
    const pricing = await getShopifyHostedPricingUrl(member.businessId);
    return NextResponse.redirect(pricing.url);
  } catch (error) {
    const url = new URL("/dashboard/integrations", process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com");
    url.searchParams.set(
      "shopify",
      error instanceof Error ? error.message : "Unable to open Shopify App Pricing.",
    );
    return NextResponse.redirect(url);
  }
}
