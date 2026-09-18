import OpenAI from "openai";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { crawlWebsite } from "@/lib/website-ingestion";
import { readOutreachRows, updateOutreachRange } from "@/lib/platform-google-sheets";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";

export const runtime = "nodejs";
export const maxDuration = 300;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

type Lead = {
  row: number;
  company: string;
  website: string;
  industry: string;
  location: string;
  email: string;
  existingChat: string;
  useCase: string;
  score: number;
  status: string;
  notes: string;
};

function authorized(request: Request) {
  const expected = process.env.OUTREACH_AGENT_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7).trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseEmail(value: string) {
  const candidates = value
    .split(/[\s,;/]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return (
    candidates.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || ""
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1)) as {
    subject?: string;
    html?: string;
    text?: string;
    observation?: string;
  };
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function draftEmail(lead: Lead) {
  const pages = await crawlWebsite(lead.website);
  const websiteContext = pages
    .slice(0, 4)
    .map((p) => `PAGE: ${p.title}\nURL: ${p.url}\n${p.content.slice(0, 7000)}`)
    .join("\n\n---\n\n")
    .slice(0, 22000);

  const response = await client.responses.create({
    model: MODEL,
    instructions: `You write concise founder-to-business cold outreach for Aaryvo, an AI website sales/support agent.

Return ONLY valid JSON with keys: subject, html, text, observation.

Rules:
- Always spell the product Aaryvo.
- Use ONLY facts explicitly present in WEBSITE CONTEXT or LEAD DATA. Never invent details.
- Mention one concrete website observation in a natural way.
- Tie that observation to the provided Aaryvo use case.
- Keep the email concise: roughly 90-150 words.
- Tone: premium, professional, human, not hypey.
- Do not claim guaranteed results, savings, conversion lifts, or customer counts.
- Do not mention scraping, automation, lead scoring, or that AI wrote the email.
- CTA should invite them to see Aaryvo at https://aaryvo.ppdesigntech.com/ or reply if they want a quick demo.
- Include a short opt-out line: "If this isn't relevant, just reply no thanks and I won't follow up."
- HTML must be email-safe inline HTML only: paragraphs, simple links, no scripts, forms, images, CSS blocks, or remote assets.
- observation should be a short factual phrase used in the email.`,
    input: `LEAD DATA
Company: ${lead.company}
Industry: ${lead.industry}
Location: ${lead.location}
Existing chat/support: ${lead.existingChat}
Aaryvo use case: ${lead.useCase}

WEBSITE CONTEXT
${websiteContext}`,
  });

  const parsed = parseJsonObject(response.output_text || "{}");
  const subject = clean(parsed.subject).slice(0, 180);
  const html = clean(parsed.html);
  const text = clean(parsed.text);
  const observation = clean(parsed.observation).slice(0, 500);

  if (!subject || (!html && !text)) {
    throw new Error("AI did not return a usable outreach email.");
  }

  const safeHtml =
    html ||
    `<p>${htmlEscape(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;

  return { subject, html: safeHtml, text: text || undefined, observation };
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit || 15);
    const limit = Math.max(1, Math.min(15, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 15));
    const dryRun = body?.dryRun === true;

    const { values } = await readOutreachRows("A1:N1000");
    if (!values.length) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 0, failed: 0, results: [] });
    }

    const leads: Lead[] = values
      .slice(1)
      .map((row, index) => ({
        row: index + 2,
        company: clean(row[0]),
        website: clean(row[1]),
        industry: clean(row[2]),
        location: clean(row[3]),
        email: parseEmail(clean(row[4])),
        existingChat: clean(row[5]),
        useCase: clean(row[6]),
        score: Number(row[7] || 0),
        status: clean(row[8]),
        notes: clean(row[13]),
      }))
      .filter(
        (lead) =>
          lead.status.toLowerCase() === "qualified - not contacted" &&
          lead.company &&
          lead.website &&
          lead.email,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const now = new Date();
    const today = isoDate(now);
    const followUp = isoDate(addDays(now, 3));

    const results: Array<Record<string, unknown>> = [];

    for (const lead of leads) {
      try {
        const draft = await draftEmail(lead);

        if (!dryRun) {
          const sent = await sendTrackedPlatformEmail({
            to: lead.email,
            subject: draft.subject,
            html: draft.html,
            text: draft.text,
            category: "OUTREACH",
          });

          const noteParts = [
            lead.notes,
            `Tracked Aaryvo outreach sent ${today}.`,
            draft.observation ? `Personalization: ${draft.observation}` : "",
            `Analytics ID: ${sent.analyticsId}`,
          ].filter(Boolean);

          await updateOutreachRange(`I${lead.row}:N${lead.row}`, [
            [
              "Contacted",
              today,
              today,
              followUp,
              "",
              noteParts.join(" "),
            ],
          ]);

          results.push({
            row: lead.row,
            company: lead.company,
            email: lead.email,
            status: "sent",
            analyticsId: sent.analyticsId,
            subject: draft.subject,
          });
        } else {
          results.push({
            row: lead.row,
            company: lead.company,
            email: lead.email,
            status: "dry-run",
            subject: draft.subject,
            observation: draft.observation,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!dryRun) {
          const failureNote = [lead.notes, `Outreach attempt ${today} failed: ${message.slice(0, 600)}`]
            .filter(Boolean)
            .join(" ");
          try {
            await updateOutreachRange(`N${lead.row}`, [[failureNote]]);
          } catch {}
        }
        results.push({
          row: lead.row,
          company: lead.company,
          email: lead.email,
          status: "failed",
          error: message,
        });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      ok: true,
      dryRun,
      selected: leads.length,
      sent,
      failed,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outreach run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
