import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelShopifyPricingSubscription } from "@/lib/shopify";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    select: { businessId: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  try {
    const result = await cancelShopifyPricingSubscription({
      businessId: member.businessId,
      deferCancellation: true,
    });

    return NextResponse.json({
      ok: true,
      deferred: result.deferred,
      message: result.deferred
        ? "Your Shopify subscription is scheduled to cancel at the end of the current billing cycle."
        : "Your Shopify subscription has been cancelled.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to cancel Shopify subscription.",
      },
      { status: 400 },
    );
  }
}
