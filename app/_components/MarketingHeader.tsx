"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-[80] px-4 pt-4 md:px-7 md:pt-5">
      <nav className="premium-nav mx-auto flex max-w-[1380px] items-center justify-between rounded-[22px] border border-black/10 bg-[#f9f7f1]/95 px-4 py-3 shadow-[0_12px_40px_rgba(20,20,20,.06)] backdrop-blur-xl md:px-5">
        <Link href="/" onClick={close} className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#161616] text-sm font-semibold text-white">A</div>
          <div>
            <div className="text-[15px] font-semibold tracking-[.24em]">AARYVO</div>
            <div className="text-[9px] uppercase tracking-[.16em] text-black/35">AI Sales OS</div>
          </div>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] font-medium text-black/55 md:flex">
          <Link href="/#platform" className="transition hover:text-black">Platform</Link>
          <Link href="/#why" className="transition hover:text-black">Why AARYVO</Link>
          <Link href="/#pricing" className="transition hover:text-black">Pricing</Link>
          <Link href="/contact" className="transition hover:text-black">Contact</Link>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-full px-4 py-2.5 text-sm font-medium text-black/55 transition hover:text-black">Sign in</Link>
          <Link href="/signup" className="premium-button inline-flex items-center gap-2 rounded-full bg-[#161616] px-5 py-2.5 text-sm font-medium text-white">Start free <ArrowRight size={14} /></Link>
        </div>

        <button type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full bg-black text-white md:hidden">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      <div className={`fixed inset-0 z-[-1] md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        <button aria-label="Close menu" onClick={close} className={`absolute inset-0 bg-black/35 backdrop-blur-sm transition ${menuOpen ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute left-4 right-4 top-[82px] rounded-[26px] bg-[#f9f7f1] p-4 shadow-2xl transition-all ${menuOpen ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}>
          <Link onClick={close} href="/#platform" className="flex items-center justify-between rounded-2xl px-4 py-4 text-lg font-medium">Platform <ArrowRight size={16} /></Link>
          <Link onClick={close} href="/#why" className="flex items-center justify-between rounded-2xl px-4 py-4 text-lg font-medium">Why AARYVO <ArrowRight size={16} /></Link>
          <Link onClick={close} href="/#pricing" className="flex items-center justify-between rounded-2xl px-4 py-4 text-lg font-medium">Pricing <ArrowRight size={16} /></Link>
          <Link onClick={close} href="/contact" className="flex items-center justify-between rounded-2xl px-4 py-4 text-lg font-medium">Contact <ArrowRight size={16} /></Link>
          <div className="my-3 h-px bg-black/10" />
          <div className="grid gap-2">
            <Link href="/login" onClick={close} className="rounded-full border border-black/10 px-5 py-3.5 text-center text-sm font-medium">Sign in</Link>
            <Link href="/signup" onClick={close} className="rounded-full bg-black px-5 py-3.5 text-center text-sm font-medium text-white">Start free</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
