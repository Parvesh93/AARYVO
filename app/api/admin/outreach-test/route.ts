import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { readOutreachRows } from "@/lib/platform-google-sheets";
import { buildOutreachEmail } from "@/lib/outreach-email";

export const runtime = "nodejs";
export const maxDuration = 120;


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

    const draft = await buildOutreachEmail(lead);

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
        subject: draft.subject,
        observation: draft.observation,
        text: draft.text,
        html: draft.html,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dry run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
