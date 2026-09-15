import Link from "next/link";
import LegalPage from "../_components/LegalPage";
export const metadata={title:"Shipping & Delivery Policy | AARYVO",description:"Shipping and delivery policy for AARYVO, a digital SaaS product of PP DESIGN AND TECH."};
const sections:Array<[string,string]>=[
["No physical shipping","AARYVO subscriptions, account access, software features and website widget functionality are delivered electronically. No courier, postal delivery or physical shipping charges apply to an AARYVO subscription."],
["Digital delivery","Free account access is provided after successful account creation. Paid plan entitlements are made available electronically after the applicable payment or recurring payment authorization is successfully confirmed, subject to the plan-change rules shown in your Billing area."],
["Delivery issues","If a successful payment is not reflected in your AARYVO account within a reasonable period, contact ppdesignandtech@gmail.com with your account email and transaction details so we can review the payment status."],
];
export default function ShippingPolicyPage(){return <LegalPage title="Shipping & Delivery Policy" effective="16 September 2026" intro={<>AARYVO is a digital software-as-a-service product operated by <strong className="text-white">PP DESIGN AND TECH</strong>. We do not sell or ship physical products through this website.</>} sections={sections} footerNote={<>Service provider: <strong>PP DESIGN AND TECH</strong> · GSTIN: 07CQXPP5370D1ZB · <Link href="/contact" className="font-semibold underline underline-offset-4">Contact us</Link></>} />;}
