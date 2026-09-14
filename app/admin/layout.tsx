import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Building2, ExternalLink, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[#111319]">
      <header className="sticky top-0 z-30 border-b border-black/[.06] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <Link href="/admin" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white"><ShieldCheck size={17}/></span><div><p className="text-sm font-semibold tracking-[.18em]">AARYVO ADMIN</p><p className="text-[10px] text-black/35">Founder console</p></div></Link>
          <div className="flex items-center gap-2"><Link href="/admin" className="hidden items-center gap-2 rounded-full px-4 py-2 text-xs text-black/55 sm:flex"><BarChart3 size={14}/>Overview</Link><Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-black/[.08] bg-white px-4 py-2 text-xs font-medium">Workspace <ExternalLink size={13}/></Link><span className="hidden text-xs text-black/35 lg:block">{session.email}</span></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
