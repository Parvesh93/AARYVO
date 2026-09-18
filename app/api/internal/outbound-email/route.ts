import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";

export const runtime = "nodejs";

const categories = new Set([
  "OUTREACH",
  "FOLLOW_UP",
  "DEMO_INVITATION",
  "RE_ENGAGEMENT",
  "TEST",
]);

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function authorized(request: Request) {
  const expected = process.env.OUTREACH_AGENT_SECRET?.trim();
  if (!expected) return { ok: false as const, status: 503, error: "Agent email API is not configured." };

  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const provided = header.slice(7).trim();
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = authorized(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = await request.json();
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const html = typeof body?.html === "string" ? body.html : "";
    const text = typeof body?.text === "string" ? body.text : "";
    const category =
      typeof body?.category === "string"
        ? body.category.trim().toUpperCase()
        : "OUTREACH";

    if (!validEmail(to) || !subject || (!html && !text)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Recipient, subject and email content are required.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!categories.has(category)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported email category." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      subject.length > 500 ||
      html.length > 250000 ||
      text.length > 100000
    ) {
      return NextResponse.json(
        { ok: false, error: "Email content is too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await sendTrackedPlatformEmail({
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
      category,
    });

    return NextResponse.json(
      {
        ok: true,
        analyticsId: result.analyticsId,
        messageId: result.messageId || null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send email";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
