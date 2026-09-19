import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessConversationUsage } from "@/lib/billing";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request) {
  const headers = corsHeadersFor(request);
  try {
    const rate = rateLimitWidget(request, "widget-session", 60, 60 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });

    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 190) : "";
    const requestedConversationId = typeof body.conversationId === "string" ? body.conversationId : "";

    if (!agentId || !visitorId) return NextResponse.json({ error: "Invalid session request." }, { status: 400, headers });

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, isActive: true },
      include: { business: true },
    });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "Unauthorized website." }, { status: 403, headers });

    let conversation = requestedConversationId
      ? await prisma.conversation.findFirst({
          where: { id: requestedConversationId, agentId, visitorId },
          include: { lead: true, messages: { orderBy: { createdAt: "asc" }, take: 40 } },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.conversation.findFirst({
        where: { agentId, visitorId },
        orderBy: { startedAt: "desc" },
        include: { lead: true, messages: { orderBy: { createdAt: "asc" }, take: 40 } },
      });
    }

    if (conversation) {
      return NextResponse.json({
        conversationId: conversation.id,
        restored: true,
        lead: conversation.lead ? { id: conversation.lead.id, name: conversation.lead.name, email: conversation.lead.email, phone: conversation.lead.phone, status: conversation.lead.status, score: conversation.lead.score } : null,
        messages: conversation.messages.map((message) => ({ role: message.role, content: message.content })),
      }, { headers });
    }

    if (agent.widgetConversationMode !== "CONVERSATION_FIRST") {
      return NextResponse.json({ restored: false, requiresContact: true }, { headers });
    }

    const quota = await getBusinessConversationUsage(agent.businessId);
    if (!quota.allowed) return NextResponse.json({ error: "This AI sales agent has reached its monthly conversation limit.", code: "CONVERSATION_LIMIT_REACHED" }, { status: 402, headers });

    const created = await prisma.conversation.create({
      data: { agentId, channel: "WEBSITE", visitorId },
    });

    return NextResponse.json({
      conversationId: created.id,
      restored: false,
      requiresContact: false,
      messages: [],
      usage: { used: quota.usage + 1, limit: quota.limit },
    }, { headers });
  } catch (error) {
    console.error("AARYVO widget session error", error);
    return NextResponse.json({ error: "Unable to start chat session." }, { status: 500, headers });
  }
}
