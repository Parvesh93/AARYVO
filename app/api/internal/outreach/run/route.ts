import { NextResponse } from "next/server";
import {
  generateOutreachPreviewBatch,
  isOutreachAgentAuthorized,
} from "@/lib/outreach-review";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isOutreachAgentAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const configuredLimit = Number(process.env.OUTREACH_DAILY_LIMIT || 5);
    const requestedLimit = Number(body?.limit ?? configuredLimit);
    const limit = Math.max(
      1,
      Math.min(15, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 5),
    );

    const result = await generateOutreachPreviewBatch({
      limit,
      replace: body?.replace === true,
    });

    return NextResponse.json({
      ok: true,
      reviewRequired: true,
      limit,
      reused: result.reused,
      generated: result.previews.length,
      previews: result.previews.map((p) => ({
        id: p.id,
        company: p.company,
        recipient: p.recipient,
        emailType: p.emailType,
        followUpNumber: p.followUpNumber,
        subject: p.subject,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to prepare outreach review batch";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
