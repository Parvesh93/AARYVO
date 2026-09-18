import { CheckCircle2, CircleAlert, Database, KeyRound, Mail, Server, WalletCards } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function HealthPage() {
  let databaseReady = false;
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    databaseReady = true;
  } catch {}

  const items = [
    ["Database", databaseReady, "MySQL connection and Prisma queries", Database],
    ["OpenAI", Boolean(process.env.OPENAI_API_KEY), "AI responses and outreach generation", KeyRound],
    [
      "Platform SMTP",
      Boolean(
        (process.env.PLATFORM_SMTP_HOST || process.env.SMTP_HOST) &&
          (process.env.PLATFORM_SMTP_USER || process.env.SMTP_USER) &&
          (process.env.PLATFORM_SMTP_PASS || process.env.SMTP_PASS),
      ),
      "Aaryvo transactional and outreach email",
      Mail,
    ],
    [
      "Razorpay",
      Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET),
      "Subscriptions and billing webhooks",
      WalletCards,
    ],
    [
      "Google service account",
      Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
      "Lead-pipeline Google Sheets access",
      Server,
    ],
    [
      "Outreach worker",
      Boolean(process.env.OUTREACH_AGENT_SECRET && process.env.OUTREACH_SHEET_ID),
      "Server-to-server outreach authentication",
      Server,
    ],
  ] as const;

  const ready = items.filter(([, ok]) => ok).length;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Operations</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em]">System health</h1>
      <p className="mt-2 text-sm text-black/45">Configuration readiness for Aaryvo production services.</p>

      <div className="mt-8 rounded-3xl border border-black/[.055] bg-[#111319] p-7 text-white">
        <div className="text-xs uppercase tracking-[.16em] text-white/35">Readiness</div>
        <div className="mt-3 text-5xl font-semibold tracking-[-.05em]">{ready}/{items.length}</div>
        <div className="mt-2 text-sm text-white/45">production checks configured</div>
      </div>

      <section className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map(([label, ok, description, Icon]) => (
          <div key={label} className="rounded-3xl border border-black/[.055] bg-white p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="flex gap-4">
                <div className="rounded-2xl bg-black/[.04] p-3"><Icon size={18} /></div>
                <div>
                  <h2 className="font-semibold">{label}</h2>
                  <p className="mt-1 text-xs text-black/40">{description}</p>
                </div>
              </div>
              {ok ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 size={12} /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                  <CircleAlert size={12} /> Check
                </span>
              )}
            </div>
          </div>
        ))}
      </section>

      <p className="mt-4 text-xs leading-5 text-black/35">
        This screen checks configuration and database reachability. It does not replace external uptime monitoring.
      </p>
    </div>
  );
}
