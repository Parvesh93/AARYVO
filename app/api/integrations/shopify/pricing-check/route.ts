import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isShopifyPartnerPricingConfigured,
  testShopifyPartnerPricingConnection,
} from "@/lib/shopify";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  if (!isShopifyPartnerPricingConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Shopify App Pricing credentials are incomplete. Add the Partner organization ID, app ID and Partner API access token.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await testShopifyPartnerPricingConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify Shopify App Pricing.",
      },
      { status: 502 },
    );
  }
}
