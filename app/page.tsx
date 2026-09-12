import { ArrowRight, Bot, CalendarCheck, MessageSquareText, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-8 md:px-10">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-black/5 bg-white px-6 py-4 shadow-sm">
        <div className="font-semibold tracking-[0.28em]">AARYVO</div>
        <a href="/onboarding" className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white">Build your agent</a>
      </nav>
      <section className="mx-auto grid min-h-[78vh] max-w-7xl items-center gap-10 py-16 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm"><Sparkles size={16} /> AI employees for growing businesses</div>
          <h1 className="max-w-4xl text-6xl font-semibold leading-[0.95] tracking-[-0.055em] md:text-8xl">Turn conversations into customers.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-black/55 md:text-xl">AARYVO answers enquiries, understands buying intent, qualifies leads and books appointments — 24/7.</p>
          <div className="mt-9 flex flex-wrap gap-3"><a href="/onboarding" className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-4 text-sm font-medium text-white">Create your AI employee <ArrowRight size={17} /></a><a href="/dashboard" className="rounded-full border border-black/10 bg-white px-6 py-4 text-sm font-medium">View demo dashboard</a></div>
        </div>
        <div className="rounded-[36px] border border-black/5 bg-white p-5 shadow-2xl shadow-black/5">
          <div className="rounded-[28px] bg-[#111319] p-6 text-white">
            <div className="mb-10 flex items-center justify-between"><div><p className="text-sm text-white/45">AI Sales Employee</p><p className="mt-1 text-lg font-medium">Aaryvo Agent</p></div><div className="rounded-full bg-emerald-400/15 px-3 py-2 text-xs text-emerald-300">● Live</div></div>
            <div className="space-y-3"><div className="max-w-[84%] rounded-3xl rounded-bl-md bg-white/10 px-4 py-3 text-sm leading-6">Hi 👋 What are you looking for today?</div><div className="ml-auto max-w-[78%] rounded-3xl rounded-br-md bg-white px-4 py-3 text-sm leading-6 text-black">I need interior design for a 3BHK in Noida.</div><div className="max-w-[84%] rounded-3xl rounded-bl-md bg-white/10 px-4 py-3 text-sm leading-6">Great. What budget range are you considering?</div><div className="ml-auto max-w-[78%] rounded-3xl rounded-br-md bg-white px-4 py-3 text-sm leading-6 text-black">Around ₹20 lakh.</div></div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-4">{[[MessageSquareText,"Converse"],[Bot,"Qualify"],[CalendarCheck,"Book"]].map(([Icon,label]) => { const I = Icon as typeof Bot; return <div key={label as string} className="rounded-2xl bg-[#f6f7fb] p-4"><I size={18}/><p className="mt-3 text-sm font-medium">{label as string}</p></div>; })}</div>
        </div>
      </section>
    </main>
  );
}
