import { prisma } from "@/lib/prisma";
import { getBusinessConversationUsage } from "@/lib/billing";

function date(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function UsagePage() {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, plan: true },
  });

  const rows = await Promise.all(
    businesses.map(async (business) => ({
      ...business,
      ...(await getBusinessConversationUsage(business.id)),
    })),
  );

  const totalUsage = rows.reduce((sum, r) => sum + r.usage, 0);
  const totalLimit = rows.reduce((sum, r) => sum + r.limit, 0);
  const nearLimit = rows.filter((r) => r.limit > 0 && r.usage / r.limit >= 0.8).length;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Usage</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Conversation usage</h1>
      <p className="mt-2 text-sm text-black/45">Current billing-period conversation consumption by workspace.</p>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Conversations used", totalUsage.toLocaleString("en-IN")],
          ["Combined allowance", totalLimit.toLocaleString("en-IN")],
          ["At 80%+ usage", nearLimit],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-black/[.055] bg-white p-6">
            <p className="text-xs text-black/35">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-.04em]">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 overflow-hidden rounded-3xl border border-black/[.055] bg-white">
        <div className="border-b border-black/[.055] px-6 py-5">
          <h2 className="font-semibold">Workspace usage</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35">
              <tr>
                <th className="px-6 py-3">Workspace</th>
                <th>Plan</th>
                <th>Usage</th>
                <th>Remaining</th>
                <th>Progress</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = Math.min(100, Math.round((r.usage / Math.max(1, r.limit)) * 100));
                return (
                  <tr key={r.id} className="border-t border-black/[.05]">
                    <td className="px-6 py-4 font-medium">{r.name}</td>
                    <td>{r.plan}</td>
                    <td>{r.usage.toLocaleString("en-IN")} / {r.limit.toLocaleString("en-IN")}</td>
                    <td>{r.remaining.toLocaleString("en-IN")}</td>
                    <td>
                      <div className="w-36">
                        <div className="mb-1 flex justify-between text-[10px] text-black/35">
                          <span>{pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/[.06]">
                          <div className="h-full rounded-full bg-[#111319]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="text-xs text-black/40">{date(r.periodStart)} – {date(r.periodEnd)}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-black/30">No workspace usage yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
