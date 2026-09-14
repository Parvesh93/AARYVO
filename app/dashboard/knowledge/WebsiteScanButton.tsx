"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WebsiteScanButton({
  disabled,
  hasWebsiteKnowledge,
}: {
  disabled: boolean;
  hasWebsiteKnowledge: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function scan() {
    if (loading || disabled) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/knowledge/scan", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Website scan failed.");
      router.push(`/dashboard/knowledge?knowledge=success&pages=${data.pages || 0}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Website scan failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={scan}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {loading ? "Scanning website…" : hasWebsiteKnowledge ? "Re-scan website" : "Scan website"}
      </button>
      {error ? <p className="max-w-md text-right text-xs leading-5 text-red-600">{error}</p> : null}
    </div>
  );
}
