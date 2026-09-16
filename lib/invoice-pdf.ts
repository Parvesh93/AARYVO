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
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/₹/g, "Rs.")
    .replace(/[^\x20-\x7E]/g, "?");
}
function esc(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function money(paise: number) {
  return `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function date(value: Date | null) {
  return value ? value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-";
}
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

  const text = (x: number, y: number, size: number, value: string, bold = false, gray = 0) => {
    ops.push(`${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET 0 g`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, width = 0.7, gray = 0.82) => {
    ops.push(`${gray} G ${width} w ${x1} ${y1} m ${x2} ${y2} l S 0 G`);
  };
  const fillGray = (x: number, y: number, w: number, h: number, gray: number) => {
    ops.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);
  };
  const fillRgb = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
    ops.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f 0 g`);
  };
  const strokeBox = (x: number, y: number, w: number, h: number, gray = 0.85, width = 0.7) => {
    ops.push(`${gray} G ${width} w ${x} ${y} ${w} ${h} re S 0 G`);
  };

  fillGray(0, 0, 595, 842, 1);

  // Premium brand header
  fillRgb(0, 748, 595, 94, 0.07, 0.07, 0.075);
  fillRgb(42, 782, 44, 44, 0.82, 1, 0.46);
  text(58, 797, 17, "A", true, 0.08);
  text(100, 806, 20, "AARYVO", true, 1);
  text(100, 788, 8, "AI SALES OS", false, 0.68);
  text(420, 806, 17, "TAX INVOICE", true, 1);
  text(420, 787, 8, `Status: ${invoice.status.toUpperCase()}`, false, 0.68);

  // Invoice summary strip
  fillGray(42, 704, 511, 28, 0.96);
  text(54, 714, 8, `Invoice ${invoice.invoiceNumber}`, true, 0.28);
  text(340, 714, 8, `Issued ${date(invoice.issuedAt)}`, false, 0.34);
  text(465, 714, 8, `Paid ${date(invoice.paidAt)}`, false, 0.34);

  // Supplier card
  strokeBox(42, 575, 240, 112);
  text(56, 666, 8, "SUPPLIER", true, 0.42);
  text(56, 646, 13, seller.name, true);
  let sy = 629;
  if (seller.address) { text(56, sy, 8, seller.address, false, 0.34); sy -= 13; }
  text(56, sy, 8, [seller.city, seller.state, seller.postalCode].filter(Boolean).join(", "), false, 0.34); sy -= 13;
  text(56, sy, 8, `GSTIN: ${seller.gstin}`, false, 0.34); sy -= 13;
  text(56, sy, 8, seller.email, false, 0.34);

  // Customer card
  strokeBox(313, 575, 240, 112);
  text(327, 666, 8, "BILL TO", true, 0.42);
  text(327, 646, 13, invoice.legalName, true);
  text(327, 629, 8, invoice.addressLine1, false, 0.34);
  let cy = 616;
  if (invoice.addressLine2) { text(327, cy, 8, invoice.addressLine2, false, 0.34); cy -= 13; }
  text(327, cy, 8, `${invoice.city}, ${invoice.state} ${invoice.postalCode}`, false, 0.34); cy -= 13;
  text(327, cy, 8, invoice.country, false, 0.34); cy -= 13;
  if (invoice.gstin) text(327, cy, 8, `GSTIN: ${invoice.gstin}`, false, 0.34);

  // Service / tax metadata
  fillRgb(42, 532, 511, 28, 0.82, 1, 0.46);
  text(54, 542, 8, "SERVICE DETAILS", true, 0.08);
  text(340, 542, 8, `Place of supply: ${invoice.state}`, true, 0.08);
  text(54, 510, 9, `AARYVO ${invoice.plan} subscription`, true);
  if (seller.sac) text(54, 494, 7, `SAC: ${seller.sac}`, false, 0.36);
  if (invoice.razorpaySubscriptionId) text(54, 481, 7, `Subscription: ${invoice.razorpaySubscriptionId}`, false, 0.36);
  if (invoice.razorpayPaymentId) text(340, 510, 8, `Payment Ref: ${invoice.razorpayPaymentId}`, false, 0.36);
  text(340, 494, 8, `Tax type: ${invoice.taxType}`, false, 0.36);

  // Line item table
  fillGray(42, 436, 511, 29, 0.94);
  text(54, 447, 8, "DESCRIPTION", true, 0.34);
  text(355, 447, 8, "QTY", true, 0.34);
  text(424, 447, 8, "TAXABLE VALUE", true, 0.34);
  text(54, 413, 9, `AARYVO ${invoice.plan} subscription`);
  text(360, 413, 9, "1");
  text(424, 413, 9, money(invoice.subtotalPaise), true);
  line(42, 392, 553, 392);

  // Totals panel
  strokeBox(326, 267, 227, 108, 0.86);
  text(340, 353, 8, "SUMMARY", true, 0.42);
  let y = 333;
  text(340, y, 9, "Taxable value", false, 0.34); text(455, y, 9, money(invoice.subtotalPaise), true); y -= 20;
  if (invoice.cgstPaise > 0) { text(340, y, 9, `CGST ${(invoice.taxRate / 2).toFixed(1)}%`, false, 0.34); text(455, y, 9, money(invoice.cgstPaise)); y -= 20; }
  if (invoice.sgstPaise > 0) { text(340, y, 9, `SGST ${(invoice.taxRate / 2).toFixed(1)}%`, false, 0.34); text(455, y, 9, money(invoice.sgstPaise)); y -= 20; }
  if (invoice.igstPaise > 0) { text(340, y, 9, `IGST ${invoice.taxRate.toFixed(1)}%`, false, 0.34); text(455, y, 9, money(invoice.igstPaise)); y -= 20; }
  line(340, y + 8, 539, y + 8, 0.9, 0.65);
  text(340, y - 11, 12, "TOTAL", true);
  text(455, y - 11, 12, money(invoice.totalPaise), true);

  // Payment status card
  fillRgb(42, 267, 260, 108, 0.07, 0.07, 0.075);
  text(56, 351, 8, "PAYMENT STATUS", true, 0.55);
  text(56, 327, 18, invoice.status.toUpperCase(), true, 1);
  text(56, 304, 8, `Total tax ${money(invoice.taxPaise)}`, false, 0.7);
  text(56, 289, 8, `Total paid ${money(invoice.totalPaise)}`, false, 0.7);

  // Footer notes
  fillGray(42, 172, 511, 65, 0.97);
  text(56, 217, 8, "ABOUT THIS INVOICE", true, 0.42);
  text(56, 199, 8, "This is a computer-generated tax invoice for an AARYVO digital subscription.", false, 0.34);
  text(56, 184, 8, "Payment was processed through Razorpay. No physical goods are supplied.", false, 0.34);

  text(42, 112, 9, "PP DESIGN AND TECH", true);
  text(42, 96, 7, `GSTIN ${seller.gstin} | ${seller.email}`, false, 0.38);
  text(42, 80, 7, "AARYVO is a product of PP DESIGN AND TECH", false, 0.38);
  text(436, 96, 7, "Computer generated", false, 0.45);
  text(436, 80, 7, "No signature required", false, 0.45);

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
