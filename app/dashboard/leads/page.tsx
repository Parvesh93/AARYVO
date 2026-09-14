import { redirect } from "next/navigation";
import { Flame, Trophy, Users } from "lucide-react";
import LeadsTable from "./LeadsTable";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LeadsPage(){
  const session=await requireSession();
  const member=await prisma.businessMember.findFirst({where:{userId:session.userId},select:{businessId:true}});
  if(!member)redirect("/onboarding");
  const leads=await prisma.lead.findMany({where:{businessId:member.businessId},orderBy:{createdAt:"desc"},take:250});
  const hot=leads.filter((lead)=>lead.status==="HOT"||lead.status==="QUALIFIED").length;
  const won=leads.filter((lead)=>lead.status==="WON").length;
  const serialized=leads.map((lead)=>({...lead,createdAt:lead.createdAt.toISOString()}));

  return <div className="mx-auto max-w-[1440px] pb-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">Sales pipeline</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Leads</h1><p className="mt-2 text-sm text-black/45">Search, prioritize and follow up every prospect captured by your AI employee.</p></div>
    </div>

    <div className="mt-7 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-black/[.055] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-black/35">Total leads</p><p className="mt-2 text-3xl font-semibold tracking-[-.04em]">{leads.length}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f5f7] text-black/45"><Users size={17}/></span></div></div>
      <div className="rounded-2xl border border-black/[.055] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-black/35">High intent</p><p className="mt-2 text-3xl font-semibold tracking-[-.04em] text-emerald-700">{hot}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Flame size={17}/></span></div></div>
      <div className="rounded-2xl border border-black/[.055] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-black/35">Won</p><p className="mt-2 text-3xl font-semibold tracking-[-.04em] text-blue-700">{won}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Trophy size={17}/></span></div></div>
    </div>

    <LeadsTable leads={serialized}/>
  </div>;
}
