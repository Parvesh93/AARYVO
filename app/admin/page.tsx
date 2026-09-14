import Link from "next/link";
import { Activity, Bot, Building2, CalendarDays, CheckCircle2, CircleDollarSign, Database, ExternalLink, Mail, MessageSquareText, Server, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/billing";

function money(value:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(value)}
function date(value:Date){return new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short",year:"numeric"}).format(value)}

export default async function AdminPage(){
  const [businesses,totalUsers,totalConversations,totalLeads,totalAppointments] = await Promise.all([
    prisma.business.findMany({orderBy:{createdAt:"desc"},include:{members:{include:{user:true}},agents:{select:{id:true,isActive:true,_count:{select:{conversations:true,knowledgeItems:true}}}},_count:{select:{leads:true,appointments:true}}}}),
    prisma.user.count(), prisma.conversation.count(), prisma.lead.count(), prisma.appointment.count(),
  ]);

  const paid=businesses.filter(b=>b.plan!=="FREE"&&!["cancelled","completed","expired"].includes(b.subscriptionStatus.toLowerCase()));
  const mrr=paid.reduce((sum,b)=>sum+(PLANS[b.plan as keyof typeof PLANS]?.price||0),0);
  const activeAgents=businesses.reduce((sum,b)=>sum+b.agents.filter(a=>a.isActive).length,0);
  const planCounts=businesses.reduce<Record<string,number>>((acc,b)=>{acc[b.plan]=(acc[b.plan]||0)+1;return acc},{});
  const health=[
    ["Database",true,Database],
    ["OpenAI",Boolean(process.env.OPENAI_API_KEY),Bot],
    ["SMTP",Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS),Mail],
    ["Razorpay",Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET),CircleDollarSign],
    ["Google OAuth",Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET),CalendarDays],
  ] as const;

  return <div>
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Platform operations</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Founder dashboard</h1><p className="mt-2 text-sm text-black/45">A launch-level view of customers, subscriptions, usage and system readiness.</p></div><div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">● AARYVO production</div></div>

    <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[[Building2,"Workspaces",businesses.length],[Users,"Users",totalUsers],[CircleDollarSign,"MRR",money(mrr)],[MessageSquareText,"Conversations",totalConversations],[Activity,"Leads",totalLeads]].map(([Icon,label,value])=>{const I=Icon as typeof Building2;return <div key={label as string} className="rounded-3xl border border-black/[.055] bg-white p-5"><I size={18} className="text-black/30"/><p className="mt-5 text-xs text-black/35">{label as string}</p><p className="mt-1 text-2xl font-semibold tracking-[-.04em]">{value as string|number}</p></div>})}
    </section>

    <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white">
        <div className="flex items-center justify-between border-b border-black/[.055] px-5 py-5"><div><h2 className="font-semibold">Customer workspaces</h2><p className="mt-1 text-xs text-black/35">Newest first · {businesses.length} total</p></div><span className="text-xs text-black/35">{paid.length} paid</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35"><tr><th className="px-5 py-3 font-medium">Business</th><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 font-medium">Plan</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Usage</th><th className="px-4 py-3 font-medium">Leads</th><th className="px-4 py-3 font-medium">Joined</th></tr></thead><tbody className="divide-y divide-black/[.05]">{businesses.map(b=>{const owner=b.members.find(m=>m.role==="OWNER")?.user||b.members[0]?.user;const conversations=b.agents.reduce((s,a)=>s+a._count.conversations,0);return <tr key={b.id} className="hover:bg-black/[.015]"><td className="px-5 py-4"><div className="font-medium">{b.name}</div>{b.websiteUrl?<a href={b.websiteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-black/35 hover:text-black">{b.websiteUrl.replace(/^https?:\/\//,"").replace(/\/$/,"")}<ExternalLink size={10}/></a>:<p className="mt-1 text-[11px] text-black/25">No website</p>}</td><td className="px-4 py-4"><div>{owner?.name||"—"}</div><div className="mt-1 text-[11px] text-black/35">{owner?.email||"—"}</div></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${b.plan==="FREE"?"bg-black/[.05] text-black/50":"bg-violet-50 text-violet-700"}`}>{b.plan}</span></td><td className="px-4 py-4 text-xs text-black/55">{b.subscriptionCancelAtEnd?"Cancels at end":b.subscriptionStatus}</td><td className="px-4 py-4"><div className="text-xs font-medium">{conversations} / {b.monthlyConversationLimit}</div><div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-black/[.06]"><div className="h-full rounded-full bg-black" style={{width:`${Math.min(100,(conversations/Math.max(1,b.monthlyConversationLimit))*100)}%`}}/></div></td><td className="px-4 py-4 text-xs">{b._count.leads}</td><td className="px-4 py-4 text-xs text-black/45">{date(b.createdAt)}</td></tr>})}{!businesses.length&&<tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-black/35">No customer workspaces yet.</td></tr>}</tbody></table></div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-black/[.055] bg-[#111319] p-6 text-white"><p className="text-xs uppercase tracking-[.16em] text-white/35">Revenue</p><div className="mt-5 text-4xl font-semibold tracking-[-.05em]">{money(mrr)}</div><p className="mt-1 text-xs text-white/35">estimated monthly recurring revenue</p><div className="mt-7 space-y-3">{Object.entries(PLANS).map(([key,plan])=><div key={key} className="flex items-center justify-between text-sm"><span className="text-white/50">{plan.name}</span><span>{planCounts[key]||0}</span></div>)}</div></div>
        <div className="rounded-3xl border border-black/[.055] bg-white p-6"><div className="flex items-center gap-2"><Server size={17}/><h2 className="font-semibold">System readiness</h2></div><div className="mt-5 space-y-3">{health.map(([label,ok,Icon])=><div key={label} className="flex items-center justify-between rounded-2xl bg-[#f6f7f9] px-4 py-3"><div className="flex items-center gap-3"><Icon size={15} className="text-black/35"/><span className="text-sm">{label}</span></div><span className={`text-[10px] font-semibold ${ok?"text-emerald-600":"text-amber-600"}`}>{ok?"READY":"CHECK"}</span></div>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-3xl border border-black/[.055] bg-white p-5"><CalendarDays size={17} className="text-black/30"/><p className="mt-4 text-xs text-black/35">Appointments</p><p className="mt-1 text-2xl font-semibold">{totalAppointments}</p></div><div className="rounded-3xl border border-black/[.055] bg-white p-5"><Bot size={17} className="text-black/30"/><p className="mt-4 text-xs text-black/35">Active agents</p><p className="mt-1 text-2xl font-semibold">{activeAgents}</p></div></div>
      </div>
    </section>
  </div>
}
