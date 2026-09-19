import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

let ready: Promise<void> | null = null;

export type EmailAnalyticsFilters = {
  days?: number;
  category?: string | null;
  source?: string | null;
};

export function ensureEmailAnalyticsTable() {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS platform_email_log (
        id VARCHAR(191) PRIMARY KEY,businessId VARCHAR(191) NULL,recipient VARCHAR(320) NOT NULL,
        subject VARCHAR(500) NOT NULL,category VARCHAR(100) NOT NULL,source VARCHAR(50) NULL,
        status VARCHAR(50) NOT NULL,errorMessage TEXT NULL,textBody LONGTEXT NULL,htmlBody LONGTEXT NULL,
        sentAt DATETIME(3) NULL,openedAt DATETIME(3) NULL,openCount INT NOT NULL DEFAULT 0,
        clickedAt DATETIME(3) NULL,clickCount INT NOT NULL DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_email_created(createdAt),INDEX idx_email_business(businessId),INDEX idx_email_status(status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

      const cols = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='platform_email_log'
         AND COLUMN_NAME IN ('textBody','htmlBody')`,
      );
      const names = new Set(cols.map((v) => v.COLUMN_NAME));
      if (!names.has("textBody")) await prisma.$executeRawUnsafe(`ALTER TABLE platform_email_log ADD COLUMN textBody LONGTEXT NULL AFTER errorMessage`);
      if (!names.has("htmlBody")) await prisma.$executeRawUnsafe(`ALTER TABLE platform_email_log ADD COLUMN htmlBody LONGTEXT NULL AFTER textBody`);
    })();
  }
  return ready;
}

export async function createEmailLog(input: {
  businessId?: string | null; recipient: string; subject: string; category: string;
  source?: string | null; textBody?: string | null; htmlBody?: string | null;
}) {
  await ensureEmailAnalyticsTable();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO platform_email_log(id,businessId,recipient,subject,category,source,status,textBody,htmlBody)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    id,input.businessId||null,input.recipient.slice(0,320),input.subject.slice(0,500),
    input.category.slice(0,100),input.source?.slice(0,50)||null,"QUEUED",input.textBody||null,input.htmlBody||null,
  );
  return id;
}

export async function markEmailSent(id:string){await ensureEmailAnalyticsTable();await prisma.$executeRawUnsafe(`UPDATE platform_email_log SET status='SENT',sentAt=NOW(3) WHERE id=?`,id)}
export async function markEmailFailed(id:string,error:unknown){await ensureEmailAnalyticsTable();await prisma.$executeRawUnsafe(`UPDATE platform_email_log SET status='FAILED',errorMessage=? WHERE id=?`,String(error instanceof Error?error.message:error).slice(0,4000),id)}
export async function markEmailOpened(id:string){await ensureEmailAnalyticsTable();await prisma.$executeRawUnsafe(`UPDATE platform_email_log SET openedAt=COALESCE(openedAt,NOW(3)),openCount=openCount+1 WHERE id=?`,id)}
export async function markEmailClicked(id:string){await ensureEmailAnalyticsTable();await prisma.$executeRawUnsafe(`UPDATE platform_email_log SET clickedAt=COALESCE(clickedAt,NOW(3)),clickCount=clickCount+1 WHERE id=?`,id)}

function safeDays(value:number|undefined){return Math.max(1,Math.min(365,Math.floor(value||30)))}
function optionalClause(category?:string|null,source?:string|null){
  const params:string[]=[]; let sql="";
  if(category){sql+=" AND category=?";params.push(category)}
  if(source){sql+=" AND source=?";params.push(source)}
  return{sql,params};
}
function toNum(value:bigint|number|null|undefined){return Number(value||0)}

export async function emailAnalyticsSummary(input:number|EmailAnalyticsFilters=30){
  await ensureEmailAnalyticsTable();
  const filters:EmailAnalyticsFilters=typeof input==="number"?{days:input}:input;
  const days=safeDays(filters.days);
  const {sql:filterSql,params}=optionalClause(filters.category,filters.source);

  const totals=await prisma.$queryRawUnsafe<Array<{total:bigint;sent:bigint;failed:bigint;opened:bigint;clicked:bigint;totalOpens:bigint;totalClicks:bigint}>>(
    `SELECT COUNT(*) total,SUM(status='SENT') sent,SUM(status='FAILED') failed,
      SUM(openCount>0) opened,SUM(clickCount>0) clicked,SUM(openCount) totalOpens,SUM(clickCount) totalClicks
     FROM platform_email_log WHERE createdAt>=DATE_SUB(NOW(),INTERVAL ${days} DAY)${filterSql}`,...params);

  const previous=await prisma.$queryRawUnsafe<Array<{total:bigint;sent:bigint;failed:bigint;opened:bigint;clicked:bigint}>>(
    `SELECT COUNT(*) total,SUM(status='SENT') sent,SUM(status='FAILED') failed,SUM(openCount>0) opened,SUM(clickCount>0) clicked
     FROM platform_email_log WHERE createdAt>=DATE_SUB(NOW(),INTERVAL ${days*2} DAY)
     AND createdAt<DATE_SUB(NOW(),INTERVAL ${days} DAY)${filterSql}`,...params);

  const byCategory=await prisma.$queryRawUnsafe<Array<{category:string;total:bigint;sent:bigint;failed:bigint;opened:bigint;clicked:bigint}>>(
    `SELECT category,COUNT(*) total,SUM(status='SENT') sent,SUM(status='FAILED') failed,SUM(openCount>0) opened,SUM(clickCount>0) clicked
     FROM platform_email_log WHERE createdAt>=DATE_SUB(NOW(),INTERVAL ${days} DAY)${filters.source ? " AND source=?" : ""}
     GROUP BY category ORDER BY total DESC`,...(filters.source?[filters.source]:[]));

  const bySource=await prisma.$queryRawUnsafe<Array<{source:string|null;total:bigint;sent:bigint;failed:bigint;opened:bigint;clicked:bigint}>>(
    `SELECT source,COUNT(*) total,SUM(status='SENT') sent,SUM(status='FAILED') failed,SUM(openCount>0) opened,SUM(clickCount>0) clicked
     FROM platform_email_log WHERE createdAt>=DATE_SUB(NOW(),INTERVAL ${days} DAY)${filters.category ? " AND category=?" : ""}
     GROUP BY source ORDER BY total DESC`,...(filters.category?[filters.category]:[]));

  const daily=await prisma.$queryRawUnsafe<Array<{day:string;sent:bigint;opened:bigint;clicked:bigint;failed:bigint}>>(
    `SELECT DATE_FORMAT(createdAt,'%Y-%m-%d') day,SUM(status='SENT') sent,SUM(openCount>0) opened,
      SUM(clickCount>0) clicked,SUM(status='FAILED') failed
     FROM platform_email_log WHERE createdAt>=DATE_SUB(NOW(),INTERVAL ${days} DAY)${filterSql}
     GROUP BY DATE(createdAt) ORDER BY DATE(createdAt) ASC`,...params);

  const failureReasons=await prisma.$queryRawUnsafe<Array<{reason:string;total:bigint}>>(
    `SELECT CASE
      WHEN LOWER(COALESCE(errorMessage,'')) REGEXP 'auth|authentication|credentials|login' THEN 'Authentication'
      WHEN LOWER(COALESCE(errorMessage,'')) REGEXP 'invalid recipient|recipient.*invalid|mailbox.*not found|user unknown|no such user' THEN 'Invalid recipient'
      WHEN LOWER(COALESCE(errorMessage,'')) REGEXP 'rate limit|too many|throttl' THEN 'Rate limited'
      WHEN LOWER(COALESCE(errorMessage,'')) REGEXP 'timeout|timed out|connection|econn|socket' THEN 'Connection'
      WHEN LOWER(COALESCE(errorMessage,'')) REGEXP 'spam|reputation|blocked|blacklist|rejected' THEN 'Reputation / blocked'
      WHEN LOWER(COALESCE(errorMessage,'')) REGEXP 'configuration|configured|smtp' THEN 'Configuration'
      ELSE 'Other' END reason,COUNT(*) total
     FROM platform_email_log WHERE status='FAILED'
     AND createdAt>=DATE_SUB(NOW(),INTERVAL ${days} DAY)${filterSql}
     GROUP BY reason ORDER BY total DESC`,...params);

  const recent=await prisma.$queryRawUnsafe<Array<{id:string;recipient:string;subject:string;category:string;source:string|null;status:string;sentAt:Date|null;openedAt:Date|null;clickedAt:Date|null;openCount:number;clickCount:number;errorMessage:string|null;createdAt:Date}>>(
    `SELECT id,recipient,subject,category,source,status,sentAt,openedAt,clickedAt,openCount,clickCount,errorMessage,createdAt
     FROM platform_email_log WHERE createdAt>=DATE_SUB(NOW(),INTERVAL ${days} DAY)${filterSql}
     ORDER BY createdAt DESC LIMIT 50`,...params);

  const categories=await prisma.$queryRawUnsafe<Array<{category:string}>>(`SELECT DISTINCT category FROM platform_email_log ORDER BY category ASC`);
  const sources=await prisma.$queryRawUnsafe<Array<{source:string|null}>>(`SELECT DISTINCT source FROM platform_email_log WHERE source IS NOT NULL ORDER BY source ASC`);

  const x=totals[0],p=previous[0];
  return{
    days,filters:{category:filters.category||null,source:filters.source||null},
    total:toNum(x?.total),sent:toNum(x?.sent),failed:toNum(x?.failed),opened:toNum(x?.opened),clicked:toNum(x?.clicked),
    totalOpens:toNum(x?.totalOpens),totalClicks:toNum(x?.totalClicks),
    previous:{total:toNum(p?.total),sent:toNum(p?.sent),failed:toNum(p?.failed),opened:toNum(p?.opened),clicked:toNum(p?.clicked)},
    byCategory:byCategory.map(v=>({...v,total:toNum(v.total),sent:toNum(v.sent),failed:toNum(v.failed),opened:toNum(v.opened),clicked:toNum(v.clicked)})),
    bySource:bySource.map(v=>({...v,source:v.source||"unknown",total:toNum(v.total),sent:toNum(v.sent),failed:toNum(v.failed),opened:toNum(v.opened),clicked:toNum(v.clicked)})),
    daily:daily.map(v=>({day:v.day,sent:toNum(v.sent),opened:toNum(v.opened),clicked:toNum(v.clicked),failed:toNum(v.failed)})),
    failureReasons:failureReasons.map(v=>({reason:v.reason,total:toNum(v.total)})),
    recent,categories:categories.map(v=>v.category),sources:sources.map(v=>v.source).filter(Boolean) as string[],
  };
}

export async function emailLogById(id:string){
  await ensureEmailAnalyticsTable();
  const rows=await prisma.$queryRawUnsafe<Array<{id:string;recipient:string;subject:string;category:string;source:string|null;status:string;textBody:string|null;htmlBody:string|null;sentAt:Date|null;createdAt:Date}>>(
    `SELECT id,recipient,subject,category,source,status,textBody,htmlBody,sentAt,createdAt FROM platform_email_log WHERE id=? LIMIT 1`,id);
  return rows[0]||null;
}
