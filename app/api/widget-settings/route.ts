import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { featureError, hasFeature } from "@/lib/plan-entitlements";

const hex = /^#[0-9a-fA-F]{6}$/;
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const agent = await prisma.agent.findFirst({ where: { businessId: member.businessId } });
  if (!agent) return NextResponse.json({ error: "AI employee not found" }, { status: 404 });
  const body = await request.json();
  const plan = member.business.plan;
  const clean = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
  const whatsappNumber = typeof body.whatsappNumber === "string" ? body.whatsappNumber.replace(/\D/g, "").slice(0, 20) : "";

  if (body.whatsappEnabled === true && !hasFeature(plan, "whatsappHandoff")) return NextResponse.json({ error: featureError("whatsappHandoff"), code: "PLAN_REQUIRED", requiredPlan: "STARTER" }, { status: 403 });
  const requestsCustomBranding = body.showPoweredBy === false || (typeof body.accentColor === "string" && body.accentColor !== agent.widgetAccentColor) || (body.theme && body.theme !== agent.widgetTheme) || (body.position && body.position !== agent.widgetPosition);
  const requestsAdvancedControls = (body.launcherStyle && body.launcherStyle !== agent.widgetLauncherStyle) || (body.launcherLabel && body.launcherLabel !== agent.widgetLauncherLabel) || (body.launcherAnimation && body.launcherAnimation !== agent.widgetLauncherAnimation) || (typeof body.launcherLabelEnabled === "boolean" && body.launcherLabelEnabled !== agent.widgetLauncherLabelEnabled);
  if (requestsCustomBranding && !hasFeature(plan, "customWidgetBranding")) return NextResponse.json({ error: featureError("customWidgetBranding"), code: "PLAN_REQUIRED", requiredPlan: "GROWTH" }, { status: 403 });
  if (requestsAdvancedControls && !hasFeature(plan, "advancedWidgetControls")) return NextResponse.json({ error: featureError("advancedWidgetControls"), code: "PLAN_REQUIRED", requiredPlan: "GROWTH" }, { status: 403 });

  const data = {
    widgetAccentColor: hex.test(body.accentColor) ? body.accentColor : agent.widgetAccentColor,
    widgetTheme: body.theme === "DARK" ? "DARK" : "LIGHT",
    widgetTitle: clean(body.title, "AARYVO", 100),
    widgetSubtitle: clean(body.subtitle, "AI sales agent online", 120),
    widgetWelcomeMessage: clean(body.welcomeMessage, agent.widgetWelcomeMessage, 1000),
    widgetStartLabel: clean(body.startLabel, "Start conversation →", 80),
    widgetBookLabel: clean(body.bookLabel, "Book a consultation", 80),
    widgetWhatsappEnabled: body.whatsappEnabled === true && Boolean(whatsappNumber),
    widgetWhatsappNumber: whatsappNumber || null,
    widgetWhatsappLabel: clean(body.whatsappLabel, "Continue on WhatsApp", 80),
    widgetWhatsappMessage: clean(body.whatsappMessage, "Hi, I was speaking with your AI assistant on your website and would like to continue the conversation on WhatsApp.", 700),
    widgetPosition: body.position === "LEFT" ? "LEFT" : "RIGHT",
    widgetLauncherStyle: ["SPARKLE", "CHAT", "TEXT"].includes(body.launcherStyle) ? body.launcherStyle : "SPARKLE",
    widgetLauncherLabel: clean(body.launcherLabel, "Chat with us", 60),
    widgetLauncherAnimation: ["PULSE", "BOUNCE", "GLOW", "NONE"].includes(body.launcherAnimation) ? body.launcherAnimation : "PULSE",
    widgetLauncherLabelEnabled: body.launcherLabelEnabled !== false,
    widgetShowPoweredBy: body.showPoweredBy !== false,
  };
  await prisma.agent.update({ where: { id: agent.id }, data });
  return NextResponse.json({ ok: true });
}
