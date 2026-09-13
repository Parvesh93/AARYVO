import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

type LeadNotification = {
  businessId: string;
  leadId: string;
  event: "NEW_LEAD" | "HOT_LEAD" | "APPOINTMENT";
  appointmentAt?: Date;
};

function escapeHtml(value: string | null | undefined) {
  return (value || "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendLeadNotification(input: LeadNotification) {
  if (!smtpConfigured()) {
    console.info("AARYVO notification skipped: SMTP is not configured");
    return;
  }

  try {
    const [lead, owner] = await Promise.all([
      prisma.lead.findUnique({ where: { id: input.leadId }, include: { business: true } }),
      prisma.businessMember.findFirst({ where: { businessId: input.businessId, role: "OWNER" }, include: { user: true } }),
    ]);
    if (!lead) return;

    const recipient = process.env.NOTIFICATION_EMAIL || owner?.user.email;
    if (!recipient) return;

    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const dashboardUrl = `${appUrl}/dashboard`;
    const labels = {
      NEW_LEAD: { subject: `New lead captured — ${lead.name || "Website visitor"}`, heading: "New website lead captured" },
      HOT_LEAD: { subject: `🔥 Hot lead — ${lead.name || "Website visitor"}`, heading: "A lead is ready for follow-up" },
      APPOINTMENT: { subject: `📅 Consultation requested — ${lead.name || "Website visitor"}`, heading: "New consultation request" },
    } as const;
    const label = labels[input.event];
    const appointment = input.appointmentAt ? input.appointmentAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : null;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `AARYVO <${process.env.SMTP_USER}>`,
      to: recipient,
      subject: `[AARYVO] ${label.subject}`,
      text: `${label.heading}\nBusiness: ${lead.business.name}\nName: ${lead.name || "—"}\nPhone: ${lead.phone || "—"}\nEmail: ${lead.email || "—"}\nRequirement: ${lead.requirement || "—"}\nBudget: ${lead.budget || "—"}\nLead score: ${lead.score}/100\nStatus: ${lead.status}${appointment ? `\nRequested consultation: ${appointment}` : ""}\nDashboard: ${dashboardUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111"><p style="letter-spacing:.18em;font-weight:700">AARYVO</p><h2>${escapeHtml(label.heading)}</h2><p style="color:#666">${escapeHtml(lead.business.name)}</p><div style="background:#f6f6f4;border-radius:18px;padding:22px;line-height:1.7"><strong>${escapeHtml(lead.name)}</strong><br>Phone: ${escapeHtml(lead.phone)}<br>Email: ${escapeHtml(lead.email)}<br><br><strong>Requirement</strong><br>${escapeHtml(lead.requirement)}<br><br><strong>Budget:</strong> ${escapeHtml(lead.budget)}<br><strong>Lead score:</strong> ${lead.score}/100<br><strong>Status:</strong> ${escapeHtml(lead.status)}${appointment ? `<br><strong>Consultation:</strong> ${escapeHtml(appointment)}` : ""}</div>${appUrl ? `<p style="margin-top:26px"><a href="${dashboardUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px">Open AARYVO dashboard</a></p>` : ""}<p style="margin-top:28px;color:#999;font-size:12px">Sent automatically by your AARYVO AI sales agent.</p></div>`,
    });
  } catch (error) {
    console.error("AARYVO lead notification error", error);
  }
}
