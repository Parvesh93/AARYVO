import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = new Set(["NEW", "WARM", "HOT", "QUALIFIED", "WON", "LOST"]);

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, select: { businessId: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const body = await request.json();
  const status = String(body.status || "").toUpperCase();
  if (!ALLOWED.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const lead = await prisma.lead.findFirst({ where: { id, businessId: member.businessId }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const updated = await prisma.lead.update({ where: { id }, data: { status: status as "NEW" | "WARM" | "HOT" | "QUALIFIED" | "WON" | "LOST" } });
  return NextResponse.json({ ok: true, lead: updated });
}
