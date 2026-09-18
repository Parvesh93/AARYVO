import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/billing";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(value)
    : "—";
}

export default async function SubscriptionsPage() {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      subscriptionCurrentStart: true,
      subscriptionCurrentEnd: true,
      subscriptionCancelAtEnd: true,
      monthlyConversationLimit: true,
      razorpaySubscriptionId: true,
    },
  });

  const paid = businesses.filter(
    (b) =>
      b.plan !== "FREE" &&
      !["cancelled", "completed", "expired"].includes(b.subscriptionStatus.toLowerCase()),
  );
  const mrr = paid.reduce(
    (sum, b) => sum + (PLANS[b.plan as keyof typeof PLANS]?.price || 0),
    0,
  );
  const counts = businesses.reduce<Record<string, number>>((acc, b) => {
    acc[b.plan] = (acc[b.plan] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Billing</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Subscriptions</h1>
      <p className="mt-2 text-sm text-black/45">Plan mix, subscription state and recurring revenue.</p>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Paid workspaces", paid.length],
          ["Estimated MRR", money(mrr)],
          ["Free workspaces", counts.FREE || 0],
          ["Total accounts", businesses.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-black/[.055] bg-white p-6">
            <p className="text-xs text-black/35">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-.04em]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="rounded-3xl border border-black/[.055] bg-[#111319] p-6 text-white">
          <p className="text-xs uppercase tracking-[.16em] text-white/35">Plan mix</p>
          <div className="mt-6 space-y-4">
            {Object.entries(PLANS).map(([key, plan]) => (
              <div key={key} className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <div className="text-sm font-medium">{plan.name}</div>
                  <div className="mt-1 text-[11px] text-white/35">{money(plan.price)} / month</div>
                </div>
                <div className="text-xl font-semibold">{counts[key] || 0}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white">
          <div className="border-b border-black/[.055] px-6 py-5">
            <h2 className="font-semibold">Workspace subscriptions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35">
                <tr>
                  <th className="px-6 py-3">Workspace</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Limit</th>
                  <th>Period end</th>
                  <th>Razorpay</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b.id} className="border-t border-black/[.05]">
                    <td className="px-6 py-4 font-medium">{b.name}</td>
                    <td>{b.plan}</td>
                    <td>
                      <span className="rounded-full bg-black/[.045] px-2 py-1 text-[10px] font-semibold">
                        {b.subscriptionCancelAtEnd ? "Cancels at end" : b.subscriptionStatus}
                      </span>
                    </td>
                    <td>{b.monthlyConversationLimit.toLocaleString("en-IN")}</td>
                    <td className="text-xs text-black/45">{date(b.subscriptionCurrentEnd)}</td>
                    <td className="max-w-[180px] truncate text-xs text-black/35">
                      {b.razorpaySubscriptionId || "—"}
                    </td>
                  </tr>
                ))}
                {!businesses.length && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-black/30">No subscriptions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
