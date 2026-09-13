import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const startsAtRaw = typeof body.startsAt === "string" ? body.startsAt : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
    const startsAt = new Date(startsAtRaw);

    if (!conversationId || !startsAtRaw || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "Please select a valid appointment date and time." }, { status: 400 });
    }
    if (startsAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Appointment time must be in the future." }, { status: 400 });
    }

    const membership = await prisma.businessMember.findFirst({
      where: { userId: session.userId },
      include: { business: { include: { agents: { take: 1 } } } },
    });
    const agent = membership?.business.agents[0];
    if (!membership || !agent) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, agentId: agent.id },
      include: { lead: true },
    });
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    if (!conversation.lead) return NextResponse.json({ error: "Please qualify and capture the lead before booking." }, { status: 400 });

    const appointment = await prisma.appointment.create({
      data: {
        businessId: membership.business.id,
        leadId: conversation.lead.id,
        startsAt,
        status: "REQUESTED",
        notes: notes || conversation.lead.requirement,
      },
    });

    if (conversation.lead.status !== "QUALIFIED") {
      await prisma.lead.update({ where: { id: conversation.lead.id }, data: { status: "QUALIFIED", score: Math.max(conversation.lead.score, 85) } });
    }

    return NextResponse.json({ appointment: { id: appointment.id, startsAt: appointment.startsAt, status: appointment.status } });
  } catch (error) {
    console.error("AARYVO appointment booking error", error);
    return NextResponse.json({ error: "Appointment could not be booked. Please try again." }, { status: 500 });
  }
}
