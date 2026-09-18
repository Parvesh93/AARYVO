import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { featureError, hasFeature } from "@/lib/plan-entitlements";
import { syncShopifyCatalog } from "@/lib/shopify";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const member = await prisma.businessMember.findFirst({
      where: { userId: session.userId },
      include: { business: { select: { id: true, plan: true } } },
    });
    if (!member) return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });
    if (!hasFeature(member.business.plan, "shopifyIntegration")) {
      return NextResponse.json(
        { ok: false, error: featureError("shopifyIntegration") },
        { status: 403 },
      );
    }

    const result = await syncShopifyCatalog(member.business.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Shopify sync failed." },
      { status: 500 },
    );
  }
}
