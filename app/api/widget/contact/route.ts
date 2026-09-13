import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request) {
  const headers = corsHeadersFor(request);
  try {
    const rate = rateLimitWidget(request, "widget-contact", 12, 60 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers });

    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 190) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 190) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 80) : "";

    if (!agentId || !visitorId || !name || (!email && !phone)) return NextResponse.json({ error: "Name and at least one contact method are required." }, { status: 400, headers });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400, headers });
    if (phone && phone.replace(/\D/g, "").length < 7) return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400, headers });

    const agent = await prisma.agent.findFirst({ where: { id: agentId, isActive: true }, include: { business: true } });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "This website is not authorized to use this AARYVO agent." }, { status: 403, headers });

    const conversation = await prisma.conversation.create({ data: { agentId: agent.id, channel: "WEBSITE", visitorId } });
    const lead = await prisma.lead.create({ data: { businessId: agent.businessId, conversationId: conversation.id, name, email: email || null, phone: phone || null, score: 15, status: "NEW", requirement: "Pre-chat contact captured; qualification pending." } });

    return NextResponse.json({ conversationId: conversation.id, lead: { id: lead.id, status: lead.status, score: lead.score } }, { headers });
  } catch (error) {
    console.error("AARYVO widget contact capture error", error);
    return NextResponse.json({ error: "Contact details could not be saved." }, { status: 500, headers });
  }
}
