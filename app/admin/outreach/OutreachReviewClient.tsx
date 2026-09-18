"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Eye, RefreshCw, Send, SkipForward } from "lucide-react";

type Preview = {
  id: string;
  company: string;
  website: string;
  recipient: string;
  emailType: "OUTREACH" | "FOLLOW_UP";
  followUpNumber: number | null;
  subject: string;
  htmlBody: string;
  textBody: string | null;
  observation: string | null;
  createdAt: string | Date;
};

export default function OutreachReviewClient({
  initialPreviews,
  defaultLimit,
}: {
  initialPreviews: Preview[];
  defaultLimit: number;
}) {
  const [previews, setPreviews] = useState(initialPreviews);
  const [selected, setSelected] = useState<string[]>(initialPreviews.map((p) => p.id));
  const [openId, setOpenId] = useState<string | null>(initialPreviews[0]?.id || null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const allSelected = previews.length > 0 && selected.length === previews.length;
  const selectedCount = selected.length;

  const active = useMemo(
    () => previews.find((p) => p.id === openId) || previews[0] || null,
    [previews, openId],
  );

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function action(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/outreach-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function regenerate() {
    startTransition(async () => {
      try {
        setMessage("Generating a fresh review batch...");
        const data = await action({
          action: "generate",
          limit: defaultLimit,
          replace: true,
        });
        setPreviews(data.previews || []);
        setSelected((data.previews || []).map((p: Preview) => p.id));
        setOpenId(data.previews?.[0]?.id || null);
        setMessage(`Generated ${data.previews?.length || 0} drafts for review.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to generate drafts.");
      }
    });
  }

  function sendSelected() {
    if (!selected.length) return;
    if (!window.confirm(`Send ${selected.length} selected outreach email(s) now?`)) return;

    startTransition(async () => {
      try {
        setMessage("Sending approved emails...");
        const data = await action({ action: "send", ids: selected });
        const successful = new Set(
          (data.results || [])
            .filter((r: { status: string }) => r.status === "sent")
            .map((r: { id: string }) => r.id),
        );
        const removed = new Set(
          (data.results || [])
            .filter((r: { status: string }) => ["sent", "stale"].includes(r.status))
            .map((r: { id: string }) => r.id),
        );

        setPreviews((current) => current.filter((p) => !removed.has(p.id)));
        setSelected((current) => current.filter((id) => !removed.has(id)));
        setOpenId((current) => {
          if (current && !removed.has(current)) return current;
          const next = previews.find((p) => !removed.has(p.id));
          return next?.id || null;
        });

        const sentCount = successful.size;
        const failedCount = (data.results || []).filter(
          (r: { status: string }) => r.status === "failed",
        ).length;
        const staleCount = (data.results || []).filter(
          (r: { status: string }) => r.status === "stale",
        ).length;
        setMessage(
          `Sent ${sentCount}. Failed ${failedCount}. Stale/skipped by safety checks ${staleCount}.`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to send emails.");
      }
    });
  }

  function skipSelected() {
    if (!selected.length) return;
    startTransition(async () => {
      try {
        await action({ action: "skip", ids: selected });
        const selectedSet = new Set(selected);
        setPreviews((current) => current.filter((p) => !selectedSet.has(p.id)));
        setSelected([]);
        setOpenId(null);
        setMessage("Selected drafts skipped.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to skip drafts.");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-4 rounded-3xl border border-black/[.055] bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">{previews.length} drafts waiting for approval</p>
          <p className="mt-1 text-xs text-black/35">
            Nothing sends until you select drafts and click Send selected.
          </p>
          {message ? <p className="mt-2 text-xs text-black/55">{message}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={regenerate}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full border border-black/[.08] px-4 py-2 text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Regenerate batch
          </button>
          <button
            onClick={skipSelected}
            disabled={isPending || !selectedCount}
            className="inline-flex items-center gap-2 rounded-full border border-black/[.08] px-4 py-2 text-xs font-medium disabled:opacity-50"
          >
            <SkipForward size={14} />
            Skip selected
          </button>
          <button
            onClick={sendSelected}
            disabled={isPending || !selectedCount}
            className="inline-flex items-center gap-2 rounded-full bg-[#111319] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Send size={14} />
            Send selected ({selectedCount})
          </button>
        </div>
      </div>

      {!previews.length ? (
        <div className="mt-4 rounded-3xl border border-dashed border-black/[.1] bg-white px-6 py-16 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={30} />
          <p className="mt-4 font-semibold">No drafts waiting for review</p>
          <p className="mt-1 text-sm text-black/35">
            Generate a batch now or wait for the scheduled workflow to prepare one.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[460px_1fr]">
          <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white">
            <div className="flex items-center justify-between border-b border-black/[.055] px-5 py-4">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? [] : previews.map((p) => p.id))
                  }
                />
                Select all
              </label>
              <span className="text-[10px] uppercase tracking-[.12em] text-black/30">
                Review queue
              </span>
            </div>

            <div className="max-h-[760px] overflow-y-auto">
              {previews.map((p) => (
                <div
                  key={p.id}
                  className={`border-b border-black/[.05] p-4 last:border-b-0 ${
                    active?.id === p.id ? "bg-black/[.025]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      className="mt-1"
                    />
                    <button
                      type="button"
                      onClick={() => setOpenId(p.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{p.company}</p>
                        <span className="shrink-0 rounded-full bg-black/[.05] px-2 py-1 text-[9px] font-semibold text-black/45">
                          {p.emailType === "FOLLOW_UP"
                            ? `FOLLOW-UP #${p.followUpNumber}`
                            : "OUTREACH"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-black/35">{p.recipient}</p>
                      <p className="mt-3 line-clamp-2 text-xs font-medium leading-5">
                        {p.subject}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-black/40">
                        <Eye size={12} />
                        Preview
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-black/[.055] bg-white">
            {active ? (
              <>
                <div className="border-b border-black/[.055] px-6 py-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-black/30">
                    Email preview
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-.025em]">
                    {active.subject}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-black/40">
                    <span>To: {active.recipient}</span>
                    <span>Company: {active.company}</span>
                  </div>
                  {active.observation ? (
                    <p className="mt-3 rounded-2xl bg-[#f6f7f9] px-4 py-3 text-xs leading-5 text-black/50">
                      <strong className="text-black/65">Personalization:</strong>{" "}
                      {active.observation}
                    </p>
                  ) : null}
                </div>

                <iframe
                  title={`Preview for ${active.company}`}
                  srcDoc={active.htmlBody}
                  sandbox=""
                  className="h-[680px] w-full bg-white"
                />

                {active.textBody ? (
                  <details className="border-t border-black/[.055] p-5">
                    <summary className="cursor-pointer text-xs font-semibold">
                      View plain-text version
                    </summary>
                    <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-black/55">
                      {active.textBody}
                    </pre>
                  </details>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
