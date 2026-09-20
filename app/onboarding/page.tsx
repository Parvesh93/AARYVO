import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const session = await requireSession();
  const membership = await prisma.businessMember.findFirst({ where: { userId: session.userId } });
  if (membership) redirect(safeNext || "/dashboard");

  return (
    <main className="min-h-screen px-6 py-10"><div className="mx-auto max-w-3xl">
      <a href="/" className="text-sm text-black/45">← AARYVO</a>
      <div className="mt-16 rounded-[36px] bg-white p-8 shadow-xl shadow-black/5 md:p-12">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-black/40">Workspace setup · 1 of 3</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em]">Create your AI employee.</h1>
        <p className="mt-4 text-lg leading-7 text-black/50">Start with your website. Next, AARYVO will learn your business and prepare a live sales agent.</p>
        <OnboardingForm next={safeNext} />
      </div>
    </div></main>
  );
}
