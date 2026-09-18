import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { emailLogById } from "@/lib/email-analytics";

function dt(value: Date | null) {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "—";
}

export default async function EmailPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const email = await emailLogById(id);
  if (!email) notFound();

  return (
    <div>
      <Link
        href="/admin/email"
        className="inline-flex items-center gap-2 text-xs font-medium text-black/45 hover:text-black"
      >
        <ArrowLeft size={14} />
        Back to Email Analytics
      </Link>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">
            Email preview
          </p>
          <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-.04em]">
            {email.subject}
          </h1>
        </div>
        <span className="w-fit rounded-full bg-black/[.05] px-3 py-1.5 text-[10px] font-semibold text-black/55">
          {email.status}
        </span>
      </div>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Recipient", email.recipient],
          ["Category", email.category.replaceAll("_", " ")],
          ["Source", email.source || "—"],
          ["Sent", dt(email.sentAt)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-black/[.055] bg-white p-4"
          >
            <p className="text-[10px] uppercase tracking-[.12em] text-black/30">
              {label}
            </p>
            <p className="mt-2 break-words text-sm font-medium">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 overflow-hidden rounded-3xl border border-black/[.055] bg-white">
        <div className="border-b border-black/[.055] px-6 py-5">
          <h2 className="font-semibold">Rendered email</h2>
          <p className="mt-1 text-xs text-black/35">
            This is the HTML body saved at send time.
          </p>
        </div>

        {email.htmlBody ? (
          <iframe
            title="Email preview"
            srcDoc={email.htmlBody}
            sandbox=""
            className="h-[720px] w-full bg-white"
          />
        ) : (
          <div className="px-6 py-12 text-center text-sm text-black/35">
            This older email was sent before body previews were stored.
          </div>
        )}
      </div>

      {email.textBody ? (
        <details className="mt-4 rounded-3xl border border-black/[.055] bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Plain-text version
          </summary>
          <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-black/60">
            {email.textBody}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
