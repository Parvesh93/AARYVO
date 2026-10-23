import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// External Google Calendar integration is not offered yet.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.redirect(new URL("/dashboard/settings?calendar=coming-soon", request.url));
}
