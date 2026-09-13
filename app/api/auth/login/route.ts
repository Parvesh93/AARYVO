import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    await createSession({ userId: user.id, email: user.email });
    const membership = await prisma.businessMember.findFirst({ where: { userId: user.id } });

    return NextResponse.json({ ok: true, redirectTo: membership ? "/dashboard" : "/onboarding" });
  } catch (error) {
    console.error("AARYVO login error", error);
    return NextResponse.json({ error: "Unable to sign in. Please try again." }, { status: 500 });
  }
}
