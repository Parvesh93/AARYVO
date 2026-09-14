import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAgent(userId: string) {
  const member = await prisma.businessMember.findFirst({ where: { userId }, select: { businessId: true } });
  if (!member) return null;
  return prisma.agent.findFirst({ where: { businessId: member.businessId }, select: { id: true } });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agent = await getAgent(session.userId);
  if (!agent) return NextResponse.json({ error: "AI employee not found" }, { status: 404 });
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 190) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 50000) : "";
  if (!title || !content) return NextResponse.json({ error: "Title and knowledge content are required." }, { status: 400 });
  const item = await prisma.knowledgeItem.create({ data: { agentId: agent.id, source: `manual:${Date.now()}`, title, content } });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agent = await getAgent(session.userId);
  if (!agent) return NextResponse.json({ error: "AI employee not found" }, { status: 404 });
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Knowledge item is required." }, { status: 400 });
  const item = await prisma.knowledgeItem.findFirst({ where: { id, agentId: agent.id }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
  await prisma.knowledgeItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
