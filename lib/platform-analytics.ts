import { prisma } from "@/lib/prisma";

let ready: Promise<void> | null = null;
export function ensurePlatformAnalyticsTables(){
  if(!ready) ready=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS platform_pageview (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      visitorId VARCHAR(191) NOT NULL,
      sessionId VARCHAR(191) NOT NULL,
      path VARCHAR(500) NOT NULL,
      referrer VARCHAR(1000) NULL,
      utmSource VARCHAR(191) NULL,
      utmMedium VARCHAR(191) NULL,
      utmCampaign VARCHAR(191) NULL,
      utmContent VARCHAR(191) NULL,
      utmTerm VARCHAR(191) NULL,
      userAgent VARCHAR(1000) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_platform_pageview_createdAt (createdAt),
      INDEX idx_platform_pageview_visitorId (visitorId),
      INDEX idx_platform_pageview_sessionId (sessionId),
      INDEX idx_platform_pageview_path (path(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    /* Remove Hostinger/LiteSpeed cache query strings recorded by the first tracker version. */
    await prisma.$executeRawUnsafe(`UPDATE platform_pageview SET path=SUBSTRING_INDEX(path,'?',1) WHERE path LIKE '%?LSCWP_CTRL=%' OR path LIKE '%&nocache=%'`);
  })();
  return ready;
}

export async function platformAnalyticsSummary(days=30){
  await ensurePlatformAnalyticsTables();
  const safeDays=Math.max(1,Math.min(365,Math.floor(days)));
  const rows=await prisma.$queryRawUnsafe<Array<{views:bigint;visitors:bigint;sessions:bigint}>>(`SELECT COUNT(*) views, COUNT(DISTINCT visitorId) visitors, COUNT(DISTINCT sessionId) sessions FROM platform_pageview WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`);
  const topPages=await prisma.$queryRawUnsafe<Array<{path:string;views:bigint}>>(`SELECT path,COUNT(*) views FROM platform_pageview WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY) GROUP BY path ORDER BY views DESC LIMIT 8`);
  const daily=await prisma.$queryRawUnsafe<Array<{day:string;views:bigint;visitors:bigint}>>(`SELECT DATE_FORMAT(createdAt,'%Y-%m-%d') day,COUNT(*) views,COUNT(DISTINCT visitorId) visitors FROM platform_pageview WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY) GROUP BY DATE(createdAt) ORDER BY DATE(createdAt)`);
  return {views:Number(rows[0]?.views||0),visitors:Number(rows[0]?.visitors||0),sessions:Number(rows[0]?.sessions||0),topPages:topPages.map(r=>({...r,views:Number(r.views)})),daily:daily.map(r=>({...r,views:Number(r.views),visitors:Number(r.visitors)}))};
}
