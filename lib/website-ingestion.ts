import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_PAGES = 8;
const MAX_HTML_BYTES = 5_000_000;
const MAX_TEXT_CHARS = 40_000;

export type CrawledPage = {
  url: string;
  title: string;
  content: string;
};

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = ip.toLowerCase();
  return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
}

async function assertSafeUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP/HTTPS websites can be scanned.");
  if (url.username || url.password) throw new Error("Website URLs with credentials are not allowed.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("Local websites cannot be scanned.");
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error("Private or local network addresses cannot be scanned.");
  return url;
}

async function readHtmlLimited(response: Response) {
  if (!response.body) {
    const html = await response.text();
    return Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES
      ? html.slice(0, MAX_HTML_BYTES)
      : html;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let html = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      const remaining = MAX_HTML_BYTES - totalBytes;
      if (remaining <= 0) break;

      const chunk =
        value.byteLength > remaining ? value.slice(0, remaining) : value;

      totalBytes += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });

      if (value.byteLength > remaining || totalBytes >= MAX_HTML_BYTES) break;
    }
  } finally {
    if (totalBytes >= MAX_HTML_BYTES) {
      try {
        await reader.cancel();
      } catch {}
    }
  }

  html += decoder.decode();
  return html;
}

async function fetchHtml(url: URL, allowedHostname: string) {
  let current = url;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    await assertSafeUrl(current.toString());
    if (current.hostname.toLowerCase() !== allowedHostname) throw new Error("Cross-domain redirects are not allowed.");

    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "AARYVO-KnowledgeBot/0.1" },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website returned an invalid redirect.");
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) throw new Error("The page is not HTML.");
    const html = await readHtmlLimited(response);
    if (!html.trim()) throw new Error("The page returned no readable HTML.");
    return { html, finalUrl: current };
  }
  throw new Error("Website redirected too many times.");
}

function parsePage(html: string, pageUrl: URL) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, canvas").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || pageUrl.pathname || "Website page";
  const content = $("main").text().trim() || $("body").text().trim();
  const clean = content.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);

  const links = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const link = new URL(href, pageUrl);
      link.hash = "";
      if (link.protocol === pageUrl.protocol && link.hostname === pageUrl.hostname) {
        const path = link.pathname.toLowerCase();
        const useful = path === "/" || /(about|service|solution|product|pricing|faq|contact|project|portfolio|collection)/.test(path);
        if (useful) links.add(link.toString());
      }
    } catch {}
  });

  return { title, content: clean, links: [...links] };
}

export async function crawlWebsite(input: string): Promise<CrawledPage[]> {
  const root = await assertSafeUrl(input);
  root.hash = "";
  const allowedHostname = root.hostname.toLowerCase();
  const queue = [root.toString()];
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];

  while (queue.length && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    try {
      const target = await assertSafeUrl(next);
      if (target.hostname.toLowerCase() !== allowedHostname) continue;
      const { html, finalUrl } = await fetchHtml(target, allowedHostname);
      const parsed = parsePage(html, finalUrl);
      if (parsed.content.length >= 80) pages.push({ url: finalUrl.toString(), title: parsed.title.slice(0, 250), content: parsed.content });
      for (const link of parsed.links) if (!visited.has(link) && queue.length < 30) queue.push(link);
    } catch (error) {
      if (pages.length === 0 && queue.length === 0) throw error;
    }
  }

  if (!pages.length) throw new Error("AARYVO could not extract usable content from this website.");
  return pages;
}
