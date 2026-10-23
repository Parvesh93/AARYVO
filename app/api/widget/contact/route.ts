import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLeadNotification } from "@/lib/notifications";
import { getBusinessConversationUsage } from "@/lib/billing";
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
    const existingConversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";

    if (!agentId || !visitorId || !name || (!email && !phone)) return NextResponse.json({ error: "Name and at least one contact method are required." }, { status: 400, headers });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400, headers });
    if (phone && phone.replace(/\D/g, "").length < 7) return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400, headers });

    const agent = await prisma.agent.findFirst({ where: { id: agentId, isActive: true }, include: { business: true } });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "This website is not authorized to use this AARYVO agent." }, { status: 403, headers });

    // An ongoing conversation-first chat must keep its history when a visitor
    // supplies details to request a consultation. Bind it to the same agent,
    // visitor ID and recent session; never accept arbitrary conversation IDs.
    const existing = existingConversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: existingConversationId, agentId: agent.id, visitorId,
            startedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
          },
          include: { lead: true },
        }) : null;
    if (existingConversationId && !existing) {
      return NextResponse.json({ error: "This conversation has expired. Reopen the chat to continue." }, { status: 404, headers });
    }
    if (existing?.lead) {
      return NextResponse.json({
        conversationId: existing.id,
        lead: { id: existing.lead.id, name: existing.lead.name, email: existing.lead.email,
          phone: existing.lead.phone, status: existing.lead.status, score: existing.lead.score },
      }, { headers });
    }
    const quota = existing ? null : await getBusinessConversationUsage(agent.businessId);
    if (quota && !quota.allowed) return NextResponse.json({
      error: "This AI sales agent has reached its monthly conversation limit.",
      code: "CONVERSATION_LIMIT_REACHED", plan: quota.plan, limit: quota.limit,
    }, { status: 402, headers });

    const conversation = existing || await prisma.conversation.create({
      data: { agentId: agent.id, channel: "WEBSITE", visitorId },
    });
    const lead = await prisma.lead.create({
      data: { businessId: agent.businessId, conversationId: conversation.id,
        name, email: email || null, phone: phone || null,
        score: 15, status: "NEW", requirement: "Contact captured; qualification pending." },
    });
    void sendLeadNotification({ businessId: agent.businessId, leadId: lead.id, event: "NEW_LEAD" });

    return NextResponse.json({
      conversationId: conversation.id,
      lead: { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone,
        status: lead.status, score: lead.score },
      usage: quota ? { used: quota.usage + 1, limit: quota.limit } : undefined,
    }, { headers });
  } catch (error) {
    console.error("AARYVO widget contact capture error", error);
    return NextResponse.json({ error: "Contact details could not be saved." }, { status: 500, headers });
  }
}
