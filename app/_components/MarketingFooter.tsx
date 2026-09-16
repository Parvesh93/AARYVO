import Link from "next/link";
import BrandLogo from "./BrandLogo";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-black/10 bg-[#171717] px-5 py-12 text-white md:px-8">
      <div className="mx-auto max-w-[1380px]">
        <div className="grid gap-10 md:grid-cols-[1.2fr_.8fr_.8fr]">
          <div>
            <BrandLogo variant="full" theme="light" className="h-[38px] w-auto object-contain" />
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/40">AI sales employees for businesses that want every website conversation to move somewhere useful.</p>
            <p className="mt-5 text-xs leading-6 text-white/35">AARYVO is a product of <span className="text-white/60">PP DESIGN AND TECH</span>.<br />Payments and GST invoices are issued by PP DESIGN AND TECH.<br />GSTIN: 07CQXPP5370D1ZB</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-white/30">Product</p>
            <div className="mt-4 grid gap-3 text-sm text-white/55"><Link href="/#platform">Platform</Link><Link href="/#why">Why AARYVO</Link><Link href="/#pricing">Pricing</Link><Link href="/login">Sign in</Link></div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-white/30">Company & legal</p>
            <div className="mt-4 grid gap-3 text-sm text-white/55"><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link><Link href="/refund-policy">Refund Policy</Link><Link href="/cancellation-policy">Cancellation Policy</Link><Link href="/shipping-policy">Shipping Policy</Link></div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 PP DESIGN AND TECH. All rights reserved.</span><span>AARYVO · Built for better conversations.</span></div>
      </div>
    </footer>
  );
}
