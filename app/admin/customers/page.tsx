import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";

function date(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function CustomersPage() {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      members: { include: { user: true } },
      agents: { select: { id: true, isActive: true } },
      _count: { select: { leads: true, appointments: true } },
    },
  });

  const active = businesses.filter((b) => b.agents.some((a) => a.isActive)).length;
  const paid = businesses.filter((b) => b.plan !== "FREE").length;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Customers</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Customer workspaces</h1>
      <p className="mt-2 text-sm text-black/45">All Aaryvo accounts, owners and workspace activity.</p>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Workspaces", businesses.length],
          ["Paid workspaces", paid],
          ["Active AI agents", active],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-black/[.055] bg-white p-6">
            <p className="text-xs text-black/35">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-.04em]">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 overflow-hidden rounded-3xl border border-black/[.055] bg-white">
        <div className="border-b border-black/[.055] px-6 py-5">
          <h2 className="font-semibold">All customers</h2>
          <p className="mt-1 text-xs text-black/35">Newest workspace first.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35">
              <tr>
                <th className="px-6 py-3">Business</th>
                <th>Owner</th>
                <th>Plan</th>
                <th>Members</th>
                <th>Agents</th>
                <th>Leads</th>
                <th>Appointments</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => {
                const owner =
                  business.members.find((m) => m.role === "OWNER")?.user ||
                  business.members[0]?.user;
                return (
                  <tr key={business.id} className="border-t border-black/[.05]">
                    <td className="px-6 py-4">
                      <div className="font-medium">{business.name}</div>
                      {business.websiteUrl ? (
                        <a
                          href={business.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-black/35 hover:text-black"
                        >
                          {business.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <div className="mt-1 text-[11px] text-black/25">No website</div>
                      )}
                    </td>
                    <td>
                      <div>{owner?.name || "—"}</div>
                      <div className="mt-1 text-[11px] text-black/35">{owner?.email || "—"}</div>
                    </td>
                    <td>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        business.plan === "FREE"
                          ? "bg-black/[.05] text-black/50"
                          : "bg-violet-50 text-violet-700"
                      }`}>
                        {business.plan}
                      </span>
                    </td>
                    <td>{business.members.length}</td>
                    <td>{business.agents.length}</td>
                    <td>{business._count.leads}</td>
                    <td>{business._count.appointments}</td>
                    <td className="text-xs text-black/45">{date(business.createdAt)}</td>
                  </tr>
                );
              })}
              {!businesses.length && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-black/30">No customers yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
