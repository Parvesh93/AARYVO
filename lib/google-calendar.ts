import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar";

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!email || !privateKey || !calendarId) return null;
  return { email, privateKey, calendarId };
}

async function accessToken() {
  const creds = credentials();
  if (!creds) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: creds.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), creds.privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed (${response.status}): ${text.slice(0, 400)}`);
  }
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google access token missing");
  return { token: data.access_token, calendarId: creds.calendarId };
}

export function isGoogleCalendarConfigured() { return Boolean(credentials()); }
export type BusyInterval = { start: Date; end: Date };

export async function getGoogleBusyIntervals(timeMin: Date, timeMax: Date): Promise<BusyInterval[]> {
  const auth = await accessToken();
  if (!auth) return [];
  const response = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: auth.calendarId }] }),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google free/busy request failed (${response.status}): ${text.slice(0, 400)}`);
  }
  const data = await response.json() as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> };
  const busy = data.calendars?.[auth.calendarId]?.busy || [];
  return busy.map((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
}

export async function createGoogleCalendarEvent(params: {
  businessName: string;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  requirement: string | null;
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
}) {
  const auth = await accessToken();
  if (!auth) return null;
  const end = new Date(params.startsAt.getTime() + params.durationMinutes * 60 * 1000);
  const description = [
    `AARYVO consultation for ${params.businessName}`,
    params.leadName ? `Lead: ${params.leadName}` : null,
    params.leadEmail ? `Email: ${params.leadEmail}` : null,
    params.leadPhone ? `Phone: ${params.leadPhone}` : null,
    params.requirement ? `Requirement: ${params.requirement}` : null,
  ].filter(Boolean).join("\n");

  const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(auth.calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `AARYVO Consultation${params.leadName ? ` - ${params.leadName}` : ""}`,
      description,
      start: { dateTime: params.startsAt.toISOString(), timeZone: params.timeZone },
      end: { dateTime: end.toISOString(), timeZone: params.timeZone },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google event creation failed (${response.status}): ${text.slice(0, 400)}`);
  }
  return response.json();
}

export async function testGoogleCalendarConnection() {
  const auth = await accessToken();
  if (!auth) return { ok: false, configured: false, error: "Google Calendar environment variables are incomplete." };
  const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(auth.calendarId)}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, configured: true, error: `Calendar access failed (${response.status}): ${text.slice(0, 400)}` };
  }
  const data = await response.json() as { summary?: string; id?: string; timeZone?: string };
  return { ok: true, configured: true, calendar: data.summary || data.id || auth.calendarId, timeZone: data.timeZone || null };
}
