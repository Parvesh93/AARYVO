import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, MailCheck, MousePointerClick, Send, TriangleAlert } from "lucide-react";
import { emailAnalyticsSummary } from "@/lib/email-analytics";

type SearchParams = Promise<Record<string,string|string[]|undefined>>;

function dt(v:Date|null){return v?new Date(v).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}):"—"}
function pct(v:number,total:number){return total?`${(v/total*100).toFixed(1)}%`:"0%"}
function rate(v:number,total:number){return total?v/total*100:0}
function delta(current:number,previous:number){
  if(!previous)return current?100:0;
  return (current-previous)/previous*100;
}
function Delta({value}:{value:number}){
  if(!Number.isFinite(value)||Math.abs(value)<0.05)return <span className="text-[10px] text-black/30">No change</span>;
  const up=value>0;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${up?"text-emerald-600":"text-red-600"}`}>{up?<ArrowUpRight size={11}/>:<ArrowDownRight size={11}/>} {Math.abs(value).toFixed(1)}% vs previous</span>
}
function nice(v:string){return v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}

export default async function EmailAnalyticsPage({searchParams}:{searchParams:SearchParams}){
  const sp=await searchParams;
  const days=[7,30,90].includes(Number(sp.days))?Number(sp.days):30;
  const category=typeof sp.category==="string"&&sp.category?sp.category:null;
  const source=typeof sp.source==="string"&&sp.source?sp.source:null;
  const d=await emailAnalyticsSummary({days,category,source});

  const deliveryRate=rate(d.sent,d.sent+d.failed);
  const openRate=rate(d.opened,d.sent);
  const clickRate=rate(d.clicked,d.sent);
  const previousDelivery=rate(d.previous.sent,d.previous.sent+d.previous.failed);
  const previousOpen=rate(d.previous.opened,d.previous.sent);
  const previousClick=rate(d.previous.clicked,d.previous.sent);
  const maxDaily=Math.max(1,...d.daily.flatMap(x=>[x.sent,x.opened,x.clicked]));
  const params=(overrides:Record<string,string|null>)=>{
    const q=new URLSearchParams();
    const values={days:String(days),category,source,...overrides};
    Object.entries(values).forEach(([k,v])=>{if(v)q.set(k,v)});
    return `/admin/email?${q.toString()}`;
  };

  const cards=[
    {label:"Sent",value:d.sent.toLocaleString("en-IN"),sub:<Delta value={delta(d.sent,d.previous.sent)}/>,icon:Send},
    {label:"Delivery rate",value:`${deliveryRate.toFixed(1)}%`,sub:<Delta value={deliveryRate-previousDelivery}/>,icon:MailCheck},
    {label:"Unique open rate",value:`${openRate.toFixed(1)}%`,sub:<Delta value={openRate-previousOpen}/>,icon:MailCheck},
    {label:"Click rate",value:`${clickRate.toFixed(1)}%`,sub:<Delta value={clickRate-previousClick}/>,icon:MousePointerClick},
    {label:"Failed",value:d.failed.toLocaleString("en-IN"),sub:<span className="text-[10px] text-black/30">{d.totalOpens.toLocaleString("en-IN")} total opens · {d.totalClicks.toLocaleString("en-IN")} total clicks</span>,icon:TriangleAlert},
  ];

  return <div>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Communication</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">Email analytics</h1><p className="mt-2 text-sm text-black/45">Delivery health and engagement across AARYVO email activity.</p></div>
      <div className="flex flex-wrap gap-2">
        {[7,30,90].map(v=><Link key={v} href={params({days:String(v)})} className={`rounded-full px-4 py-2 text-xs font-semibold ${days===v?"bg-black text-white":"border border-black/10 bg-white text-black/55"}`}>{v}D</Link>)}
        <form className="flex flex-wrap gap-2" action="/admin/email">
          <input type="hidden" name="days" value={days}/>
          <select name="category" defaultValue={category||""} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-black/60"><option value="">All categories</option>{d.categories.map(v=><option key={v} value={v}>{nice(v)}</option>)}</select>
          <select name="source" defaultValue={source||""} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-black/60"><option value="">All sources</option>{d.sources.map(v=><option key={v} value={v}>{nice(v)}</option>)}</select>
          <button className="rounded-full bg-black/[.06] px-4 py-2 text-xs font-semibold text-black/60">Apply</button>
          {(category||source)&&<Link href={`/admin/email?days=${days}`} className="px-2 py-2 text-xs font-medium text-black/35">Clear</Link>}
        </form>
      </div>
    </div>

    <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(({label,value,sub,icon:Icon})=><div key={label} className="rounded-3xl border border-black/[.055] bg-white p-5"><div className="flex items-start justify-between"><p className="text-xs text-black/35">{label}</p><div className="grid h-8 w-8 place-items-center rounded-full bg-black/[.035] text-black/45"><Icon size={14}/></div></div><p className="mt-3 text-2xl font-semibold tracking-[-.04em]">{value}</p><div className="mt-2">{sub}</div></div>)}</section>

    <section className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
      <div className="rounded-3xl border border-black/[.055] bg-white p-6">
        <div className="flex items-end justify-between gap-4"><div><h2 className="font-semibold">Performance trend</h2><p className="mt-1 text-xs text-black/35">Sent, unique opens and unique clicks by day.</p></div><div className="hidden gap-4 text-[10px] text-black/40 sm:flex"><span>● Sent</span><span className="text-emerald-600">● Opened</span><span className="text-amber-600">● Clicked</span></div></div>
        <div className="mt-8 flex h-56 items-end gap-1.5">{d.daily.length?d.daily.map(x=><div key={x.day} className="group relative flex min-w-1 flex-1 items-end justify-center gap-[2px]" title={`${x.day} · Sent ${x.sent} · Opened ${x.opened} · Clicked ${x.clicked}`}><div className="w-[30%] min-w-[2px] rounded-t bg-[#171717]" style={{height:`${Math.max(3,x.sent/maxDaily*100)}%`}}/><div className="w-[30%] min-w-[2px] rounded-t bg-emerald-500" style={{height:`${Math.max(x.opened?3:0,x.opened/maxDaily*100)}%`}}/><div className="w-[30%] min-w-[2px] rounded-t bg-amber-400" style={{height:`${Math.max(x.clicked?3:0,x.clicked/maxDaily*100)}%`}}/></div>):<div className="m-auto text-sm text-black/30">Email activity will appear here as messages are sent.</div>}</div>
      </div>

      <div className="rounded-3xl border border-black/[.055] bg-white p-6"><h2 className="font-semibold">Delivery health</h2><p className="mt-1 text-xs text-black/35">Why messages failed in this period.</p><div className="mt-6 rounded-2xl bg-black/[.025] p-5"><div className="flex items-end justify-between"><div><p className="text-xs text-black/35">SMTP acceptance</p><p className="mt-2 text-3xl font-semibold tracking-[-.04em]">{deliveryRate.toFixed(1)}%</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${deliveryRate>=98?"bg-emerald-50 text-emerald-700":deliveryRate>=95?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700"}`}>{deliveryRate>=98?"Healthy":deliveryRate>=95?"Watch":"Needs attention"}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[.06]"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,deliveryRate)}%`}}/></div></div><div className="mt-5 space-y-3">{d.failureReasons.map(x=><div key={x.reason} className="flex items-center justify-between border-b border-black/[.05] pb-3 text-xs"><span className="text-black/55">{x.reason}</span><strong>{x.total}</strong></div>)}{!d.failureReasons.length&&<p className="text-sm text-black/30">No failed messages in this period.</p>}</div></div>
    </section>

    <section className="mt-4 grid gap-4 xl:grid-cols-2">
      <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white"><div className="border-b border-black/[.055] px-6 py-5"><h2 className="font-semibold">Category performance</h2><p className="mt-1 text-xs text-black/35">Compare notification and outreach types.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35"><tr><th className="px-6 py-3">Category</th><th>Sent</th><th>Open rate</th><th>Click rate</th><th>Failed</th></tr></thead><tbody>{d.byCategory.map(r=><tr key={r.category} className="border-t border-black/[.05]"><td className="px-6 py-4 font-medium">{nice(r.category)}</td><td>{r.sent}</td><td>{pct(r.opened,r.sent)}</td><td>{pct(r.clicked,r.sent)}</td><td>{r.failed}</td></tr>)}{!d.byCategory.length&&<tr><td colSpan={5} className="px-6 py-8 text-center text-black/30">No category data yet.</td></tr>}</tbody></table></div></div>

      <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white"><div className="border-b border-black/[.055] px-6 py-5"><h2 className="font-semibold">Sending source</h2><p className="mt-1 text-xs text-black/35">AARYVO platform SMTP versus workspace SMTP.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35"><tr><th className="px-6 py-3">Source</th><th>Sent</th><th>Delivery</th><th>Open rate</th><th>Click rate</th></tr></thead><tbody>{d.bySource.map(r=><tr key={r.source} className="border-t border-black/[.05]"><td className="px-6 py-4 font-medium">{nice(r.source)}</td><td>{r.sent}</td><td>{pct(r.sent,r.sent+r.failed)}</td><td>{pct(r.opened,r.sent)}</td><td>{pct(r.clicked,r.sent)}</td></tr>)}{!d.bySource.length&&<tr><td colSpan={5} className="px-6 py-8 text-center text-black/30">No source data yet.</td></tr>}</tbody></table></div></div>
    </section>

    <div className="mt-4 overflow-hidden rounded-3xl border border-black/[.055] bg-white"><div className="border-b border-black/[.055] px-6 py-5"><div className="flex items-end justify-between"><div><h2 className="font-semibold">Recent email activity</h2><p className="mt-1 text-xs text-black/35">Latest 50 messages matching the current filters.</p></div><span className="text-[10px] text-black/30">{d.totalOpens} opens · {d.totalClicks} clicks</span></div></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-black/[.018] text-[10px] uppercase tracking-[.12em] text-black/35"><tr><th className="px-6 py-3">Recipient</th><th>Subject</th><th>Category</th><th>Source</th><th>Status</th><th>Sent</th><th>Opened</th><th>Clicked</th></tr></thead><tbody>{d.recent.map(r=><tr key={r.id} className="border-t border-black/[.05]"><td className="px-6 py-4">{r.recipient}</td><td className="max-w-[300px] pr-5"><Link href={`/admin/email/${r.id}`} className="font-medium hover:underline">{r.subject}</Link><div className="mt-1 text-[10px] text-black/30">Preview email</div></td><td>{nice(r.category)}</td><td>{r.source?nice(r.source):"—"}</td><td><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${r.status==="SENT"?"bg-emerald-50 text-emerald-700":r.status==="FAILED"?"bg-red-50 text-red-700":"bg-amber-50 text-amber-700"}`}>{r.status}</span></td><td>{dt(r.sentAt)}</td><td>{r.openCount?`${r.openCount} · ${dt(r.openedAt)}`:"—"}</td><td>{r.clickCount?`${r.clickCount} · ${dt(r.clickedAt)}`:"—"}</td></tr>)}{!d.recent.length&&<tr><td colSpan={8} className="px-6 py-8 text-center text-black/30">No tracked email activity for these filters.</td></tr>}</tbody></table></div></div>
    <p className="mt-4 text-xs leading-5 text-black/35">SMTP acceptance means the configured mail server accepted the message; it is not proof of inbox placement. Unique opens are approximate because mail clients may block or proxy tracking pixels.</p>
  </div>
}
