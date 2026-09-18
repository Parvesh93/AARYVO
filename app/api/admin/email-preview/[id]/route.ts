import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { emailLogById } from "@/lib/email-analytics";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;
  const row = await emailLogById(id);

  if (!row) {
    return NextResponse.json({ ok: false, error: "Email not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    email: {
      id: row.id,
      recipient: row.recipient,
      subject: row.subject,
      category: row.category,
      source: row.source,
      status: row.status,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      text: row.textBody,
      html: row.htmlBody,
    },
  });
}
