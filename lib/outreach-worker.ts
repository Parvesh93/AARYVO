import OpenAI from "openai";
import { crawlWebsite } from "@/lib/website-ingestion";
import { readOutreachRows, updateOutreachRange } from "@/lib/platform-google-sheets";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com").replace(/\/$/, "");
const OWNER_NAME = process.env.OUTREACH_OWNER_NAME?.trim() || "Parvesh";

type LeadRow = {
  rowNumber: number;
  company: string;
  website: string;
  industry: string;
  location: string;
  rawEmail: string;
  email: string;
  existingChat: string;
  useCase: string;
  fitScore: number;
  status: string;
  firstContact: string;
  lastEmail: string;
  nextFollowUp: string;
  replyCategory: string;
  notes: string;
  followUpCount: number;
  lastAnalyticsId: string;
  lastMessageId: string;
};

type RunOptions = {
  maxNew?: number;
  maxFollowUps?: number;
  dryRun?: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function firstEmail(value: string) {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.find(validEmail) || "";
}

function dateInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function parseSheetDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00+05:30`);
}

function due(value: string) {
  const parsed = parseSheetDate(value);
  if (!parsed) return false;
  const today = parseSheetDate(dateInIndia());
  return Boolean(today && parsed.getTime() <= today.getTime());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1)) as {
    subject?: string;
    opening?: string;
    value?: string;
    cta?: string;
  };
}

function readRows(values: string[][]): LeadRow[] {
  return values.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    company: clean(row[0]),
    website: clean(row[1]),
    industry: clean(row[2]),
    location: clean(row[3]),
    rawEmail: clean(row[4]),
    email: firstEmail(clean(row[4])),
    existingChat: clean(row[5]),
    useCase: clean(row[6]),
    fitScore: Number(row[7]) || 0,
    status: clean(row[8]),
    firstContact: clean(row[9]),
    lastEmail: clean(row[10]),
    nextFollowUp: clean(row[11]),
    replyCategory: clean(row[12]),
    notes: clean(row[13]),
    followUpCount: Math.max(0, Number(row[14]) || 0),
    lastAnalyticsId: clean(row[15]),
    lastMessageId: clean(row[16]),
  }));
}

async function websiteContext(website: string) {
  if (!website) return "";
  try {
    const pages = await crawlWebsite(website);
    return pages
      .slice(0, 4)
      .map((page) => `PAGE: ${page.title}\n${page.content.slice(0, 2500)}`)
      .join("\n\n")
      .slice(0, 8000);
  } catch {
    return "";
  }
}

async function composeInitialEmail(lead: LeadRow) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const context = await websiteContext(lead.website);

  const response = await client.responses.create({
    model: MODEL,
    instructions: `You write concise, premium B2B cold outreach emails for Aaryvo.
Return ONLY valid JSON with keys subject, opening, value, cta.
Rules:
- Always spell the product exactly "Aaryvo".
- Do not invent facts, metrics, customers, integrations or capabilities.
- Use one specific observation from the supplied prospect information or website context when available.
- The email should feel individually written, not like a bulk campaign.
- opening: 1 short sentence.
- value: 1-2 short sentences connecting Aaryvo to the prospect's actual business/use case.
- cta: one low-friction sentence asking whether they would like to see a short demo.
- No emojis, hype, fake urgency or exaggerated claims.
- Do not mention that an AI generated the message.
- subject must be natural and under 65 characters.
- Total visible copy across opening/value/cta should stay under about 110 words.`,
    input: `PROSPECT
Company: ${lead.company}
Website: ${lead.website}
Industry: ${lead.industry}
Location: ${lead.location}
Existing chat/support: ${lead.existingChat}
Suggested Aaryvo use case: ${lead.useCase}

WEBSITE CONTEXT
${context || "No crawlable website context was available. Use only the prospect fields above."}`,
  });

  const parsed = parseJsonObject(response.output_text || "{}");
  const subject = clean(parsed.subject).slice(0, 180);
  const opening = clean(parsed.opening);
  const value = clean(parsed.value);
  const cta = clean(parsed.cta);

  if (!subject || !opening || !value || !cta) {
    throw new Error("Aaryvo outreach copy generation returned incomplete content.");
  }

  return { subject, opening, value, cta };
}

function initialHtml(lead: LeadRow, copy: { opening: string; value: string; cta: string }) {
  const company = escapeHtml(lead.company || "your team");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#151515;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1e8;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ebe7dc;">
          <tr><td style="padding:26px 30px 16px;">
            <img src="${APP_URL}/aaryvo-logo.webp" alt="Aaryvo" width="118" style="display:block;max-width:118px;height:auto;border:0;" />
          </td></tr>
          <tr><td style="padding:6px 30px 30px;">
            <div style="display:inline-block;background:#ffdf67;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:18px;">AI sales & support</div>
            <p style="margin:0 0 15px;font-size:16px;line-height:1.65;">Hi ${company} team,</p>
            <p style="margin:0 0 15px;font-size:16px;line-height:1.65;">${escapeHtml(copy.opening)}</p>
            <p style="margin:0 0 20px;font-size:16px;line-height:1.65;">${escapeHtml(copy.value)}</p>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.65;">${escapeHtml(copy.cta)}</p>
            <a href="${APP_URL}/" style="display:inline-block;background:#151515;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:10px;font-size:14px;font-weight:700;">See Aaryvo</a>
            <p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#555;">${escapeHtml(OWNER_NAME)}<br/>Aaryvo</p>
            <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#8a8a8a;">If this is not relevant, just reply and I will close the loop.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function initialText(lead: LeadRow, copy: { opening: string; value: string; cta: string }) {
  return `Hi ${lead.company || "there"} team,

${copy.opening}

${copy.value}

${copy.cta}

${APP_URL}/

${OWNER_NAME}
Aaryvo

If this is not relevant, just reply and I will close the loop.`;
}

function followUpCopy(lead: LeadRow, number: number) {
  if (number === 1) {
    return {
      subject: `Quick follow-up — Aaryvo for ${lead.company}`,
      text: `Hi ${lead.company || "there"} team,

Just following up on my earlier note. Based on ${lead.useCase || "your website flow"}, I think Aaryvo could help handle more of the first conversation before a visitor needs your team.

Would you like me to send over a short demo?

${OWNER_NAME}
Aaryvo`,
    };
  }

  if (number === 2) {
    return {
      subject: `Aaryvo — worth a quick look?`,
      text: `Hi ${lead.company || "there"} team,

One more quick note from me. Aaryvo is designed to sit on the website and help answer questions, capture qualified enquiries and move interested visitors toward the next step.

If useful, I can show you what that could look like for ${lead.company || "your website"} in a short demo.

${OWNER_NAME}
Aaryvo`,
    };
  }

  return {
    subject: `Closing the loop — Aaryvo`,
    text: `Hi ${lead.company || "there"} team,

I will close the loop after this message. If improving website lead capture or first-line customer support becomes a priority, Aaryvo may be worth a look.

You can see it here: ${APP_URL}/

${OWNER_NAME}
Aaryvo`,
  };
}

function textToHtml(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => `<p style="margin:0 0 15px;font-size:16px;line-height:1.65;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#151515;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1e8;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#fff;border:1px solid #ebe7dc;border-radius:20px;"><tr><td style="padding:28px 30px;">
<img src="${APP_URL}/aaryvo-logo.webp" alt="Aaryvo" width="118" style="display:block;max-width:118px;height:auto;border:0;margin-bottom:22px;" />
${paragraphs}
<a href="${APP_URL}/" style="display:inline-block;background:#151515;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-size:14px;font-weight:700;">See Aaryvo</a>
<p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:#8a8a8a;">If this is not relevant, just reply and I will close the loop.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function noteWith(existing: string, addition: string) {
  const joined = [existing, addition].filter(Boolean).join(" | ");
  return joined.slice(-3500);
}

async function updateLeadRow(
  lead: LeadRow,
  patch: Partial<Pick<LeadRow, "status" | "firstContact" | "lastEmail" | "nextFollowUp" | "replyCategory" | "notes" | "followUpCount" | "lastAnalyticsId" | "lastMessageId">>,
) {
  const values = [
    patch.status ?? lead.status,
    patch.firstContact ?? lead.firstContact,
    patch.lastEmail ?? lead.lastEmail,
    patch.nextFollowUp ?? lead.nextFollowUp,
    patch.replyCategory ?? lead.replyCategory,
    patch.notes ?? lead.notes,
    patch.followUpCount ?? lead.followUpCount,
    patch.lastAnalyticsId ?? lead.lastAnalyticsId,
    patch.lastMessageId ?? lead.lastMessageId,
  ];

  await updateOutreachRange(`I${lead.rowNumber}:Q${lead.rowNumber}`, [values]);
}

export async function runOutreachWorker(options: RunOptions = {}) {
  const maxNew = Math.max(0, Math.min(15, Math.floor(options.maxNew ?? 15)));
  const maxFollowUps = Math.max(0, Math.min(15, Math.floor(options.maxFollowUps ?? 10)));
  const dryRun = Boolean(options.dryRun);
  const sheet = await readOutreachRows("A1:Q1000");

  if (!sheet.values.length) throw new Error("Aaryvo Lead Pipeline is empty.");

  const headers = sheet.values[0] || [];
  if (headers[14] !== "Follow-up Count" || headers[15] !== "Last Analytics ID" || headers[16] !== "Last Message ID") {
    await updateOutreachRange("O1:Q1", [["Follow-up Count", "Last Analytics ID", "Last Message ID"]]);
  }

  const rows = readRows(sheet.values);
  const newLeads = rows
    .filter((lead) => lead.status === "Qualified - not contacted" && lead.email && lead.website)
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, maxNew);

  const followUps = rows
    .filter(
      (lead) =>
        lead.status === "Contacted" &&
        !lead.replyCategory &&
        lead.email &&
        lead.followUpCount < 3 &&
        due(lead.nextFollowUp),
    )
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, maxFollowUps);

  const summary = {
    dryRun,
    selectedNew: newLeads.length,
    selectedFollowUps: followUps.length,
    sentNew: 0,
    sentFollowUps: 0,
    failed: [] as Array<{ company: string; email: string; stage: string; error: string }>,
    sent: [] as Array<{ company: string; email: string; category: string; analyticsId: string }>,
  };

  if (dryRun) {
    return {
      ...summary,
      newLeads: newLeads.map((lead) => ({ company: lead.company, email: lead.email, fitScore: lead.fitScore })),
      followUps: followUps.map((lead) => ({ company: lead.company, email: lead.email, followUpCount: lead.followUpCount })),
    };
  }

  for (const lead of newLeads) {
    try {
      const copy = await composeInitialEmail(lead);
      const result = await sendTrackedPlatformEmail({
        to: lead.email,
        subject: copy.subject,
        text: initialText(lead, copy),
        html: initialHtml(lead, copy),
        category: "OUTREACH",
      });

      const today = dateInIndia();
      const next = dateInIndia(addDays(new Date(), 3));
      await updateLeadRow(lead, {
        status: "Contacted",
        firstContact: today,
        lastEmail: today,
        nextFollowUp: next,
        followUpCount: 0,
        lastAnalyticsId: result.analyticsId,
        lastMessageId: result.messageId || "",
        notes: noteWith(lead.notes, `Tracked initial outreach sent ${today}.`),
      });

      summary.sentNew += 1;
      summary.sent.push({
        company: lead.company,
        email: lead.email,
        category: "OUTREACH",
        analyticsId: result.analyticsId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed.push({ company: lead.company, email: lead.email, stage: "OUTREACH", error: message });
      try {
        await updateLeadRow(lead, {
          status: "Send failed",
          notes: noteWith(lead.notes, `Outreach send failed ${dateInIndia()}: ${message.slice(0, 500)}`),
        });
      } catch {}
    }
  }

  for (const lead of followUps) {
    const followUpNumber = lead.followUpCount + 1;
    try {
      const copy = followUpCopy(lead, followUpNumber);
      const result = await sendTrackedPlatformEmail({
        to: lead.email,
        subject: copy.subject,
        text: copy.text,
        html: textToHtml(copy.text),
        category: "FOLLOW_UP",
      });

      const today = dateInIndia();
      const nextFollowUp =
        followUpNumber === 1
          ? dateInIndia(addDays(new Date(), 4))
          : followUpNumber === 2
            ? dateInIndia(addDays(new Date(), 7))
            : "";

      await updateLeadRow(lead, {
        status: followUpNumber >= 3 ? "Follow-up sequence complete" : "Contacted",
        lastEmail: today,
        nextFollowUp,
        followUpCount: followUpNumber,
        lastAnalyticsId: result.analyticsId,
        lastMessageId: result.messageId || "",
        notes: noteWith(lead.notes, `Tracked follow-up #${followUpNumber} sent ${today}.`),
      });

      summary.sentFollowUps += 1;
      summary.sent.push({
        company: lead.company,
        email: lead.email,
        category: "FOLLOW_UP",
        analyticsId: result.analyticsId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed.push({ company: lead.company, email: lead.email, stage: `FOLLOW_UP_${followUpNumber}`, error: message });
      try {
        await updateLeadRow(lead, {
          notes: noteWith(lead.notes, `Follow-up #${followUpNumber} failed ${dateInIndia()}: ${message.slice(0, 500)}`),
        });
      } catch {}
    }
  }

  return summary;
}
