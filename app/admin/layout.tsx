import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Activity, BarChart3, Building2, CircleDollarSign, ExternalLink, Gauge, HeartPulse, Mail, MessageSquareText, Send, Settings, Users } from "lucide-react";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin | AARYVO", robots: { index: false, follow: false } };

const nav = [
  ["Overview", "/admin", Gauge],
  ["Website Analytics", "/admin/analytics", BarChart3],
  ["Customers", "/admin/customers", Building2],
  ["Subscriptions", "/admin/subscriptions", CircleDollarSign],
  ["Usage", "/admin/usage", Activity],
  ["Email Analytics", "/admin/email", Mail],
  ["Outreach Review", "/admin/outreach", Send],
  ["Conversations & Leads", "/admin/sales", MessageSquareText],
  ["System Health", "/admin/health", HeartPulse],
  ["Activity Logs", "/admin/activity", Users],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return <div className="min-h-screen bg-[#f4f5f7] text-[#111319] lg:flex">
    <aside className="border-b border-white/10 bg-[#111319] text-white lg:sticky lg:top-0 lg:h-screen lg:w-[252px] lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-4 py-5">
        <Link href="/admin" className="flex items-center gap-3 px-2 py-2">
          <Image src="/aaryvo-logo-white.webp" alt="AARYVO" width={2048} height={500} className="h-auto w-[122px] object-contain" priority />
        </Link>
        <p className="mt-2 px-2 text-[9px] font-semibold uppercase tracking-[.2em] text-white/30">SaaS operations</p>
        <nav className="admin-sidebar-scroll mt-6 flex gap-1 overflow-x-auto pb-2 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
          {nav.map(([label,href,Icon])=><Link key={href} href={href} className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-white/55 transition hover:bg-white/[.07] hover:text-white"><Icon size={16}/><span>{label}</span></Link>)}
        </nav>
        <div className="hidden border-t border-white/10 pt-4 lg:block">
          <div className="px-3 text-[10px] text-white/30">Signed in as</div><div className="mt-1 truncate px-3 text-xs text-white/65">{session.email}</div>
          <Link href="/dashboard" className="mt-4 flex items-center justify-between rounded-xl bg-white/[.07] px-3 py-2.5 text-xs text-white/75 hover:bg-white/[.1]"><span>Open workspace</span><ExternalLink size={13}/></Link>
        </div>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-black/[.055] bg-white/90 px-5 backdrop-blur-xl lg:px-8"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/30">AARYVO</p><p className="text-sm font-semibold">Founder Console</p></div><div className="flex items-center gap-2"><span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700 sm:block">● Production</span><Link href="/dashboard" className="rounded-full border border-black/[.08] px-4 py-2 text-xs font-medium">Workspace</Link></div></header>
      <main className="mx-auto max-w-[1600px] px-5 py-7 lg:px-8 lg:py-9">{children}</main>
    </div>
  </div>;
}
