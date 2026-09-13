"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clearSession, createSession } from "@/lib/auth";

export async function signup(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!name || !email || password.length < 8) redirect("/signup?error=invalid");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/login?error=exists");
  const user = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12) } });
  await createSession({ userId: user.id, email: user.email });
  redirect("/onboarding");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) redirect("/login?error=credentials");
  await createSession({ userId: user.id, email: user.email });
  const membership = await prisma.businessMember.findFirst({ where: { userId: user.id } });
  redirect(membership ? "/dashboard" : "/onboarding");
}

export async function logout() {
  await clearSession();
  redirect("/");
}
