import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readOutreachRows, updateOutreachRange } from "@/lib/platform-google-sheets";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";
import { buildFollowUpEmail, buildOutreachEmail } from "@/lib/outreach-email";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  firstContact: string;
  lastEmail: string;
  nextFollowUp: string;
  replyCategory: string;
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
  return (
    value
      .split(/[\s,;/]+/)
      .map((v) => v.trim())
      .find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || ""
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function followUpCount(notes: string) {
  let highest = 0;
  for (const match of notes.matchAll(/Follow-up #(\d) sent/gi)) {
    highest = Math.max(highest, Number(match[1] || 0));
  }
  return Math.min(3, highest);
}

function hasReply(lead: Lead) {
  if (lead.replyCategory.trim()) return true;
  return /(interested|replied|demo requested|pricing requested|not interested|unsubscribe|declined|later)/i.test(
    lead.status,
  );
}

function nextFollowUpDate(lead: Lead, numberJustSent: 1 | 2 | 3) {
  if (numberJustSent === 3) return "";
  const first =
    dateFromIso(lead.firstContact) ||
    dateFromIso(lead.lastEmail) ||
    new Date();
  const offset = numberJustSent === 1 ? 7 : 14;
  return isoDate(addDays(first, offset));
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
    const configuredLimit = Number(process.env.OUTREACH_DAILY_LIMIT || 5);
    const requestedLimit = Number(body?.limit ?? configuredLimit);
    const limit = Math.max(
      1,
      Math.min(15, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 5),
    );
    const dryRun = body?.dryRun === true;

    const { values } = await readOutreachRows("A1:N1000");
    if (!values.length) {
      return NextResponse.json({
        ok: true,
        dryRun,
        limit,
        selected: 0,
        sent: 0,
        failed: 0,
        results: [],
      });
    }

    const allLeads: Lead[] = values.slice(1).map((row, index) => ({
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
      firstContact: clean(row[9]),
      lastEmail: clean(row[10]),
      nextFollowUp: clean(row[11]),
      replyCategory: clean(row[12]),
      notes: clean(row[13]),
    }));

    const now = new Date();
    const today = isoDate(now);
    const results: Array<Record<string, unknown>> = [];
    let remaining = limit;

    const dueFollowUps = allLeads
      .filter((lead) => {
        if (!lead.company || !lead.email || hasReply(lead)) return false;
        if (lead.status.toLowerCase() !== "contacted") return false;
        if (followUpCount(lead.notes) >= 3 || !lead.nextFollowUp) return false;
        return lead.nextFollowUp <= today;
      })
      .sort((a, b) => {
        const byDate = a.nextFollowUp.localeCompare(b.nextFollowUp);
        return byDate !== 0 ? byDate : b.score - a.score;
      });

    for (const lead of dueFollowUps) {
      if (remaining <= 0) break;
      const nextNumber = (followUpCount(lead.notes) + 1) as 1 | 2 | 3;

      try {
        const draft = await buildFollowUpEmail(lead, nextNumber);

        if (dryRun) {
          results.push({
            row: lead.row,
            company: lead.company,
            email: lead.email,
            type: `follow-up-${nextNumber}`,
            status: "dry-run",
            subject: draft.subject,
          });
        } else {
          const sent = await sendTrackedPlatformEmail({
            to: lead.email,
            subject: draft.subject,
            html: draft.html,
            text: draft.text,
            category: "FOLLOW_UP",
          });

          const nextDate = nextFollowUpDate(lead, nextNumber);
          const nextStatus =
            nextNumber === 3 ? "Follow-up complete - no reply" : "Contacted";
          const notes = [
            lead.notes,
            `Follow-up #${nextNumber} sent ${today}.`,
            `Analytics ID: ${sent.analyticsId}`,
          ]
            .filter(Boolean)
            .join(" ");

          await updateOutreachRange(`I${lead.row}:N${lead.row}`, [
            [nextStatus, lead.firstContact, today, nextDate, lead.replyCategory, notes],
          ]);

          results.push({
            row: lead.row,
            company: lead.company,
            email: lead.email,
            type: `follow-up-${nextNumber}`,
            status: "sent",
            analyticsId: sent.analyticsId,
            subject: draft.subject,
            nextFollowUp: nextDate || null,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!dryRun) {
          const failureNote = [
            lead.notes,
            `Follow-up #${nextNumber} attempt ${today} failed: ${message.slice(0, 600)}`,
          ]
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
          type: `follow-up-${nextNumber}`,
          status: "failed",
          error: message,
        });
      }

      remaining -= 1;
    }

    const newLeads = allLeads
      .filter(
        (lead) =>
          lead.status.toLowerCase() === "qualified - not contacted" &&
          lead.company &&
          lead.website &&
          lead.email,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, remaining);

    for (const lead of newLeads) {
      try {
        const draft = await buildOutreachEmail(lead);

        if (dryRun) {
          results.push({
            row: lead.row,
            company: lead.company,
            email: lead.email,
            type: "outreach",
            status: "dry-run",
            subject: draft.subject,
            observation: draft.observation,
          });
        } else {
          const sent = await sendTrackedPlatformEmail({
            to: lead.email,
            subject: draft.subject,
            html: draft.html,
            text: draft.text,
            category: "OUTREACH",
          });

          const followUp = isoDate(addDays(now, 3));
          const noteParts = [
            lead.notes,
            `Tracked Aaryvo outreach sent ${today}.`,
            draft.observation ? `Personalization: ${draft.observation}` : "",
            `Analytics ID: ${sent.analyticsId}`,
          ].filter(Boolean);

          await updateOutreachRange(`I${lead.row}:N${lead.row}`, [
            ["Contacted", today, today, followUp, "", noteParts.join(" ")],
          ]);

          results.push({
            row: lead.row,
            company: lead.company,
            email: lead.email,
            type: "outreach",
            status: "sent",
            analyticsId: sent.analyticsId,
            subject: draft.subject,
            nextFollowUp: followUp,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!dryRun) {
          const failureNote = [
            lead.notes,
            `Outreach attempt ${today} failed: ${message.slice(0, 600)}`,
          ]
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
          type: "outreach",
          status: "failed",
          error: message,
        });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const followUps = results.filter((r) =>
      String(r.type || "").startsWith("follow-up"),
    ).length;
    const outreach = results.filter((r) => r.type === "outreach").length;

    return NextResponse.json({
      ok: true,
      dryRun,
      limit,
      selected: results.length,
      sent,
      failed,
      followUps,
      outreach,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outreach run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
