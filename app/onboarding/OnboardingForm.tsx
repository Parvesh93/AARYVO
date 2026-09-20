"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), websiteUrl: form.get("websiteUrl"), goal: form.get("goal") }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Workspace could not be created.");
        if (response.status === 401) setTimeout(() => router.push("/login"), 800);
        return;
      }
      router.push(next || data.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      setError("Could not connect to AARYVO. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    {error && <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="mt-10 space-y-5">
      <label className="block"><span className="mb-2 block text-sm font-medium">Business name</span><input name="name" required className="w-full rounded-2xl border border-black/10 px-5 py-4 outline-none focus:border-black/30" placeholder="Acme Interiors" /></label>
      <label className="block"><span className="mb-2 block text-sm font-medium">Website</span><input name="websiteUrl" type="url" className="w-full rounded-2xl border border-black/10 px-5 py-4 outline-none focus:border-black/30" placeholder="https://example.com" /></label>
      <label className="block"><span className="mb-2 block text-sm font-medium">Primary goal</span><select name="goal" className="w-full rounded-2xl border border-black/10 px-5 py-4"><option>Qualify leads and book appointments</option><option>Answer enquiries and capture leads</option><option>Recommend services and qualify buyers</option></select></label>
      <button disabled={loading} className="w-full rounded-full bg-black px-6 py-4 font-medium text-white disabled:opacity-50">{loading ? "Creating workspace…" : "Create workspace & continue"}</button>
    </form>
  </>;
}
