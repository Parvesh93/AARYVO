import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function cleanEnv(value?: string) {
  return (value || "").trim().replace(/^['\"]|['\"]$/g, "");
}

function config() {
  const email = cleanEnv(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanEnv(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(/\\n/g, "\n");
  const spreadsheetId = cleanEnv(process.env.OUTREACH_SHEET_ID);
  const sheetName = cleanEnv(process.env.OUTREACH_SHEET_NAME) || "Leads";

  if (!email || !privateKey || !spreadsheetId) return null;
  return { email, privateKey, spreadsheetId, sheetName };
}

async function accessToken() {
  const cfg = config();
  if (!cfg) throw new Error("Outreach Google Sheets integration is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: cfg.email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), cfg.privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Sheets token request failed (${response.status}).`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google Sheets access token missing.");
  return { token: data.access_token, ...cfg };
}

export function isOutreachSheetConfigured() {
  return Boolean(config());
}

export async function readOutreachRows(range = "A1:N1000") {
  const auth = await accessToken();
  const a1 = `${auth.sheetName}!${range}`;
  const url = `${SHEETS_API}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(a1)}?majorDimension=ROWS`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${auth.token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Sheets read failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as { values?: string[][] };
  return {
    values: data.values || [],
    spreadsheetId: auth.spreadsheetId,
    sheetName: auth.sheetName,
  };
}

export async function updateOutreachRange(
  range: string,
  values: Array<Array<string | number | boolean | null>>,
) {
  const auth = await accessToken();
  const a1 = `${auth.sheetName}!${range}`;
  const url = `${SHEETS_API}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(a1)}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range: a1, majorDimension: "ROWS", values }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Sheets update failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return response.json();
}
