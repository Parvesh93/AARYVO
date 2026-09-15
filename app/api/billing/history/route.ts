import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpayConfigured, razorpayRequest } from "@/lib/billing";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.userId },
    include: { business: true },
  });
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const subscriptionId = member.business.razorpaySubscriptionId;
  if (!subscriptionId) return NextResponse.json({ invoices: [] });
  if (!razorpayConfigured()) return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });

  try {
    const result = await razorpayRequest(`/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`);
    const invoices = Array.isArray(result?.items) ? result.items.map((invoice: Record<string, unknown>) => ({
      id: String(invoice.id || ""),
      invoiceNumber: invoice.invoice_number ? String(invoice.invoice_number) : null,
      paymentId: invoice.payment_id ? String(invoice.payment_id) : null,
      status: String(invoice.status || "unknown"),
      amount: Number(invoice.amount || 0),
      amountPaid: Number(invoice.amount_paid || 0),
      taxAmount: Number(invoice.tax_amount || 0),
      taxableAmount: Number(invoice.taxable_amount || 0),
      currency: String(invoice.currency || "INR"),
      issuedAt: invoice.issued_at ? new Date(Number(invoice.issued_at) * 1000).toISOString() : null,
      paidAt: invoice.paid_at ? new Date(Number(invoice.paid_at) * 1000).toISOString() : null,
      shortUrl: invoice.short_url ? String(invoice.short_url) : null,
    })) : [];

    invoices.sort((a: { issuedAt: string | null }, b: { issuedAt: string | null }) => (b.issuedAt || "").localeCompare(a.issuedAt || ""));
    return NextResponse.json({ invoices });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load billing history." }, { status: 500 });
  }
}
