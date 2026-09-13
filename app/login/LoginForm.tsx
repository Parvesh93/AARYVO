"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }
      router.push(data.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      setError("Could not connect to AARYVO. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="mt-8 space-y-4">
      <input name="email" type="email" required placeholder="Email address" className="w-full rounded-2xl border border-black/10 px-5 py-4 outline-none focus:border-black/30" />
      <input name="password" type="password" required placeholder="Password" className="w-full rounded-2xl border border-black/10 px-5 py-4 outline-none focus:border-black/30" />
      <button disabled={loading} className="w-full rounded-full bg-black px-6 py-4 font-medium text-white disabled:opacity-50">{loading ? "Signing in…" : "Sign in"}</button>
    </form>
  </>;
}
