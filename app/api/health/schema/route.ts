import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.user.findFirst({ select: { id: true } });
    return NextResponse.json({ ok: true, schema: "compatible", userTable: "readable" });
  } catch (error) {
    console.error("AARYVO schema health check failed", error);
    return NextResponse.json({ ok: false, schema: "incompatible" }, { status: 500 });
  }
}
