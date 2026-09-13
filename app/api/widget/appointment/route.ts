import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders }); }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const startsAt = new Date(typeof body.startsAt === "string" ? body.startsAt : "");
    if (!agentId || !visitorId || !conversationId || Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Please choose a valid future date and time." }, { status: 400, headers: corsHeaders });
    }
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, agentId, visitorId },
      include: { agent: true, lead: true },
    });
    if (!conversation?.agent.isActive) return NextResponse.json({ error: "Conversation not found." }, { status: 404, headers: corsHeaders });
    if (!conversation.lead) return NextResponse.json({ error: "Please share your project details before booking." }, { status: 400, headers: corsHeaders });

    const appointment = await prisma.appointment.create({
      data: { businessId: conversation.agent.businessId, leadId: conversation.lead.id, startsAt, status: "REQUESTED", notes: conversation.lead.requirement },
    });
    await prisma.lead.update({ where: { id: conversation.lead.id }, data: { status: "QUALIFIED", score: Math.max(conversation.lead.score, 85) } });
    return NextResponse.json({ appointment: { id: appointment.id, startsAt: appointment.startsAt, status: appointment.status } }, { headers: corsHeaders });
  } catch (error) {
    console.error("AARYVO widget appointment error", error);
    return NextResponse.json({ error: "Appointment could not be booked." }, { status: 500, headers: corsHeaders });
  }
}
