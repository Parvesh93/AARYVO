import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeShopDomain, shopifyAuthorizationUrl } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let shop: string;
  try {
    shop = normalizeShopDomain(url.searchParams.get("shop") || "");
  } catch {
    return NextResponse.json({ error: "Invalid Shopify store." }, { status: 400 });
  }

  const launch = `/shopify/launch?shop=${encodeURIComponent(shop)}`;
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(launch)}`, url));
  }

  const businessId = url.searchParams.get("businessId") || "";
  if (!businessId) return NextResponse.redirect(new URL(launch, url));

  const membership = await prisma.businessMember.findFirst({
    where: { businessId, userId: session.userId },
    select: {
      business: {
        select: {
          razorpaySubscriptionId: true,
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "You cannot connect this workspace." }, { status: 403 });
  }
  if (membership.business.razorpaySubscriptionId) {
    return NextResponse.json(
      { error: "This workspace has direct billing. Contact support to migrate before connecting via Shopify." },
      { status: 409 },
    );
  }

  try {
    const authorizeUrl = shopifyAuthorizationUrl({
      businessId,
      userId: session.userId,
      shop,
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error("Shopify launch authorization failed", error);
    return NextResponse.json(
      { error: "Shopify authorization is temporarily unavailable." },
      { status: 503 },
    );
  }
}
