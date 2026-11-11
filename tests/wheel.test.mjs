/**
 * The shortlist wheel module and its data contract (WHEEL_CONTRACT.md), drawn with the brand's
 * answer record (brand system 3, brief 8.2), and the Kalvenor sample built from it.
 *
 * Parity: for the same record, the wheel and the brand's own drawing function (the vendored ES
 * module, vendor/brand/answer-record.mjs, which every other surface draws from) produce the same
 * SVG path data, the same table and the same words.
 *
 * Run: node tests/wheel.test.mjs
 */

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as brand from "../vendor/brand/answer-record.mjs";

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || "" });
}
const file = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
const RUN = { category: "field service management software", company: "acmefield.com", brand: "Acme Field" };
const UPSTREAM = { named: 3, asked: 10, tier: "named 1 to 3", chapter: "/category-door/", engine: "Perplexity", measured_on: "2026-09-21", questions: Array.from({ length: 10 }, (_, i) => ({ question: "Question " + (i + 1), status: i < 3 ? "named" : "not named" })) };
const CLAUDE = Object.assign({}, UPSTREAM, { engine: "Claude" });

// The served brand file first (BwAnswerRecord), then the wheel, exactly as the page loads them.
await import("../public/assets/brand/answer-record.js");
await import("../public/assets/wheel.js");
const W = globalThis.BwWheel;
const paths = (svg) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);

{
  const sample = JSON.parse(file("public/assets/sample/kalvenor-wheel.json"));
  check("the Kalvenor sample fits the contract and the brand's own rules", W.validate(sample).length === 0 && brand.validate(W.record(sample)).length === 0, W.validate(sample).join("; "));
  check("the sample is marked as sample data with all five rings measured", sample.sample === true && sample.engines.every((engine) => engine.measured) && sample.brand === "Kalvenor Systems" && W.record(sample).engines.length === 5, "sample flags");
  const svg = file("public/assets/sample/kalvenor-wheel.svg");
  check("the sample image is the brand's wheel form for the sample, and says sample data, fictional company", svg.trim() === W.svg(sample, { size: 720, id: "kalvenor" }) && svg.includes("<title id=\"kalvenor-alt\">Sample data, fictional company: Kalvenor Systems was named in 13 of 50 question and engine pairs across 10 buyer questions"), "sample image");
  // R-154 round 1: the sample's marks are question and engine pairs (10 questions on 5 engines), each
  // summing three runs, so the count and its stated base agree and neither says "valid answers".
  check("the sample counts its marks in the unit its base states", sample.count_unit === "question and engine pairs" && /50 question and engine pairs; each pair had three runs/.test(sample.base) && !W.draw(sample, { id: "u" }).html.includes("valid answers") && W.draw(sample, { id: "u" }).html.includes("named in 13 of 50 question and engine pairs"), "sample unit");
  const free = W.fromFreeCheck(UPSTREAM, { brand: "Acme Field", category: RUN.category, website: RUN.company });
  check("a free result becomes contract data with one measured ring, Perplexity", W.validate(free).length === 0 && free.engines.filter((engine) => engine.measured).map((engine) => engine.id).join() === "perplexity", W.validate(free).join("; "));
  const claude = W.fromFreeCheck(CLAUDE, { brand: "Acme Field", category: RUN.category, website: RUN.company });
  check("a current result draws one ring, Claude, as the brand draws a one-engine check", W.record(claude).engines.join() === "Claude" && (W.draw(claude).svg.match(/class="bw-ar__ring bw-ar__ring--/g) || []).length === 1 && W.draw(claude).html.includes('<li class="bw-ar__ring-label bw-ar__ring-label--1-1">Claude</li>'), "one ring");
  check("the five engines are named exactly, in the brand's order", W.ENGINES.map((engine) => engine.label).join(",") === "ChatGPT,Claude,Perplexity,Google AI Overviews,Google AI Mode" && W.ENGINES.map((engine) => engine.label).join(",") === brand.ENGINES.join(","), "engines");
  const drawn = W.draw(free, { id: "page" });
  check("named, not named and no valid answer differ in shape, not only in color", (drawn.svg.match(/class="bw-ar__mark bw-ar__mark--named" fill="#1D4ED8"/g) || []).length === 3 && (drawn.svg.match(/class="bw-ar__mark bw-ar__mark--open" fill="#FFFFFF" stroke="#4A5568"/g) || []).length === 7 && !/bw-ar__mark--bar/.test(drawn.svg) && /a [\d.]+ [\d.]+ 0 1 0/.test(drawn.svg), "shapes");
  check("the record states its count in one sentence for screen readers", drawn.alt === "Acme Field was named in 3 of 10 valid answers to 10 buyer questions on Perplexity, Free 10-question check (one engine), answers captured 21 September 2026." && drawn.svg.includes('role="img" aria-labelledby="page-alt"'), drawn.alt);
  check("the record carries its caption, its legend and a Read as a table control", drawn.html.includes("Read as a table") && drawn.html.includes("Free 10-question check (one engine). Field service management software. Answers captured 21 September 2026. Base: 10 buyer questions, one run on Perplexity.") && drawn.html.includes('Source: <a href="https://broadcastwell.com/methodology">the published method</a>.') && drawn.legend.includes("No valid answer"), "caption");
  const notItemised = W.fromFreeCheck(Object.assign({}, UPSTREAM, { questions: UPSTREAM.questions.map((q) => ({ question: q.question, status: "not itemised" })) }), { brand: "A", category: "b" });
  check("a count that does not itemise its questions is not itemised, and is never drawn as named or not named", W.itemised(free) === true && W.itemised(notItemised) === false && !/bw-ar__mark--named|bw-ar__mark--open/.test(W.draw(notItemised).svg) && (W.draw(notItemised).svg.match(/bw-ar__mark--bar/g) || []).length === 10, "not itemised");
  for (const [w, h] of [[1200, 630], [1080, 1080], [1600, 900]]) {
    const card = W.card(free, { width: w, height: h });
    check("the " + w + " by " + h + " export is that size and carries the footer strip", card.includes('width="' + w + '" height="' + h + '"') && card.includes("broadcastwell.com.") && card.includes("Free 10-question check (one engine).") && card.includes("Perplexity.") && card.includes("Measured 21 September 2026.") && card.includes("One run on one engine. Answers vary between runs.") && card.includes(drawn.svg.slice(drawn.svg.indexOf("<g class=\"bw-ar__spokes\""), drawn.svg.indexOf("</svg>")).replace(/page-alt/g, "card-alt")), w + "x" + h);
  }
  const sampleCard = W.card(sample, { width: 1200, height: 630 });
  check("a sample export says sample data, fictional company and never claims to be the free check", sampleCard.includes("Sample data, fictional company") && !sampleCard.includes("Free 10-question check (one engine)") && !/SAMPLE DATA/.test(sampleCard), "sample card");
  const every = [drawn.html, W.card(free, {}), sampleCard, svg, W.svg(free, {})].join("\n");
  check("the wheel never carries a style attribute, a script or an event handler", !/\sstyle="|<script|\son[a-z]+="/i.test(every), "csp safe");
  check("the wheel draws no dash the site does not print, no percentage, no score, no red and no middle dot", !/[–—·]|--|%|\bscore\b|\bgrade\b/i.test(every.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")) && !/#(?:ef4444|dc2626|ff0000|b91c1c|f87171|991B1B|FEE2E2)/i.test(every), "copy law");
  check("the wheel names no other engine and never four engines", !/Gemini|four engines/i.test(every), "engines");
  const size = statSync(fileURLToPath(new URL("../public/assets/wheel.js", import.meta.url))).size;
  check("the wheel module stays small, under 24 KB unminified", size < 24 * 1024, size + " bytes");
  const escaped = W.draw(W.fromFreeCheck(UPSTREAM, { brand: "<img src=x onerror=alert(1)>", category: "a & b" }));
  check("text in the wheel is escaped", !escaped.html.includes("<img") && escaped.html.includes("&lt;img"), "escape");
  const client = Object.assign({}, free, { brand: "Neurvalis" });
  check("a client's record is never drawn, and the fictional company only as the sample", W.validate(client).includes("a client's record is never drawn") && W.validate(Object.assign({}, free, { brand: "Kalvenor Systems" })).some((p) => /sample: true/.test(p)), W.validate(client).join("; "));
}

// Parity with the brand: the same record gives the same marks, table and words on both sides.
{
  const sample = JSON.parse(file("public/assets/sample/kalvenor-wheel.json"));
  const nulls = Object.assign({}, sample, { spokes: sample.spokes.slice(0, 3).map((spoke, i) => Object.assign({}, spoke, { named: Object.assign({}, spoke.named, { claude: i === 1 ? null : spoke.named.claude }) })) });
  const twelve = Object.assign({}, sample, { spokes: sample.spokes.concat(sample.spokes.slice(0, 2)) });
  const cases = {
    "a current one-engine result": W.fromFreeCheck(CLAUDE, { brand: "Acme Field", category: RUN.category, website: RUN.company }),
    "a legacy one-engine result": W.fromFreeCheck(UPSTREAM, { brand: "Acme Field", category: RUN.category, website: RUN.company }),
    "the five-engine sample": sample,
    "three spokes with an answer that was not valid": nulls,
    "twelve spokes": twelve,
  };
  for (const [name, data] of Object.entries(cases)) {
    const ours = W.draw(data, { id: "parity" });
    // A record with its own count unit (the sample) differs from the brand's words in the unit only:
    // "of N valid answers" reads "of N <unit>", and nothing else in the drawing moves.
    const brandDrawn = brand.draw(W.record(data), { id: "parity" });
    const unit = (text) => !data.count_unit ? text : text.replace(/ of (\d+) valid answers to /g, " of $1 " + data.count_unit + " across ").replace(/ of (\d+) valid answers/g, " of $1 " + data.count_unit);
    const theirs = { html: unit(brandDrawn.html), alt: unit(brandDrawn.alt), svg: unit(brandDrawn.svg) };
    if (data.count_unit) check("parity, " + name + ": the brand's own drawing carries the words the unit replaces", brandDrawn.html.includes(" valid answers") && !ours.html.includes(" valid answers"), name);
    check("parity, " + name + ": the same SVG path data", paths(ours.svg).length > 10 && JSON.stringify(paths(ours.svg)) === JSON.stringify(paths(theirs.svg)), paths(ours.svg).length + " paths");
    check("parity, " + name + ": the same drawing, table and words", ours.html === theirs.html && ours.alt === theirs.alt && ours.svg === theirs.svg, name);
  }
  // The core inside the served plain script is the core of the brand's module, byte for byte.
  const core = (text) => text.slice(text.indexOf("// BEGIN answer-record core"), text.indexOf("// END answer-record core"));
  check("the served answer record script carries the brand module's core byte for byte", core(file("public/assets/brand/answer-record.js")).length > 10000 && core(file("public/assets/brand/answer-record.js")) === core(file("vendor/brand/answer-record.mjs")), "core");
  // The page draws the sample at build time with the same function, and inlines both scripts.
  const page = file("public/index.html");
  check("the page's Kalvenor record is the brand's drawing of the sample", page.includes("<!-- sample record: begin -->" + W.draw(sample, { id: "sample-record" }).html + "<!-- sample record: end -->"), "run node scripts/build-page.mjs");
  check("the page carries the brand's answer record script and the wheel module, byte for byte", page.includes("/* answer record: begin */\n" + file("vendor/brand/answer-record.js").trim() + "\n/* answer record: end */") && page.includes("/* wheel module: begin */\n" + file("public/assets/wheel.js").trim() + "\n/* wheel module: end */") && page.indexOf("/* answer record: begin */") < page.indexOf("/* wheel module: begin */"), "run node scripts/build-page.mjs");
}

// Without the brand's answer record the wheel refuses to draw, and says why.
{
  const context = {};
  vm.createContext(context);
  vm.runInContext(file("public/assets/wheel.js"), context);
  let message = "";
  try { context.BwWheel.draw(JSON.parse(file("public/assets/sample/kalvenor-wheel.json"))); } catch (error) { message = String(error.message); }
  check("the wheel draws only with the brand's answer record and says so when it is missing", /load assets\/brand\/answer-record\.js first/.test(message), message);
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
