import { prisma } from "@/lib/prisma";

function dt(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export default async function SalesPage() {
  const [leads, conversations, leadCount, hotLeadCount, needsHuman] = await Promise.all([
    prisma.lead.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { business: { select: { name: true } } },
    }),
    prisma.conversation.findMany({
      take: 30,
      orderBy: { startedAt: "desc" },
      include: {
        agent: { select: { name: true, business: { select: { name: true } } } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: { in: ["HOT", "QUALIFIED"] } } }),
    prisma.conversation.count({ where: { needsHuman: true, resolvedAt: null } }),
  ]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Revenue operations</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Conversations & leads</h1>
      <p className="mt-2 text-sm text-black/45">Latest customer conversations, captured leads and human-attention queues.</p>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Total leads", leadCount],
          ["Hot / qualified", hotLeadCount],
          ["Need human attention", needsHuman],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-black/[.055] bg-white p-6">
            <p className="text-xs text-black/35">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-.04em]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-4 2xl:grid-cols-[1.15fr_.85fr]">
        <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white">
          <div className="border-b border-black/[.055] px-6 py-5">
            <h2 className="font-semibold">Latest leads</h2>
            <p className="mt-1 text-xs text-black/35">Newest 50 leads across all workspaces.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35">
                <tr>
                  <th className="px-6 py-3">Lead</th>
                  <th>Workspace</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Requirement</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-black/[.05]">
                    <td className="px-6 py-4">
                      <div className="font-medium">{lead.name || "Anonymous"}</div>
                      <div className="mt-1 text-[11px] text-black/35">{lead.email || lead.phone || "No contact details"}</div>
                    </td>
                    <td>{lead.business.name}</td>
                    <td><strong>{lead.score}</strong></td>
                    <td><span className="rounded-full bg-black/[.05] px-2 py-1 text-[10px] font-semibold">{lead.status}</span></td>
                    <td className="max-w-[260px] truncate text-xs text-black/50">{lead.requirement || "—"}</td>
                    <td className="text-xs text-black/40">{dt(lead.createdAt)}</td>
                  </tr>
                ))}
                {!leads.length && <tr><td colSpan={6} className="px-6 py-10 text-center text-black/30">No leads yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white">
          <div className="border-b border-black/[.055] px-6 py-5">
            <h2 className="font-semibold">Recent conversations</h2>
            <p className="mt-1 text-xs text-black/35">Latest 30 sessions.</p>
          </div>
          <div className="divide-y divide-black/[.05]">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{conversation.agent.business.name}</div>
                    <div className="mt-1 text-xs text-black/40">{conversation.agent.name} · {conversation.channel}</div>
                  </div>
                  {conversation.needsHuman && !conversation.resolvedAt ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Needs human</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Normal</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-black/35">
                  <span>{conversation._count.messages} messages</span>
                  <span>{dt(conversation.startedAt)}</span>
                </div>
              </div>
            ))}
            {!conversations.length && <div className="px-6 py-10 text-center text-sm text-black/30">No conversations yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
