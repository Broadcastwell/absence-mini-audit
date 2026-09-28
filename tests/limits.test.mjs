/**
 * Exercises the rate limiter and the spend cap against a fake key-value store
 * and a fake upstream, including deliberate over-limit attempts on all three
 * counters.
 *
 * Run: node tests/limits.test.mjs
 */

import audit, { previewHost } from "../lib/audit.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
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
  "You have already run today's check for this address. Read the chapter your result pointed to, or start with the $490 Category Audit.",
  "This network has reached its daily check limit. Try again tomorrow.",
  "Today's runs are full. Come back after 00:00 UTC, or start with the $490 Category Audit.",
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
  check("without upstream rows the ten questions are rebuilt from the category", Array.isArray(r.payload.questions) && r.payload.questions.length === 10 && r.payload.questions[0].question === "What is the best field service management software?" && r.payload.questions[9].question === "How can field service management software reduce manual work for an operations team?", JSON.stringify(r.payload.questions));
  check("a count between none and all marks no question either way", r.payload.questions.every((row) => row.status === "not itemised"), JSON.stringify(r.payload.questions.map((row) => row.status)));
}

// A count of none or of all settles every question's status on its own.
{
  const saved = upstreamPayload;
  for (const [named, tier, status] of [[0, "named 0 of 10", "not named"], [10, "named 7 to 10", "named"]]) {
    upstreamPayload = Object.assign({}, saved, { named: named, tier: tier });
    const env = makeEnv({ per_address_per_day: 9, per_ip_per_day: 99, global_per_day: 99 });
    const r = await call(env, body(360 + named), "192.0.2." + (20 + named));
    check("named " + named + " of 10 marks all ten questions " + status, r.status === 200 && r.payload.questions.length === 10 && r.payload.questions.every((row) => row.status === status && row.question), JSON.stringify(r.payload.questions.map((row) => row.status)));
  }
  upstreamPayload = saved;
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

// Every refusal carries the fixed reason word the page turns into its own sentence,
// and a result never carries one.
{
  const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 2, global_per_day: 3 });
  const ok = await call(env, body(700), "198.51.100.30");
  check("a result carries no reason word", ok.status === 200 && !("reason" in ok.payload), JSON.stringify(Object.keys(ok.payload)));

  const again = await call(env, body(700), "198.51.100.30");
  check("the address refusal says address", again.status === 429 && again.payload.reason === "address", String(again.payload.reason));

  const ipEnv = makeEnv({ per_address_per_day: 9, per_ip_per_day: 1, global_per_day: 9 });
  await call(ipEnv, body(701), "198.51.100.31");
  const ipRefused = await call(ipEnv, body(702), "198.51.100.31");
  check("the network refusal says network", ipRefused.status === 429 && ipRefused.payload.reason === "network", String(ipRefused.payload.reason));

  const capEnv = makeEnv({ per_address_per_day: 9, per_ip_per_day: 9, global_per_day: 1 });
  await call(capEnv, body(703), "198.51.100.32");
  const capRefused = await call(capEnv, body(704), "198.51.100.33");
  check("the daily allowance refusal says global", capRefused.status === 503 && capRefused.payload.reason === "global", String(capRefused.payload.reason));

  const failing = makeEnv({ per_address_per_day: 9, per_ip_per_day: 9, global_per_day: 9 });
  upstreamMode = "status";
  const unavailable = await call(failing, body(705), "198.51.100.34");
  upstreamMode = "ok";
  check("a run that returned nothing says unavailable", unavailable.status === 502 && unavailable.payload.reason === "unavailable", String(unavailable.payload.reason));

  const badInput = await call(failing, { category: "", company: "", email: "x@example.com" }, "198.51.100.35");
  check("a refused input says input", badInput.status === 400 && badInput.payload.reason === "input", String(badInput.payload.reason));
  const badEmail = await call(failing, { category: "x", company: "y", email: "nope" }, "198.51.100.36");
  check("a refused address says email", badEmail.status === 400 && badEmail.payload.reason === "email", String(badEmail.payload.reason));

  const words = ["input", "email", "address", "network", "global", "unavailable"];
  const source = readFileSync(fileURLToPath(new URL("../lib/audit.js", import.meta.url)), "utf8");
  const declared = [...source.matchAll(/^  [a-z_]+: "([a-z]+)",$/gm)].map((match) => match[1]);
  check("the reason words are a closed set", declared.every((word) => words.indexOf(word) !== -1), declared.join(","));
}

// The acceptance double answers only on a preview alias of this project, and is refused
// by name on every host that serves a real visitor.
{
  const live = ["audit.broadcastwell.com", "absence-mini-audit.pages.dev"];
  const preview = ["code2-free-check-2026-09-16.absence-mini-audit.pages.dev", "abc123.absence-mini-audit.pages.dev", "localhost"];
  for (const host of live) {
    check("the double is refused on " + host, previewHost(new Request("https://" + host + "/api/run")) === false, host);
  }
  for (const host of preview) {
    check("the double answers on " + host, previewHost(new Request("https://" + host + "/api/run")) === true, host);
  }

  // No upstream address, no upstream secret and no key-value store: exactly what the
  // preview environment is, and every state still renders.
  const bare = { ASSETS: { fetch: async () => new Response("front end", { status: 200 }) } };
  const previewCall = async (state) => {
    const request = new Request("https://code2-free-check-2026-09-16.absence-mini-audit.pages.dev/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "field service management software", company: "example.com", email: "person800@example.com", state }),
    });
    const response = await audit.fetch(request, bare, {});
    return { status: response.status, payload: await response.json() };
  };
  const before = upstreamCalls;
  const started = await previewCall("");
  check("the double returns a complete result with no upstream and no store", started.status === 200 && started.payload.questions.length === 10, JSON.stringify(started.payload).slice(0, 80));
  for (const [state, status, reason] of [["address", 429, "address"], ["network", 429, "network"], ["global", 503, "global"], ["unavailable", 502, "unavailable"]]) {
    const r = await previewCall(state);
    check("the double renders the " + state + " state", r.status === status && r.payload.reason === reason, state + " " + r.status + " " + r.payload.reason);
    check("the " + state + " state is one of the published strings", PUBLISHED.indexOf(r.payload.message) !== -1, r.payload.message);
  }
  check("no state of the double calls an upstream", upstreamCalls === before, "upstream calls " + (upstreamCalls - before));

  // The same body on a live host is handled normally: the state field is ignored.
  const liveEnv = makeEnv({ per_address_per_day: 9, per_ip_per_day: 9, global_per_day: 9 });
  const liveRequest = new Request("https://audit.broadcastwell.com/api/run", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.40" },
    body: JSON.stringify({ category: "field service management software", company: "example.com", email: "person801@example.com", state: "unavailable" }),
  });
  const liveResponse = await audit.fetch(liveRequest, liveEnv, {});
  check("a live host ignores the state field and runs normally", liveResponse.status === 200, "status " + liveResponse.status);
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
    "#0A0A0B", "#0A0E1A", "#F8FAFC", "#CBD5E1",
    "#F7F9FC", "#EFF4FB", "#101828", "#475467", "#D5DDE8", "#98A2B3",
    // The one Paused state every Broadcastwell surface shares: this text on this fill.
    "#92400E", "#FEF3C7",
    // The site navy behind the wheel and the card rule of the site (release review, 26 September 2026).
    "#111727", "#E2E8F0"
  ]);
  const colours = [...copy.matchAll(/#[0-9a-f]{6}/gi)].map((match) => match[0].toUpperCase());
  check("public copy uses only the approved blue and neutral palette", colours.every((colour) => allowedColours.has(colour)), colours.join(","));
}

// The audit tool uses the shared light reading surface and the published offers.
{
  const page = readFileSync(fileURLToPath(new URL("../public/index.html", import.meta.url)), "utf8");
  check("the page uses the shared light surface and readable ink", /--bw-canvas:\s*#F7F9FC/i.test(page) && /--bw-ink:\s*#101828/i.test(page) && /--bw-muted:\s*#475467/i.test(page), "token scan");
  check("the page aliases the shared surface tokens", /--ground:\s*var\(--bw-canvas\)/.test(page) && /--body:\s*var\(--bw-muted\)/.test(page), "shared tokens");
  check("the running state states the wait", page.includes("Running. It can take up to 55 seconds."), "running copy");
  check("the running state is announced politely", /id="working"[^>]*aria-live="polite"/.test(page), "aria-live");
  check("the result and the refusal both scroll into view", (page.match(/scrollIntoView/g) || []).length >= 3, "scrollIntoView");
  check("the retention line is on the page twice", (page.match(/keep it for 24 months and then delete it/g) || []).length === 2, "retention line");
  check("the free offer is not named with a retired name", !/Free check|free audit|instant check|four-engine audit/i.test(page), "offer name scan");
  const pageBody = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
  check("the paid path names the offer in full and goes only through the site's /buy switch", /AI Visibility Diagnostic/.test(page) && (pageBody.match(/href="https:\/\/broadcastwell\.com\/buy\/audit" data-buy>/g) || []).length === 2 && !/buy\.stripe\.com/.test(page) && !/\/buy\/diagnostic/.test(page) && !/ai-visibility-audit#request/.test(page) && !/tally\.so/.test(page), "paid path");
  check("the Diagnostic is shown Paused, with the shared line and no button of its own", /<span class="paused">Paused<\/span> The Diagnostic reopens after our next Audit delivery\. Start with the \$490 Category Audit; it credits in full within 30 days\./.test(pageBody) && !/Get the Diagnostic/.test(page), "paused");
  check("no purchase control is a mailto", !/<a [^>]*href="mailto:[^"]*"[^>]*>[^<]*(\$490|\$990|Audit|Diagnostic|availability)/i.test(page), "mailto buy");
  check("the engine may be named and no model string appears", /Named engine: Perplexity/.test(page), "engine naming");
  check("both paid surfaces link to the published price ladder", (pageBody.match(/https:\/\/broadcastwell\.com\/pricing/g) || []).length === 2, "price ladder link");

  // The shell the three subdomains share with the site.
  const head = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
  const foot = page.slice(page.indexOf("<footer"), page.indexOf("</footer>"));
  check("the header carries the wordmark, both text links and the pill",
    head.includes('class="wordmark" href="https://broadcastwell.com"')
    && head.includes('href="https://broadcastwell.com/pricing">Pricing<')
    && head.includes('href="https://app.broadcastwell.com/signin">Sign in<')
    && head.includes('class="pill" href="https://broadcastwell.com/buy/audit" data-buy aria-label="Get the Category Audit, $490"><span class="pill-long">Get the Category Audit, $490</span><span class="pill-short">Get the Audit, $490</span></a>'), "header shell");
  check("the phone menu is an icon button with a name, as on the main site",
    /<summary aria-label="Open menu"><svg class="menu-icon"[^>]*aria-hidden="true"/.test(head) && !/<summary>Menu<\/summary>/.test(head) && /setAttribute\('aria-label', siteMenu\.open \? 'Close menu' : 'Open menu'\)/.test(page), "icon menu");
  check("the header repeats the filled $490 purchase control",
    /\.pill\s*\{[^}]*background:\s*var\(--blue\)/.test(page) && head.includes('href="https://broadcastwell.com/buy/audit"'), "primary offer");
  check("the footer names the free check with its one engine", foot.includes('href="https://audit.broadcastwell.com">Free 10-question check (one engine)<'), "footer label");
  check("the pill and every phone menu target clear 44 px",
    /\.pill \{[^}]*min-height: 44px/.test(page) && /\.menu summary \{[^}]*min-height: 44px/.test(page) && /\.menu-panel a \{[^}]*min-height: 44px/.test(page), "touch targets");
  check("the text links collapse behind one disclosure at phone widths and the pill stays",
    page.includes("@media (max-width: 640px) { .site-nav { display: none; } .menu { display: block; }") && !/\.pill \{ display: none/.test(page), "phone header");
  check("the footer carries the site's four columns and the bottom bar",
    ["Product", "Research", "Company", "Contact"].every((name) => foot.includes(">" + name + "</h2>"))
    && foot.includes("Broadcastwell LLC. Indiana, USA. Copyright 2026.")
    && ["privacy", "terms", "cookies"].every((slug) => foot.includes('href="https://broadcastwell.com/' + slug + '">')), "footer shell");
  check("the footer keeps this surface's own disclosure note above the columns",
    foot.indexOf("Broadcastwell is excluded from its own sample") < foot.indexOf("footer-columns"), "disclosure note");
  check("the footer columns stack below 640", page.includes(".footer-columns { grid-template-columns: 1fr;"), "footer stacking");
  check("no label on the page is set in capitals", !/text-transform:\s*uppercase/i.test(page), "sentence case");
  check("the header and footer add no third party request",
    !/<script[^>]+src=/i.test(page) && !/<link[^>]+rel="stylesheet"/i.test(page), "no third party");
  check("no retired price or offer term survives in the copy", !/\$3,000|\$6,000|\$5,000|founding|three-month minimum|three month minimum|120 observed|credited against month one|against the first month|starting at|best software in a category/i.test(page), "retired offer scan");
  check("the social card is a PNG at 1200 by 630", /og:image"\s+content="[^"]+\.png"/.test(page) && /og:image:width"\s+content="1200"/.test(page) && /og:image:height"\s+content="630"/.test(page), "social card");
  check("the result page does not invent per-question rows", !/Buyer question ' \+/.test(page) && !/answer unavailable/.test(page), "placeholder scan");
  check("the page says when a count does not itemise the questions", /id="question-note" class="small hidden"/.test(page) && /row\.status === 'not itemised'/.test(page), "question note");
  check("the question list is hidden until ten real rows arrive", /id="question-block" class="hidden"/.test(page) && /rows\.length !== 10/.test(page) && /block\.classList\.remove\('hidden'\)/.test(page), "question block");
  check("the six published response keys are the ones the page reads", ["tier", "engine", "measured_on", "named", "asked", "chapter"].every((key) => page.includes("data." + key)), "contract keys");
  check("the social card file exists at the declared size", (() => {
    const png = readFileSync(fileURLToPath(new URL("../public/assets/absence-mini-audit-2026-09.png", import.meta.url)));
    return png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630;
  })(), "png header");
}

let failed = 0;

// Response headers. public/_headers is a served file: Cloudflare Pages reads it from the
// output directory. The Content-Security-Policy names the page's one inline script and one
// inline style block by hash, so the hashes are recomputed here from public/index.html on
// every run. An edit to either block that forgets this file fails the suite rather than
// blocking the page's own script in a visitor's browser with nothing on the page to say so.
{
  const page = readFileSync(fileURLToPath(new URL("../public/index.html", import.meta.url)), "utf8");
  const headers = readFileSync(fileURLToPath(new URL("../public/_headers", import.meta.url)), "utf8");

  // The bare tag, so the structured data block (type application/ld+json, which a browser
  // never executes and script-src does not govern) is not mistaken for the page script.
  // A second bare tag of either kind still fails, because one hash cannot cover two blocks.
  const inlineBody = (tag) => {
    const openAt = page.indexOf("<" + tag + ">");
    const second = openAt < 0 ? -1 : page.indexOf("<" + tag + ">", openAt + 1);
    if (openAt < 0 || second >= 0) return null;
    const bodyAt = page.indexOf(">", openAt) + 1;
    const closeAt = page.indexOf("</" + tag + ">", bodyAt);
    return closeAt < 0 ? null : page.slice(bodyAt, closeAt);
  };
  const cspHash = (tag) => {
    const body = inlineBody(tag);
    return body === null ? null : "'sha256-" + createHash("sha256").update(body, "utf8").digest("base64") + "'";
  };

  check("the served directory carries a headers file that applies to every path", /^\/\*$/m.test(headers), "headers file");
  for (const header of [
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "X-Frame-Options: DENY",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin"
  ]) check("the headers file sends " + header.split(":")[0], headers.includes(header), "headers file");

  const policy = (/Content-Security-Policy:\s*(.+)/.exec(headers) || [])[1] || "";
  const directives = new Map(policy.split(";").map(part => part.trim()).filter(Boolean)
    .map(part => [part.split(/\s+/)[0], part.split(/\s+/).slice(1).join(" ")]));
  check("the policy starts closed", directives.get("default-src") === "'none'", "csp default-src");
  check("the policy refuses framing, base rewriting and off-site form posts",
    directives.get("frame-ancestors") === "'none'" && directives.get("base-uri") === "'none'" && directives.get("form-action") === "'self'", "csp hardening");
  check("the policy allows no inline execution wholesale",
    !policy.includes("unsafe-inline") && !policy.includes("unsafe-eval") && !policy.includes("unsafe-hashes"), "csp unsafe");
  check("the inline script is allowed by its own hash", cspHash("script") !== null && (directives.get("script-src") || "").includes(cspHash("script")), "csp script hash");
  check("the inline style block is allowed by its own hash", cspHash("style") !== null && (directives.get("style-src") || "").includes(cspHash("style")), "csp style hash");
  check("no style attribute survives, because a hash cannot cover one", !/\sstyle\s*=\s*"/.test(page), "csp style attribute");
  check("the fetch target the page uses is same origin", /fetch\('\/api\/run'/.test(page) && directives.get("connect-src") === "'self'", "csp connect-src");
  check("every host the page loads from is named in the policy", policy.includes("https://framerusercontent.com"), "csp hosts");
  // Inter is served from this origin now, so no font CDN should be reachable or named.
  check("no font CDN is loaded or allowed", !/fonts.(googleapis|gstatic).com/.test(page) && !/fonts.(googleapis|gstatic).com/.test(policy) && directives.get("font-src") === "'self'", "csp fonts");
  check("both Inter subsets are declared and shipped", (page.match(/@font-face/g) || []).length === 2 && ["inter-latin-var.woff2", "inter-latin-ext-var.woff2"].every(file => page.includes("/assets/fonts/" + file) && existsSync(fileURLToPath(new URL("../public/assets/fonts/" + file, import.meta.url)))), "self hosted faces");

  check("the started state is named and brought into view", page.includes("Your check has started") && page.includes("working.scrollIntoView"), "started state");
  check("the refusal names itself and its reason in one sentence",
    page.includes("Your check could not start") && page.includes('id="errorwhy"')
    && ["address", "network", "global", "unavailable"].every((reason) => page.includes(reason + ":")), "refused state");
  check("a run that never answers still ends in a stated outcome", page.includes("WAIT_MS") && page.includes("refuse('unavailable'); }, WAIT_MS)"), "late run");
  check("the page reads the reason word the handler sends", page.includes("outcome.data && outcome.data.reason"), "reason wiring");

  check("the content column matches the shared 1200px container", /\.container\s*\{[^}]*max-width:1200px;[^}]*padding-inline:var\(--bw-gutter\)/.test(page), "container width");

  const scriptTags = [...page.matchAll(/<script([^>]*)>/g)].map((match) => match[1].trim());
  check("every script tag is either the one hashed page script or a structured data block",
    scriptTags.filter((attributes) => attributes === "").length === 1
    && scriptTags.filter((attributes) => attributes !== "").every((attributes) => attributes === 'type="application/ld+json"'), scriptTags.join(" | "));
}

// Result before email: the run starts from the category and the website alone.
{
  const day = new Date().toISOString().slice(0, 10);
  const noEmail = (n) => ({ category: "field service management software", company: `site${n}.example` });

  const env = makeEnv({ per_address_per_day: 1, per_ip_per_day: 3, global_per_day: 100 });
  const r = await call(env, noEmail(1), "198.51.100.60");
  check("a run with no email returns a result", r.status === 200 && r.payload.tier === "named 1 to 3", `status ${r.status}`);
  check("a run with no email writes no address record", ![...env.AUDIT.store.keys()].some((key) => key.startsWith("count:addr:")), [...env.AUDIT.store.keys()].join(","));
  check("a run with no email still counts the network and the global allowance",
    env.AUDIT.store.get(`count:ip:${day}:198.51.100.60`) === "1" && env.AUDIT.store.get(`count:global:${day}`) === "1", [...env.AUDIT.store.entries()].join(";"));

  const statuses = [];
  for (let i = 2; i <= 4; i++) statuses.push((await call(env, noEmail(i), "198.51.100.60")).status);
  check("runs with no email are still refused at the network limit", statuses.join(",") === "200,200,429", statuses.join(","));

  const capEnv = makeEnv({ per_address_per_day: 9, per_ip_per_day: 9, global_per_day: 1 });
  await call(capEnv, noEmail(10), "198.51.100.61");
  const capped = await call(capEnv, noEmail(11), "198.51.100.62");
  check("runs with no email are still refused at the global cap", capped.status === 503 && capped.payload.reason === "global", `status ${capped.status}`);

  const withEmail = makeEnv({ per_address_per_day: 1, per_ip_per_day: 9, global_per_day: 9 });
  await call(withEmail, body(900), "198.51.100.63");
  check("an address that is given is still counted under the same key", withEmail.AUDIT.store.get(`count:addr:${day}:person900@example.com`) === "1", [...withEmail.AUDIT.store.keys()].join(","));

  const failing = makeEnv({ per_address_per_day: 1, per_ip_per_day: 3, global_per_day: 100 });
  upstreamMode = "status";
  const failed = await call(failing, noEmail(20), "198.51.100.64");
  upstreamMode = "ok";
  check("a failed run with no email gives the allowance back", failed.status === 502 && failing.AUDIT.store.get(`count:global:${day}`) === "0" && failing.AUDIT.store.get(`count:ip:${day}:198.51.100.64`) === "0", `status ${failed.status}`);

  let sent = null;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return savedFetch(url, init); };
  await call(makeEnv(null), noEmail(30), "198.51.100.65");
  globalThis.fetch = savedFetch;
  check("the upstream request keeps its three field shape with an empty address", sent && Object.keys(sent).sort().join(",") === "category,company,email" && sent.email === "", JSON.stringify(sent));
}

// The page: result first, one engine stated twice, a buy path at the end of the result.
{
  const page = readFileSync(fileURLToPath(new URL("../public/index.html", import.meta.url)), "utf8");
  const pageBody = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
  const formBlock = page.slice(page.indexOf('<form id="form"'), page.indexOf("</form>", page.indexOf('<form id="form"')));
  const resultBlock = page.slice(page.indexOf('<section id="result"'), page.indexOf("</section>", page.indexOf('class="buy-path"')));
  const script = page.slice(page.indexOf("<script>"), page.indexOf("</script>", page.indexOf("<script>")));

  check("the check form asks for the category and the website and no email", /id="category"/.test(formBlock) && /id="company"/.test(formBlock) && !/type="email"/.test(formBlock), "form fields");
  check("the run the page sends carries no email", /var payload = \{ category: [^}]+, company: [^}]+\};/.test(script) && !/payload\.email|email: document/.test(script), "payload");
  check("the optional email sits below the result and is offered for one thing",
    page.indexOf('id="email-card"') > page.indexOf('id="result"') && /id="email-card" class="card email-card hidden"/.test(page)
    && />Email me this result with its sources</.test(page) && !/id="email"[^>]*required/.test(page), "email placement");
  // The page now makes other same-origin requests (reading the website, a result link, the
  // export font), so the email path is checked directly: its handler makes no request of any
  // kind, and every request the page makes at all goes to a fixed path on this origin.
  const emailAt = script.indexOf("emailForm.addEventListener('submit'");
  const emailHandler = script.slice(emailAt, script.indexOf("\n", emailAt));
  const requestTargets = [...script.matchAll(/(?:fetch|sendBeacon)\(([^,)]*)/g)].map((match) => match[1].trim());
  check("asking for the result by email sends nothing from the page",
    /mailto:hello@broadcastwell\.com/.test(script) && emailHandler.length > 40 && /mailto:/.test(emailHandler)
    && !/fetch\(|XMLHttpRequest|sendBeacon|new Image|\.submit\(|WebSocket|EventSource/.test(emailHandler)
    && requestTargets.length >= 1 && requestTargets.every((target) => /^'\/(api|assets)\/[a-z0-9/._-]+'$/.test(target)), "no second request: " + requestTargets.join(" "));

  const oneEngine = "This check asks ten buyer questions on one engine, Perplexity, once each.";
  // The note sits under the button, so the website field and the button fit the first phone screen.
  check("the one engine is stated in the form, under the button", pageBody.indexOf(oneEngine) > pageBody.indexOf('<button id="go"') && pageBody.indexOf(oneEngine) < pageBody.indexOf("</form>"), "under the button");
  check("the one engine is stated again in the result", /This result comes from one engine, Perplexity, with one run per question\./.test(resultBlock), "in result");
  const visible = pageBody.replace(/<[^>]+>/g, " ");
  check("the five engines are named once on the page", ["ChatGPT", "Claude", "Google AI Overviews", "Google AI Mode"].every((name) => visible.split(name).length === 2), "engine names");
  // A sentence may set the free result beside the five engine products, but no sentence may
  // put five engines on the free check without naming the paid product that runs them.
  const claims = visible.split(/\.\s/).filter((sentence) => /(10-question check|this check|this result)/i.test(sentence) && /(five|5) engines/i.test(sentence) && !/Category Audit|Diagnostic/.test(sentence));
  check("no sentence gives the free 10-question check more than one engine", claims.length === 0, claims.join(" | "));

  const fullResult = page.slice(page.indexOf('<section id="result"'), page.indexOf('<section id="email-card"'));
  const buyAt = fullResult.indexOf('class="buy-path"');
  const buy = fullResult.slice(buyAt, fullResult.indexOf('id="keep"'));
  check("the buy path follows the questions and comes before the keep and share block", buyAt > fullResult.indexOf('id="question-block"') && buyAt < fullResult.indexOf('id="keep"'), "buy path place");
  check("the buy path leads with one engine against five", /<h3 id="buy-title">One engine, one run\. Your buyers use five\.<\/h3>/.test(buy) && /The \$490 Category Audit asks these ten questions on ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode, three measured runs each\./.test(buy), "buy sentence");
  check("the buy path has one priced button, then the terms and the sample link",
    /<div class="buy-actions"><a class="cta cta-filled" href="https:\/\/broadcastwell\.com\/buy\/audit" data-buy>Run it on all five engines, \$490<\/a><\/div><p class="small flush">Findings within 48 hours of category confirmation\. Refundable in full within 30 days of delivery\. The full \$490 credits against the Diagnostic within 30 days\.<\/p>/.test(buy)
    && (buy.match(/class="cta /g) || []).length === 1 && /app\.broadcastwell\.com\/sample">See a sample account<\/a>/.test(buy), "buy path order");
  const filledOffers = [...pageBody.matchAll(/<a class="cta cta-filled" href="([^"]+)"/g)];
  check("every filled purchase button is the $490 Category Audit", filledOffers.length === 2 && filledOffers.every(match => match[1] === 'https://broadcastwell.com/buy/audit') && !/class="[^"]*\bprimary\b[^"]*"[^>]*href=/.test(pageBody), "one primary kind");
  check("the submit is filled before a result and steps down once one is shown",
    /<button id="go" class="primary" type="submit">/.test(page) && /\.primary\.settled \{[^}]*background: transparent/.test(page)
    && /settle\(true\)/.test(script) && /go\.classList\.remove\('settled'\)/.test(script) && /refuse\(reason, message\) \{ stopProgress\(\); hide\(working\); settle\(false\)/.test(script), "submit state");

  const ld = (/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page) || [])[1];
  let graph = [];
  try { graph = JSON.parse(ld)["@graph"]; } catch (_) { graph = []; }
  const app = graph.find((node) => node["@type"] === "WebApplication");
  const audit = graph.find((node) => node["@type"] === "Service");
  check("the structured data names the Free 10-question check as a free web application", app && app.name === "Free 10-question check" && app.offers.price === "0", JSON.stringify(app || {}).slice(0, 80));
  check("the structured data carries the $490 offer at the site's /buy switch", audit && audit.offers.price === "490" && audit.offers.url === "https://broadcastwell.com/buy/audit" && audit.offers.availability === "https://schema.org/InStock", JSON.stringify(audit || {}).slice(0, 80));
}


for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
