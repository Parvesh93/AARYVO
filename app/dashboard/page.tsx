import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { buildKnowledgeBase } from "@/app/actions/knowledge";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DashboardProps = {
  searchParams: Promise<{ knowledge?: string; pages?: string; message?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const session = await requireSession();
  const query = await searchParams;
  const membership = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: {
      business: {
        include: {
          _count: { select: { leads: true, appointments: true } },
          agents: { take: 1, include: { _count: { select: { conversations: true, knowledgeItems: true } } } },
        },
      },
    },
  });

  if (!membership) redirect("/onboarding");
  const business = membership.business;
  const agent = business.agents[0];
  const knowledgeCount = agent?._count.knowledgeItems ?? 0;
  const stats = [
    ["Conversations", String(agent?._count.conversations ?? 0), "Live"],
    ["Leads captured", String(business._count.leads), "Live"],
    ["Appointments", String(business._count.appointments), "Live"],
    ["Knowledge pages", String(knowledgeCount), knowledgeCount ? "Ready" : "Pending"],
  ];

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-5 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex items-center justify-between">
          <a href="/" className="font-semibold tracking-[0.25em]">AARYVO</a>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white px-4 py-2 text-sm shadow-sm">{business.name}</div>
            <form action={logout}><button className="rounded-full border border-black/10 px-4 py-2 text-sm">Sign out</button></form>
          </div>
        </header>

        <div className="mt-12">
          <p className="text-sm text-black/40">AI Sales Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">{knowledgeCount ? "Your AI employee is learning." : "Your AI employee is ready to learn."}</h1>
          <p className="mt-3 max-w-2xl text-black/50">{knowledgeCount ? `AARYVO has ${knowledgeCount} approved website pages in its knowledge base. Next we’ll make the agent answer from this content.` : `Workspace created successfully. Scan ${business.websiteUrl || "your business content"} to build the knowledge base.`}</p>
        </div>

        {query.knowledge === "success" && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">Knowledge base built successfully. {query.pages || knowledgeCount} website pages were saved.</div>}
        {query.knowledge === "error" && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{query.message || "Website scan failed. Please check the website URL and try again."}</div>}

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {stats.map(([label, value, state]) => <div key={label} className="rounded-[28px] bg-white p-6 shadow-sm"><p className="text-sm text-black/45">{label}</p><div className="mt-6 flex items-end justify-between"><p className="text-4xl font-semibold tracking-[-0.04em]">{value}</p><span className={state === "Pending" ? "text-sm text-amber-600" : "text-sm text-emerald-600"}>{state}</span></div></div>)}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
          <div className="rounded-[32px] bg-black p-8 text-white">
            <p className="text-sm text-white/45">{knowledgeCount ? "Knowledge base" : "Next setup step"}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{knowledgeCount ? `${business.name} knowledge is ready.` : `Teach AARYVO about ${business.name}.`}</h2>
            <p className="mt-3 max-w-xl text-white/60">AARYVO scans up to 8 useful pages from the same website, extracts readable business content and stores it privately for this AI agent.</p>
            <form action={buildKnowledgeBase}>
              <button type="submit" className="mt-8 rounded-full bg-white px-5 py-3 text-sm font-medium text-black">{knowledgeCount ? "Re-scan website →" : "Build knowledge base →"}</button>
            </form>
          </div>
          <div className="rounded-[32px] bg-white p-8 shadow-sm">
            <p className="text-sm text-black/40">Workspace</p>
            <p className="mt-4 text-xl font-semibold">{business.name}</p>
            <p className="mt-2 break-all text-sm text-black/50">{business.websiteUrl || "No website added"}</p>
            <div className="mt-8 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">AI Sales Agent · Active</div>
            <div className="mt-3 rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-black/60">Knowledge · {knowledgeCount} pages</div>
          </div>
        </section>
      </div>
    </main>
  );
}
