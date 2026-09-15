import Link from "next/link";
import { Mail, Building2, BadgeCheck } from "lucide-react";

export const metadata = { title: "Contact Us | AARYVO", description: "Contact AARYVO, a product of PP DESIGN AND TECH." };

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] px-6 py-10 text-[#111319] md:px-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold tracking-[.22em]">AARYVO</Link>
        <p className="mt-16 text-xs font-semibold uppercase tracking-[.16em] text-black/35">Contact</p>
        <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-[-.05em]">We&apos;re here to help.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-black/55">For product support, subscriptions, billing, account queries or business enquiries, contact the AARYVO team using the details below.</p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-black/[.06] bg-white p-6">
            <Mail size={20}/><h2 className="mt-6 text-lg font-semibold">Email</h2>
            <a href="mailto:ppdesignandtech@gmail.com" className="mt-2 block text-sm text-black/55 underline underline-offset-4">ppdesignandtech@gmail.com</a>
            <p className="mt-3 text-xs leading-5 text-black/40">We generally respond to support and billing queries within 2 business days.</p>
          </div>
          <div className="rounded-[28px] border border-black/[.06] bg-white p-6">
            <Building2 size={20}/><h2 className="mt-6 text-lg font-semibold">Legal entity</h2>
            <p className="mt-2 text-sm font-medium">PP DESIGN AND TECH</p>
            <p className="mt-1 text-sm text-black/50">AARYVO is a product and brand operated by PP DESIGN AND TECH.</p>
          </div>
        </div>

        <div className="mt-4 rounded-[28px] bg-[#111319] p-6 text-white md:p-8">
          <div className="flex items-start gap-3"><BadgeCheck size={20} className="mt-0.5 shrink-0"/><div><p className="text-xs uppercase tracking-[.14em] text-white/35">Business & billing identity</p><h2 className="mt-2 text-2xl font-semibold">PP DESIGN AND TECH</h2><p className="mt-3 text-sm leading-6 text-white/55">Payments for AARYVO subscriptions are collected by PP DESIGN AND TECH. GST invoices are issued by PP DESIGN AND TECH.</p><p className="mt-3 text-sm text-white/70">GSTIN: 07CQXPP5370D1ZB</p></div></div>
        </div>

        <div className="mt-12 flex flex-wrap gap-x-5 gap-y-3 border-t border-black/[.07] pt-7 text-sm text-black/45">
          <Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link><Link href="/refund-policy">Refund Policy</Link><Link href="/cancellation-policy">Cancellation Policy</Link><Link href="/shipping-policy">Shipping Policy</Link>
        </div>
      </div>
    </main>
  );
}
