"use client";

import { useState } from "react";
import { Bot, Check, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  agent: {
    name: string;
    goal: string;
    tone: string;
    qualificationQuestions: string | null;
    bookingScoreThreshold: number;
    handoffInstructions: string | null;
    isActive: boolean;
  };
};

const tones = ["Professional", "Friendly", "Consultative", "Concise", "Premium"];

export default function AgentConfigForm({ agent }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ ...agent, qualificationQuestions: agent.qualificationQuestions || "What service or solution are you looking for?\nWhat is your expected budget?\nWhat is your timeline to get started?", handoffInstructions: agent.handoffInstructions || "Offer a human follow-up when the visitor asks for something outside the approved knowledge or explicitly requests to speak with a person." });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setSaved(false); setError("");
    try {
      const response = await fetch("/api/agent/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save settings.");
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save settings."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <section className="rounded-3xl border border-black/[.055] bg-white p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-black/35">Identity</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">Who is your AI employee?</h2><p className="mt-2 text-xs leading-5 text-black/40">This identity guides how the agent introduces itself and approaches prospects.</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4f5f7]"><Bot size={18}/></span></div>
      <div className="mt-6 grid gap-5 md:grid-cols-2"><label className="text-xs font-medium text-black/55">Employee name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-2 w-full rounded-xl border border-black/[.08] px-4 py-3 text-sm outline-none focus:border-black/25"/></label><label className="text-xs font-medium text-black/55">Conversation tone<select value={form.tone} onChange={e=>setForm({...form,tone:e.target.value})} className="mt-2 w-full rounded-xl border border-black/[.08] bg-white px-4 py-3 text-sm outline-none">{tones.map(t=><option key={t}>{t}</option>)}</select></label></div>
      <label className="mt-5 block text-xs font-medium text-black/55">Primary sales goal<textarea value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} rows={3} className="mt-2 w-full resize-none rounded-xl border border-black/[.08] px-4 py-3 text-sm leading-6 outline-none focus:border-black/25"/></label>
    </section>

    <section className="rounded-3xl border border-black/[.055] bg-white p-6"><div><p className="text-xs font-medium text-black/35">Qualification</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">What should AARYVO discover?</h2><p className="mt-2 text-xs leading-5 text-black/40">One question per line. The AI asks naturally and progressively rather than interrogating the visitor.</p></div><textarea value={form.qualificationQuestions} onChange={e=>setForm({...form,qualificationQuestions:e.target.value})} rows={6} className="mt-5 w-full resize-y rounded-xl border border-black/[.08] px-4 py-3 text-sm leading-7 outline-none focus:border-black/25"/><div className="mt-5 rounded-2xl bg-[#f6f7f8] p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold">Booking readiness threshold</p><p className="mt-1 text-[11px] text-black/40">Use this score to decide when a lead is ready to be offered an appointment.</p></div><strong className="text-lg">{form.bookingScoreThreshold}/100</strong></div><input type="range" min="20" max="100" step="5" value={form.bookingScoreThreshold} onChange={e=>setForm({...form,bookingScoreThreshold:Number(e.target.value)})} className="mt-4 w-full accent-black"/></div></section>

    <section className="rounded-3xl border border-black/[.055] bg-white p-6"><p className="text-xs font-medium text-black/35">Human handoff</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">When should a person take over?</h2><textarea value={form.handoffInstructions} onChange={e=>setForm({...form,handoffInstructions:e.target.value})} rows={4} className="mt-5 w-full resize-y rounded-xl border border-black/[.08] px-4 py-3 text-sm leading-6 outline-none focus:border-black/25"/></section>

    <section className="flex flex-col gap-4 rounded-3xl bg-[#111319] p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Sparkles size={16}/></span><div><p className="text-sm font-semibold">AI employee status</p><p className="mt-1 text-xs text-white/40">{form.isActive?"Live and available to website visitors":"Paused — visitors cannot start AI conversations"}</p></div></div><div className="flex items-center gap-2"><button onClick={()=>setForm({...form,isActive:!form.isActive})} className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${form.isActive?"bg-white/10 text-white":"bg-amber-300 text-black"}`}>{form.isActive?"Pause agent":"Activate agent"}</button><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-50">{saved?<Check size={14}/>:<Save size={14}/>} {saving?"Saving...":saved?"Saved":"Save changes"}</button></div></section>
    {error&&<p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
  </div>;
}
