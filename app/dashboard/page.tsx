const stats = [["Conversations", "184", "+18%"], ["Qualified leads", "47", "+24%"], ["Appointments", "19", "+11%"], ["Conversion rate", "40.4%", "+6.2%"]];
const leads = [["Rahul Sharma", "3BHK Interior · Noida", "₹20L", "Hot"], ["Priya Mehta", "Consultation", "₹1.2L", "Hot"], ["Amit Verma", "General enquiry", "—", "Warm"]];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] p-5 md:p-8"><div className="mx-auto max-w-7xl">
      <header className="flex items-center justify-between"><a href="/" className="font-semibold tracking-[0.25em]">AARYVO</a><div className="rounded-full bg-white px-4 py-2 text-sm shadow-sm">Demo workspace</div></header>
      <div className="mt-12"><p className="text-sm text-black/40">AI Sales Dashboard</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Good morning. Your AI is working.</h1></div>
      <section className="mt-8 grid gap-4 md:grid-cols-4">{stats.map(([label,value,delta]) => <div key={label} className="rounded-[28px] bg-white p-6 shadow-sm"><p className="text-sm text-black/45">{label}</p><div className="mt-6 flex items-end justify-between"><p className="text-4xl font-semibold tracking-[-0.04em]">{value}</p><span className="text-sm text-emerald-600">{delta}</span></div></div>)}</section>
      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-sm md:p-8"><div className="flex items-center justify-between"><div><p className="text-sm text-black/40">Latest opportunities</p><h2 className="mt-1 text-2xl font-semibold">Qualified leads</h2></div><span className="text-sm text-black/40">Updated live</span></div><div className="mt-6 divide-y divide-black/5">{leads.map(([name,req,value,status]) => <div key={name} className="grid gap-3 py-5 md:grid-cols-[1.1fr_1.8fr_.6fr_.5fr] md:items-center"><p className="font-medium">{name}</p><p className="text-black/50">{req}</p><p>{value}</p><span className="w-fit rounded-full bg-black px-3 py-1.5 text-xs text-white">{status}</span></div>)}</div></section>
    </div></main>
  );
}
