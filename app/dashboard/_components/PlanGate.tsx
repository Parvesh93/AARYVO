import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export default function PlanGate({title,description,requiredPlan}:{title:string;description:string;requiredPlan:"Starter"|"Growth"|"Pro"}){
  return <div className="rounded-3xl border border-black/[.06] bg-white p-6">
    <div className="flex items-start gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black text-white"><LockKeyhole size={17}/></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{title}</h3><span className="rounded-full bg-[#ffdf67] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em]">{requiredPlan}+</span></div>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-black/45">{description}</p>
        <Link href="/dashboard/billing" className="mt-4 inline-flex rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white">View plans</Link>
      </div>
    </div>
  </div>;
}
