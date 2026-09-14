import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock3, ExternalLink, History, UserRound } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function dateLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function timeLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function statusClass(status: string) {
  if (status === "CONFIRMED" || status === "REQUESTED") return "bg-emerald-50 text-emerald-700";
  if (status === "CANCELLED") return "bg-red-50 text-red-600";
  if (status === "COMPLETED") return "bg-blue-50 text-blue-700";
  return "bg-black/[0.04] text-black/55";
}

export default async function AppointmentsPage() {
  const session = await requireSession();
  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: { business: true },
  });
  if (!member) redirect("/onboarding");

  const appointments = await prisma.appointment.findMany({
    where: { businessId: member.businessId },
    include: { lead: true },
    orderBy: { startsAt: "asc" },
  });

  const now = new Date();
  const tz = member.business.bookingTimeZone;
  const upcoming = appointments.filter((appointment) => appointment.startsAt >= now && appointment.status !== "CANCELLED");
  const past = appointments.filter((appointment) => appointment.startsAt < now || appointment.status === "CANCELLED").reverse();
  const next = upcoming[0];

  return (
    <div className="mx-auto max-w-[1400px] pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Scheduling</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Appointments</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Consultations booked by qualified prospects through your AARYVO sales agent.</p>
        </div>
        <Link href="/dashboard/settings" className="inline-flex w-fit items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-black">Manage availability <ExternalLink size={13} /></Link>
      </div>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/[0.055] bg-white p-5"><p className="text-xs text-black/35">Upcoming</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-semibold tracking-[-0.05em]">{upcoming.length}</p><CalendarDays size={18} className="text-black/25" /></div></div>
        <div className="rounded-2xl border border-black/[0.055] bg-white p-5"><p className="text-xs text-black/35">Past / cancelled</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-semibold tracking-[-0.05em]">{past.length}</p><History size={18} className="text-black/25" /></div></div>
        <div className="rounded-2xl border border-black/[0.055] bg-white p-5 sm:col-span-2"><p className="text-xs text-black/35">Next consultation</p>{next ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-semibold">{next.lead?.name || "Website prospect"}</p><p className="mt-1 text-xs text-black/40">{dateLabel(next.startsAt, tz)} · {timeLabel(next.startsAt, tz)}</p></div>{next.leadId && <Link href={`/dashboard/leads/${next.leadId}`} className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">Open lead →</Link>}</div> : <p className="mt-3 text-sm text-black/35">No upcoming appointments.</p>}</div>
      </section>

      <section className="mt-4 rounded-3xl border border-black/[0.055] bg-white p-6">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-medium text-black/35">Upcoming schedule</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Booked consultations</h2></div><span className="rounded-full bg-[#f4f5f7] px-3 py-1.5 text-[10px] font-semibold text-black/45">{tz}</span></div>

        <div className="mt-6 space-y-3">
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-[#f6f7f8] px-6 py-14 text-center"><CalendarDays size={22} className="text-black/20" /><p className="mt-3 text-sm font-semibold text-black/45">No upcoming consultations</p><p className="mt-1 max-w-sm text-xs leading-5 text-black/30">Once a qualified visitor chooses an available slot, it will appear here automatically.</p></div>
          ) : upcoming.map((appointment) => (
            <div key={appointment.id} className="grid gap-4 rounded-2xl border border-black/[0.055] p-4 transition hover:border-black/[0.1] sm:grid-cols-[160px_1fr_auto] sm:items-center">
              <div className="flex items-center gap-3 sm:block"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4f5f7] sm:mb-3"><Clock3 size={16} className="text-black/45" /></div><div><p className="text-sm font-semibold">{dateLabel(appointment.startsAt, tz)}</p><p className="mt-1 text-xs text-black/40">{timeLabel(appointment.startsAt, tz)}</p></div></div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{appointment.lead?.name || "Website prospect"}</p><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusClass(appointment.status)}`}>{appointment.status}</span></div><p className="mt-1 truncate text-xs text-black/40">{appointment.lead?.requirement || appointment.notes || "Consultation request"}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/35">{appointment.lead?.phone && <span>{appointment.lead.phone}</span>}{appointment.lead?.email && <span>{appointment.lead.email}</span>}</div></div>
              <div>{appointment.leadId ? <Link href={`/dashboard/leads/${appointment.leadId}`} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] px-3 py-2 text-xs font-semibold text-black/55 hover:bg-black hover:text-white"><UserRound size={13} />View lead</Link> : <span className="text-xs text-black/25">No lead linked</span>}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-black/[0.055] bg-white p-6">
        <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-black/35">History</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Past & cancelled</h2></div><span className="text-xs text-black/30">{past.length} records</span></div>
        <div className="mt-5 divide-y divide-black/[0.055]">{past.length === 0 ? <div className="py-10 text-center text-sm text-black/35">No appointment history yet.</div> : past.slice(0, 25).map((appointment) => <div key={appointment.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[180px_1fr_auto] sm:items-center"><div><p className="text-sm font-medium">{dateLabel(appointment.startsAt, tz)}</p><p className="mt-1 text-xs text-black/35">{timeLabel(appointment.startsAt, tz)}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium">{appointment.lead?.name || "Website prospect"}</p><p className="mt-1 truncate text-xs text-black/35">{appointment.lead?.requirement || appointment.notes || "Consultation request"}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusClass(appointment.status)}`}>{appointment.status}</span>{appointment.leadId && <Link href={`/dashboard/leads/${appointment.leadId}`} className="text-xs font-semibold text-black/40 hover:text-black">Lead →</Link>}</div></div>)}</div>
      </section>
    </div>
  );
}
