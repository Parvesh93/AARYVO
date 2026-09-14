import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { crawlWebsite } from "@/lib/website-ingestion";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: { business: { include: { agents: { take: 1 } } } },
  });

  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const business = membership.business;
  const agent = business.agents[0];

  if (!agent) return NextResponse.json({ error: "No AI employee was found." }, { status: 400 });
  if (!business.websiteUrl) return NextResponse.json({ error: "Add a website URL first." }, { status: 400 });

  try {
    const pages = await crawlWebsite(business.websiteUrl);

    await prisma.$transaction([
      prisma.knowledgeItem.deleteMany({
        where: {
          agentId: agent.id,
          OR: [
            { source: { startsWith: "http://" } },
            { source: { startsWith: "https://" } },
          ],
        },
      }),
      ...pages.map((page) =>
        prisma.knowledgeItem.create({
          data: {
            agentId: agent.id,
            source: page.url,
            title: page.title,
            content: page.content,
          },
        })
      ),
    ]);

    return NextResponse.json({ ok: true, pages: pages.length });
  } catch (error) {
    console.error("AARYVO website scan error", error);
    const message = error instanceof Error ? error.message : "Website scan failed.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
