import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function safeError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof value.code === "string" ? value.code : undefined;
    const name = typeof value.name === "string" ? value.name : "Error";
    const message = typeof value.message === "string" ? value.message : "Unknown database error";
    return { name, code, message: message.slice(0, 700) };
  }
  return { name: "Error", message: String(error).slice(0, 700) };
}

export async function GET() {
  try {
    const user = await prisma.user.findFirst({
      select: { id: true, name: true, email: true, passwordHash: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      schema: "compatible",
      userTable: "readable",
      hasRows: Boolean(user),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      schema: "incompatible",
      error: safeError(error),
    }, { status: 500 });
  }
}
