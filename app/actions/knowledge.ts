"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { crawlWebsite } from "@/lib/website-ingestion";

export async function buildKnowledgeBase() {
  const session = await requireSession();
  const membership = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: { business: { include: { agents: { take: 1 } } } },
  });

  if (!membership) redirect("/onboarding");
  const business = membership.business;
  const agent = business.agents[0];
  if (!agent) redirect("/dashboard?knowledge=error&message=No%20AI%20agent%20was%20found.");
  if (!business.websiteUrl) redirect("/dashboard?knowledge=error&message=Add%20a%20website%20URL%20first.");

  try {
    const pages = await crawlWebsite(business.websiteUrl);
    await prisma.$transaction([
      prisma.knowledgeItem.deleteMany({ where: { agentId: agent.id } }),
      ...pages.map((page) => prisma.knowledgeItem.create({
        data: { agentId: agent.id, source: page.url, title: page.title, content: page.content },
      })),
    ]);
    redirect(`/dashboard?knowledge=success&pages=${pages.length}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Website scan failed.";
    redirect(`/dashboard?knowledge=error&message=${encodeURIComponent(message.slice(0, 180))}`);
  }
}
