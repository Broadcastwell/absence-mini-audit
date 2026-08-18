/**
 * Exercises the rate limiter and the spend cap against a fake key-value store
 * and a fake upstream, including deliberate over-limit attempts on all three
 * counters.
 *
 * Run: node tests/limits.test.mjs
 */

import audit from "../lib/audit.js";

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
  return new Response(JSON.stringify(upstreamPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

// The complete set of strings a caller may ever be shown. A refusal that is not
// one of these is a leak, whatever it says.
const PUBLISHED = [
  "Check the category and address and try again.",
  "That does not look like an address we can send to.",
  "That is one result per address per day. Try again tomorrow.",
  "That is three results per network per day. Try again tomorrow.",
  "The mini-audit is at its limit for today. Try again tomorrow.",
  "Something went wrong on our side. Try again later.",
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
  check("response carries exactly six keys", keys === "asked,chapter,engine,measured_on,named,tier", keys);
  check("upstream extra fields do not leak", !("secret_internal_field" in r.payload), keys);
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

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
