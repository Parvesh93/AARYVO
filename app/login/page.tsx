import Link from "next/link";
import MarketingFooter from "../_components/MarketingFooter";
import MarketingHeader from "../_components/MarketingHeader";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return <main className="min-h-screen bg-[#f4f1e8] text-[#151515]"><MarketingHeader /><section className="px-5 py-16 md:px-8 md:py-24"><div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center"><div className="hidden lg:block"><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Welcome back</p><h1 className="premium-display mt-4 max-w-xl text-6xl font-semibold leading-[.93] tracking-[-.06em]">Your next conversation is already waiting.</h1><p className="mt-6 max-w-md text-base leading-8 text-black/50">Sign in to manage conversations, leads, appointments and your AARYVO AI employee.</p></div><div className="mx-auto w-full max-w-lg rounded-[36px] border border-black/10 bg-[#f9f7f1] p-7 shadow-[0_25px_70px_rgba(0,0,0,.08)] md:p-10"><div className="inline-flex rounded-full bg-[#ffdf67] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.14em]">AARYVO workspace</div><h2 className="mt-6 text-4xl font-semibold tracking-[-.05em]">Sign in.</h2><LoginForm next={safeNext} /><p className="mt-6 text-center text-sm text-black/50">New to AARYVO? <Link href={safeNext ? `/signup?next=${encodeURIComponent(safeNext)}` : "/signup"} className="font-semibold text-black">Create account</Link></p></div></div></section><MarketingFooter /></main>;
}
