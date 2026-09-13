import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { testGoogleCalendarConnection } from "@/lib/google-calendar";

export async function GET() {
  try {
    await requireSession();
    const result = await testGoogleCalendarConnection();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    console.error("AARYVO calendar health error", error);
    return NextResponse.json({ ok: false, error: "Unable to test Google Calendar connection." }, { status: 500 });
  }
}
