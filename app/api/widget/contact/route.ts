import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 190) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 190) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 80) : "";

    if (!agentId || !visitorId || !name || (!email && !phone)) {
      return NextResponse.json({ error: "Name and at least one contact method are required." }, { status: 400, headers: corsHeaders });
    }

    const agent = await prisma.agent.findFirst({ where: { id: agentId, isActive: true } });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers: corsHeaders });

    const conversation = await prisma.conversation.create({
      data: { agentId: agent.id, channel: "WEBSITE", visitorId },
    });

    const lead = await prisma.lead.create({
      data: {
        businessId: agent.businessId,
        conversationId: conversation.id,
        name,
        email: email || null,
        phone: phone || null,
        score: 15,
        status: "NEW",
        requirement: "Pre-chat contact captured; qualification pending.",
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      lead: { id: lead.id, status: lead.status, score: lead.score },
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("AARYVO widget contact capture error", error);
    return NextResponse.json({ error: "Contact details could not be saved." }, { status: 500, headers: corsHeaders });
  }
}
