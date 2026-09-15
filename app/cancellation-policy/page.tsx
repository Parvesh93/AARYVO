import Link from "next/link";
import LegalPage from "../_components/LegalPage";
export const metadata={title:"Cancellation Policy | AARYVO",description:"Cancellation policy for AARYVO subscriptions provided by PP DESIGN AND TECH."};
const sections:Array<[string,string]>=[
["Cancelling a subscription","You may request cancellation of recurring billing for an eligible paid AARYVO subscription from the Billing area of your account. You may also contact our support team for billing assistance."],
["Access after cancellation","Unless otherwise stated, cancellation takes effect at the end of the current paid billing period. You can continue using the features and conversation limit of your current paid plan until that period ends."],
["After the billing period","Once the paid billing period ends, recurring charges stop and your workspace may move to the Free plan and its applicable usage limits unless another plan has been arranged."],
["Downgrades","If you downgrade to a lower paid plan, your existing higher plan remains available until the end of the current paid billing period. The lower plan is intended to begin from the next billing cycle after the required recurring payment authorization is completed."],
["Upgrades","Eligible upgrades may provide higher plan access during the current billing period after successful payment or authorization. The replacement recurring subscription is intended to apply from the next billing cycle."],
["Support","For cancellation or subscription questions, email ppdesignandtech@gmail.com from the email associated with your AARYVO account."],
];
export default function CancellationPolicyPage(){return <LegalPage title="Cancellation Policy" effective="16 September 2026" intro={<>AARYVO subscriptions are provided by <strong className="text-white">PP DESIGN AND TECH</strong>. This policy explains how cancellations and plan changes are handled.</>} sections={sections} footerNote={<>Billing entity: <strong>PP DESIGN AND TECH</strong> · GSTIN: 07CQXPP5370D1ZB · <Link href="/contact" className="font-semibold underline underline-offset-4">Contact us</Link></>} />;}
