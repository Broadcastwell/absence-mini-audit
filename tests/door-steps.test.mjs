/**
 * Door one on the audit site (STEP 3.3 brief section 10.3 steps 2 and 4): the three next steps under
 * the answer record, and the read-only JSON endpoint the app fetches a kept result from, by its id.
 * Everything runs against a fake key-value store and a stubbed upstream.
 *
 * Run: node tests/door-steps.test.mjs
 */

import audit from "../lib/audit.js";
import { cleanResult } from "../lib/link.js";
import stored from "../lib/result.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

let passed = 0, failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log("PASS  " + name); } else { failed += 1; console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : "")); }
}
const file = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
const PAGE = file("public/index.html");

function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  let writes = 0;
  return {
    store, get writes() { return writes; },
    async get(key, type) { const raw = store.get(key); if (raw === undefined) return null; return type === "json" ? JSON.parse(raw) : raw; },
    async put(key, value) { writes += 1; store.set(key, String(value)); },
    async delete(key) { writes += 1; store.delete(key); },
  };
}

let upstreamCalls = 0;
const UPSTREAM = {
  named: 2, asked: 10, tier: "named 1 to 3", chapter: "/category-door/", engine: "Claude", measured_on: "2026-11-10",
  questions: Array.from({ length: 10 }, (_, i) => ({ question: "Synthetic question " + (i + 1), status: i < 2 ? "named" : "not named", named: i < 2, answer: "Synthetic answer " + (i + 1) + ".", named_companies: ["Synthetic Rival"], sources: ["example.com"], names_status: "extracted" })),
  named_instead: [{ company: "Synthetic Rival", count: 10 }],
  cited_sources: { domains: [{ domain: "example.com", count: 10 }], own_site_cited: 0 },
};
globalThis.fetch = async () => { upstreamCalls += 1; return new Response(JSON.stringify(UPSTREAM), { headers: { "content-type": "application/json" } }); };

function env(seed) {
  return { AUDIT: fakeKV(seed), UPSTREAM_URL: "https://upstream.invalid/run", UPSTREAM_TOKEN: "test-token", ASSETS: { fetch: async () => new Response(PAGE, { headers: { "content-type": "text/html" } }) } };
}
const post = (host, path, body) => new Request("https://" + host + path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.20" }, body: JSON.stringify(body) });
const get = (host, path, method = "GET") => new Request("https://" + host + path, { method });
const RUN = { category: "field service management software", company: "synthetic.example", brand: "Synthetic Field" };

async function keptLink(e, host) {
  const run = await audit.fetch(post(host, "/api/run", RUN), e);
  const result = await run.json();
  const made = await audit.fetch(post(host, "/api/link", { brand: RUN.brand, category: RUN.category, website: RUN.company, result, seal: run.headers.get("x-result-seal") }), e);
  return { result, link: await made.json() };
}

// The read-only result endpoint.
{
  const e = env();
  const { result, link } = await keptLink(e, "audit.broadcastwell.com");
  check("a kept result has a 32 character id", /^[0-9a-f]{32}$/.test(link.id || ""), JSON.stringify(link).slice(0, 80));
  const calls = upstreamCalls, writes = e.AUDIT.writes;
  const response = await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + link.id), e);
  const body = await response.json();
  check("GET /api/result/<id> returns the stored result", response.status === 200 && body.id === link.id && body.brand === RUN.brand && body.category === RUN.category && body.website === RUN.company, String(response.status));
  check("the stored result is exactly what the link keeps, cleaned the same way", JSON.stringify(body.result) === JSON.stringify(cleanResult(result)) && body.result.named === 2 && body.result.questions.length === 10, "result");
  check("the answer carries only the result and its dates, nothing about the visitor", Object.keys(body).sort().join(",") === "brand,category,created_on,expires_on,id,result,website" && !JSON.stringify(body).includes("revoke") && !JSON.stringify(body).includes("198.51.100.20"), Object.keys(body).join(","));
  check("the answer is noindex and never cached", response.headers.get("x-robots-tag") === "noindex, nofollow" && response.headers.get("cache-control") === "no-store", response.headers.get("x-robots-tag") + " " + response.headers.get("cache-control"));
  check("reading a result calls nothing upstream and writes nothing", upstreamCalls === calls && e.AUDIT.writes === writes, upstreamCalls - calls + " calls, " + (e.AUDIT.writes - writes) + " writes");
  const head = await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + link.id, "HEAD"), e);
  check("HEAD answers without a body", head.status === 200 && (await head.text()) === "", String(head.status));
  const posted = await stored.fetch(post("audit.broadcastwell.com", "/api/result/" + link.id, { result: UPSTREAM }), e);
  check("the endpoint is read only: a POST is refused and changes nothing", posted.status === 405 && e.AUDIT.writes === writes, String(posted.status));
  const unknown = await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + "0".repeat(32)), e);
  check("an unknown id answers 404", unknown.status === 404 && (await unknown.json()).reason === "not_found", String(unknown.status));
  for (const path of ["/api/result/", "/api/result/ABC", "/api/result/" + link.id + "/x", "/api/result/" + link.id.slice(0, 31) + "g"]) {
    const r = await stored.fetch(get("audit.broadcastwell.com", path), e);
    check("a malformed id answers 404: " + path.slice(12, 30), r.status === 404, String(r.status));
  }
  e.AUDIT.store.set("link:" + "a".repeat(32), JSON.stringify({ v: 1, id: "a".repeat(32), brand: "Made Up", category: "x", website: "made.example", result: { named: 10, asked: 10, tier: "invented", chapter: "/elsewhere/", engine: "Claude", measured_on: "2026-11-10", questions: [] } }));
  const invented = await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + "a".repeat(32)), e);
  check("a stored record that is not a clean result is never served", invented.status === 404, String(invented.status));
  e.AUDIT.store.set("link:" + "b".repeat(32), JSON.stringify({ v: 1, id: "c".repeat(32), brand: "Other", category: RUN.category, website: "other.example", result: cleanResult(result) }));
  check("a record stored under another id is never served", (await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + "b".repeat(32)), e)).status === 404);
  const deleted = await audit.fetch(post("audit.broadcastwell.com", "/api/unlink", { id: link.id, token: link.revoke_token }), e);
  const gone = await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + link.id), e);
  check("a deleted link is no longer served", deleted.status === 200 && gone.status === 404, deleted.status + " " + gone.status);
}

// Preview records stay on preview hosts.
{
  const e = env();
  const { link } = await keptLink(e, "door.absence-mini-audit.pages.dev");
  const onPreview = await stored.fetch(get("door.absence-mini-audit.pages.dev", "/api/result/" + link.id), e);
  const previewBody = await onPreview.json();
  check("a preview record is served on a preview host, marked as preview", onPreview.status === 200 && previewBody.preview === true, String(onPreview.status));
  const onLive = await stored.fetch(get("audit.broadcastwell.com", "/api/result/" + link.id), e);
  check("a preview record is never served on the live host", onLive.status === 404, String(onLive.status));
}

// The entry point hands the request to the handler and nothing else.
check("the result endpoint has its own entry point and module", file("functions/api/result/[[path]].js").includes('import result from "../../../lib/result.js";') && file("functions/api/result/[[path]].js").includes("result.fetch(context.request, context.env)"));
check("the result module reads the key-value store and never writes, deletes or calls out", !/\.put\(|\.delete\(|fetch\(|UPSTREAM/.test(file("lib/result.js")), "read only");

// The three next steps on the result page.
for (const name of ["index.html", "embed.html"]) {
  const doc = file("public/" + name);
  const result = doc.slice(doc.indexOf('<section id="result"'), doc.indexOf('<section id="email-card"'));
  const at = (needle) => result.indexOf(needle);
  check(name + ": the next steps follow the answer record and come before the method note and the repair terms", at('id="next-steps"') > at('id="question-block"') && at('id="next-steps"') < at('id="scope-title"') && at('id="next-steps"') < at('class="buy-path"'), "order");
  const list = (/<ol class="next-list[^"]*" id="next-list">([\s\S]*?)<\/ol>/.exec(result) || ["", ""])[1];
  const items = [...list.matchAll(/<li id="([a-z-]+)">/g)].map((m) => m[1]);
  check(name + ": exactly three next steps, in order: keep, fix or live question, talk to us", items.join(",") === "next-keep,next-second,next-talk" && (list.match(/<li\b/g) || []).length === 3, items.join(","));
  const keep = list.slice(list.indexOf('id="next-keep"'), list.indexOf('id="next-second"'));
  check(name + ": the first step keeps this result in a free account, with no card", keep.includes("<h3>Keep this result</h3>") && keep.includes("Create a free account, no card.") && keep.includes('id="keep-result">Create a free account</button>') && !/class="cta /.test(keep), "keep");
  check(name + ": the first step says one engine and ten buyer questions for your category, and conditions its runs on free runs being open", keep.includes("ten buyer questions for your category") && keep.includes("one-engine runs while free runs are open") && !/five engines|own questions/.test(keep), "words");
  const second = list.slice(list.indexOf('id="next-second"'), list.indexOf('id="next-talk"'));
  check(name + ": the second step fixes the first missing answer for $490 at /answer-repair", second.includes("<h3>Fix the first missing answer</h3>") && /<a id="next-fix-link" href="https:\/\/broadcastwell\.com\/answer-repair">Fix this answer, \$490<\/a>/.test(second), "fix");
  check(name + ": the second step's other form is the $19 live question on five engines, hidden until named in all ten", /<div id="next-live" class="hidden">/.test(second) && second.includes("ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode, three runs each.") && second.includes("Ask a live question, $19"), "live");
  const talk = list.slice(list.indexOf('id="next-talk"'));
  check(name + ": the third step is talk to us at /contact", talk.includes("<h3>Talk to us</h3>") && /<a id="next-talk-link" href="https:\/\/broadcastwell\.com\/contact">Talk to us<\/a>/.test(talk), "talk");
  check(name + ": no next step carries a filled button, so the one filled purchase button stays the repair", !/cta-filled|class="primary"/.test(list), "buttons");
}

// The page script: which second step shows, and where Keep this result goes.
{
  const scriptAt = PAGE.indexOf("<script>") + 8;
  const script = PAGE.slice(scriptAt, PAGE.indexOf("</script>", scriptAt));
  const fn = (/function renderNextSteps\(data\) \{[\s\S]*?\n  \}\n/.exec(script) || [""])[0];
  check("renderResult draws the next steps for every result, fresh or from a link", /renderQuestions\(data\.questions\);\n    renderNextSteps\(data\);/.test(script) && fn.length > 100, "call");
  const elements = {};
  const element = (id) => elements[id] || (elements[id] = { id, textContent: "", hidden: new Set(["next-live"].includes(id) ? ["hidden"] : []), classList: { toggle(cls, on) { on ? element(id).hidden.add(cls) : element(id).hidden.delete(cls); } } });
  const sandbox = { document: { getElementById: element }, hide: (el) => el.hidden.add("hidden"), out: null };
  vm.runInNewContext(fn + "\nout = renderNextSteps;", sandbox);
  const rows = (named) => Array.from({ length: 10 }, (_, i) => ({ question: "Question " + (i + 1), status: named(i) ? "named" : "not named" }));
  sandbox.out({ named: 3, questions: rows((i) => i === 0 || i === 1 || i === 4) });
  check("named in fewer than ten, the second step names the first question marked not named", element("next-fix-text").textContent === 'Claude did not name you for "Question 3". Answer Repair fixes that one buyer question with one source-backed page or fix, for $490.', element("next-fix-text").textContent);
  check("named in fewer than ten, the repair shows and the live question stays hidden", !element("next-fix").hidden.has("hidden") && element("next-live").hidden.has("hidden"));
  sandbox.out({ named: 10, questions: rows(() => true) });
  check("named in all ten, the second step becomes the $19 live question", element("next-fix").hidden.has("hidden") && !element("next-live").hidden.has("hidden"));
  sandbox.out({ named: 4, questions: Array.from({ length: 10 }, (_, i) => ({ question: "Question " + (i + 1), status: "not itemised" })) });
  check("a saved count without marks names no question it cannot point to", element("next-fix-text").textContent === "Answer Repair fixes one buyer question where Claude did not name you, with one source-backed page or fix, for $490." && !element("next-fix").hidden.has("hidden"));
  const keep = script.slice(script.indexOf("var APP_ORIGIN"), script.indexOf("document.getElementById('link-create').addEventListener"));
  check("Keep this result goes to the app's own sign-up with the result id, on production", keep.includes("'https://app.broadcastwell.com'") && keep.includes("APP_ORIGIN + '/signin?keep=' + encodeURIComponent(id)"), "target");
  check("Keep this result makes the private link first, or reuses the one already made", /if \(linkId\) \{ leaveTo\(keepTarget\(linkId\)\); return; \}/.test(keep) && /createLink\(\)\.then\(function \(made\) \{ button\.disabled = false; leaveTo\(keepTarget\(made\.id\)\); \}/.test(keep), "link first");
  check("Keep this result sends only the id: no result, count or company travels in the address", !/keep=' \+ [^;]*(named|result|brand|category)/.test(keep) && !/sessionStorage|localStorage/.test(keep), "id only");
  check("Keep this result leaves an embedded frame in the top window", /a\.target = '_top'/.test(keep), "top");
  check("no next-step script writes a credit, a Sprint or a price other than $490", !/\bcredit|\bSprint\b|\$19|\$3,/.test(fn + keep), "script");
}

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
