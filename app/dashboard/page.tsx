import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  MessageSquareText,
  Settings2,
  Users,
} from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncShopifyPricingSubscription } from "@/lib/shopify";

type DashboardProps = {
  searchParams: Promise<{
    knowledge?: string;
    pages?: string;
    message?: string;
    shop?: string;
    plan_handle?: string;
  }>;
};

function statusClasses(status: string) {
  if (status === "HOT" || status === "QUALIFIED") return "bg-emerald-50 text-emerald-700";
  if (status === "WARM") return "bg-amber-50 text-amber-700";
  if (status === "WON") return "bg-blue-50 text-blue-700";
  if (status === "LOST") return "bg-red-50 text-red-600";
  return "bg-black/[0.04] text-black/55";
}

function formatAppointment(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const session = await requireSession();
  const query = await searchParams;

  const membership = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: {
      business: {
        include: {
          _count: { select: { leads: true, appointments: true } },
          leads: { orderBy: { createdAt: "desc" }, take: 5 },
          appointments: {
            where: { startsAt: { gte: new Date() }, status: { not: "CANCELLED" } },
            orderBy: { startsAt: "asc" },
            take: 4,
            include: { lead: true },
          },
          agents: {
            take: 1,
            include: { _count: { select: { conversations: true, knowledgeItems: true } } },
          },
        },
      },
    },
  });

  if (!membership) redirect("/onboarding");

  if (query.shop && query.plan_handle) {
    try {
      await syncShopifyPricingSubscription({
        businessId: membership.business.id,
        shop: query.shop,
        expectedPlanHandle: query.plan_handle,
      });
      redirect("/dashboard/billing?shopifyPricing=success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify Shopify plan.";
      redirect(`/dashboard/billing?shopifyPricing=error&message=${encodeURIComponent(message)}`);
    }
  }

  const business = membership.business;
  const agent = business.agents[0];
  const knowledgeCount = agent?._count.knowledgeItems ?? 0;
  const conversations = agent?._count.conversations ?? 0;

  const grouped = await prisma.lead.groupBy({
    by: ["status"],
    where: { businessId: business.id },
    _count: { _all: true },
  });

  const statusCounts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  const hotLeads = (statusCounts.HOT ?? 0) + (statusCounts.QUALIFIED ?? 0);
  const warmLeads = statusCounts.WARM ?? 0;
  const newLeads = statusCounts.NEW ?? 0;
  const wonLeads = statusCounts.WON ?? 0;

  const cards = [
    { label: "Conversations", value: conversations, icon: MessageSquareText, detail: "AI handled" },
    { label: "Leads captured", value: business._count.leads, icon: Users, detail: `${hotLeads} high intent` },
    { label: "Appointments", value: business._count.appointments, icon: CalendarDays, detail: `${business.appointments.length} upcoming` },
    { label: "Knowledge", value: knowledgeCount, icon: Database, detail: knowledgeCount ? "pages indexed" : "needs setup" },
  ];

  const pipeline = [
    { label: "New", value: newLeads, className: "bg-black/10" },
    { label: "Warm", value: warmLeads, className: "bg-amber-400" },
    { label: "High intent", value: hotLeads, className: "bg-emerald-500" },
    { label: "Won", value: wonLeads, className: "bg-blue-500" },
  ];
  const maxPipeline = Math.max(1, ...pipeline.map((item) => item.value));

  return (
    <div className="mx-auto max-w-[1440px] pb-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Sales command center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">See what your AI employee is handling, which leads need attention and what is booked next.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/leads" className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-xs font-semibold text-black/65 transition hover:border-black/20 hover:text-black">View leads <ArrowUpRight size={14} /></Link>
          <Link href="/dashboard/ai-employee" className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white">Test AI employee <ArrowUpRight size={14} /></Link>
        </div>
      </div>

      {query.knowledge === "success" && <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"><CheckCircle2 size={17} />Knowledge base updated successfully. {query.pages || knowledgeCount} pages are ready.</div>}
      {query.knowledge === "error" && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{query.message || "Website scan failed. Please check the website URL and try again."}</div>}

      {knowledgeCount === 0 && (
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Database size={17} /></div><div><p className="text-sm font-semibold text-amber-950">Your AI employee needs business knowledge</p><p className="mt-1 text-xs leading-5 text-amber-800/70">Build the knowledge base before sending customer traffic to the widget.</p></div></div>
          <Link href="/dashboard/knowledge" className="w-fit rounded-full bg-amber-950 px-4 py-2 text-xs font-semibold text-white">Set up knowledge →</Link>
        </div>
      )}

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return <div key={card.label} className="rounded-2xl border border-black/[0.055] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-black/40">{card.label}</p><p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{card.value}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f5f7] text-black/55"><Icon size={17} strokeWidth={1.8} /></span></div><p className="mt-4 text-xs text-black/35">{card.detail}</p></div>;
        })}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-3xl border border-black/[0.055] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-medium text-black/35">Sales pipeline</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Lead intent at a glance</h2></div><Link href="/dashboard/leads" className="text-xs font-semibold text-black/45 hover:text-black">All leads →</Link></div>
          <div className="mt-7 space-y-5">{pipeline.map((item) => <div key={item.label}><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-black/55">{item.label}</span><span className="font-semibold">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-black/[0.045]"><div className={`h-full rounded-full ${item.className}`} style={{ width: `${Math.max(item.value ? 8 : 0, (item.value / maxPipeline) * 100)}%` }} /></div></div>)}</div>
          <div className="mt-7 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-5"><div><p className="text-[11px] text-black/35">New</p><p className="mt-1 text-lg font-semibold">{newLeads}</p></div><div><p className="text-[11px] text-black/35">High intent</p><p className="mt-1 text-lg font-semibold text-emerald-700">{hotLeads}</p></div><div><p className="text-[11px] text-black/35">Won</p><p className="mt-1 text-lg font-semibold text-blue-700">{wonLeads}</p></div></div>
        </div>

        <div className="rounded-3xl bg-[#111319] p-6 text-white">
          <div className="flex items-start justify-between"><div><p className="text-xs text-white/35">AI employee</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{agent?.name || "AARYVO Agent"}</h2></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Active</span></div>
          <div className="mt-7 space-y-3"><div className="flex items-center justify-between rounded-2xl bg-white/[0.055] px-4 py-3"><span className="flex items-center gap-2 text-xs text-white/50"><Bot size={15} />Conversations</span><strong className="text-sm">{conversations}</strong></div><div className="flex items-center justify-between rounded-2xl bg-white/[0.055] px-4 py-3"><span className="flex items-center gap-2 text-xs text-white/50"><Database size={15} />Knowledge</span><strong className="text-sm">{knowledgeCount} pages</strong></div><div className="flex items-center justify-between rounded-2xl bg-white/[0.055] px-4 py-3"><span className="flex items-center gap-2 text-xs text-white/50"><Flame size={15} />High-intent leads</span><strong className="text-sm">{hotLeads}</strong></div></div>
          <div className="mt-6 grid grid-cols-2 gap-2"><Link href="/dashboard/ai-employee" className="rounded-xl bg-white px-3 py-2.5 text-center text-xs font-semibold text-black">Test agent</Link><Link href="/dashboard/settings" className="rounded-xl border border-white/10 px-3 py-2.5 text-center text-xs font-semibold text-white/70 hover:bg-white/[0.06]">Settings</Link></div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl border border-black/[0.055] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-black/35">Recent activity</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Latest leads</h2></div><Link href="/dashboard/leads" className="text-xs font-semibold text-black/45 hover:text-black">View all →</Link></div>
          <div className="mt-5 divide-y divide-black/[0.055]">{business.leads.length === 0 ? <div className="py-10 text-center text-sm text-black/35">New leads will appear here once your widget starts conversations.</div> : business.leads.map((lead) => <Link key={lead.id} href={`/dashboard/leads/${lead.id}`} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-black/55">{(lead.name || "L").charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{lead.name || "Anonymous prospect"}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${statusClasses(lead.status)}`}>{lead.status}</span></div><p className="mt-1 truncate text-xs text-black/35">{lead.requirement || lead.phone || lead.email || "Qualification in progress"}</p></div><div className="hidden text-right sm:block"><p className="text-xs font-semibold">{lead.score}/100</p><p className="mt-1 text-[10px] text-black/30">lead score</p></div><ArrowUpRight size={15} className="shrink-0 text-black/25" /></Link>)}</div>
        </div>

        <div className="rounded-3xl border border-black/[0.055] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-black/35">Schedule</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Upcoming consultations</h2></div><Link href="/dashboard/appointments" className="text-xs font-semibold text-black/45 hover:text-black">Calendar →</Link></div>
          <div className="mt-5 space-y-3">{business.appointments.length === 0 ? <div className="flex flex-col items-center justify-center rounded-2xl bg-[#f6f7f8] py-9 text-center"><CalendarDays size={20} className="text-black/25" /><p className="mt-3 text-sm font-medium text-black/45">No upcoming consultations</p><p className="mt-1 text-xs text-black/30">Bookings from qualified leads will appear here.</p></div> : business.appointments.map((appointment) => <div key={appointment.id} className="flex items-center gap-3 rounded-2xl bg-[#f6f7f8] p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-black/45"><Clock3 size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{appointment.lead?.name || "Consultation"}</p><p className="mt-1 text-[11px] text-black/40">{formatAppointment(appointment.startsAt, business.bookingTimeZone)}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold text-black/45">{appointment.status}</span></div>)}</div>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-black/[0.055] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-medium text-black/35">Quick actions</p><p className="mt-1 text-sm font-semibold">Manage your AARYVO workspace</p></div><div className="grid gap-2 sm:grid-cols-2 lg:flex"><Link href="/dashboard/knowledge" className="inline-flex items-center gap-2 rounded-xl bg-[#f5f6f7] px-4 py-3 text-xs font-semibold text-black/60 hover:text-black"><Database size={15} />Knowledge base</Link><Link href="/dashboard/integrations" className="inline-flex items-center gap-2 rounded-xl bg-[#f5f6f7] px-4 py-3 text-xs font-semibold text-black/60 hover:text-black"><CheckCircle2 size={15} />Integrations</Link><Link href="/dashboard/settings" className="inline-flex items-center gap-2 rounded-xl bg-[#f5f6f7] px-4 py-3 text-xs font-semibold text-black/60 hover:text-black"><Settings2 size={15} />Workspace settings</Link></div></div>
      </section>
    </div>
  );
}
