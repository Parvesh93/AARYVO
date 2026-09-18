import { randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readOutreachRows, updateOutreachRange } from "@/lib/platform-google-sheets";
import { buildFollowUpEmail, buildOutreachEmail } from "@/lib/outreach-email";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";

export type OutreachPreview = {
  id: string;
  sheetRow: number;
  company: string;
  website: string;
  recipient: string;
  emailType: "OUTREACH" | "FOLLOW_UP";
  followUpNumber: number | null;
  subject: string;
  htmlBody: string;
  textBody: string | null;
  observation: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

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

let ready: Promise<void> | null = null;

export function ensureOutreachPreviewTable() {
  if (!ready) {
    ready = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS platform_outreach_preview (
        id VARCHAR(191) PRIMARY KEY,
        sheetRow INT NOT NULL,
        company VARCHAR(320) NOT NULL,
        website VARCHAR(1000) NULL,
        recipient VARCHAR(320) NOT NULL,
        emailType VARCHAR(50) NOT NULL,
        followUpNumber INT NULL,
        subject VARCHAR(500) NOT NULL,
        htmlBody LONGTEXT NOT NULL,
        textBody LONGTEXT NULL,
        observation TEXT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
        errorMessage TEXT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        sentAt DATETIME(3) NULL,
        INDEX idx_outreach_preview_status_created(status, createdAt),
        INDEX idx_outreach_preview_row(sheetRow)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined);
  }
  return ready;
}

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

function parseRows(values: string[][]): Lead[] {
  return values.slice(1).map((row, index) => ({
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
}

export async function listDraftOutreachPreviews() {
  await ensureOutreachPreviewTable();
  return prisma.$queryRawUnsafe<OutreachPreview[]>(`
    SELECT id,sheetRow,company,website,recipient,emailType,followUpNumber,subject,
           htmlBody,textBody,observation,status,errorMessage,createdAt,sentAt
    FROM platform_outreach_preview
    WHERE status='DRAFT'
    ORDER BY createdAt ASC
  `);
}

export async function generateOutreachPreviewBatch(input?: {
  limit?: number;
  replace?: boolean;
}) {
  await ensureOutreachPreviewTable();

  const limit = Math.max(
    1,
    Math.min(
      15,
      Number.isFinite(Number(input?.limit))
        ? Math.floor(Number(input?.limit))
        : Number(process.env.OUTREACH_DAILY_LIMIT || 5),
    ),
  );

  const existing = await listDraftOutreachPreviews();
  if (existing.length && !input?.replace) {
    return { reused: true, previews: existing.slice(0, limit) };
  }

  if (input?.replace && existing.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE platform_outreach_preview SET status='SUPERSEDED' WHERE status='DRAFT'`,
    );
  }

  const { values } = await readOutreachRows("A1:N1000");
  const allLeads = parseRows(values);
  const today = isoDate();
  const selected: Array<{
    lead: Lead;
    emailType: "OUTREACH" | "FOLLOW_UP";
    followUpNumber: 1 | 2 | 3 | null;
  }> = [];

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
    if (selected.length >= limit) break;
    selected.push({
      lead,
      emailType: "FOLLOW_UP",
      followUpNumber: (followUpCount(lead.notes) + 1) as 1 | 2 | 3,
    });
  }

  if (selected.length < limit) {
    const newLeads = allLeads
      .filter(
        (lead) =>
          lead.status.toLowerCase() === "qualified - not contacted" &&
          lead.company &&
          lead.website &&
          lead.email,
      )
      .sort((a, b) => b.score - a.score);

    for (const lead of newLeads) {
      if (selected.length >= limit) break;
      selected.push({ lead, emailType: "OUTREACH", followUpNumber: null });
    }
  }

  const previews: OutreachPreview[] = [];

  for (const item of selected) {
    const draft =
      item.emailType === "FOLLOW_UP"
        ? await buildFollowUpEmail(
            item.lead,
            item.followUpNumber as 1 | 2 | 3,
          )
        : await buildOutreachEmail(item.lead);

    const id = randomUUID();
    const observation =
      item.emailType === "OUTREACH" && "observation" in draft
        ? draft.observation || null
        : null;

    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_outreach_preview
        (id,sheetRow,company,website,recipient,emailType,followUpNumber,subject,htmlBody,textBody,observation,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'DRAFT')`,
      id,
      item.lead.row,
      item.lead.company.slice(0, 320),
      item.lead.website.slice(0, 1000) || null,
      item.lead.email.slice(0, 320),
      item.emailType,
      item.followUpNumber,
      draft.subject.slice(0, 500),
      draft.html,
      draft.text || null,
      observation,
    );

    previews.push({
      id,
      sheetRow: item.lead.row,
      company: item.lead.company,
      website: item.lead.website,
      recipient: item.lead.email,
      emailType: item.emailType,
      followUpNumber: item.followUpNumber,
      subject: draft.subject,
      htmlBody: draft.html,
      textBody: draft.text || null,
      observation,
      status: "DRAFT",
      errorMessage: null,
      createdAt: new Date(),
      sentAt: null,
    });
  }

  return { reused: false, previews };
}

function currentLeadByRow(values: string[][], rowNumber: number) {
  const row = values[rowNumber - 1];
  if (!row) return null;
  return parseRows([values[0], row])[0] || null;
}

export async function sendApprovedOutreachPreviews(ids: string[]) {
  await ensureOutreachPreviewTable();
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 15);
  if (!uniqueIds.length) return [];

  const placeholders = uniqueIds.map(() => "?").join(",");
  const drafts = await prisma.$queryRawUnsafe<OutreachPreview[]>(
    `SELECT id,sheetRow,company,website,recipient,emailType,followUpNumber,subject,
            htmlBody,textBody,observation,status,errorMessage,createdAt,sentAt
     FROM platform_outreach_preview
     WHERE status='DRAFT' AND id IN (${placeholders})
     ORDER BY createdAt ASC`,
    ...uniqueIds,
  );

  const { values } = await readOutreachRows("A1:N1000");
  const today = isoDate();
  const results: Array<Record<string, unknown>> = [];

  for (const draft of drafts) {
    const lead = currentLeadByRow(values, draft.sheetRow);
    if (!lead || lead.email.toLowerCase() !== draft.recipient.toLowerCase()) {
      const error = "Lead row changed since preview generation.";
      await prisma.$executeRawUnsafe(
        `UPDATE platform_outreach_preview SET status='STALE',errorMessage=? WHERE id=?`,
        error,
        draft.id,
      );
      results.push({ id: draft.id, company: draft.company, status: "stale", error });
      continue;
    }

    let eligible = false;
    if (draft.emailType === "OUTREACH") {
      eligible = lead.status.toLowerCase() === "qualified - not contacted";
    } else {
      const nextNumber = followUpCount(lead.notes) + 1;
      eligible =
        lead.status.toLowerCase() === "contacted" &&
        !hasReply(lead) &&
        Boolean(lead.nextFollowUp) &&
        lead.nextFollowUp <= today &&
        nextNumber === draft.followUpNumber;
    }

    if (!eligible) {
      const error = "Lead is no longer eligible for this email.";
      await prisma.$executeRawUnsafe(
        `UPDATE platform_outreach_preview SET status='STALE',errorMessage=? WHERE id=?`,
        error,
        draft.id,
      );
      results.push({ id: draft.id, company: draft.company, status: "stale", error });
      continue;
    }

    try {
      const sent = await sendTrackedPlatformEmail({
        to: draft.recipient,
        subject: draft.subject,
        html: draft.htmlBody,
        text: draft.textBody || undefined,
        category: draft.emailType === "FOLLOW_UP" ? "FOLLOW_UP" : "OUTREACH",
      });

      if (draft.emailType === "FOLLOW_UP") {
        const nextNumber = draft.followUpNumber as 1 | 2 | 3;
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
      } else {
        const nextFollowUp = isoDate(addDays(new Date(), 3));
        const notes = [
          lead.notes,
          `Tracked Aaryvo outreach sent ${today}.`,
          draft.observation ? `Personalization: ${draft.observation}` : "",
          `Analytics ID: ${sent.analyticsId}`,
        ]
          .filter(Boolean)
          .join(" ");

        await updateOutreachRange(`I${lead.row}:N${lead.row}`, [
          ["Contacted", today, today, nextFollowUp, "", notes],
        ]);
      }

      await prisma.$executeRawUnsafe(
        `UPDATE platform_outreach_preview SET status='SENT',sentAt=NOW(3),errorMessage=NULL WHERE id=?`,
        draft.id,
      );

      results.push({
        id: draft.id,
        company: draft.company,
        status: "sent",
        analyticsId: sent.analyticsId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.$executeRawUnsafe(
        `UPDATE platform_outreach_preview SET status='FAILED',errorMessage=? WHERE id=?`,
        message.slice(0, 4000),
        draft.id,
      );
      results.push({
        id: draft.id,
        company: draft.company,
        status: "failed",
        error: message,
      });
    }
  }

  return results;
}

export async function skipOutreachPreviews(ids: string[]) {
  await ensureOutreachPreviewTable();
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 15);
  if (!uniqueIds.length) return 0;
  const placeholders = uniqueIds.map(() => "?").join(",");
  const result = await prisma.$executeRawUnsafe(
    `UPDATE platform_outreach_preview SET status='SKIPPED' WHERE status='DRAFT' AND id IN (${placeholders})`,
    ...uniqueIds,
  );
  return result;
}

export function isOutreachAgentAuthorized(request: Request) {
  const expected = process.env.OUTREACH_AGENT_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7).trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
