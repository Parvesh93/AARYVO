import { NextResponse } from "next/server";
import { getAvailableSlots, getBusinessBookingSettings } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";

export async function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) }); }

export async function POST(request: Request) {
  const headers = corsHeadersFor(request);
  try {
    const rate = rateLimitWidget(request, "widget-availability", 30, 60 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers });
    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    if (!agentId || !visitorId || !conversationId) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, agentId, visitorId }, include: { agent: { include: { business: true } }, lead: true } });
    if (!conversation?.agent.isActive || !conversation.lead) return NextResponse.json({ error: "Conversation not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, conversation.agent.business.websiteUrl)) return NextResponse.json({ error: "This website is not authorized to use this AARYVO agent." }, { status: 403, headers });
    const [slots, settings] = await Promise.all([getAvailableSlots(conversation.agent.businessId), getBusinessBookingSettings(conversation.agent.businessId)]);
    return NextResponse.json({ slots, timeZone: settings.timeZone, slotMinutes: settings.slotMinutes }, { headers });
  } catch (error) {
    console.error("AARYVO availability error", error);
    return NextResponse.json({ error: "Availability could not be loaded." }, { status: 500, headers });
  }
}
