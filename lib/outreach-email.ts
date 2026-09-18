import OpenAI from "openai";
import { crawlWebsite } from "@/lib/website-ingestion";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

export type OutreachLead = {
  company: string;
  website: string;
  industry: string;
  location: string;
  existingChat: string;
  useCase: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    observation?: string;
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildOutreachEmail(lead: OutreachLead) {
  const pages = await crawlWebsite(lead.website);
  const websiteContext = pages
    .slice(0, 4)
    .map((p) => `PAGE: ${p.title}\nURL: ${p.url}\n${p.content.slice(0, 7000)}`)
    .join("\n\n---\n\n")
    .slice(0, 22000);

  const response = await client.responses.create({
    model: MODEL,
    instructions: `You write concise founder-to-business cold outreach for Aaryvo, an AI website sales/support agent.

Return ONLY valid JSON with keys: subject, opening, value, observation.

Rules:
- Always spell the product Aaryvo.
- Use ONLY facts explicitly present in WEBSITE CONTEXT or LEAD DATA. Never invent details.
- opening: one sentence beginning naturally from a specific website observation.
- value: one or two sentences explaining how Aaryvo could help this business, tied to the supplied use case.
- observation: a short factual phrase summarizing the website observation used.
- Keep opening + value together under about 90 words.
- Tone: premium, professional, human, founder-to-business, not hypey.
- Avoid generic compliments such as "great website", "impressive business", or "love what you're doing".
- Do not claim guaranteed results, savings, conversion lifts, customer counts, or outcomes.
- Do not mention scraping, automation, lead scoring, or that AI wrote the email.
- Do not include a greeting, CTA, sign-off, links, or opt-out line. The application adds those consistently.`,
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
  const opening = clean(parsed.opening);
  const value = clean(parsed.value);
  const observation = clean(parsed.observation).slice(0, 500);

  if (!subject || !opening || !value) {
    throw new Error("AI did not return a usable outreach email.");
  }

  const company = escapeHtml(lead.company);
  const safeOpening = escapeHtml(opening);
  const safeValue = escapeHtml(value);

  const text = [
    `Hi ${lead.company} team,`,
    "",
    opening,
    "",
    value,
    "",
    "If you'd like, I can show you a quick demo tailored to your website:",
    "https://aaryvo.ppdesigntech.com/",
    "",
    "Best,",
    "Parvesh",
    "Aaryvo",
    "",
    "If this isn't relevant, just reply no thanks and I won't follow up.",
  ].join("\n");

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f5f5f5;width:100%;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e8e8e8;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:30px 34px 12px 34px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:23px;line-height:1.2;font-weight:700;letter-spacing:-0.4px;color:#111111;">Aaryvo</div>
            <div style="margin-top:5px;font-size:12px;line-height:1.5;color:#777777;">AI sales & support for your website</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 34px 32px 34px;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 18px 0;">Hi ${company} team,</p>
            <p style="margin:0 0 16px 0;">${safeOpening}</p>
            <p style="margin:0 0 24px 0;">${safeValue}</p>
            <p style="margin:0 0 24px 0;">If you'd like, I can show you a quick demo tailored to your website.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px 0;">
              <tr>
                <td style="background:#111111;border-radius:9px;">
                  <a href="https://aaryvo.ppdesigntech.com/" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">See Aaryvo</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px 0;">Best,</p>
            <p style="margin:0;font-weight:700;">Parvesh</p>
            <p style="margin:0;color:#666666;">Aaryvo</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 34px 24px 34px;border-top:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a8a8a;">
            If this isn't relevant, just reply no thanks and I won't follow up.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  return { subject, opening, value, observation, text, html };
}


export async function buildFollowUpEmail(
  lead: OutreachLead,
  followUpNumber: 1 | 2 | 3,
) {
  const response = await client.responses.create({
    model: MODEL,
    instructions: `You write concise follow-up cold emails for Aaryvo, an AI website sales/support agent.

Return ONLY valid JSON with keys: subject, body.

Rules:
- Always spell the product Aaryvo.
- This is follow-up #${followUpNumber} after an earlier outreach email.
- Use ONLY the LEAD DATA supplied. Never invent website facts, results, urgency, prior engagement, or interest.
- Keep the body between 35 and 75 words.
- Tone: polite, premium, low-pressure and human.
- Do not say "just bumping this", "circling back", or "following up again".
- Refer briefly to the earlier idea and make the value clearer for this business.
- Do not claim guaranteed results, savings, conversion lifts, or outcomes.
- Do not include a greeting, CTA link, sign-off, or opt-out line. The application adds those consistently.
- For follow-up #3, make it a graceful final note and say you will leave it there if timing is not right.`,
    input: `LEAD DATA
Company: ${lead.company}
Industry: ${lead.industry}
Location: ${lead.location}
Aaryvo use case: ${lead.useCase}
Existing chat/support: ${lead.existingChat}`,
  });

  const cleaned = (response.output_text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI did not return a usable follow-up email.");
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    subject?: string;
    body?: string;
  };
  const subject = clean(parsed.subject).slice(0, 180);
  const body = clean(parsed.body);

  if (!subject || !body) {
    throw new Error("AI did not return a usable follow-up email.");
  }

  const company = escapeHtml(lead.company);
  const safeBody = escapeHtml(body);
  const finalLine =
    followUpNumber === 3
      ? "If the timing isn't right, no problem - I'll leave it here."
      : "If useful, I can show you a quick demo tailored to your website.";

  const text = [
    `Hi ${lead.company} team,`,
    "",
    body,
    "",
    finalLine,
    "https://aaryvo.ppdesigntech.com/",
    "",
    "Best,",
    "Parvesh",
    "Aaryvo",
    "",
    "If this isn't relevant, just reply no thanks and I won't follow up.",
  ].join("\n");

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f5f5f5;width:100%;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e8e8e8;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:30px 34px 12px 34px;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:23px;line-height:1.2;font-weight:700;letter-spacing:-0.4px;color:#111111;">Aaryvo</div>
            <div style="margin-top:5px;font-size:12px;line-height:1.5;color:#777777;">AI sales & support for your website</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 34px 32px 34px;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 18px 0;">Hi ${company} team,</p>
            <p style="margin:0 0 20px 0;">${safeBody}</p>
            <p style="margin:0 0 24px 0;">${escapeHtml(finalLine)}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px 0;">
              <tr>
                <td style="background:#111111;border-radius:9px;">
                  <a href="https://aaryvo.ppdesigntech.com/" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">See Aaryvo</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px 0;">Best,</p>
            <p style="margin:0;font-weight:700;">Parvesh</p>
            <p style="margin:0;color:#666666;">Aaryvo</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 34px 24px 34px;border-top:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a8a8a;">
            If this isn't relevant, just reply no thanks and I won't follow up.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  return { subject, body, text, html };
}
