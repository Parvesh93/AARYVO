import Link from "next/link";

export const metadata = { title: "Privacy Policy | AARYVO", description: "Privacy Policy for AARYVO." };

const sections = [
  ["Information we collect", "We collect account information such as your name and email, workspace and website configuration, billing and subscription identifiers, and information submitted through AARYVO-powered conversations including contact details, enquiries and appointment requests."],
  ["How we use information", "We use information to provide and secure AARYVO, operate AI conversations, qualify and manage leads, schedule appointments, send requested notifications, process subscriptions, improve reliability and provide customer support."],
  ["AI processing", "Content supplied to AARYVO may be processed by AI service providers to generate responses and qualification results. Customers are responsible for ensuring that the information they provide to AARYVO, including website knowledge and visitor data, may lawfully be processed for these purposes."],
  ["Service providers", "We may use infrastructure, AI, email, calendar and payment service providers to operate AARYVO. These providers process information only as necessary to deliver their services to us or our customers."],
  ["Payments", "Payment details are processed by our payment provider. AARYVO stores subscription identifiers, plan, status and billing-period information, but does not need to store full card or UPI credentials."],
  ["Data security and retention", "We use reasonable technical and organizational safeguards to protect information. We retain information for as long as needed to provide the service, meet legal obligations, resolve disputes and maintain legitimate business records."],
  ["Your choices", "Workspace owners can manage lead and notification settings in AARYVO. For account, access, correction or deletion requests, contact us using the support details provided by AARYVO."],
  ["Changes", "We may update this policy as AARYVO evolves. Material changes will be reflected by updating the effective date on this page."],
];

export default function PrivacyPage() {
  return <main className="min-h-screen px-6 py-10 md:px-10"><div className="mx-auto max-w-3xl"><Link href="/" className="text-sm font-semibold tracking-[.22em]">AARYVO</Link><p className="mt-16 text-xs font-semibold uppercase tracking-[.16em] text-black/35">Legal</p><h1 className="mt-3 text-5xl font-semibold tracking-[-.05em]">Privacy Policy</h1><p className="mt-4 text-sm text-black/45">Effective: 14 September 2026</p><p className="mt-8 text-base leading-7 text-black/60">This Privacy Policy explains how AARYVO handles information when businesses use our AI sales employee platform and website visitors interact with AARYVO-powered experiences.</p><div className="mt-10 space-y-9">{sections.map(([title,body])=><section key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-7 text-black/55">{body}</p></section>)}</div><div className="mt-14 border-t border-black/[.07] pt-7 text-sm text-black/45">Questions about privacy? Contact the AARYVO support team. · <Link href="/terms" className="text-black underline underline-offset-4">Terms of Service</Link></div></div></main>;
}
