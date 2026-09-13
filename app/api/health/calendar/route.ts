import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { testGoogleCalendarConnection } from "@/lib/google-calendar";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Google Calendar error";
  return message
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[private key hidden]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [hidden]")
    .slice(0, 700);
}

export async function GET() {
  try {
    await requireSession();
    const result = await testGoogleCalendarConnection();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    console.error("AARYVO calendar health error", error);
    return NextResponse.json({ ok: false, configured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && process.env.GOOGLE_CALENDAR_ID), error: safeError(error) }, { status: 500 });
  }
}
