import OpenAI from "openai";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { crawlWebsite } from "@/lib/website-ingestion";
import { readOutreachRows } from "@/lib/platform-google-sheets";

export const runtime = "nodejs";
export const maxDuration = 120;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseEmail(value: string) {
  return (
    value
      .split(/[\s,;/]+/)
      .map((v) => v.trim())
      .find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || ""
  );
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

export async function GET() {
  await requireAdmin();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const { values } = await readOutreachRows("A1:N1000");

    const candidates = values
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
      }))
      .filter(
        (lead) =>
          lead.status.toLowerCase() === "qualified - not contacted" &&
          lead.company &&
          lead.website &&
          lead.email,
      )
      .sort((a, b) => b.score - a.score);

    const lead = candidates[0];

    if (!lead) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: "No eligible qualified lead with website and email was found.",
      });
    }

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
- HTML must be email-safe inline HTML only: paragraphs and simple links only.
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

    const draft = parseJsonObject(response.output_text || "{}");

    return NextResponse.json({
      ok: true,
      dryRun: true,
      message: "No email was sent and the sheet was not modified.",
      lead: {
        row: lead.row,
        company: lead.company,
        website: lead.website,
        email: lead.email,
        score: lead.score,
      },
      draft: {
        subject: clean(draft.subject),
        observation: clean(draft.observation),
        text: clean(draft.text),
        html: clean(draft.html),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dry run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
