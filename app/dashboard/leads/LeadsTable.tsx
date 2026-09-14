"use client";

import Link from "next/link";
import { Search, SlidersHorizontal, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  requirement: string | null;
  budget: string | null;
  score: number;
  status: string;
  createdAt: string;
};

type Props = { leads: Lead[] };

function badge(status: string) {
  if (status === "HOT" || status === "QUALIFIED") return "bg-emerald-50 text-emerald-700";
  if (status === "WARM") return "bg-amber-50 text-amber-700";
  if (status === "WON") return "bg-blue-50 text-blue-700";
  if (status === "LOST") return "bg-red-50 text-red-700";
  return "bg-black/[0.04] text-black/55";
}

function scoreClass(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-400";
  return "bg-black/20";
}

export default function LeadsTable({ leads }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = leads.filter((lead) => {
      const matchesStatus = status === "ALL" || lead.status === status || (status === "HIGH_INTENT" && (lead.status === "HOT" || lead.status === "QUALIFIED"));
      const haystack = [lead.name, lead.email, lead.phone, lead.requirement, lead.budget].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });

    return [...list].sort((a, b) => {
      if (sort === "HIGHEST_SCORE") return b.score - a.score;
      if (sort === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [leads, search, status, sort]);

  return (
    <div className="mt-7 overflow-hidden rounded-3xl border border-black/[0.055] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-3 border-b border-black/[0.055] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, requirement..." className="w-full rounded-xl border border-black/[0.07] bg-[#f7f8f9] py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-black/20 focus:bg-white" />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative"><SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="appearance-none rounded-xl border border-black/[0.07] bg-white py-2.5 pl-9 pr-8 text-xs font-medium text-black/60 outline-none"><option value="ALL">All statuses</option><option value="HIGH_INTENT">High intent</option><option value="NEW">New</option><option value="WARM">Warm</option><option value="HOT">Hot</option><option value="QUALIFIED">Qualified</option><option value="WON">Won</option><option value="LOST">Lost</option></select></label>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-xs font-medium text-black/60 outline-none"><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option><option value="HIGHEST_SCORE">Highest score</option></select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-black/[0.018] text-[11px] uppercase tracking-[0.08em] text-black/30"><tr><th className="px-6 py-4 font-semibold">Prospect</th><th className="px-4 py-4 font-semibold">Requirement</th><th className="px-4 py-4 font-semibold">Budget</th><th className="px-4 py-4 font-semibold">Score</th><th className="px-4 py-4 font-semibold">Status</th><th className="px-6 py-4"></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-black/35">No leads match these filters.</td></tr> : filtered.map((lead) => (
              <tr key={lead.id} className="group border-t border-black/[0.045] transition hover:bg-black/[0.012]">
                <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f3f5] text-xs font-semibold text-black/55">{(lead.name || "L").charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate font-semibold">{lead.name || "Anonymous prospect"}</p><p className="mt-1 truncate text-xs text-black/35">{lead.phone || lead.email || "Contact pending"}</p></div></div></td>
                <td className="max-w-md px-4 py-4"><p className="line-clamp-2 text-sm leading-5 text-black/55">{lead.requirement || "Qualification in progress"}</p></td>
                <td className="px-4 py-4 text-black/55">{lead.budget || "—"}</td>
                <td className="px-4 py-4"><div className="w-28"><div className="flex items-center justify-between text-xs"><span className="font-semibold">{lead.score}</span><span className="text-black/25">/100</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.05]"><div className={`h-full rounded-full ${scoreClass(lead.score)}`} style={{ width: `${Math.max(4, Math.min(100, lead.score))}%` }} /></div></div></td>
                <td className="px-4 py-4"><span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${badge(lead.status)}`}>{lead.status.replace("_", " ")}</span></td>
                <td className="px-6 py-4 text-right"><Link href={`/dashboard/leads/${lead.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.07] text-black/35 transition group-hover:border-black/15 group-hover:bg-black group-hover:text-white"><ArrowUpRight size={15} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-black/[0.05] px-6 py-3 text-xs text-black/30">Showing {filtered.length} of {leads.length} leads</div>
    </div>
  );
}
