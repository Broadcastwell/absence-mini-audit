/**
 * The shortlist wheel, image export, result links, the funnel count and the page that
 * carries them. Everything here runs against a fake key-value store and a stubbed upstream.
 *
 * Run: node tests/frontdoor.test.mjs
 */

import audit from "../lib/audit.js";
import { sealKey, seal, verify, canonical } from "../lib/seal.js";
import { cleanResult, newId, LINK_TTL_DAYS } from "../lib/link.js";
import { EVENTS } from "../lib/event.js";
import { PAGE_HEADERS } from "../lib/headers.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || "" });
}
const file = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");

function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ttl = new Map();
  return {
    store, ttl,
    async get(key, type) { const raw = store.get(key); if (raw === undefined) return null; return type === "json" ? JSON.parse(raw) : raw; },
    async put(key, value, options) { store.set(key, String(value)); if (options && options.expirationTtl) ttl.set(key, options.expirationTtl); },
    async delete(key) { store.delete(key); ttl.delete(key); },
  };
}

const PAGE = file("public/index.html");
let upstreamCalls = 0;
const UPSTREAM = { named: 3, asked: 10, tier: "named 1 to 3", chapter: "/category-door/", engine: "Perplexity", measured_on: "2026-09-21", questions: Array.from({ length: 10 }, (_, i) => ({ question: "Question " + (i + 1), status: i < 3 ? "named" : "not named" })) };
globalThis.fetch = async () => { upstreamCalls += 1; return new Response(JSON.stringify(UPSTREAM), { headers: { "content-type": "application/json" } }); };

function env(seed) {
  return {
    AUDIT: fakeKV(seed || {}),
    UPSTREAM_URL: "https://upstream.invalid/run",
    UPSTREAM_TOKEN: "test-token",
    ASSETS: { fetch: async () => new Response(PAGE, { headers: { "content-type": "text/html" } }) },
  };
}
function req(path, body, host, ip) {
  return new Request("https://" + (host || "audit.broadcastwell.com") + path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip || "198.51.100.7" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
async function runCheck(e, body, host, ip) {
  const response = await audit.fetch(req("/api/run", body, host, ip), e, {});
  return { status: response.status, seal: response.headers.get("x-result-seal"), body: await response.json() };
}
async function makeLink(e, body, host, ip) {
  const response = await audit.fetch(req("/api/link", body, host, ip), e, {});
  return { status: response.status, body: await response.json() };
}

const RUN = { category: "field service management software", company: "acmefield.com", brand: "Acme Field" };

// The seal: every result is sealed, and the seal covers what a link will show
{
  const e = env();
  const r = await runCheck(e, RUN);
  check("a run result carries a seal header", r.status === 200 && typeof r.seal === "string" && r.seal.length >= 40, String(r.seal));
  check("the seal leaves the seven key contract as it was", Object.keys(r.body).sort().join(",") === "asked,chapter,engine,measured_on,named,questions,tier", Object.keys(r.body).join(","));
  const key = await sealKey(e, false);
  check("the seal verifies for the same brand, category, website and result", await verify(key, "Acme Field", RUN.category, RUN.company, r.body, r.seal), "verify");
  check("a changed count breaks the seal", !(await verify(key, "Acme Field", RUN.category, RUN.company, Object.assign({}, r.body, { named: 10, tier: "named 7 to 10" }), r.seal)), "tamper count");
  check("a changed brand breaks the seal", !(await verify(key, "Other Co", RUN.category, RUN.company, r.body, r.seal)), "tamper brand");
  check("a seal made with another key does not verify", !(await verify(await sealKey({ UPSTREAM_TOKEN: "other" }, false), "Acme Field", RUN.category, RUN.company, r.body, r.seal)), "other key");
  check("no live key exists without the bound token", (await sealKey({}, false)) === null, "no key");
  check("the seal never contains the token", !r.seal.includes("test-token") && !canonical("a", "b", "c", r.body).includes("test-token"), "no token");
  const refused = await runCheck(e, { category: "", company: "" });
  check("a refusal carries no seal", refused.status === 400, String(refused.status));
  const preview = await runCheck({}, RUN, "abc123.absence-mini-audit.pages.dev");
  check("the preview double is sealed with the preview key only", preview.status === 200 && (await verify(await sealKey({}, true), "Acme Field", RUN.category, RUN.company, preview.body, preview.seal)), String(preview.seal));
}

// Result links
{
  const e = env();
  const before = upstreamCalls;
  const r = await runCheck(e, RUN, null, "198.51.100.20");
  const callsForRun = upstreamCalls - before;
  const made = await makeLink(e, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: r.body, seal: r.seal }, null, "198.51.100.20");
  check("a sealed result makes a link", made.status === 200 && /^[0-9a-f]{32}$/.test(made.body.id) && made.body.url === "https://audit.broadcastwell.com/r/" + made.body.id, JSON.stringify(made.body));
  check("the link reference is fc_ plus the id, letters digits and underscore only", made.body.reference === "fc_" + made.body.id && /^fc_[a-z0-9]+$/.test(made.body.reference), made.body.reference);
  check("making a link costs no upstream call", upstreamCalls - before === callsForRun, String(upstreamCalls - before));
  const stored = JSON.parse(e.AUDIT.store.get("link:" + made.body.id));
  check("the link is kept 30 days by the store itself", e.AUDIT.ttl.get("link:" + made.body.id) === LINK_TTL_DAYS * 86400, String(e.AUDIT.ttl.get("link:" + made.body.id)));
  check("the stored record holds only what the wheel shows, plus a hash of the delete token", Object.keys(stored).sort().join(",") === "brand,category,created_on,expires_on,id,result,revoke_hash,v,website" && !JSON.stringify(stored).includes("198.51.100.20") && !/@/.test(JSON.stringify(stored)), Object.keys(stored).join(","));
  check("the delete token goes to the browser that asked and is never stored", /^[0-9a-f]{32}$/.test(made.body.revoke_token) && made.body.revoke_token !== made.body.id && !JSON.stringify(stored).includes(made.body.revoke_token) && /^[0-9a-f]{64}$/.test(stored.revoke_hash), String(made.body.revoke_token));
  check("the expiry date is 30 days out", stored.expires_on === new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), stored.expires_on);

  const forged = await makeLink(e, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: Object.assign({}, r.body, { named: 10, tier: "named 7 to 10" }), seal: r.seal });
  check("a forged result cannot be stored", forged.status === 400 && forged.body.reason === "seal", JSON.stringify(forged.body));
  const unsealed = await makeLink(e, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: r.body });
  check("a result without a seal cannot be stored", unsealed.status === 400, String(unsealed.status));
  const junk = await makeLink(e, { brand: "x", category: "y", website: "z", result: { named: 3, asked: 10, tier: "doing great", chapter: "/x/", engine: "E", measured_on: "2026-09-21", questions: [] }, seal: "x" });
  check("an off list result is refused before any seal check", junk.status === 400 && junk.body.reason === "input", JSON.stringify(junk.body));
  check("ids are 128 random bits", new Set(Array.from({ length: 200 }, newId)).size === 200 && newId().length === 32, "ids");
  check("cleanResult keeps the seven public keys only", Object.keys(cleanResult(Object.assign({ extra: 1 }, r.body))).sort().join(",") === "asked,chapter,engine,measured_on,named,questions,tier", "clean");

  // The limits on links
  const limited = env({ "config:limits": JSON.stringify({ link_per_ip_per_day: 1, link_global_per_day: 2 }) });
  const r2 = await runCheck(limited, RUN, null, "198.51.100.30");
  const body2 = { brand: "Acme Field", category: RUN.category, website: RUN.company, result: r2.body, seal: r2.seal };
  const statuses = [(await makeLink(limited, body2, null, "198.51.100.30")).status, (await makeLink(limited, body2, null, "198.51.100.30")).status, (await makeLink(limited, body2, null, "198.51.100.31")).status, (await makeLink(limited, body2, null, "198.51.100.32")).status];
  check("links are limited per network and per day", statuses.join(",") === "200,429,200,503", statuses.join(","));

  // The shared page
  const page = await audit.fetch(new Request("https://audit.broadcastwell.com/r/" + made.body.id), e, {});
  const html = await page.text();
  check("a result link opens with a 200", page.status === 200, String(page.status));
  check("a result link page is noindex in its header and its meta", page.headers.get("x-robots-tag") === "noindex, nofollow" && html.includes('<meta name="robots" content="noindex, nofollow">') && !html.includes('content="index, follow"'), page.headers.get("x-robots-tag"));
  check("a result link page carries the static page's security headers", page.headers.get("content-security-policy") === PAGE_HEADERS["Content-Security-Policy"] && page.headers.get("strict-transport-security") && page.headers.get("x-frame-options") === "DENY", page.headers.get("content-security-policy"));
  const data = JSON.parse(/<script type="application\/json" id="shared-result">([\s\S]*?)<\/script>/.exec(html)[1]);
  check("the stored result is placed in the page as data", data.id === made.body.id && data.result.named === 3 && data.expires_on === stored.expires_on, JSON.stringify(data).slice(0, 120));
  check("the page's own script is untouched, so its hash still holds", createHash("sha256").update(html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>", html.indexOf("<script>"))), "utf8").digest("base64") === createHash("sha256").update(PAGE.slice(PAGE.indexOf("<script>") + 8, PAGE.indexOf("</script>", PAGE.indexOf("<script>"))), "utf8").digest("base64"), "hash");
  const nasty = env();
  const r3 = await runCheck(nasty, { category: RUN.category, company: RUN.company, brand: "</script><script>alert(1)</script>" }, null, "198.51.100.40");
  const made3 = await makeLink(nasty, { brand: "</script><script>alert(1)</script>", category: RUN.category, website: RUN.company, result: r3.body, seal: r3.seal }, null, "198.51.100.40");
  const html3 = await (await audit.fetch(new Request("https://audit.broadcastwell.com/r/" + made3.body.id), nasty, {})).text();
  check("a brand cannot break out of the data block", made3.status === 200 && !html3.includes("<script>alert(1)") && (html3.match(/<\/script>/g) || []).length === (PAGE.match(/<\/script>/g) || []).length + 1, String(made3.status));
  const missing = await audit.fetch(new Request("https://audit.broadcastwell.com/r/" + "0".repeat(32)), e, {});
  const missingHtml = await missing.text();
  check("an expired or unknown link answers 404 with the expired state", missing.status === 404 && missingHtml.includes('"expired":true') && missing.headers.get("x-robots-tag") === "noindex, nofollow", String(missing.status));
  const bad = await audit.fetch(new Request("https://audit.broadcastwell.com/r/config:limits"), e, {});
  check("a malformed link id reads nothing from the store", bad.status === 404, String(bad.status));
  const previewLink = await makeLink({}, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: (await runCheck({}, RUN, "abc123.absence-mini-audit.pages.dev")).body, seal: (await runCheck({}, RUN, "abc123.absence-mini-audit.pages.dev")).seal }, "abc123.absence-mini-audit.pages.dev");
  check("preview with no store says links are unavailable", previewLink.status === 503, String(previewLink.status));
}

// Receipts: excerpt, cited URLs and vendors named instead, when the upstream supplies them
{
  const long = "word ".repeat(200);
  const RECEIPTS = Object.assign({}, UPSTREAM, {
    questions: UPSTREAM.questions.map((row, i) => Object.assign({}, row, {
      excerpt: i === 0 ? long : "  The leading tools are\nAcme and Beta.  ",
      citations: i === 1 ? ["javascript:alert(1)", "https://user:pw@example.com/x", "ftp://example.com/a", "https://example.com/a", "https://example.com/a"].concat(Array.from({ length: 8 }, (_, n) => "https://example.org/" + n)) : ["https://g2.com/categories/fsm"],
      named_instead: ["ServiceTitan", "servicetitan", "Jobber", ""],
      secret_note: "must never pass",
    })),
  });
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(RECEIPTS), { headers: { "content-type": "application/json" } });
  const e = env();
  const r = await runCheck(e, RUN, null, "198.51.100.50");
  globalThis.fetch = saved;
  const rows = r.body.questions || [];
  check("the seven key contract still holds with receipts", r.status === 200 && Object.keys(r.body).sort().join(",") === "asked,chapter,engine,measured_on,named,questions,tier", Object.keys(r.body).join(","));
  check("a row keeps only its question, status and the three receipt fields", rows.length === 10 && rows.every((row) => Object.keys(row).every((k) => ["question", "status", "excerpt", "sources", "named_instead"].indexOf(k) !== -1)) && !JSON.stringify(r.body).includes("must never pass"), JSON.stringify(rows[2]).slice(0, 160));
  check("an excerpt is one line and cut to 320 characters", rows[0].excerpt.length <= 320 && rows[0].excerpt.endsWith("...") && rows[2].excerpt === "The leading tools are Acme and Beta.", rows[2].excerpt);
  check("only plain http and https citations survive, without credentials, deduplicated, at most five", rows[1].sources.length === 5 && rows[1].sources[0] === "https://example.com/a" && rows[1].sources.every((u) => /^https?:\/\//.test(u) && !/@/.test(u)), JSON.stringify(rows[1].sources));
  check("vendors named instead are deduplicated without regard to case", JSON.stringify(rows[3].named_instead) === JSON.stringify(["ServiceTitan", "Jobber"]), JSON.stringify(rows[3].named_instead));
  const key = await sealKey(e, false);
  const tampered = JSON.parse(JSON.stringify(r.body)); tampered.questions[2].excerpt = "Broadcastwell is the best";
  check("the seal covers the receipts, so an edited excerpt cannot be stored", !(await verify(key, "Acme Field", RUN.category, RUN.company, tampered, r.seal)) && (await verify(key, "Acme Field", RUN.category, RUN.company, r.body, r.seal)), "seal receipts");
  const made = await makeLink(e, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: r.body, seal: r.seal }, null, "198.51.100.50");
  const stored = JSON.parse(e.AUDIT.store.get("link:" + made.body.id));
  check("a result link keeps the receipts exactly as the run returned them", made.status === 200 && JSON.stringify(stored.result.questions) === JSON.stringify(rows), String(made.status));
  check("cleanResult drops a hostile citation from a stored row", cleanResult(Object.assign({}, r.body, { questions: rows.map((row) => Object.assign({}, row, { sources: ["javascript:alert(1)"] })) })).questions.every((row) => !row.sources), "clean hostile");
  const forged = await makeLink(e, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: tampered, seal: r.seal }, null, "198.51.100.50");
  check("a link cannot be made with an edited excerpt", forged.status === 400 && forged.body.reason === "seal", JSON.stringify(forged.body));
}

// Deleting a result link
{
  const e = env();
  const r = await runCheck(e, RUN, null, "198.51.100.60");
  const made = await makeLink(e, { brand: "Acme Field", category: RUN.category, website: RUN.company, result: r.body, seal: r.seal }, null, "198.51.100.60");
  const unlinkCall = async (body) => { const response = await audit.fetch(req("/api/unlink", body), e, {}); return { status: response.status, body: await response.json() }; };
  const wrong = await unlinkCall({ id: made.body.id, token: newId() });
  check("a wrong token cannot delete a link", wrong.status === 403 && wrong.body.reason === "token" && e.AUDIT.store.has("link:" + made.body.id), JSON.stringify(wrong.body));
  const malformed = await unlinkCall({ id: "config:limits", token: made.body.revoke_token });
  check("a malformed id is refused before the store is read", malformed.status === 400 && e.AUDIT.store.has("config:limits") === false, String(malformed.status));
  const right = await unlinkCall({ id: made.body.id, token: made.body.revoke_token });
  check("the token the link was made with deletes it at once", right.status === 200 && right.body.deleted === true && !e.AUDIT.store.has("link:" + made.body.id), JSON.stringify(right.body));
  const after = await audit.fetch(new Request("https://audit.broadcastwell.com/r/" + made.body.id), e, {});
  check("a deleted link answers 404 with the expired state", after.status === 404 && (await after.text()).includes('"expired":true'), String(after.status));
  const again = await unlinkCall({ id: made.body.id, token: made.body.revoke_token });
  check("deleting twice says deleted and reveals nothing", again.status === 200 && again.body.deleted === true, JSON.stringify(again.body));
  const legacyId = newId();
  e.AUDIT.store.set("link:" + legacyId, JSON.stringify({ v: 1, id: legacyId, brand: "x", category: "y", website: "z", result: r.body, created_on: "2026-09-21", expires_on: "2026-10-21" }));
  const legacy = await unlinkCall({ id: legacyId, token: newId() });
  check("a link made before tokens existed is kept and the answer says to email", legacy.status === 403 && /hello@broadcastwell\.com/.test(legacy.body.message) && e.AUDIT.store.has("link:" + legacyId), JSON.stringify(legacy.body));
  check("only POST reaches the delete route", (await audit.fetch(new Request("https://audit.broadcastwell.com/api/unlink"), e, {})).status === 405, "method");
  check("the delete route has its own entry point", file("functions/api/unlink.js").includes('import audit from "../../lib/audit.js";'), "entry");
}

// The funnel count
{
  const e = env({ "config:limits": JSON.stringify({ funnel_writes_per_day: 3 }) });
  const day = new Date().toISOString().slice(0, 10);
  for (const word of ["confirmed", "export", "buy_490", "buy_990", "export"]) {
    const response = await audit.fetch(req("/api/event", { e: word }), e, {});
    if (response.status !== 204) check("an event answers 204", false, String(response.status));
  }
  const counts = JSON.parse(e.AUDIT.store.get("funnel:" + day));
  check("events are counted by day and word", counts.confirmed === 1 && counts.export === 1 && counts.buy_490 === 1, JSON.stringify(counts));
  check("the daily write cap stops counting and records that it did", counts.writes === 3 && counts.capped === true && !counts.buy_990, JSON.stringify(counts));
  const before = e.AUDIT.store.get("funnel:" + day);
  await audit.fetch(req("/api/event", { e: "somebody@example.com" }), e, {});
  await audit.fetch(req("/api/event", "not json"), e, {});
  check("an unknown word is ignored and nothing personal is stored", e.AUDIT.store.get("funnel:" + day) === before && !/@|198\.51/.test(before), before);
  check("the funnel words are a closed set", EVENTS.join(",") === "confirmed,export,buy_490,buy_990", EVENTS.join(","));
  check("no route reads the funnel", (await audit.fetch(new Request("https://audit.broadcastwell.com/api/event"), e, {})).status === 405 && (await audit.fetch(new Request("https://audit.broadcastwell.com/api/funnel"), { ASSETS: { fetch: async () => new Response("static", { status: 404 }) } }, {})).status === 404, "routes");
}

// The page: one inlined module, headers in step, and the copy law
{
  const module = file("public/assets/wheel.js").trim();
  check("the page carries the wheel module byte for byte", PAGE.includes("/* wheel module: begin */\n" + module + "\n/* wheel module: end */"), "run node scripts/build-page.mjs");
  const headers = file("public/_headers");
  const csp = (/Content-Security-Policy:\s*(.+)/.exec(headers) || [])[1];
  check("lib/headers.js matches the headers file", PAGE_HEADERS["Content-Security-Policy"] === csp && PAGE_HEADERS["Strict-Transport-Security"] === "max-age=31536000; includeSubDomains", "run node scripts/build-page.mjs");
  check("the policy opened images to data and blob for export, and nothing else", /img-src 'self' data: blob: https:\/\/framerusercontent\.com;/.test(csp) && /connect-src 'self';/.test(csp) && /font-src 'self';/.test(csp) && !/script-src[^;]*(data:|blob:|'self')/.test(csp), csp);
  const face = file("public/assets/fonts/inter-embed.css");
  const faceHash = "'sha256-" + createHash("sha256").update(face, "utf8").digest("base64") + "'";
  check("the one font rule exported images embed is allowed by its hash, and only it", /^@font-face\{font-family:Inter;[^}]*src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\('woff2'\)\}$/.test(face) && (/style-src ([^;]+)/.exec(csp) || [])[1].split(" ").length === 3 && csp.includes(faceHash) && !/unsafe/.test(csp), faceHash);
  const sampleRule = headers.slice(headers.indexOf("/assets/sample/*"));
  check("the sample image has an image's own policy: nothing runs, only the font rule by hash", /! Content-Security-Policy/.test(sampleRule) && sampleRule.includes("Content-Security-Policy: default-src 'none'; style-src " + faceHash + "; font-src data:") && !/script-src|unsafe/.test(sampleRule), sampleRule.slice(0, 80));
  check("the page and the sample wheel embed that same rule", PAGE.includes("fetch('/assets/fonts/inter-embed.css')") && file("public/assets/sample/kalvenor-wheel.svg").includes('<style type="text/css">' + face + "</style>"), "embed");
  const main = PAGE.slice(PAGE.indexOf("<main"), PAGE.indexOf("</main>"));
  const visible = main.replace(/<[^>]+>/g, " ");
  check("the entry asks for a website and nothing else first", /<label for="company">Your website<\/label><input id="company"/.test(PAGE) && PAGE.indexOf('id="confirm" class="confirm hidden"') > PAGE.indexOf('id="company"'), "entry");
  check("nothing runs before the visitor confirms", /if \(stage === 'site'\) \{ readSite\(\); return; \}/.test(PAGE) && PAGE.indexOf("fetch('/api/run'") > PAGE.indexOf("if (stage === 'site') { readSite(); return; }"), "confirm first");
  check("the confirm card shows the ten questions, collapsed", /<details class="preview"><summary>The ten questions Perplexity will be asked<\/summary><ol id="preview-list"><\/ol><\/details>/.test(PAGE), "preview");
  check("the confirm card shows what was read, verbatim", PAGE.includes("What we read on <span id=\"read-host\"></span>, verbatim:"), "read");
  check("every reason a read can fail has its own sentence and ends at typing", ["blocked", "timeout", "empty", "unclassified", "unreachable", "not_html", "private", "unresolved", "network", "global", "unavailable"].every((word) => new RegExp("\\b" + word + ": '").test(PAGE)) && PAGE.includes("Type them below. The check runs the same way."), "fallbacks");
  check("the published limits sentence is on the page as published", PAGE.includes("No email is needed; runs are limited per network and per day, and by the site's daily allowance."), "limits sentence");
  check("the wait is stated honestly, with no per question progress", PAGE.includes("The answers come back together in one response, so there is no per question progress to show. A run that takes longer than 55 seconds is stopped, and your daily check is not used.") && !/Step ' \+|progressLabel|stages\.forEach/.test(PAGE), "honest progress");
  check("no unmeasured duration is promised", !/about 25 seconds|25 seconds|In about/i.test(PAGE), "no 25 seconds");
  check("the stated 55 seconds is the handler's own stop", file("lib/audit.js").includes("const UPSTREAM_TIMEOUT_MS = 55000;"), "timeout");
  check("the free tool is never called an audit", !/free (?:ai visibility )?audit|audit for free/i.test(PAGE) && !/"name":"Free[^"]*[Aa]udit/.test(PAGE), "no free audit");
  const dollars = [...new Set(PAGE.match(/\$[0-9][0-9,]*/g) || [])];
  check("the only prices on the page are $490 and $990", dollars.every((d) => d === "$490" || d === "$990"), dollars.join(","));
  check("no percentage, score, grade, guarantee or promise in the visible copy", !/\d\s?%|percent(?!age)|\bscore\b|\bgrade\b|guarantee|we promise/i.test(visible.replace(/95 percent confidence interval/, "")) , "copy law");
  check("no engine is called Gemini and nothing says four engines", !/Gemini|four engines/i.test(PAGE), "engines");
  check("the $490 block is worded from the pricing page", ["Why you are not on the shortlist: who is named instead of you, how often, and the sources visible in those answers", "Three prioritized fixes: which page to update or which publisher to get in front of", "Written findings within 48 hours of category confirmation"].every((line) => PAGE.includes("<li>" + line + "</li>")), "pricing lines");
  const result = PAGE.slice(PAGE.indexOf('<section id="result"'), PAGE.indexOf("</section>", PAGE.indexOf('class="buy-path"')));
  const whole = PAGE.slice(PAGE.indexOf('<section id="result"'), PAGE.indexOf('<section id="email-card"'));
  const order = ['id="meta"', 'id="lead-line"', 'id="wheel"', 'id="position"', 'id="question-block"', 'One engine, one run. Your buyers use five.', 'class="cta cta-filled"', 'app.broadcastwell.com/sample">See a sample account', 'id="keep"', 'id="link-create"'].map((mark) => whole.indexOf(mark));
  check("the result reads scope, verdict, wheel, position, questions, one engine against five, the one button, then keep and share", order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), order.join(","));
  check("export and link controls are outlined, never filled", !/data-export[^>]*cta-filled|link-create[^>]*cta-filled|link-delete[^>]*cta-filled/.test(PAGE) && (whole.match(/cta-filled/g) || []).length === 1 && !/cta-outline/.test(whole), "one filled");
  check("the buy links gain the reference only from a result link id", /url\.searchParams\.set\('client_reference_id', 'fc_' \+ id\)/.test(PAGE) && !/client_reference_id=/.test(main) && /querySelectorAll\('a\[data-buy\]'\)/.test(PAGE), "reference");
  check("the buy links carry the visitor's own address only when one was typed", /url\.searchParams\.set\('prefilled_email', address\)/.test(PAGE) && !/prefilled_email=/.test(main) && /emailInput\.addEventListener\('input'/.test(PAGE), "prefill");
  check("a buy from a fresh result makes its link first, and never waits more than four seconds", /createLink\(\)\.then\(function \(\) \{ window\.clearTimeout\(late\); leave\(\); \}/.test(PAGE) && /window\.setTimeout\(leave, 4000\)/.test(PAGE) && /id="buy-link-note"/.test(PAGE), "link first");
  check("the verdict is the published sentence", PAGE.includes("' questions buyers ask about ' + ctx.category + '.' + (top ? ' It named ' + top.name + ' in ' + top.count + '.' : '')"), "verdict");
  check("the scope line names the engine, the ten questions, one run and the date", PAGE.includes("' questions · 1 run · Measured ' + when"), "scope");
  check("each row shows its receipt when the run returned one, and the page says when it did not", /Answer excerpt: "/.test(PAGE) && /'Named instead: '/.test(PAGE) && /'Also named: '/.test(PAGE) && /'Cited: '/.test(PAGE) && /id="receipt-note" class="small hidden">This run returned the marks, not the answer text or the sources it cited\.</.test(PAGE), "receipts");
  check("a cited link is only ever http or https, and opens without a referrer", /url\.protocol === 'https:' \|\| url\.protocol === 'http:'/.test(PAGE) && /a\.rel = 'nofollow noopener noreferrer'/.test(PAGE), "cited links");
  check("the link wording says private, not indexed and deletable", /It is private and not indexed by search engines\./.test(PAGE) && /Delete this link/.test(PAGE) && /fetch\('\/api\/unlink'/.test(PAGE), "revocable");
  check("the delete token lives only in this browser's storage, read and written inside try", /try \{ var all = JSON\.parse\(window\.localStorage\.getItem\(TOKENS_KEY\)/.test(PAGE) && (PAGE.match(/window\.localStorage\.setItem/g) || []).length === 2, "storage");
  check("?domain= fills the website and reads it, and runs nothing", /get\('domain'\)/.test(PAGE) && /if \(arriving\) \{ siteInput\.value = arriving; readSite\(\); \}/.test(PAGE), "domain");
  check("no Stripe address and no retired $990 button remain", !/buy\.stripe\.com|Get the Diagnostic, \$990|4gM7sMgDOdmYbi93grds401|dRm7sM3R23Mo0Dv6sDds400/.test(PAGE), "stripe");
  check("exports wait for fonts before drawing", /document\.fonts\.ready/.test(PAGE), "fonts");
  check("the wheel respects reduced motion and hides its labels at phone width", /prefers-reduced-motion: reduce/.test(PAGE) && /@media \(max-width: 560px\) \{ \.wheel \.wheel-arc-label, \.wheel \.wheel-ring-label \{ display: none; \}/.test(PAGE), "responsive");
  check("the question list stays under the wheel as its text alternative, with each type", PAGE.indexOf('id="question-block"') > PAGE.indexOf('id="wheel"') && /type\.className = 'q-type'/.test(PAGE), "list");
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(PAGE)[1])["@graph"];
  const faq = ld.find((node) => node["@type"] === "FAQPage");
  check("the structured data carries a short FAQ", faq && faq.mainEntity.length >= 4 && faq.mainEntity.every((q) => q.name && q.acceptedAnswer.text), "faq");
  check("the FAQ on the page matches the FAQ in the structured data", faq.mainEntity.every((q) => main.includes("<summary>" + q.name.replace(/&/g, "&amp;") + "</summary>")), "faq match");
  check("the page title says what a searcher wants and never audit", /<title>Free AI visibility check[^<]*<\/title>/.test(PAGE) && !/<title>[^<]*[Aa]udit/.test(PAGE), (/<title>[^<]*<\/title>/.exec(PAGE) || [""])[0]);
  check("Kalvenor is labelled SAMPLE DATA wherever it is shown", (main.match(/Kalvenor/g) || []).length > 0 && main.split("Kalvenor").slice(1).every((after) => /SAMPLE DATA/.test(after.slice(0, 260))), "sample label");
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
