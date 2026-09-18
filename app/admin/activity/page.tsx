import { prisma } from "@/lib/prisma";
import { emailAnalyticsSummary } from "@/lib/email-analytics";

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  type: string;
  at: Date;
};

function dt(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export default async function ActivityPage() {
  const [businesses, leads, conversations, appointments, emailData] = await Promise.all([
    prisma.business.findMany({ take: 20, orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdAt: true } }),
    prisma.lead.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { business: { select: { name: true } } } }),
    prisma.conversation.findMany({
      take: 30,
      orderBy: { startedAt: "desc" },
      include: { agent: { select: { business: { select: { name: true } } } } },
    }),
    prisma.appointment.findMany({ take: 20, orderBy: { createdAt: "desc" }, include: { business: { select: { name: true } } } }),
    emailAnalyticsSummary(30),
  ]);

  const items: ActivityItem[] = [
    ...businesses.map((b) => ({
      id: `business-${b.id}`,
      title: "Workspace created",
      detail: b.name,
      type: "CUSTOMER",
      at: b.createdAt,
    })),
    ...leads.map((l) => ({
      id: `lead-${l.id}`,
      title: "Lead captured",
      detail: `${l.business.name} · ${l.name || l.email || "Anonymous"} · score ${l.score}`,
      type: "LEAD",
      at: l.createdAt,
    })),
    ...conversations.map((c) => ({
      id: `conversation-${c.id}`,
      title: "Conversation started",
      detail: `${c.agent.business.name} · ${c.channel}`,
      type: "CONVERSATION",
      at: c.startedAt,
    })),
    ...appointments.map((a) => ({
      id: `appointment-${a.id}`,
      title: "Appointment created",
      detail: `${a.business.name} · ${a.status}`,
      type: "APPOINTMENT",
      at: a.createdAt,
    })),
    ...emailData.recent.map((e) => ({
      id: `email-${e.id}`,
      title: e.status === "FAILED" ? "Email failed" : "Email activity",
      detail: `${e.recipient} · ${e.subject}`,
      type: "EMAIL",
      at: e.createdAt,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 80);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Operations</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Activity logs</h1>
      <p className="mt-2 text-sm text-black/45">Recent platform events across workspaces, leads, conversations, bookings and email.</p>

      <div className="mt-8 overflow-hidden rounded-3xl border border-black/[.055] bg-white">
        <div className="grid grid-cols-[130px_1fr_auto] border-b border-black/[.055] bg-black/[.018] px-6 py-3 text-[10px] uppercase tracking-[.12em] text-black/35">
          <span>Type</span><span>Event</span><span>Time</span>
        </div>
        <div className="divide-y divide-black/[.05]">
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 px-6 py-4 sm:grid-cols-[130px_1fr_auto] sm:items-center">
              <div><span className="rounded-full bg-black/[.045] px-2 py-1 text-[10px] font-semibold">{item.type}</span></div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-1 truncate text-xs text-black/40">{item.detail}</div>
              </div>
              <div className="text-xs text-black/35">{dt(item.at)}</div>
            </div>
          ))}
          {!items.length && <div className="px-6 py-12 text-center text-sm text-black/30">No activity yet.</div>}
        </div>
      </div>
    </div>
  );
}
