import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";

export async function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) }); }
export async function POST(request: Request) {
  const headers = corsHeadersFor(request);
  try {
    const rate = rateLimitWidget(request, "widget-config", 60, 60 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
    const body = await request.json();
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    if (!agentId) return NextResponse.json({ error: "Agent is required." }, { status: 400, headers });
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, include: { business: { select: { websiteUrl: true } } } });
    if (!agent?.isActive) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "Unauthorized website." }, { status: 403, headers });
    return NextResponse.json({
      title: agent.widgetTitle,
      subtitle: agent.widgetSubtitle,
      welcomeMessage: agent.widgetWelcomeMessage,
      startLabel: agent.widgetStartLabel,
      bookLabel: agent.widgetBookLabel,
      whatsappEnabled: agent.widgetWhatsappEnabled,
      whatsappNumber: agent.widgetWhatsappNumber,
      whatsappLabel: agent.widgetWhatsappLabel,
      whatsappMessage: agent.widgetWhatsappMessage,
      accentColor: agent.widgetAccentColor,
      theme: agent.widgetTheme,
      position: agent.widgetPosition,
      launcherStyle: agent.widgetLauncherStyle,
      launcherLabel: agent.widgetLauncherLabel,
      launcherAnimation: agent.widgetLauncherAnimation,
      launcherLabelEnabled: agent.widgetLauncherLabelEnabled,
      showPoweredBy: agent.widgetShowPoweredBy,
      bookingScoreThreshold: agent.bookingScoreThreshold,
    }, { headers });
  } catch (error) { console.error("AARYVO widget config error", error); return NextResponse.json({ error: "Unable to load widget." }, { status: 500, headers }); }
}
