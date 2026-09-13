"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createWorkspace(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") || "").trim();
  const websiteUrl = String(formData.get("websiteUrl") || "").trim();
  const goal = String(formData.get("goal") || "Qualify leads and book appointments");
  if (!name) redirect("/onboarding?error=business");
  const base = slugify(name) || "workspace";
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  await prisma.business.create({ data: { name, slug, websiteUrl: websiteUrl || null, members: { create: { userId: session.userId, role: "OWNER" } }, agents: { create: { name: `${name} Sales Agent`, goal, systemPrompt: `You are AARYVO, the AI sales employee for ${name}. Answer accurately from approved business knowledge, understand customer intent, qualify opportunities and guide qualified visitors toward an appointment. Never invent business facts.` } } } });
  redirect("/dashboard");
}
