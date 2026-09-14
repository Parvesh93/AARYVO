import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";

function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.trim().toLowerCase());
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!isAdminEmail(session.email)) redirect("/dashboard");
  return session;
}
