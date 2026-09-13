import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error("AARYVO database health check failed", error);
    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        error: message
          .replace(/mysql:\/\/[^\s]+/gi, "[DATABASE_URL REDACTED]")
          .replace(/password[^,}\n]*/gi, "password=[REDACTED]"),
      },
      { status: 500 },
    );
  }
}
