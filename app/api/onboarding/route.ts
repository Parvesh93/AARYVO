import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const existing = await prisma.businessMember.findFirst({ where: { userId: session.userId } });
    if (existing) return NextResponse.json({ ok: true, redirectTo: "/dashboard" });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const goal = typeof body.goal === "string" && body.goal.trim() ? body.goal.trim() : "Qualify leads and book appointments";
    if (!name) return NextResponse.json({ error: "Enter your business name." }, { status: 400 });

    if (websiteUrl) {
      try {
        const url = new URL(websiteUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return NextResponse.json({ error: "Enter a valid website URL including https://" }, { status: 400 });
      }
    }

    const base = slugify(name) || "workspace";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    await prisma.business.create({
      data: {
        name,
        slug,
        websiteUrl: websiteUrl || null,
        members: { create: { userId: session.userId, role: "OWNER" } },
        agents: {
          create: {
            name: `${name} Sales Agent`,
            goal,
            systemPrompt: `You are AARYVO, the AI sales employee for ${name}. Answer accurately from approved business knowledge, understand customer intent, qualify opportunities and guide qualified visitors toward an appointment. Never invent business facts.`,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
  } catch (error) {
    console.error("AARYVO onboarding error", error);
    return NextResponse.json({ error: "Workspace could not be created. Please try again." }, { status: 500 });
  }
}
