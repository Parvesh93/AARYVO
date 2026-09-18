import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { readOutreachRows, updateOutreachRange } from "@/lib/platform-google-sheets";
import { buildOutreachEmail } from "@/lib/outreach-email";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";

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


function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export async function POST() {
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
        notes: clean(row[13]),
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
      return NextResponse.json(
        { ok: false, error: "No eligible qualified lead was found." },
        { status: 404 },
      );
    }

    const draft = await buildOutreachEmail(lead);
    const sent = await sendTrackedPlatformEmail({
      to: lead.email,
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
      category: "OUTREACH",
    });

    const today = isoDate();
    const followUp = isoDate(addDays(new Date(), 3));
    const notes = [
      lead.notes,
      `Tracked Aaryvo outreach sent ${today}.`,
      draft.observation ? `Personalization: ${draft.observation}` : "",
      `Analytics ID: ${sent.analyticsId}`,
    ]
      .filter(Boolean)
      .join(" ");

    await updateOutreachRange(`I${lead.row}:N${lead.row}`, [
      ["Contacted", today, today, followUp, "", notes],
    ]);

    return NextResponse.json({
      ok: true,
      sent: true,
      lead: {
        row: lead.row,
        company: lead.company,
        email: lead.email,
        score: lead.score,
      },
      subject: draft.subject,
      analyticsId: sent.analyticsId,
      messageId: sent.messageId || null,
      nextFollowUp: followUp,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send outreach email";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
