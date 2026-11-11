// The art director's live round 3 on the front door (STEP 3.3 B132, the lead's ART-R4 rules): section headings
// that state what the section shows, the phone card and its panels hung from the 16 px gutter, the website field's
// own check in the browser (the same shape rules as the server's, never stricter), and the busy run button. The
// page's behaviour under a fake DOM is checked in tests/frontdoor.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { checkAddress } from "../lib/guard.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const PAGE = read("public/index.html");
const style = PAGE.slice(PAGE.indexOf("/* brand: end */"), PAGE.indexOf("</style>"));
const script = PAGE.slice(PAGE.indexOf("<script>") + 8, PAGE.indexOf("</script>", PAGE.indexOf("<script>")));
const main = PAGE.slice(PAGE.indexOf("<main"), PAGE.indexOf("</main>"));

test("point 4: the explanatory sections are headed by statements, not labels", () => {
  const heads = [...main.matchAll(/<section class="left-section[^"]*" aria-labelledby="([a-z]+)-title"><h2 id="\1-title">([^<]+)<\/h2>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(Object.fromEntries(heads).wheel, "The shortlist wheel shows which engine named a company on each question");
  assert.deepEqual(Object.fromEntries(heads).method, "The ten questions come from a published bank");
  assert.doesNotMatch(main, />The shortlist wheel<|>A fixed public method</);
  for (const [, text] of heads) assert.doesNotMatch(text, /—|--|!|\b(?:I|me|my)\b/);
  assert.equal(read("public/embed.html"), PAGE, "the frame serves the same bytes");
});

test("point 5: on a phone the check's card and every inset panel run full-bleed from the 16 px gutter", () => {
  const at = style.indexOf("Art director's live round 3, point 5");
  assert.ok(at > 0);
  const phone = style.slice(style.lastIndexOf("@media (max-width: 767px) {", at), style.indexOf("\n}", at));
  assert.match(phone, /html:not\(\.embed\) \.card:not\(\.result\) \{ margin-inline: calc\(-1 \* var\(--bw-layout-margin\)\); padding-inline: var\(--bw-layout-margin\); border-width: var\(--bw-stroke-hairline\) 0 0; border-radius: 0; \}/);
  assert.match(phone, /html:not\(\.embed\) :is\(\.progress, \.message, \.shared-note\) \{ margin-inline: calc\(-1 \* var\(--bw-layout-margin\)\); padding-inline: var\(--bw-layout-margin\); border-radius: 0; \}/);
  assert.doesNotMatch(phone, /\.message[^{]*\{[^}]*border-inline: 0/, "the notice keeps its left rule");
  assert.match(phone, /html:not\(\.embed\) :is\(\.card \.engine-note, \.card \.read, \.answer-disclosure\) \{ margin-inline: calc\(-1 \* var\(--bw-layout-margin\)\); padding-inline: var\(--bw-layout-margin\); \}/);
  assert.match(phone, /html:not\(\.embed\) :is\(\.card \.read, \.message\) \{ padding-left: calc\(var\(--bw-layout-margin\) - var\(--bw-stroke-rule\)\); \}/);
  assert.match(phone, /html:not\(\.embed\) \.question-list li \{ margin-inline: calc\(-1 \* var\(--bw-layout-margin\)\); padding-inline: var\(--bw-layout-margin\);/);
  // The /embed frame has no gutter (its container and page carry no padding), so nothing bleeds there.
  const bleeds = phone.split("\n").filter((line) => line.includes("margin-inline: calc(-1"));
  assert.ok(bleeds.length >= 4 && bleeds.every((line) => line.trimStart().startsWith("html:not(.embed) ")), "every bleed rule skips the frame");
  assert.match(style, /html\.embed \.container \{ max-width: none; margin: 0; padding-inline: 0; \}/);
  // The phone margin the bleed reads is the brand's 16 px gutter.
  assert.match(PAGE, /@media \(max-width:767px\)\{:root\{--bw-layout-margin:16px;/);
});

test("points 15 and 18: the field's own check follows the server's shape rules and is never stricter", () => {
  const start = script.indexOf("  var SITE_SHAPE"), end = script.indexOf("  function markSite(");
  assert.ok(start > 0 && end > start);
  const box = { URL };
  vm.createContext(box);
  vm.runInContext(script.slice(start, end), box);
  const cases = ["acmefield.com", "https://acmefield.com/pricing", "http://www.acmefield.com:443/", "bücher.de", "EXAMPLE.COM.", "a.b.c.example.org",
    "not a website", "acme field.com", "localhost", "intranet.local", "printer.lan", "10.0.0.1", "2130706433", "0x7f.1", "[::1]", "ftp://acmefield.com",
    "https://user:pass@acmefield.com", "acmefield.com:8080", "http://acme_field.com", "acmefield", "a..com", "x".repeat(64) + ".com", "javascript:alert(1)", "acmefield.test"];
  for (const value of cases) {
    const client = box.siteProblem(value), server = checkAddress(value);
    assert.equal(client === "", server.ok, value + ": the browser and the server agree");
    if (!server.ok) assert.equal(client, server.reason === "address" ? box.SITE_SHAPE : box.SITE_PUBLIC, value + ": the plain line for its reason");
  }
  assert.equal(box.siteProblem(""), "", "an empty field waits for the submit");
  assert.match(script, /siteInput\.addEventListener\('blur', function \(\) \{ markSite\(siteProblem\(siteValue\(\)\)\); \}\);/);
  assert.match(style, /input\[aria-invalid="true"\] \{ border-color: var\(--bw-color-notice-rule\); border-left-width: var\(--bw-stroke-rule\); \}/);
  assert.match(main, /<input id="company"[^>]*aria-describedby="site-hint site-error"/, "the error line describes the field");
  assert.match(main, /<p id="site-error" class="field-error hidden" role="alert"><\/p>/);
});

test("point 18: one helper disables the run button and the selector while a site is read or a check runs", () => {
  assert.match(script, /function busy\(on\) \{ go\.disabled = on; modeInput\.disabled = on; if \(on\) go\.setAttribute\('aria-busy', 'true'\); else go\.removeAttribute\('aria-busy'\); \}/);
  assert.doesNotMatch(script, /go\.disabled\s*=\s*(?:true|false)/, "every change goes through busy()");
  assert.match(style, /\.primary\[disabled\], \.small-button\[disabled\] \{ background: var\(--bw-color-canvas\);/);
});
