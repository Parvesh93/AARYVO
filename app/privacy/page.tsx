import Link from "next/link";
import LegalPage from "../_components/LegalPage";

export const metadata = { title: "Privacy Policy | AARYVO", description: "Privacy Policy for AARYVO." };
const sections: Array<[string, string]> = [
  ["Information we collect", "We collect account information such as your name and email, workspace and website configuration, billing and subscription identifiers, and information submitted through AARYVO-powered conversations including contact details, enquiries and appointment requests."],
  ["How we use information", "We use information to provide and secure AARYVO, operate AI conversations, qualify and manage leads, schedule appointments, send requested notifications, process subscriptions, improve reliability and provide customer support."],
  ["AI processing", "Content supplied to AARYVO may be processed by AI service providers to generate responses and qualification results. Customers are responsible for ensuring that the information they provide to AARYVO, including website knowledge and visitor data, may lawfully be processed for these purposes."],
  ["Service providers", "We may use infrastructure, AI, email, calendar and payment service providers to operate AARYVO. These providers process information only as necessary to deliver their services to us or our customers."],
  ["Payments", "Payment details are processed by our payment provider. AARYVO stores subscription identifiers, plan, status and billing-period information, but does not need to store full card or UPI credentials."],
  ["Data security and retention", "We use reasonable technical and organizational safeguards to protect information. We retain information for as long as needed to provide the service, meet legal obligations, resolve disputes and maintain legitimate business records."],
  ["Your choices", "Workspace owners can manage lead and notification settings in AARYVO. For account, access, correction or deletion requests, contact us using the support details provided by AARYVO."],
  ["Changes", "We may update this policy as AARYVO evolves. Material changes will be reflected by updating the effective date on this page."],
];
export default function PrivacyPage(){return <LegalPage title="Privacy Policy" effective="14 September 2026" intro="This Privacy Policy explains how AARYVO handles information when businesses use our AI sales employee platform and website visitors interact with AARYVO-powered experiences." sections={sections} footerNote={<>Questions about privacy? <Link href="/contact" className="font-semibold underline underline-offset-4">Contact the AARYVO support team.</Link></>} />;}
