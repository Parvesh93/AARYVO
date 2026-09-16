import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plan-entitlements";
import PlanGate from "../_components/PlanGate";
import EmailDeliveryForm from "./EmailDeliveryForm";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage(){
  const session=await requireSession();
  const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:true}});
  if(!member)notFound();
  const b=member.business;
  const customSmtp=hasFeature(b.plan,"customSmtp");
  return <div className="mx-auto max-w-[1100px]"><p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Settings</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Manage notifications, email delivery and booking availability for {b.name}.</p><div className="mt-7 space-y-5">{customSmtp?<EmailDeliveryForm initial={{customSmtpEnabled:b.customSmtpEnabled,smtpHost:b.smtpHost||"",smtpPort:b.smtpPort||587,smtpSecure:b.smtpSecure,smtpUser:b.smtpUser||"",smtpFromName:b.smtpFromName||b.name,smtpFromEmail:b.smtpFromEmail||"",passwordSaved:Boolean(b.smtpPasswordEncrypted),notificationEmail:b.notificationEmail||""}}/>:<PlanGate title="Custom email sender / SMTP" description="Use your own business email server and From address for AARYVO notifications. AARYVO's standard email delivery remains available on eligible lower plans." requiredPlan="Growth"/>}<SettingsForm initial={{notificationEmail:b.notificationEmail,notifyNewLead:b.notifyNewLead,notifyHotLead:b.notifyHotLead,notifyAppointment:b.notifyAppointment,notifyHumanAttention:b.notifyHumanAttention,bookingTimeZone:b.bookingTimeZone,bookingSlotMinutes:b.bookingSlotMinutes,bookingStartHour:b.bookingStartHour,bookingEndHour:b.bookingEndHour,bookingDaysAhead:b.bookingDaysAhead,bookingWorkingDays:b.bookingWorkingDays}}/></div></div>
}
