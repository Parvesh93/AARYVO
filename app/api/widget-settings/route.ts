import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const hex = /^#[0-9a-fA-F]{6}$/;
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, select: { businessId: true } });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const agent = await prisma.agent.findFirst({ where: { businessId: member.businessId } });
  if (!agent) return NextResponse.json({ error: "AI employee not found" }, { status: 404 });
  const body = await request.json();
  const clean = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
  const data = {
    widgetAccentColor: hex.test(body.accentColor) ? body.accentColor : agent.widgetAccentColor,
    widgetTheme: body.theme === "DARK" ? "DARK" : "LIGHT",
    widgetTitle: clean(body.title, "AARYVO", 100),
    widgetSubtitle: clean(body.subtitle, "AI sales agent online", 120),
    widgetWelcomeMessage: clean(body.welcomeMessage, agent.widgetWelcomeMessage, 1000),
    widgetStartLabel: clean(body.startLabel, "Start conversation →", 80),
    widgetBookLabel: clean(body.bookLabel, "Book a consultation", 80),
    widgetPosition: body.position === "LEFT" ? "LEFT" : "RIGHT",
    widgetLauncherStyle: ["SPARKLE", "CHAT", "TEXT"].includes(body.launcherStyle) ? body.launcherStyle : "SPARKLE",
    widgetShowPoweredBy: body.showPoweredBy !== false,
  };
  await prisma.agent.update({ where: { id: agent.id }, data });
  return NextResponse.json({ ok: true });
}
