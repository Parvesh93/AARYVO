import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/token-crypto";

export async function workspaceMailConfig(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      customSmtpEnabled: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPasswordEncrypted: true,
      smtpFromName: true,
      smtpFromEmail: true,
    },
  });

  if (
    business?.customSmtpEnabled &&
    business.smtpHost &&
    business.smtpPort &&
    business.smtpUser &&
    business.smtpPasswordEncrypted &&
    business.smtpFromEmail
  ) {
    return {
      transporter: nodemailer.createTransport({
        host: business.smtpHost,
        port: business.smtpPort,
        secure: business.smtpSecure,
        auth: {
          user: business.smtpUser,
          pass: decryptToken(business.smtpPasswordEncrypted),
        },
      }),
      from: business.smtpFromName
        ? `${business.smtpFromName} <${business.smtpFromEmail}>`
        : business.smtpFromEmail,
      source: "workspace" as const,
    };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from: process.env.SMTP_FROM || `AARYVO <${user}>`,
    source: "aaryvo" as const,
  };
}
