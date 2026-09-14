import crypto from "node:crypto";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { prisma } from "@/lib/prisma";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/userinfo.email"];

function config() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !appUrl) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/integrations/google/callback` };
}

function stateSecret() {
  return process.env.AUTH_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY || "";
}

export function isGoogleOAuthConfigured() { return Boolean(config() && stateSecret()); }

export function googleAuthorizationUrl(businessId: string, userId: string) {
  const cfg = config();
  if (!cfg || !stateSecret()) throw new Error("Google OAuth is not configured");
  const payload = Buffer.from(JSON.stringify({ businessId, userId, exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const state = `${payload}.${signature}`;
  const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `${AUTH_URL}?${params}`;
}

export function verifyGoogleState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !stateSecret()) return null;
  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { businessId: string; userId: string; exp: number };
  return data.exp > Date.now() ? data : null;
}

export async function exchangeGoogleCode(code: string) {
  const cfg = config(); if (!cfg) throw new Error("Google OAuth is not configured");
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }), cache: "no-store" });
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Google token exchange failed");
  return data;
}

async function refreshAccessToken(businessId: string, encryptedRefreshToken: string) {
  const cfg = config(); if (!cfg) throw new Error("Google OAuth is not configured");
  const refreshToken = decryptToken(encryptedRefreshToken);
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store" });
  const data = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Google token refresh failed");
  await prisma.business.update({ where: { id: businessId }, data: { googleAccessToken: encryptToken(data.access_token), googleTokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000) } });
  return data.access_token;
}

export async function workspaceGoogleAuth(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiresAt: true, googleCalendarId: true } });
  if (!business?.googleAccessToken || !business.googleCalendarId) return null;
  if (business.googleTokenExpiresAt && business.googleTokenExpiresAt.getTime() > Date.now() + 60_000) return { token: decryptToken(business.googleAccessToken), calendarId: business.googleCalendarId };
  if (!business.googleRefreshToken) return null;
  return { token: await refreshAccessToken(businessId, business.googleRefreshToken), calendarId: business.googleCalendarId };
}

export async function getGoogleAccountEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json() as { email?: string }; return data.email || null;
}

export async function getPrimaryCalendar(accessToken: string) {
  const response = await fetch(`${CALENDAR_API}/calendars/primary`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to access the primary Google Calendar");
  return response.json() as Promise<{ id: string; summary?: string; timeZone?: string }>;
}
