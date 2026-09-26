/**
 * The shortlist wheel module and its data contract (WHEEL_CONTRACT.md), and the Kalvenor
 * sample built from it.
 *
 * Run: node tests/wheel.test.mjs
 */

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || "" });
}
const file = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
const RUN = { category: "field service management software", company: "acmefield.com", brand: "Acme Field" };
const UPSTREAM = { named: 3, asked: 10, tier: "named 1 to 3", chapter: "/category-door/", engine: "Perplexity", measured_on: "2026-09-21", questions: Array.from({ length: 10 }, (_, i) => ({ question: "Question " + (i + 1), status: i < 3 ? "named" : "not named" })) };

// The wheel module and its contract
await import("../public/assets/wheel.js");
const W = globalThis.BwWheel;
{
  const sample = JSON.parse(file("public/assets/sample/kalvenor-wheel.json"));
  check("the Kalvenor sample fits the contract", W.validate(sample).length === 0, W.validate(sample).join("; "));
  check("the sample is marked as sample data with all five rings measured", sample.sample === true && sample.engines.every((engine) => engine.measured) && sample.brand === "Kalvenor Systems", "sample flags");
  const svg = file("public/assets/sample/kalvenor-wheel.svg");
  check("the sample image says SAMPLE DATA", svg.includes("SAMPLE DATA"), "sample label");
  const free = W.fromFreeCheck(UPSTREAM, { brand: "Acme Field", category: RUN.category, website: RUN.company });
  check("a free result becomes contract data with one measured ring, Perplexity", W.validate(free).length === 0 && free.engines.filter((engine) => engine.measured).map((engine) => engine.id).join() === "perplexity", W.validate(free).join("; "));
  check("the five engines are named exactly, in the site's order", W.ENGINES.map((engine) => engine.label).join(",") === "ChatGPT,Claude,Perplexity,Google AI Overviews,Google AI Mode", "engines");
  const wheel = W.svg(free, { interactive: true });
  check("named and not named differ in shape, not only colour", (wheel.match(/<circle[^>]*r="9"[^>]*fill="#3B82F6"/g) || []).length === 3 && (wheel.match(/<circle[^>]*r="8"[^>]*fill="#111727"[^>]*stroke="#CBD5E1"/g) || []).length === 7, "shapes");
  check("the unmeasured rings are faint and labelled for the $490 Category Audit", W.UNMEASURED === "Measured in the $490 Category Audit" && (wheel.match(/stroke-dasharray/g) || []).length >= 4, "rings");
  check("every measured node is focusable and says its question and status", (wheel.match(/class="wheel-node" tabindex="0"/g) || []).length === 10 && wheel.includes('aria-label="Question 1, Perplexity: Named. Question 1"'), "nodes");
  check("the centre says named in N of 10 answers", wheel.includes("Named in 3 of 10 answers") && wheel.includes("Perplexity, 21 September 2026"), "centre");
  const unknown = W.svg(W.fromFreeCheck(Object.assign({}, UPSTREAM, { questions: UPSTREAM.questions.map((q) => ({ question: q.question, status: "not itemised" })) }), { brand: "A", category: "b" }), {});
  check("a question the run did not itemise is drawn dashed, not guessed", (unknown.match(/stroke-dasharray="2.5 2.5"/g) || []).length === 10, "dashed");
  for (const [w, h] of [[1200, 630], [1080, 1080], [1600, 900]]) {
    const card = W.card(free, { width: w, height: h });
    check("the " + w + " by " + h + " export is that size and carries the footer strip", card.includes('width="' + w + '" height="' + h + '"') && card.includes("broadcastwell.com") && card.includes("Free 10-question check (one engine)") && card.includes("Perplexity") && card.includes("Measured 21 September 2026") && card.includes("One run on one engine. Answers vary between runs."), w + "x" + h);
  }
  const sampleCard = W.card(sample, { width: 1200, height: 630 });
  check("a sample export is labelled SAMPLE DATA and never claims to be the free check", sampleCard.includes("SAMPLE DATA") && !sampleCard.includes("Free 10-question check (one engine)"), "sample card");
  const every = [wheel, W.card(free, {}), sampleCard, svg].join("\n");
  check("the wheel never carries a style attribute, a script or an event handler", !/\sstyle="|<script|\son[a-z]+="/i.test(every), "csp safe");
  check("the wheel draws no dash the site does not print, no percentage, no score and no red", !/[\u2013\u2014]|--|%|\bscore\b|\bgrade\b/i.test(every.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")) && !/#(?:ef4444|dc2626|ff0000|b91c1c|f87171)/i.test(every), "copy law");
  check("the wheel names no other engine and never four engines", !/Gemini|four engines/i.test(every), "engines");
  const size = statSync(fileURLToPath(new URL("../public/assets/wheel.js", import.meta.url))).size;
  check("the wheel module stays small, under 24 KB unminified", size < 24 * 1024, size + " bytes");
  const compact = W.svg(free, { compact: true, interactive: true });
  check("the compact centre keeps the name and the count for phone widths", compact.includes(">3 of 10<") && compact.includes(">named<") && !compact.includes("Named in 3 of 10 answers") && (compact.match(/class="wheel-node"/g) || []).length === 10, "compact");
  const escaped = W.svg(W.fromFreeCheck(UPSTREAM, { brand: "<img src=x onerror=alert(1)>", category: "a & b" }), {});
  check("text in the wheel is escaped", !escaped.includes("<img") && escaped.includes("&lt;img"), "escape");
}


let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
