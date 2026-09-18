import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const headers = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cache-Control": "public, max-age=300, must-revalidate",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function GET() {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "widget.js"), "utf8");
    return new Response(file, { status: 200, headers });
  } catch (error) {
    console.error("AARYVO widget script delivery error", error);
    return new Response("/* AARYVO widget unavailable */", {
      status: 500,
      headers: { ...headers, "Cache-Control": "no-store" },
    });
  }
}
