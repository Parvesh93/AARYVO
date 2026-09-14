import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TONES = new Set(["Professional", "Friendly", "Consultative", "Concise", "Premium"]);

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, select: { businessId: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const agent = await prisma.agent.findFirst({ where: { businessId: member.businessId } });
  if (!agent) return NextResponse.json({ error: "AI employee not found" }, { status: 404 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 500) : "";
  const tone = TONES.has(body.tone) ? body.tone : "Professional";
  const qualificationQuestions = typeof body.qualificationQuestions === "string" ? body.qualificationQuestions.trim().slice(0, 5000) : "";
  const handoffInstructions = typeof body.handoffInstructions === "string" ? body.handoffInstructions.trim().slice(0, 3000) : "";
  const threshold = Math.max(0, Math.min(100, Math.round(Number(body.bookingScoreThreshold) || 65)));

  if (!name || !goal) return NextResponse.json({ error: "Name and goal are required." }, { status: 400 });

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { name, goal, tone, qualificationQuestions: qualificationQuestions || null, handoffInstructions: handoffInstructions || null, bookingScoreThreshold: threshold, isActive: body.isActive !== false },
  });

  return NextResponse.json({ ok: true, agent: { id: updated.id, name: updated.name, goal: updated.goal, tone: updated.tone, bookingScoreThreshold: updated.bookingScoreThreshold, isActive: updated.isActive } });
}
