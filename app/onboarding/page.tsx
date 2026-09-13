import { redirect } from "next/navigation";
import { createWorkspace } from "@/app/actions/onboarding";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function OnboardingPage() {
  const session = await requireSession();
  const membership = await prisma.businessMember.findFirst({ where: { userId: session.userId } });
  if (membership) redirect("/dashboard");
  return (
    <main className="min-h-screen px-6 py-10"><div className="mx-auto max-w-3xl">
      <a href="/" className="text-sm text-black/45">← AARYVO</a>
      <div className="mt-16 rounded-[36px] bg-white p-8 shadow-xl shadow-black/5 md:p-12">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-black/40">Workspace setup · 1 of 3</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em]">Create your AI employee.</h1>
        <p className="mt-4 text-lg leading-7 text-black/50">Start with your website. Next, AARYVO will learn your business and prepare a live sales agent.</p>
        <form action={createWorkspace} className="mt-10 space-y-5">
          <label className="block"><span className="mb-2 block text-sm font-medium">Business name</span><input name="name" required className="w-full rounded-2xl border border-black/10 px-5 py-4 outline-none focus:border-black/30" placeholder="Acme Interiors" /></label>
          <label className="block"><span className="mb-2 block text-sm font-medium">Website</span><input name="websiteUrl" type="url" className="w-full rounded-2xl border border-black/10 px-5 py-4 outline-none focus:border-black/30" placeholder="https://example.com" /></label>
          <label className="block"><span className="mb-2 block text-sm font-medium">Primary goal</span><select name="goal" className="w-full rounded-2xl border border-black/10 px-5 py-4"><option>Qualify leads and book appointments</option><option>Answer enquiries and capture leads</option><option>Recommend services and qualify buyers</option></select></label>
          <button className="w-full rounded-full bg-black px-6 py-4 font-medium text-white">Create workspace & continue</button>
        </form>
      </div>
    </div></main>
  );
}
