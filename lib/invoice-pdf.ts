type InvoicePdfData = {
  invoiceNumber: string;
  issuedAt: Date;
  paidAt: Date | null;
  status: string;
  plan: string;
  currency: string;
  subtotalPaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  taxRate: number;
  taxType: string;
  razorpayPaymentId: string | null;
  razorpaySubscriptionId: string | null;
  legalName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string | null;
  supplierState: string | null;
};

type Supplier = {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  email: string;
  sac: string;
};

function ascii(value: string | null | undefined) {
  return String(value || "").replace(/[–—]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/₹/g, "Rs.").replace(/[^\x20-\x7E]/g, "?");
}
function esc(value: string) { return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function money(paise: number) { return `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function date(value: Date | null) { return value ? value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-"; }
function supplierDetails(): Supplier {
  return {
    name: process.env.BILLING_SUPPLIER_NAME || "PP DESIGN AND TECH",
    gstin: process.env.BILLING_SUPPLIER_GSTIN || "07CQXPP5370D1ZB",
    address: process.env.BILLING_SUPPLIER_ADDRESS || "",
    city: process.env.BILLING_SUPPLIER_CITY || "Delhi",
    state: process.env.BILLING_SUPPLIER_STATE || "Delhi",
    postalCode: process.env.BILLING_SUPPLIER_POSTAL_CODE || "",
    email: process.env.BILLING_SUPPLIER_EMAIL || "ppdesignandtech@gmail.com",
    sac: process.env.BILLING_SAC || "",
  };
}

export function createInvoicePdf(invoice: InvoicePdfData) {
  const seller = supplierDetails();
  const ops: string[] = [];
  const text = (x: number, y: number, size: number, value: string, bold = false) => ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`);
  const line = (x1: number, y1: number, x2: number, y2: number, width = 0.7) => ops.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const fill = (x: number, y: number, w: number, h: number, gray: number) => ops.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);

  fill(0, 0, 595, 842, 1);
  fill(0, 775, 595, 67, 0.06);
  text(42, 810, 19, "AARYVO", true);
  text(42, 792, 8, "A PRODUCT OF PP DESIGN AND TECH");
  text(420, 810, 18, "TAX INVOICE", true);
  text(420, 792, 8, `Status: ${invoice.status.toUpperCase()}`);

  text(42, 748, 9, "SUPPLIER", true);
  text(42, 730, 12, seller.name, true);
  let sy = 714;
  if (seller.address) { text(42, sy, 8, seller.address); sy -= 13; }
  text(42, sy, 8, [seller.city, seller.state, seller.postalCode].filter(Boolean).join(", ")); sy -= 13;
  text(42, sy, 8, `GSTIN: ${seller.gstin}`); sy -= 13;
  text(42, sy, 8, `Email: ${seller.email}`);

  text(345, 748, 9, "INVOICE DETAILS", true);
  text(345, 730, 8, `Invoice No: ${invoice.invoiceNumber}`);
  text(345, 716, 8, `Invoice Date: ${date(invoice.issuedAt)}`);
  text(345, 702, 8, `Payment Date: ${date(invoice.paidAt)}`);
  if (invoice.razorpayPaymentId) text(345, 688, 8, `Payment Ref: ${invoice.razorpayPaymentId}`);

  line(42, 654, 553, 654);
  text(42, 632, 9, "BILL TO", true);
  text(42, 613, 12, invoice.legalName, true);
  text(42, 597, 8, invoice.addressLine1);
  if (invoice.addressLine2) text(42, 584, 8, invoice.addressLine2);
  const addressY = invoice.addressLine2 ? 571 : 584;
  text(42, addressY, 8, `${invoice.city}, ${invoice.state} ${invoice.postalCode}`);
  text(42, addressY - 13, 8, invoice.country);
  if (invoice.gstin) text(42, addressY - 26, 8, `GSTIN: ${invoice.gstin}`);
  text(345, 613, 8, `Place of supply: ${invoice.state}`);
  text(345, 599, 8, `Email: ${invoice.email}`);
  text(345, 585, 8, `Phone: ${invoice.phone}`);

  const tableTop = 525;
  fill(42, tableTop - 2, 511, 28, 0.94);
  text(52, tableTop + 8, 8, "DESCRIPTION", true);
  text(350, tableTop + 8, 8, "QTY", true);
  text(410, tableTop + 8, 8, "TAXABLE VALUE", true);
  line(42, tableTop - 2, 553, tableTop - 2);
  text(52, tableTop - 28, 9, `AARYVO ${invoice.plan} subscription`);
  if (seller.sac) text(52, tableTop - 42, 7, `SAC: ${seller.sac}`);
  if (invoice.razorpaySubscriptionId) text(52, tableTop - 55, 7, `Subscription: ${invoice.razorpaySubscriptionId}`);
  text(350, tableTop - 28, 9, "1");
  text(410, tableTop - 28, 9, money(invoice.subtotalPaise));
  line(42, tableTop - 70, 553, tableTop - 70);

  let y = 420;
  text(350, y, 9, "Taxable value"); text(455, y, 9, money(invoice.subtotalPaise), true); y -= 22;
  if (invoice.cgstPaise > 0) { text(350, y, 9, `CGST ${(invoice.taxRate / 2).toFixed(1)}%`); text(455, y, 9, money(invoice.cgstPaise)); y -= 22; }
  if (invoice.sgstPaise > 0) { text(350, y, 9, `SGST ${(invoice.taxRate / 2).toFixed(1)}%`); text(455, y, 9, money(invoice.sgstPaise)); y -= 22; }
  if (invoice.igstPaise > 0) { text(350, y, 9, `IGST ${invoice.taxRate.toFixed(1)}%`); text(455, y, 9, money(invoice.igstPaise)); y -= 22; }
  line(345, y + 8, 553, y + 8);
  text(350, y - 12, 11, "TOTAL", true); text(455, y - 12, 11, money(invoice.totalPaise), true);

  fill(42, 220, 511, 68, 0.96);
  text(55, 264, 8, "PAYMENT STATUS", true);
  text(55, 246, 12, invoice.status.toUpperCase(), true);
  text(210, 264, 8, "TAX TYPE", true);
  text(210, 246, 10, invoice.taxType, true);
  text(365, 264, 8, "TOTAL TAX", true);
  text(365, 246, 10, money(invoice.taxPaise), true);

  text(42, 165, 8, "Notes", true);
  text(42, 149, 8, "This is a computer-generated tax invoice for an AARYVO digital subscription.");
  text(42, 136, 8, "Payment was processed through Razorpay. No physical goods are supplied.");
  text(42, 90, 8, "PP DESIGN AND TECH", true);
  text(42, 76, 7, `GSTIN ${seller.gstin} | ${seller.email}`);
  text(420, 76, 7, "Computer generated invoice");

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
