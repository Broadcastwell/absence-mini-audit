/**
 * Exercises the rate limiter and the spend cap against a fake key-value store
 * and a fake upstream, including deliberate over-limit attempts on all three
 * counters.
 *
 * Run: node tests/limits.test.mjs
 */

import audit from "../lib/audit.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(key, type) {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
  };
}

function makeEnv(limits) {
  return {
    AUDIT: fakeKV(limits ? { "config:limits": JSON.stringify(limits) } : {}),
    UPSTREAM_URL: "https://upstream.invalid/run",
    UPSTREAM_TOKEN: "test-token",
    ASSETS: { fetch: async () => new Response("front end", { status: 200 }) },
  };
}

function post(body, ip = "203.0.113.7") {
  return new Request("https://audit.broadcastwell.com/api/run", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

let upstreamCalls = 0;
let upstreamMode = "ok";
let upstreamPayload = {
  named: 2,
  asked: 10,
  tier: "named 1 to 3",
  chapter: "/category-door/",
  engine: "Perplexity",
  measured_on: "2026-08-18",
  secret_internal_field: "must not leak",
};
globalThis.fetch = async () => {
  upstreamCalls += 1;
  if (upstreamMode === "throw") throw new TypeError("network unreachable");
  if (upstreamMode === "timeout") {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  }
  if (upstreamMode === "status") {
    return new Response("upstream detail that must never be shown", { status: 500 });
  }
  if (upstreamMode === "not_json") {
    return new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } });
  }
  return new Response(JSON.stringify(upstreamPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

// The complete set of strings a caller may ever be shown. A refusal that is not
// one of these is a leak, whatever it says.
const PUBLISHED = [
  "Check the category and address and try again.",
  "That does not look like a valid email address.",
  "You have already run today's check for this address. Read the chapter your result pointed to, or request the AI Visibility Diagnostic.",
  "This network has reached its daily check limit. Try again tomorrow.",
  "Today's runs are full. Come back after 00:00 UTC, or request the AI Visibility Diagnostic.",
  "We could not complete this run. Your daily check has not been used. Try again in a few minutes, or email hello@broadcastwell.com.",
];

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || "" });
}

async function call(env, body, ip) {
  const response = await audit.fetch(post(body, ip), env, {});
  const payload = await response.json();
  return { status: response.status, payload };
}

const body = (n) => ({ category: "field service management software", company: "example.com", email: `person${n}@example.com` });

// per address per day
{
  const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 99, global_per_day: 99 });
  const first = await call(env, body(1));
  const second = await call(env, body(1));
  check("address limit: first request allowed", first.status === 200, `status ${first.status}`);
  check("address limit: second request refused", second.status === 429, `status ${second.status}`);
  check("address limit: refusal is one of the published strings", PUBLISHED.indexOf(second.payload.message) !== -1, second.payload.message);
}

// per IP per day
{
  const env = makeEnv({ per_address_per_day: 9, per_ip_per_day: 3, global_per_day: 99 });
  const statuses = [];
  for (let i = 1; i <= 4; i++) statuses.push((await call(env, body(i), "198.51.100.4")).status);
  check("ip limit: first three allowed", statuses.slice(0, 3).every((s) => s === 200), statuses.join(","));
  check("ip limit: fourth refused", statuses[3] === 429, statuses.join(","));
}

// global spend cap
{
  const env = makeEnv({ per_address_per_day: 9, per_ip_per_day: 99, global_per_day: 2 });
  const before = upstreamCalls;
  const statuses = [];
  for (let i = 1; i <= 3; i++) statuses.push((await call(env, body(100 + i), `203.0.113.${i}`)).status);
  check("global cap: first two allowed", statuses.slice(0, 2).every((s) => s === 200), statuses.join(","));
  check("global cap: third refused with 503", statuses[2] === 503, statuses.join(","));
  check("global cap: refusal costs no upstream call", upstreamCalls - before === 2, `upstream calls ${upstreamCalls - before}`);
}

// the response contract
{
  const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 9, global_per_day: 9 });
  const r = await call(env, body(200));
  const keys = Object.keys(r.payload).sort().join(",");
  check("response carries the public result keys", keys === "asked,chapter,engine,measured_on,named,questions,tier", keys);
  check("upstream extra fields do not leak", !("secret_internal_field" in r.payload), keys);
  check("missing question detail remains an empty public list", Array.isArray(r.payload.questions) && r.payload.questions.length === 0, JSON.stringify(r.payload.questions));
}

// Public per-question detail is retained only in the narrow expected shape.
{
  const saved = upstreamPayload;
  upstreamPayload = Object.assign({}, saved, {
    questions: Array.from({ length: 10 }, (_, index) => ({ question: `Buyer question ${index + 1}`, status: index < 2 ? "named" : "not named", internal: "never leak" })),
  });
  const env = makeEnv({ per_address_per_day: 9, per_ip_per_day: 99, global_per_day: 99 });
  const r = await call(env, body(350), "192.0.2.10");
  check("ten public question statuses are retained", r.status === 200 && r.payload.questions.length === 10 && r.payload.questions[0].status === "named", JSON.stringify(r.payload.questions));
  check("question internals do not leak", !("internal" in r.payload.questions[0]), JSON.stringify(r.payload.questions[0]));
  upstreamPayload = saved;
}

// input validation
{
  const env = makeEnv(null);
  const bad = await call(env, { category: "", company: "", email: "nope" });
  check("empty input refused", bad.status === 400, `status ${bad.status}`);
  const badEmail = await call(env, { category: "x", company: "y", email: "not-an-address" });
  check("malformed address refused", badEmail.status === 400, `status ${badEmail.status}`);
}

// defaults when the store holds no config
{
  const env = makeEnv(null);
  const first = await call(env, body(300), "192.0.2.9");
  const second = await call(env, body(300), "192.0.2.9");
  check("defaults apply with no config record", first.status === 200 && second.status === 429, `${first.status},${second.status}`);
}

// the two allow-lists
{
  const saved = upstreamPayload;
  upstreamPayload = Object.assign({}, saved, { tier: "doing great" });
  const env = makeEnv({ per_address_per_day: 9, per_ip_per_day: 99, global_per_day: 99 });
  const r = await call(env, body(400), "192.0.2.20");
  check("an unrecognised ladder position is refused", r.status === 502, `status ${r.status}`);

  upstreamPayload = Object.assign({}, saved, { chapter: "https://elsewhere.example/" });
  const r2 = await call(env, body(401), "192.0.2.21");
  check("an off-manual chapter link is refused", r2.status === 502, `status ${r2.status}`);
  upstreamPayload = saved;
}

// A run that returns no result must not spend the visitor's daily allowance.
// Each case reproduces one of the five ways the upstream can fail.
{
  const counted = (env) => ({
    address: env.AUDIT.store.get("count:addr:" + new Date().toISOString().slice(0, 10) + ":person500@example.com"),
    global: env.AUDIT.store.get("count:global:" + new Date().toISOString().slice(0, 10)),
  });

  const cases = [
    ["upstream refused the connection", "throw"],
    ["upstream timed out", "timeout"],
    ["upstream answered with an error status", "status"],
    ["upstream answered with something that is not JSON", "not_json"],
  ];

  for (const [label, mode] of cases) {
    const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 3, global_per_day: 100 });
    upstreamMode = mode;
    const failed = await call(env, { category: "field service management software", company: "example.com", email: "person500@example.com" }, "198.51.100.90");
    const after = counted(env);
    check(`${label}: caller sees 502`, failed.status === 502, `status ${failed.status}`);
    check(`${label}: refusal is one of the published strings`, PUBLISHED.indexOf(failed.payload.message) !== -1, failed.payload.message);
    check(`${label}: no upstream detail reaches the caller`, !/gateway|upstream detail|network unreachable|timed out/i.test(JSON.stringify(failed.payload)), JSON.stringify(failed.payload));
    check(`${label}: the address allowance is given back`, after.address === "0" || after.address === undefined, `counter ${after.address}`);
    check(`${label}: the global allowance is given back`, after.global === "0" || after.global === undefined, `counter ${after.global}`);

    upstreamMode = "ok";
    const retry = await call(env, { category: "field service management software", company: "example.com", email: "person500@example.com" }, "198.51.100.90");
    check(`${label}: the same address can run again the same day`, retry.status === 200, `status ${retry.status}`);
  }
}

// A result the allow-lists refuse is also a run that returned nothing.
{
  const saved = upstreamPayload;
  upstreamPayload = Object.assign({}, saved, { tier: "doing great" });
  const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 3, global_per_day: 100 });
  const refused = await call(env, { category: "x software", company: "example.com", email: "person501@example.com" }, "198.51.100.91");
  check("an off-list result gives the allowance back", refused.status === 502 && (env.AUDIT.store.get("count:global:" + new Date().toISOString().slice(0, 10)) === "0"), `status ${refused.status}`);
  upstreamPayload = saved;
  const retry = await call(env, { category: "x software", company: "example.com", email: "person501@example.com" }, "198.51.100.91");
  check("the address refused by the allow-list can run again the same day", retry.status === 200, `status ${retry.status}`);
}

// A refusal at a limit gate must not spend a different counter either.
{
  const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 3, global_per_day: 100 });
  const day = new Date().toISOString().slice(0, 10);
  await call(env, { category: "x software", company: "example.com", email: "person600@example.com" }, "198.51.100.92");
  const globalAfterFirst = env.AUDIT.store.get("count:global:" + day);
  const refused = await call(env, { category: "x software", company: "example.com", email: "person600@example.com" }, "198.51.100.92");
  check("a second run for one address is refused", refused.status === 429, `status ${refused.status}`);
  check("the refused second run does not spend the global cap", env.AUDIT.store.get("count:global:" + day) === globalAfterFirst, `global ${env.AUDIT.store.get("count:global:" + day)} was ${globalAfterFirst}`);
}

// No user-visible string names the paid product by a retired name.
{
  const strings = Object.values(PUBLISHED).join("\n");
  check("no published refusal uses a retired product name", !/four-engine audit|Four-Engine AI Visibility Audit|four-engine Diagnostic/i.test(strings), "name scan");
}

function publicFiles(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? publicFiles(path) : [path];
  });
}

// Static-public copy and palette rules that protect the shared visual system.
const TEXT_FILE = /\.(?:html|css|js|mjs|svg|txt|json|xml)$/i;
{
  const textPaths = publicFiles(fileURLToPath(new URL("../public/", import.meta.url))).filter((path) => TEXT_FILE.test(path));
  const copy = textPaths.map((path) => readFileSync(path, "utf8")).join("\n");
  check("public copy contains no banned dash characters", !/[\u2013\u2014]|&(?:mdash|ndash|#8211|#8212);/i.test(copy), "dash scan");
  check("public copy has no independent dark-mode switch", !/prefers-color-scheme\s*:\s*dark/i.test(copy), "theme scan");
  check("public copy keeps the user-visible engine free of model strings", !/sonar-pro/i.test(copy), "model scan");
  // The dark theme values are the ones the marketing site serves: ground, raised panel, heading, body and muted text.
  const allowedColours = new Set([
    "#111827", "#475569", "#BFDBFE", "#1D4ED8", "#3B82F6", "#EFF6FF", "#FFFFFF", "#94A3B8", "#1E40AF",
    "#0A0A0B", "#0A0E1A", "#F8FAFC", "#CBD5E1"
  ]);
  const colours = [...copy.matchAll(/#[0-9a-f]{6}/gi)].map((match) => match[0].toUpperCase());
  check("public copy uses only the approved blue and neutral palette", colours.every((colour) => allowedColours.has(colour)), colours.join(","));
}

// The audit tool sits on the dark token set, and its copy carries the offer the site publishes today.
{
  const page = readFileSync(fileURLToPath(new URL("../public/index.html", import.meta.url)), "utf8");
  check("the page ground and body text are the dark tokens", /--ground:\s*#0A0A0B/i.test(page) && /--ink:\s*#F8FAFC/i.test(page) && /--body:\s*#CBD5E1/i.test(page), "token scan");
  check("no light ground survives on the page", !/background:\s*#FFFFFF/i.test(page) && !/--paper:/i.test(page), "light ground scan");
  check("the running state states the wait", page.includes("Running. Usually under a minute."), "running copy");
  check("the running state is announced politely", /id="working"[^>]*aria-live="polite"/.test(page), "aria-live");
  check("the result and the refusal both scroll into view", (page.match(/scrollIntoView/g) || []).length >= 3, "scrollIntoView");
  check("the retention line is on the page twice", (page.match(/keep it for 24 months and then delete it/g) || []).length === 2, "retention line");
  check("the free offer is not named with a retired name", !/Free check|free audit|instant check|four-engine audit/i.test(page), "offer name scan");
  check("the paid path names the offer in full and points at the one request route", /Request the AI Visibility Diagnostic/.test(page) && (page.match(/tally\.so\/r\/J9xpbK/g) || []).length === 2, "paid path");
  check("the engine may be named and no model string appears", /Named engine: Perplexity/.test(page), "engine naming");
  check("the social card is a PNG at 1200 by 630", /og:image"\s+content="[^"]+\.png"/.test(page) && /og:image:width"\s+content="1200"/.test(page) && /og:image:height"\s+content="630"/.test(page), "social card");
  check("the social card file exists at the declared size", (() => {
    const png = readFileSync(fileURLToPath(new URL("../public/assets/absence-mini-audit-2026-09.png", import.meta.url)));
    return png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630;
  })(), "png header");
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
