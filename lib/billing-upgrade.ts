import { prisma } from "@/lib/prisma";

export type BillingTransition = {
  id: string;
  businessId: string;
  oldSubscriptionId: string;
  newSubscriptionId: string;
  fromPlan: string;
  toPlan: string;
  direction: string;
  upfrontPaise: number;
  startAt: Date;
  status: string;
  paymentId: string | null;
  createdAt: Date;
};

export async function ensureBillingTransitionTable() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS billing_subscription_transition (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    businessId VARCHAR(191) NOT NULL,
    oldSubscriptionId VARCHAR(191) NOT NULL,
    newSubscriptionId VARCHAR(191) NOT NULL UNIQUE,
    fromPlan VARCHAR(50) NOT NULL,
    toPlan VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    upfrontPaise INT NOT NULL DEFAULT 0,
    startAt DATETIME(3) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
    paymentId VARCHAR(191) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX billing_transition_business_idx (businessId),
    INDEX billing_transition_old_idx (oldSubscriptionId),
    INDEX billing_transition_status_idx (status)
  )`);
}

export async function createBillingTransition(input: Omit<BillingTransition,"createdAt">) {
  await ensureBillingTransitionTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO billing_subscription_transition
      (id,businessId,oldSubscriptionId,newSubscriptionId,fromPlan,toPlan,direction,upfrontPaise,startAt,status,paymentId)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    input.id,input.businessId,input.oldSubscriptionId,input.newSubscriptionId,input.fromPlan,input.toPlan,input.direction,input.upfrontPaise,input.startAt,input.status,input.paymentId,
  );
}

function rowToTransition(row: Record<string, unknown> | undefined): BillingTransition | null {
  if (!row) return null;
  return {
    id:String(row.id||""),businessId:String(row.businessId||""),oldSubscriptionId:String(row.oldSubscriptionId||""),newSubscriptionId:String(row.newSubscriptionId||""),fromPlan:String(row.fromPlan||""),toPlan:String(row.toPlan||""),direction:String(row.direction||""),upfrontPaise:Number(row.upfrontPaise||0),startAt:new Date(String(row.startAt)),status:String(row.status||""),paymentId:row.paymentId?String(row.paymentId):null,createdAt:new Date(String(row.createdAt)),
  };
}

export async function transitionByNewSubscription(newSubscriptionId:string){await ensureBillingTransitionTable();const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>("SELECT * FROM billing_subscription_transition WHERE newSubscriptionId = ? LIMIT 1",newSubscriptionId);return rowToTransition(rows[0])}
export async function activeTransitionForBusiness(businessId:string){await ensureBillingTransitionTable();const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM billing_subscription_transition WHERE businessId = ? AND status IN ('CREATED','AUTHENTICATED','ACTIVE') ORDER BY createdAt DESC LIMIT 1`,businessId);return rowToTransition(rows[0])}
export async function transitionByOldSubscription(oldSubscriptionId:string){await ensureBillingTransitionTable();const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM billing_subscription_transition WHERE oldSubscriptionId = ? AND status IN ('AUTHENTICATED','ACTIVE') ORDER BY createdAt DESC LIMIT 1`,oldSubscriptionId);return rowToTransition(rows[0])}
export async function updateBillingTransition(newSubscriptionId:string,status:string,paymentId?:string|null){await ensureBillingTransitionTable();await prisma.$executeRawUnsafe(`UPDATE billing_subscription_transition SET status = ?, paymentId = COALESCE(?, paymentId), updatedAt = CURRENT_TIMESTAMP(3) WHERE newSubscriptionId = ?`,status,paymentId||null,newSubscriptionId)}
export async function subscriptionIdsForBusiness(businessId:string){await ensureBillingTransitionTable();const rows=await prisma.$queryRawUnsafe<Array<{oldSubscriptionId:string;newSubscriptionId:string}>>(`SELECT oldSubscriptionId,newSubscriptionId FROM billing_subscription_transition WHERE businessId = ? ORDER BY createdAt DESC`,businessId);const ids=new Set<string>();for(const row of rows){if(row.oldSubscriptionId)ids.add(String(row.oldSubscriptionId));if(row.newSubscriptionId)ids.add(String(row.newSubscriptionId));}return [...ids]}
