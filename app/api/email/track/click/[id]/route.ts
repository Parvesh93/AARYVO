import { NextResponse } from "next/server";
import { markEmailClicked, verifyEmailClick } from "@/lib/email-analytics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const current = new URL(request.url);
  const raw = current.searchParams.get("url");
  const signature = current.searchParams.get("sig");
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com").replace(/\/$/, "");
  let target = base;

  try {
    if (raw) {
      const parsed = new URL(raw);
      const allowedProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
      if (allowedProtocol && verifyEmailClick(id, parsed.toString(), signature)) {
        target = parsed.toString();
        try {
          await markEmailClicked(id, target);
        } catch {}
      }
    }
  } catch {}

  return NextResponse.redirect(target, 302);
}
