import { redirect } from "next/navigation";
import { Bot, Database, MessageSquareText, Target } from "lucide-react";
import AgentTester from "@/app/dashboard/AgentTester";
import AgentConfigForm from "@/app/dashboard/ai-employee/AgentConfigForm";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AIEmployeePage() {
  const session = await requireSession();
  const member = await prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: { include: { agents: { take: 1, include: { _count: { select: { knowledgeItems: true, conversations: true } } } } } } } });
  if (!member) redirect("/onboarding");
  const business = member.business;
  const agent = business.agents[0];

  return <div className="mx-auto max-w-[1400px] pb-8">
    <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">AI sales employee</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Configure your AI employee</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Control how AARYVO represents your business, qualifies prospects and decides when to move a conversation toward a consultation.</p></div>
    {agent ? <>
      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-black/[.055] bg-white p-5"><Bot size={17} className="text-black/30"/><p className="mt-4 text-xs text-black/35">Employee</p><p className="mt-1 font-semibold">{agent.name}</p></div><div className="rounded-2xl border border-black/[.055] bg-white p-5"><Database size={17} className="text-black/30"/><p className="mt-4 text-xs text-black/35">Knowledge</p><p className="mt-1 font-semibold">{agent._count.knowledgeItems} pages</p></div><div className="rounded-2xl border border-black/[.055] bg-white p-5"><MessageSquareText size={17} className="text-black/30"/><p className="mt-4 text-xs text-black/35">Conversations</p><p className="mt-1 font-semibold">{agent._count.conversations}</p></div><div className="rounded-2xl border border-black/[.055] bg-white p-5"><Target size={17} className="text-black/30"/><p className="mt-4 text-xs text-black/35">Booking threshold</p><p className="mt-1 font-semibold">{agent.bookingScoreThreshold}/100</p></div></section>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_.95fr]"><AgentConfigForm agent={{ name:agent.name, goal:agent.goal, tone:agent.tone, qualificationQuestions:agent.qualificationQuestions, bookingScoreThreshold:agent.bookingScoreThreshold, handoffInstructions:agent.handoffInstructions, isActive:agent.isActive }}/><div className="xl:sticky xl:top-0 xl:self-start"><div className="mb-3"><p className="text-xs font-medium text-black/35">Live preview</p><p className="mt-1 text-sm font-semibold">Test before customers see it</p></div><AgentTester businessName={business.name}/></div></div>
    </> : <div className="mt-7 rounded-3xl border border-black/[.06] bg-white p-12 text-center text-sm text-black/40">Complete onboarding to create your AI employee.</div>}
  </div>;
}
