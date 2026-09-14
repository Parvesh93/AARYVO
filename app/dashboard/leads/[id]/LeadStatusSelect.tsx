"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadStatusSelect({leadId,initialStatus}:{leadId:string;initialStatus:string}){
 const router=useRouter();const[status,setStatus]=useState(initialStatus);const[saving,setSaving]=useState(false);
 async function update(next:string){const previous=status;setStatus(next);setSaving(true);try{const res=await fetch(`/api/leads/${leadId}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});if(!res.ok)throw new Error();router.refresh();}catch{setStatus(previous);}finally{setSaving(false);}}
 return <select aria-label="Lead status" disabled={saving} value={status} onChange={(e)=>update(e.target.value)} className="rounded-xl border border-black/[.08] bg-white px-3 py-2.5 text-xs font-semibold outline-none disabled:opacity-50"><option value="NEW">New</option><option value="WARM">Warm</option><option value="HOT">Hot</option><option value="QUALIFIED">Qualified</option><option value="WON">Won</option><option value="LOST">Lost</option></select>;
}
