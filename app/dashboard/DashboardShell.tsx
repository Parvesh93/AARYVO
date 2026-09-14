"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  Database,
  Home,
  Menu,
  Plug,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { logout } from "@/app/actions/auth";

type Props = {
  children: React.ReactNode;
  user: { name: string | null; email: string };
  business: { name: string; websiteUrl: string | null };
};

const NAV = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: Database },
  { href: "/dashboard/ai-employee", label: "AI Employee", icon: Bot },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
];

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
}

export default function DashboardShell({ children, user, business }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isActive = (href: string) => href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={`${mobile ? "flex" : "hidden lg:flex"} h-full w-[268px] shrink-0 flex-col border-r border-black/[0.06] bg-[#111319] text-white`}>
      <div className="flex h-20 items-center justify-between px-6">
        <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black"><Sparkles size={17} /></span>
          <div><p className="font-semibold tracking-[0.22em]">AARYVO</p><p className="mt-0.5 text-[10px] text-white/35">AI SALES OS</p></div>
        </Link>
        {mobile && <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>}
      </div>

      <div className="px-4 pb-3 pt-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">Workspace</p>
          <p className="mt-1.5 truncate text-sm font-medium">{business.name}</p>
          <p className="mt-1 truncate text-[11px] text-white/35">{business.websiteUrl || "Website not set"}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">Workspace</p>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white text-black shadow-sm" : "text-white/55 hover:bg-white/[0.07] hover:text-white"}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-black" />}</Link>;
        })}
      </nav>

      <div className="border-t border-white/[0.08] p-3">
        <Link href="/dashboard/settings" onClick={() => setMobileOpen(false)} className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${pathname.startsWith("/dashboard/settings") ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.07] hover:text-white"}`}><Settings size={17} strokeWidth={1.8} />Settings</Link>
        <div className="relative">
          <button onClick={() => setProfileOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.07]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">{initials(user.name, user.email)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name || "Account"}</span><span className="block truncate text-[11px] text-white/35">{user.email}</span></span>
            <ChevronDown size={15} className={`text-white/35 transition ${profileOpen ? "rotate-180" : ""}`} />
          </button>
          {profileOpen && <div className="absolute bottom-[58px] left-0 right-0 rounded-2xl border border-white/10 bg-[#1b1e25] p-2 shadow-2xl"><Link href="/dashboard/settings" onClick={() => { setProfileOpen(false); setMobileOpen(false); }} className="block rounded-xl px-3 py-2 text-sm text-white/65 hover:bg-white/10 hover:text-white">Profile & settings</Link><form action={logout}><button className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 hover:bg-white/10">Sign out</button></form></div>}
        </div>
      </div>
    </aside>
  );

  return <div className="min-h-screen bg-[#f5f6f8] text-[#111319]">
    <div className="flex min-h-screen">
      <Sidebar />
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} /><div className="relative h-full"><Sidebar mobile /></div></div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-black/[0.06] bg-[#f5f6f8]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-xl border border-black/[0.08] bg-white p-2 lg:hidden"><Menu size={18} /></button><div className="min-w-0"><p className="truncate text-sm font-medium">{business.name}</p><p className="hidden text-[11px] text-black/35 sm:block">AARYVO workspace</p></div></div>
          <div className="flex items-center gap-2"><Link href="/dashboard/ai-employee" className="hidden rounded-full border border-black/[0.08] bg-white px-4 py-2 text-xs font-medium text-black/65 transition hover:border-black/20 hover:text-black sm:inline-flex">Test AI employee</Link><Link href="/dashboard/settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">{initials(user.name, user.email)}</Link></div>
        </header>
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  </div>;
}
