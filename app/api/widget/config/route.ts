import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plan-entitlements";
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
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, include: { business: { select: { websiteUrl: true, plan: true } } } });
    if (!agent?.isActive) return NextResponse.json({ error: "Agent not found." }, { status: 404, headers });
    if (!isAllowedWidgetOrigin(request, agent.business.websiteUrl)) return NextResponse.json({ error: "Unauthorized website." }, { status: 403, headers });
    const starter=hasFeature(agent.business.plan,"whatsappHandoff"),growth=hasFeature(agent.business.plan,"customWidgetBranding");
    return NextResponse.json({
      title: growth?agent.widgetTitle:"AARYVO",
      subtitle: growth?agent.widgetSubtitle:"AI sales agent online",
      welcomeMessage: agent.widgetWelcomeMessage,
      startLabel: growth?agent.widgetStartLabel:"Start conversation →",
      bookLabel: starter?agent.widgetBookLabel:"Book a consultation",
      bookingEnabled: hasFeature(agent.business.plan,"appointments"),
      whatsappEnabled: starter&&agent.widgetWhatsappEnabled,
      whatsappNumber: starter?agent.widgetWhatsappNumber:null,
      whatsappLabel: starter?agent.widgetWhatsappLabel:"Continue on WhatsApp",
      whatsappMessage: starter?agent.widgetWhatsappMessage:null,
      accentColor: growth?agent.widgetAccentColor:"#111319",
      theme: growth?agent.widgetTheme:"LIGHT",
      position: growth?agent.widgetPosition:"RIGHT",
      launcherStyle: growth?agent.widgetLauncherStyle:"SPARKLE",
      launcherLabel: growth?agent.widgetLauncherLabel:"Chat with us",
      launcherAnimation: growth?agent.widgetLauncherAnimation:"PULSE",
      launcherLabelEnabled: growth?agent.widgetLauncherLabelEnabled:true,
      showPoweredBy: growth?agent.widgetShowPoweredBy:true,
      bookingScoreThreshold: agent.bookingScoreThreshold,
      richAiActionsEnabled: hasFeature(agent.business.plan,"richAiActions"),
    }, { headers });
  } catch (error) { console.error("AARYVO widget config error", error); return NextResponse.json({ error: "Unable to load widget." }, { status: 500, headers }); }
}
