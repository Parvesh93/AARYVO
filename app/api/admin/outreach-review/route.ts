import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  generateOutreachPreviewBatch,
  listDraftOutreachPreviews,
  sendApprovedOutreachPreviews,
  skipOutreachPreviews,
} from "@/lib/outreach-review";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  await requireAdmin();
  const previews = await listDraftOutreachPreviews();
  return NextResponse.json({ ok: true, previews });
}

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "generate";

  if (action === "generate") {
    const result = await generateOutreachPreviewBatch({
      limit: Number(body?.limit || process.env.OUTREACH_DAILY_LIMIT || 5),
      replace: body?.replace === true,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "send") {
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const results = await sendApprovedOutreachPreviews(ids);
    return NextResponse.json({ ok: true, results });
  }

  if (action === "skip") {
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const skipped = await skipOutreachPreviews(ids);
    return NextResponse.json({ ok: true, skipped });
  }

  return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
}
