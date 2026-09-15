import { BadgeCheck, Building2, Mail, MessageSquareText } from "lucide-react";
import MarketingFooter from "../_components/MarketingFooter";
import MarketingHeader from "../_components/MarketingHeader";

export const metadata = { title: "Contact Us | AARYVO", description: "Contact AARYVO, a product of PP DESIGN AND TECH." };

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#f4f1e8] text-[#151515]">
      <MarketingHeader />
      <section className="px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Contact</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
            <h1 className="premium-display max-w-3xl text-5xl font-semibold leading-[.94] tracking-[-.055em] sm:text-7xl">Talk to the people behind AARYVO.</h1>
            <p className="max-w-xl text-base leading-8 text-black/50">Product support, subscriptions, billing or business enquiries — send us a message and we&apos;ll point you in the right direction.</p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            <a href="mailto:ppdesignandtech@gmail.com" className="group rounded-[32px] border border-black/10 bg-[#f9f7f1] p-7 transition hover:-translate-y-1"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#ffdf67]"><Mail size={20} /></div><h2 className="mt-12 text-2xl font-semibold">Email support</h2><p className="mt-3 text-sm text-black/55">ppdesignandtech@gmail.com</p><p className="mt-5 text-xs leading-5 text-black/35">We generally respond to support and billing queries within 2 business days.</p></a>
            <div className="rounded-[32px] bg-[#171717] p-7 text-white"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#d7ff73] text-black"><Building2 size={20} /></div><h2 className="mt-12 text-2xl font-semibold">Legal entity</h2><p className="mt-3 text-sm font-medium text-white/75">PP DESIGN AND TECH</p><p className="mt-2 text-sm leading-6 text-white/45">AARYVO is a product and brand operated by PP DESIGN AND TECH.</p></div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-[32px] bg-[#ffdf67] p-7 md:p-9"><div className="flex items-start gap-4"><BadgeCheck size={22} className="mt-1 shrink-0" /><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-black/40">Business & billing identity</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.04em]">PP DESIGN AND TECH</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">Payments for AARYVO subscriptions are collected by PP DESIGN AND TECH. GST invoices are issued by PP DESIGN AND TECH.</p><p className="mt-4 text-sm font-semibold">GSTIN: 07CQXPP5370D1ZB</p></div></div></div>
            <div className="rounded-[32px] border border-black/10 bg-[#f9f7f1] p-7"><MessageSquareText size={21} /><p className="mt-12 text-xs font-semibold uppercase tracking-[.14em] text-black/35">Need help?</p><h3 className="mt-3 text-2xl font-semibold tracking-[-.035em]">We keep support human.</h3><p className="mt-3 text-sm leading-6 text-black/50">Include your AARYVO account email and workspace name so we can help faster.</p></div>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
