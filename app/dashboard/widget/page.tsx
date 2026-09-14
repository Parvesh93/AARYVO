import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import WidgetSettingsForm from "./WidgetSettingsForm";

export default async function WidgetPage(){
  const session=await requireSession();
  const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:{include:{agents:{take:1}}}}});
  if(!member)redirect("/onboarding");
  const agent=member.business.agents[0];
  if(!agent)return <div className="rounded-3xl bg-white p-10 text-center text-sm text-black/40">Complete onboarding to create your widget.</div>;
  const base=process.env.NEXT_PUBLIC_APP_URL||"http://localhost:3000";
  const installCode=`<script src="${base}/widget.js" data-agent="${agent.id}" defer></script>`;
  return <div className="mx-auto max-w-[1400px] pb-8"><p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">Customer experience</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Widget appearance</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Match AARYVO to your website brand, preview the experience and publish changes without editing your website code.</p><div className="mt-7"><WidgetSettingsForm initial={{title:agent.widgetTitle,subtitle:agent.widgetSubtitle,welcomeMessage:agent.widgetWelcomeMessage,startLabel:agent.widgetStartLabel,bookLabel:agent.widgetBookLabel,accentColor:agent.widgetAccentColor,theme:agent.widgetTheme,position:agent.widgetPosition,launcherStyle:agent.widgetLauncherStyle,showPoweredBy:agent.widgetShowPoweredBy}} installCode={installCode}/></div></div>;
}
