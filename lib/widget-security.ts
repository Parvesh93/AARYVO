type RateEntry = { count: number; resetAt: number };

const globalForWidgetSecurity = globalThis as unknown as {
  aaryvoWidgetRateLimits?: Map<string, RateEntry>;
};

const buckets = globalForWidgetSecurity.aaryvoWidgetRateLimits ?? new Map<string, RateEntry>();
if (process.env.NODE_ENV !== "production") globalForWidgetSecurity.aaryvoWidgetRateLimits = buckets;

export function corsHeadersFor(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedWidgetOrigin(request: Request, websiteUrl: string | null) {
  const requestOrigin = normalizeOrigin(request.headers.get("origin"));
  if (!requestOrigin) return false;

  const allowed = new Set<string>();
  const websiteOrigin = normalizeOrigin(websiteUrl);
  if (websiteOrigin) {
    allowed.add(websiteOrigin);
    try {
      const url = new URL(websiteOrigin);
      if (url.hostname.startsWith("www.")) {
        allowed.add(`${url.protocol}//${url.hostname.slice(4)}${url.port ? `:${url.port}` : ""}`.toLowerCase());
      } else {
        allowed.add(`${url.protocol}//www.${url.hostname}${url.port ? `:${url.port}` : ""}`.toLowerCase());
      }
    } catch {}
  }

  const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (appOrigin) allowed.add(appOrigin);

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }

  return allowed.has(requestOrigin);
}

export function rateLimitWidget(request: Request, scope: string, limit: number, windowMs: number) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (current.count >= limit) return { allowed: false, remaining: 0 };
  current.count += 1;
  buckets.set(key, current);
  return { allowed: true, remaining: Math.max(0, limit - current.count) };
}
