import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listVisibleGoogleCalendars } from "@/lib/google-calendar";

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
    const result = await listVisibleGoogleCalendars();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("AARYVO calendar list health error", error);
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 500 });
  }
}
