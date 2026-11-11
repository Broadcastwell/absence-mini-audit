// The art director's live round 2 on the front door and the free check result (STEP 3.3 B128, the lead's
// ART-R3 rules): both columns filled at 1440 with every second column on column 7, the result hung from the
// 16 px phone edge, hierarchical radii, no numerals on the result cards, and one disclosure drawn the way
// the Framer pages draw it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
await import("../public/assets/report.js");
const R = globalThis.BwReport;

const PAGE = read("public/index.html");
const style = PAGE.slice(PAGE.indexOf("/* brand: end */"), PAGE.indexOf("</style>"));
const script = PAGE.slice(PAGE.indexOf("<script>") + 8, PAGE.indexOf("</script>", PAGE.indexOf("<script>")));
const main = PAGE.slice(PAGE.indexOf("<main"), PAGE.indexOf("</main>"));
// The rules of the first media block that opens with this query and holds the given selector.
const block = (query, holds) => {
  let at = 0;
  for (;;) {
    at = style.indexOf("@media (" + query + ") {", at);
    assert.ok(at >= 0, query + " block holding " + holds);
    const end = style.indexOf("\n}", at);
    const body = style.slice(at, end);
    if (body.includes(holds)) return body;
    at = end;
  }
};

test("the page and /embed stay the same bytes, and the 404 page carries the same style block", () => {
  assert.equal(read("public/embed.html"), PAGE);
  assert.ok(read("public/404.html").includes(PAGE.slice(PAGE.indexOf("<style>"), PAGE.indexOf("</style>"))));
});

test("front door at 1024 px and up: the check and the right column start at column 7, and the explanation fills the left", () => {
  const wide = block("min-width: 1024px", ".detail.detail-side");
  assert.match(wide, /\.audit-grid \{ grid-template-columns: repeat\(12, minmax\(0, 1fr\)\); grid-template-rows: auto auto 1fr;/);
  assert.match(wide, /\.intro \{ grid-column: 1 \/ span 6; grid-row: 1; \}/);
  assert.match(wide, /\.form-column \{ grid-column: 7 \/ span 6; grid-row: 1 \/ span 2; \}/);
  assert.match(wide, /\.detail \{ grid-column: 1 \/ span 6; grid-row: 2 \/ span 2;/);
  assert.match(wide, /\.detail\.detail-side \{ grid-column: 7 \/ span 6; grid-row: 3; \}/);
  assert.match(wide, /\.audit-grid\.has-result \.form-column \{ grid-column: 1 \/ -1; grid-row: 1; \}/);
  assert.doesNotMatch(wide, /grid-column: 8 \//, "no second column on column 8");
  // The sections keep their order on a phone: the left column first, then the right.
  const titles = [...main.matchAll(/<section class="left-section[^"]*" aria-labelledby="([a-z]+)-title">/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["wheel", "method", "privacy", "full", "faq"]);
  const left = main.slice(main.indexOf('<section class="detail" aria-label="How the check works">'), main.indexOf('<div class="detail detail-side">'));
  const right = main.slice(main.indexOf('<div class="detail detail-side">'));
  assert.ok(["wheel", "method", "privacy"].every((t) => left.includes('aria-labelledby="' + t + '-title"')));
  assert.ok(["full", "faq"].every((t) => right.includes('aria-labelledby="' + t + '-title"')));
  // Hidden with the rest of the explanation when a result, the PHP2Shell mode or /embed is on screen.
  assert.match(style, /\.audit-grid\.has-result \.detail, \.audit-grid\.has-result \.form-column > \.card:first-child, \.php-mode \.detail \{ display: none; \}/);
  assert.match(style, /html\.embed \.bw-skip,html\.embed \.bw-site-nav,html\.embed \.page-notes,html\.embed \.bw-site-footer,html\.embed \.detail\{display:none\}/);
});

test("result at 1024 px and up: the score beside its record, graphics beside captions, two columns of questions", () => {
  const wide = block("min-width: 1024px", "#result {");
  assert.match(wide, /#result \{ display: grid; grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/);
  assert.match(wide, /#result > \.next-steps \{ grid-column: 1 \/ span 6; \}/);
  assert.match(wide, /#result > \.report-scope \{ grid-column: 7 \/ span 6; \}/);
  assert.match(wide, /\.report-score > \.result-record \{ grid-column: 7 \/ span 6; grid-row: 1 \/ -1; margin: 0; \}/);
  assert.match(wide, /\.buy-path > \.keep \{ grid-column: 7 \/ span 6; grid-row: 1 \/ -1;/);
  assert.match(wide, /\.result \.report-figure > \.report-caption \{ grid-column: 7 \/ span 6; grid-row: 1;/);
  assert.match(wide, /\.result \.question-list \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(wide, /#email-form > \.hint \{ grid-column: 2;/);
  for (const placed of wide.matchAll(/grid-column: (\d+) \//g)) assert.ok(["1", "7"].includes(placed[1]), "every column starts at 1 or 7: " + placed[0]);
  assert.match(main, /<section class="report-section report-score" aria-labelledby="score-title">/);
  assert.match(main, /<section class="report-section report-scope" aria-labelledby="scope-title">/);
});

test("phone: the result hangs from the 16 px edge, not inside a card's padding", () => {
  const phone = block("max-width: 767px", ".card {");
  assert.match(phone, /\.card \{ padding: var\(--bw-space-16\); \}\n  \.card\.result \{ padding: 0; \}/);
  assert.match(style, /\.result \{ margin-top: 0; padding: 0; border: 0; border-radius: 0; \}/);
});

test("radii: inner panels are 0 inside their cards, a panel that stands alone is 12", () => {
  const rule = (selector) => (new RegExp("\\n" + selector.replace(/[.#]/g, "\\$&") + " \\{([^}]*)\\}").exec(style) || [])[1] || "";
  for (const inner of [".answer-disclosure", ".engine-note", ".read", ".preview"]) assert.match(rule(inner), /border-radius: 0;/, inner);
  assert.match(rule(".email-card"), /border-radius: var\(--bw-radius-12\);/);
  assert.match(rule(".shared-note"), /border-radius: var\(--bw-radius-12\);/);
  assert.match(rule(".card"), /border-radius: var\(--bw-radius-8\);/);
  assert.match(rule(".question-list li"), /border-radius: var\(--bw-radius-8\);/);
});

test("the result cards keep their plain type labels, without numerals", () => {
  assert.match(script, /type\.className = 'q-type'; type\.textContent = TYPE_LABELS\[index\];/);
  assert.doesNotMatch(script, /\(index \+ 1\) \+ '\. ' \+ TYPE_LABELS/);
  assert.match(script, /var TYPE_LABELS = \['Best of', 'Best of', 'Best of', 'Alternatives', 'Alternatives', 'Alternatives', 'Comparison', 'Comparison', 'Evaluation', 'Use case'\];/);
});

test("one disclosure, as the Framer pages draw it: 20 px questions, a right-hand chevron, no native triangle", () => {
  assert.match(style, /\.faq summary \{ display: flex; align-items: baseline; justify-content: space-between; gap: var\(--bw-space-24\);[^}]*font-size: var\(--bw-text-20\);[^}]*font-weight: var\(--bw-weight-semibold\);[^}]*list-style: none; \}/);
  assert.match(style, /\.faq summary::-webkit-details-marker, \.preview summary::-webkit-details-marker, \.answer-disclosure summary::-webkit-details-marker \{ display: none; \}/);
  const chevron = (/\.faq summary::after, \.preview summary::after, \.answer-disclosure summary::after \{([^}]*)\}/.exec(style) || [])[1] || "";
  assert.match(chevron, /width: var\(--bw-space-16\); height: var\(--bw-space-16\); background: var\(--bw-color-ink-secondary\);/);
  assert.match(chevron, /mask: url\("data:image\/svg\+xml,[^"]*d='m6 9 6 6 6-6'[^"]*"\) center \/ contain no-repeat;/);
  assert.match(style, /\.faq details\[open\] > summary::after, \.preview\[open\] > summary::after, \.answer-disclosure\[open\] > summary::after \{ transform: rotate\(180deg\); \}/);
  assert.doesNotMatch(style, /summary \{ display: list-item/);
  // The questions are the structured data's questions, word for word, one summary each.
  assert.equal((main.match(/<details(?: id="[^"]+")?><summary>/g) || []).length, 6);
});

test("24 px between the share heading and its help text", () => {
  assert.match(style, /\n\.keep h3 \{ margin-bottom: var\(--bw-space-24\); \}/);
});

test("a bar graphic is drawn at the width it is shown at, so its words stay 16 px", () => {
  const rows = [{ label: "Acme (you)", count: 3, own: true }, { label: "Vendor A", count: 10, own: false }];
  assert.match(R.bars(rows, "Companies"), /viewBox="0 0 640 132"/, "the default width is unchanged");
  assert.match(R.bars(rows, "Companies", { compact: true }), /viewBox="0 0 360 132"/, "the compact width is unchanged");
  const wide = R.bars(rows, "Companies", { width: 588 });
  assert.match(wide, /viewBox="0 0 588 132"/);
  assert.match(wide, /<rect x="0" y="40" width="528" height="12"/, "the track runs to 60 px short of the edge");
  assert.match(R.bars(rows, "Companies", { width: 300 }), /viewBox="0 0 640 132"/, "below 480 px the width option is ignored");
  for (const name of ["company", "source"]) assert.equal(script.split("{compact:document.getElementById('" + name + "-chart').clientWidth<480,width:document.getElementById('" + name + "-chart').clientWidth}").length, 3, name);
});
