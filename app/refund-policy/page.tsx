import Link from "next/link";
import LegalPage from "../_components/LegalPage";
export const metadata={title:"Refund Policy | AARYVO",description:"Refund policy for AARYVO subscriptions provided by PP DESIGN AND TECH."};
const sections:Array<[string,string]>=[
["Digital subscription service","AARYVO is a digital software-as-a-service product. No physical goods are sold or delivered as part of an AARYVO subscription."],
["Subscription payments","Paid AARYVO plans are recurring subscriptions. Charges provide access to the selected plan and its usage limits for the applicable billing period."],
["Refund eligibility","Subscription payments are generally non-refundable once a paid billing period has started or plan access has been provided. If you believe you were charged incorrectly, charged more than once, or experienced a billing error, contact us and we will review the transaction."],
["Plan upgrades","When an upgrade requires an additional or prorated payment, the higher plan entitlement may be made available after successful payment or authorization. Amounts paid for immediate upgrade access are generally non-refundable after the upgraded entitlement has been provided."],
["Approved refunds","Where a refund is approved for a billing error or other eligible circumstance, it will be processed to the original payment method through our payment provider. The time taken for the amount to appear is subject to the payment provider and the customer's bank or payment method."],
["How to request a review","Email ppdesignandtech@gmail.com with your AARYVO account email, business name, payment date and transaction details. Please do not send card numbers, OTPs or other sensitive payment credentials."],
];
export default function RefundPolicyPage(){return <LegalPage title="Refund Policy" effective="16 September 2026" intro={<>AARYVO is a digital SaaS product operated by <strong className="text-white">PP DESIGN AND TECH</strong>. This policy explains how refund requests for AARYVO subscription payments are handled.</>} sections={sections} footerNote={<>Billing entity: <strong>PP DESIGN AND TECH</strong> · GSTIN: 07CQXPP5370D1ZB · <Link href="/contact" className="font-semibold underline underline-offset-4">Contact us</Link></>} />;}
