import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LeadPageProps = {
  params: Promise<{ id: string }>;
};

function statusClass(status: string) {
  if (status === "HOT" || status === "QUALIFIED") return "bg-emerald-50 text-emerald-700";
  if (status === "WARM") return "bg-amber-50 text-amber-700";
  if (status === "WON") return "bg-blue-50 text-blue-700";
  if (status === "LOST") return "bg-red-50 text-red-700";
  return "bg-[#f6f7fb] text-black/60";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export default async function LeadDetailPage({ params }: LeadPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const membership = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    select: { businessId: true, business: { select: { name: true } } },
  });

  if (!membership) redirect("/onboarding");

  const lead = await prisma.lead.findFirst({
    where: { id, businessId: membership.businessId },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
      appointments: { orderBy: { startsAt: "desc" } },
    },
  });

  if (!lead) notFound();

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-5 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="font-semibold tracking-[0.25em]">AARYVO</Link>
          <Link href="/dashboard" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm">← Back to dashboard</Link>
        </header>

        <section className="mt-10 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="space-y-5">
            <div className="rounded-[32px] bg-white p-7 shadow-sm">
              <p className="text-sm text-black/40">Lead profile</p>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em]">{lead.name || "Anonymous prospect"}</h1>
                  <p className="mt-2 text-sm text-black/45">Captured {formatDate(lead.createdAt)}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${statusClass(lead.status)}`}>{lead.status}</span>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f6f7fb] p-4"><p className="text-xs text-black/40">Lead score</p><p className="mt-2 text-2xl font-semibold">{lead.score}/100</p></div>
                <div className="rounded-2xl bg-[#f6f7fb] p-4"><p className="text-xs text-black/40">Budget</p><p className="mt-2 font-medium">{lead.budget || "Not captured"}</p></div>
              </div>

              <div className="mt-6 space-y-4 text-sm">
                <div><p className="text-black/40">Email</p><p className="mt-1 font-medium break-all">{lead.email || "Not provided"}</p></div>
                <div><p className="text-black/40">Phone</p><p className="mt-1 font-medium">{lead.phone || "Not provided"}</p></div>
                <div><p className="text-black/40">Requirement</p><p className="mt-1 leading-6 text-black/75">{lead.requirement || "Qualification in progress"}</p></div>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {lead.phone && <a href={`tel:${lead.phone}`} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">Call lead</a>}
                {lead.email && <a href={`mailto:${lead.email}`} className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium">Email lead</a>}
              </div>
            </div>

            <div className="rounded-[32px] bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between"><div><p className="text-sm text-black/40">Appointments</p><h2 className="mt-2 text-xl font-semibold">Consultation activity</h2></div><span className="rounded-full bg-[#f6f7fb] px-3 py-1 text-xs text-black/50">{lead.appointments.length}</span></div>
              <div className="mt-5 space-y-3">
                {lead.appointments.length === 0 ? <p className="text-sm text-black/45">No appointment requested yet.</p> : lead.appointments.map((appointment) => (
                  <div key={appointment.id} className="rounded-2xl bg-[#f6f7fb] p-4">
                    <div className="flex items-center justify-between gap-3"><p className="font-medium">{formatDate(appointment.startsAt)}</p><span className="rounded-full bg-white px-3 py-1 text-xs text-black/55">{appointment.status}</span></div>
                    {appointment.notes && <p className="mt-2 text-sm leading-6 text-black/50">{appointment.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[32px] bg-[#111319] text-white shadow-sm">
            <div className="border-b border-white/10 p-6 md:p-8">
              <p className="text-sm text-white/40">Conversation</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">AI sales transcript</h2>
              <p className="mt-2 text-sm text-white/45">{membership.business.name} · {lead.conversation ? formatDate(lead.conversation.startedAt) : "No conversation"}</p>
            </div>
            <div className="max-h-[760px] min-h-[480px] space-y-4 overflow-y-auto p-6 md:p-8">
              {!lead.conversation || lead.conversation.messages.length === 0 ? (
                <p className="text-sm text-white/45">No chat messages have been recorded for this lead yet.</p>
              ) : lead.conversation.messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[82%]" : "max-w-[82%]"}>
                  <p className={`mb-1 text-xs ${message.role === "user" ? "text-right text-white/35" : "text-white/35"}`}>{message.role === "user" ? "Visitor" : "AARYVO"} · {formatDate(message.createdAt)}</p>
                  <div className={message.role === "user" ? "rounded-3xl rounded-br-md bg-white px-5 py-3 text-sm leading-6 text-black" : "rounded-3xl rounded-bl-md bg-white/10 px-5 py-3 text-sm leading-6 text-white"}>{message.content}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
