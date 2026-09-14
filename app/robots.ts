import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/login", "/signup"],
      disallow: ["/dashboard/", "/onboarding/", "/api/", "/widget-test/"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
