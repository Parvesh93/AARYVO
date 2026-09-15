import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/refund-policy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/cancellation-policy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/shipping-policy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
