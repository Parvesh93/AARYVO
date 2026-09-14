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

    // Fetch website-source IDs in application code instead of using SQL LIKE/startsWith.
    // Some production MySQL databases have mixed utf8mb4 collations, which makes
    // LIKE comparisons fail with error 1267 even though normal equality works.
    const existingSources = await prisma.knowledgeItem.findMany({
      where: { agentId: agent.id },
      select: { id: true, source: true },
    });
    const websiteSourceIds = existingSources
      .filter((item) => /^https?:\/\//i.test(item.source))
      .map((item) => item.id);

    await prisma.$transaction([
      ...(websiteSourceIds.length
        ? [prisma.knowledgeItem.deleteMany({ where: { id: { in: websiteSourceIds } } })]
        : []),
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
