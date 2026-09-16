import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";
import { workspaceMailConfig } from "@/lib/email-delivery";
import { featureError, hasFeature } from "@/lib/plan-entitlements";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function membership() {
  const session = await getSession();
  if (!session) return null;
  return prisma.businessMember.findFirst({ where: { userId: session.userId }, include: { business: true } });
}

export async function PUT(request: Request) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const enabled = body.customSmtpEnabled === true;
    if (enabled && !hasFeature(member.business.plan, "customSmtp")) return NextResponse.json({ error: featureError("customSmtp"), code: "PLAN_REQUIRED", requiredPlan: "GROWTH" }, { status: 403 });
    const host = String(body.smtpHost || "").trim(), port = Number(body.smtpPort || 587), user = String(body.smtpUser || "").trim(), password = String(body.smtpPassword || ""), fromName = String(body.smtpFromName || "").trim(), fromEmail = String(body.smtpFromEmail || "").trim().toLowerCase();
    if (enabled) {
      if (!host) return NextResponse.json({ error: "SMTP host is required." }, { status: 400 });
      if (!Number.isInteger(port) || port < 1 || port > 65535) return NextResponse.json({ error: "Enter a valid SMTP port." }, { status: 400 });
      if (!user) return NextResponse.json({ error: "SMTP username is required." }, { status: 400 });
      if (!fromEmail || !emailPattern.test(fromEmail)) return NextResponse.json({ error: "Enter a valid From email." }, { status: 400 });
      if (!password && !member.business.smtpPasswordEncrypted) return NextResponse.json({ error: "SMTP password is required." }, { status: 400 });
    }
    await prisma.business.update({ where: { id: member.businessId }, data: { customSmtpEnabled: enabled, smtpHost: host || null, smtpPort: Number.isInteger(port) ? port : null, smtpSecure: body.smtpSecure === true, smtpUser: user || null, smtpPasswordEncrypted: password ? encryptToken(password) : member.business.smtpPasswordEncrypted, smtpFromName: fromName || null, smtpFromEmail: fromEmail || null } });
    return NextResponse.json({ ok: true, passwordSaved: Boolean(password || member.business.smtpPasswordEncrypted) });
  } catch (error) { console.error("AARYVO email settings update error", error); return NextResponse.json({ error: "Email settings could not be saved." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const member = await membership();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (member.business.customSmtpEnabled && !hasFeature(member.business.plan, "customSmtp")) return NextResponse.json({ error: featureError("customSmtp"), code: "PLAN_REQUIRED", requiredPlan: "GROWTH" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const recipient = String(body.email || member.business.notificationEmail || member.business.smtpFromEmail || "").trim();
    if (!recipient || !emailPattern.test(recipient)) return NextResponse.json({ error: "Enter a valid test recipient email." }, { status: 400 });
    const mail = await workspaceMailConfig(member.businessId);
    if (!mail) return NextResponse.json({ error: "Email delivery is not configured." }, { status: 400 });
    await mail.transporter.verify();
    await mail.transporter.sendMail({ from: mail.from, to: recipient, subject: "AARYVO email delivery test", text: `Email delivery is working for ${member.business.name}. This test was sent using ${mail.source === "workspace" ? "your workspace SMTP settings" : "AARYVO email delivery"}.`, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><div style="font-size:12px;font-weight:700;letter-spacing:.14em">AARYVO</div><h2 style="margin:18px 0 8px">Email delivery is working.</h2><p style="color:#667085;line-height:1.6">This test confirms email delivery for <strong>${member.business.name}</strong>.</p><p style="color:#667085;line-height:1.6">Delivery method: ${mail.source === "workspace" ? "Your workspace SMTP" : "AARYVO email delivery"}.</p></div>` });
    return NextResponse.json({ ok: true, source: mail.source });
  } catch (error) { console.error("AARYVO test email error", error); const message = error instanceof Error ? error.message : "Unable to send test email."; return NextResponse.json({ error: `Test email failed: ${message}` }, { status: 400 }); }
}
