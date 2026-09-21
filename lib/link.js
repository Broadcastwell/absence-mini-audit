/**
 * Result links. Made only when a visitor asks for one, from a result this handler sealed.
 *
 * POST /api/link stores the result under an unguessable id (128 random bits, 32 hex
 * characters) for 30 days, then the key-value store deletes it on its own. The record holds
 * what the wheel shows and nothing else: company name, website, category, the seven result
 * keys, the creation and expiry dates. No email, no address, no network, nothing about the
 * visitor.
 *
 * GET /r/<id> serves the page itself with the stored result placed in it as data, marked
 * noindex, with the same security headers as the static page. A missing or expired id gets
 * the same page with a plain "this link has expired" state and a 404.
 */

import { sealKey, verify, cleanBrand } from "./seal.js";
import { TIERS, CHAPTERS } from "./audit.js";
import { PAGE_HEADERS } from "./headers.js";

export const LINK_TTL_DAYS = 30;
const LIMITS_KEY = "config:limits";
export const LINK_DEFAULTS = { link_per_ip_per_day: 10, link_global_per_day: 40 };
const STATUSES = ["named", "not named", "not itemised", "answer unavailable"];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" },
  });
}

function day(offsetDays) {
  return new Date(Date.now() + (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
}

function secondsUntilTomorrow() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(60, Math.floor((midnight - now) / 1000));
}

export function newId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Keep only the seven public keys, in their public shapes. Anything else is refused. */
export function cleanResult(result) {
  if (!result || typeof result !== "object") return null;
  const named = Number(result.named), asked = Number(result.asked);
  if (!Number.isInteger(named) || asked !== 10 || named < 0 || named > asked) return null;
  if (TIERS.indexOf(result.tier) === -1 || CHAPTERS.indexOf(result.chapter) === -1) return null;
  if (typeof result.engine !== "string" || result.engine.length > 60) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(result.measured_on))) return null;
  const questions = Array.isArray(result.questions) ? result.questions : [];
  if (questions.length !== 0 && questions.length !== 10) return null;
  const rows = questions.map((row) => ({ question: String((row && row.question) || "").slice(0, 500), status: String((row && row.status) || "") }));
  if (rows.some((row) => !row.question || STATUSES.indexOf(row.status) === -1)) return null;
  return { named: named, asked: asked, tier: result.tier, chapter: result.chapter, engine: result.engine, measured_on: String(result.measured_on), questions: rows };
}

async function counted(env, key, cap, ttl) {
  const current = parseInt((await env.AUDIT.get(key)) || "0", 10);
  if (current >= cap) return false;
  await env.AUDIT.put(key, String(current + 1), { expirationTtl: ttl });
  return true;
}

export async function link(request, env, options) {
  const preview = options && options.preview;
  let payload;
  try { payload = await request.json(); } catch (_) { return json({ message: "The link could not be created.", reason: "input" }, 400); }
  // The same trimming the run applied before it sealed, so the seal compares like with like.
  const category = String((payload && payload.category) || "").trim().slice(0, 120);
  const company = String((payload && payload.website) || "").trim().slice(0, 120);
  const brand = cleanBrand(payload && payload.brand);
  const result = cleanResult(payload && payload.result);
  if (!category || !company || !result) return json({ message: "The link could not be created.", reason: "input" }, 400);

  const key = await sealKey(env, preview);
  if (!(await verify(key, brand, category, company, payload.result, payload.seal))) {
    return json({ message: "A link can only be made for a result this page produced. Run the check again to make one.", reason: "seal" }, 400);
  }
  if (!env || !env.AUDIT) return json({ message: "Result links are not available right now.", reason: "unavailable" }, 503);

  const stored = await env.AUDIT.get(LIMITS_KEY, "json");
  const cfg = Object.assign({}, LINK_DEFAULTS, stored || {});
  const today = day(0), ttl = secondsUntilTomorrow();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipKey = `count:link:ip:${today}:${ip}`;
  const ipCount = parseInt((await env.AUDIT.get(ipKey)) || "0", 10);
  if (ipCount >= cfg.link_per_ip_per_day) return json({ message: "This network has made enough result links for today.", reason: "network" }, 429);
  if (!(await counted(env, `count:link:global:${today}`, cfg.link_global_per_day, ttl))) return json({ message: "Result links are paused for today. Save an image instead.", reason: "global" }, 503);
  await env.AUDIT.put(ipKey, String(ipCount + 1), { expirationTtl: ttl });

  const id = newId();
  const record = { v: 1, id: id, brand: brand, category: category, website: company, result: result, created_on: today, expires_on: day(LINK_TTL_DAYS) };
  await env.AUDIT.put("link:" + id, JSON.stringify(record), { expirationTtl: LINK_TTL_DAYS * 86400 });
  return json({ id: id, url: new URL("/r/" + id, request.url).toString(), expires_on: record.expires_on, reference: "fc_" + id }, 200);
}

function embed(record) {
  return JSON.stringify(record).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The result link page: the static page, marked noindex, with the stored result as data. */
export async function sharedPage(request, env) {
  const match = /^\/r\/([0-9a-f]{32})\/?$/.exec(new URL(request.url).pathname);
  let record = null;
  if (match && env && env.AUDIT) {
    try { record = await env.AUDIT.get("link:" + match[1], "json"); } catch (_) { record = null; }
  }
  const asset = await env.ASSETS.fetch(new Request(new URL("/", request.url).toString(), { method: "GET" }));
  let html = await asset.text();
  const data = record && record.result ? { id: record.id, brand: record.brand, category: record.category, website: record.website, result: record.result, expires_on: record.expires_on } : { expired: true };
  html = html
    .replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, nofollow">')
    .replace(/<link rel="canonical"[^>]*>\n?/, "")
    .replace(/<title>[^<]*<\/title>/, "<title>" + escapeHtml(record && record.result ? "Shortlist wheel for " + (record.brand || record.website) + " | Free 10-question check (one engine)" : "Result link expired | Free 10-question check (one engine)") + "</title>")
    .replace("</head>", '<script type="application/json" id="shared-result">' + embed(data) + "</script>\n</head>");
  const headers = new Headers(PAGE_HEADERS);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("cache-control", "private, no-store");
  return new Response(html, { status: record && record.result ? 200 : 404, headers: headers });
}
