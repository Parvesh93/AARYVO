import { prisma } from "@/lib/prisma";

export type BillingProfile = {
  legalName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string;
};

export type BillingInvoiceSnapshot = BillingProfile & {
  supplierState: string;
};

export const EMPTY_BILLING_PROFILE: BillingProfile = {
  legalName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  gstin: "",
};

function str(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function sanitizeBillingProfile(value: unknown): BillingProfile {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    legalName: str(body.legalName, 190),
    email: str(body.email, 190).toLowerCase(),
    phone: str(body.phone, 50),
    addressLine1: str(body.addressLine1, 255),
    addressLine2: str(body.addressLine2, 255),
    city: str(body.city, 120),
    state: str(body.state, 120),
    postalCode: str(body.postalCode, 30),
    country: str(body.country, 120) || "India",
    gstin: str(body.gstin, 30).toUpperCase(),
  };
}

export function validateBillingProfile(profile: BillingProfile) {
  if (!profile.legalName || !profile.email || !profile.phone || !profile.addressLine1 || !profile.city || !profile.state || !profile.postalCode || !profile.country) {
    return "Please complete all required billing details.";
  }
  if (!/^\S+@\S+\.\S+$/.test(profile.email)) return "Enter a valid billing email.";
  if (profile.country.toLowerCase() === "india" && profile.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(profile.gstin)) {
    return "Enter a valid GSTIN or leave it blank.";
  }
  return null;
}

export async function ensureBillingTables() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS billing_profile (
    businessId VARCHAR(191) NOT NULL PRIMARY KEY,
    legalName VARCHAR(190) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    addressLine1 VARCHAR(255) NOT NULL,
    addressLine2 VARCHAR(255) NULL,
    city VARCHAR(120) NOT NULL,
    state VARCHAR(120) NOT NULL,
    postalCode VARCHAR(30) NOT NULL,
    country VARCHAR(120) NOT NULL DEFAULT 'India',
    gstin VARCHAR(30) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS billing_invoice (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    businessId VARCHAR(191) NOT NULL,
    razorpayInvoiceId VARCHAR(191) NOT NULL UNIQUE,
    razorpayPaymentId VARCHAR(191) NULL,
    razorpaySubscriptionId VARCHAR(191) NULL,
    invoiceNumber VARCHAR(191) NULL,
    plan VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    subtotalPaise INT NOT NULL DEFAULT 0,
    taxPaise INT NOT NULL DEFAULT 0,
    cgstPaise INT NOT NULL DEFAULT 0,
    sgstPaise INT NOT NULL DEFAULT 0,
    igstPaise INT NOT NULL DEFAULT 0,
    totalPaise INT NOT NULL DEFAULT 0,
    taxRate DECIMAL(6,2) NOT NULL DEFAULT 18.00,
    taxType VARCHAR(20) NOT NULL DEFAULT 'GST',
    shortUrl TEXT NULL,
    issuedAt DATETIME(3) NOT NULL,
    paidAt DATETIME(3) NULL,
    legalName VARCHAR(190) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    addressLine1 VARCHAR(255) NOT NULL,
    addressLine2 VARCHAR(255) NULL,
    city VARCHAR(120) NOT NULL,
    state VARCHAR(120) NOT NULL,
    postalCode VARCHAR(30) NOT NULL,
    country VARCHAR(120) NOT NULL,
    gstin VARCHAR(30) NULL,
    supplierState VARCHAR(120) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX billing_invoice_business_idx (businessId),
    INDEX billing_invoice_subscription_idx (razorpaySubscriptionId)
  )`);
}

export async function getBillingProfile(businessId: string): Promise<BillingProfile | null> {
  await ensureBillingTables();
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT * FROM billing_profile WHERE businessId = ? LIMIT 1", businessId);
  const row = rows[0];
  if (!row) return null;
  return sanitizeBillingProfile(row);
}

export async function saveBillingProfile(businessId: string, profile: BillingProfile) {
  await ensureBillingTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO billing_profile (businessId,legalName,email,phone,addressLine1,addressLine2,city,state,postalCode,country,gstin)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE legalName=VALUES(legalName),email=VALUES(email),phone=VALUES(phone),addressLine1=VALUES(addressLine1),addressLine2=VALUES(addressLine2),city=VALUES(city),state=VALUES(state),postalCode=VALUES(postalCode),country=VALUES(country),gstin=VALUES(gstin),updatedAt=CURRENT_TIMESTAMP(3)`,
    businessId, profile.legalName, profile.email, profile.phone, profile.addressLine1, profile.addressLine2 || null, profile.city, profile.state, profile.postalCode, profile.country, profile.gstin || null,
  );
}

export function gstRate() {
  const value = Number(process.env.BILLING_GST_RATE || 18);
  return Number.isFinite(value) && value >= 0 ? value : 18;
}

export function supplierState() {
  return String(process.env.BILLING_SUPPLIER_STATE || "").trim();
}

export function taxBreakdownInclusive(totalPaise: number, customerState: string, customerCountry = "India") {
  const rate = customerCountry.toLowerCase() === "india" ? gstRate() : 0;
  const subtotalPaise = rate ? Math.round(totalPaise * 100 / (100 + rate)) : totalPaise;
  const taxPaise = totalPaise - subtotalPaise;
  const sellerState = supplierState();
  const sameState = Boolean(sellerState) && sellerState.toLowerCase() === customerState.trim().toLowerCase();
  const cgstPaise = rate && sameState ? Math.floor(taxPaise / 2) : 0;
  const sgstPaise = rate && sameState ? taxPaise - cgstPaise : 0;
  const igstPaise = rate && !sameState ? taxPaise : 0;
  return {
    subtotalPaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalPaise,
    taxRate: rate,
    taxType: rate ? (sameState ? "CGST+SGST" : "IGST") : "NONE",
    supplierState: sellerState,
  };
}
