import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { disconnectShopify } from "@/lib/shopify";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const member = await prisma.businessMember.findFirst({
      where: { userId: session.userId },
      select: { businessId: true },
    });
    if (!member) return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });

    await disconnectShopify(member.businessId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to disconnect Shopify." },
      { status: 500 },
    );
  }
}
