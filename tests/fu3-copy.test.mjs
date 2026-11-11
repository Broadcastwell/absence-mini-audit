// Follow-up 3 of STEP 3.3 (11 November 2026), items 2 and 3, on the free check (rulings R-168 and R-169).
// Item 2: every refund sentence a visitor or a machine reads is one of the owner's sentences, word for word.
// Item 3: the result's account card states the offer and leaves the ceiling to the check, so the clause
// "while free runs are open" and the two "Free runs have no end date" sentences are gone, while the check
// page keeps its limit line and its closed state.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const PAGE = read("public/index.html");
const LLMS = read("public/llms.txt");

// The owner's sheet (FU3 item 2), word for word.
const SHORT = "Full refund on request within 30 days of delivery.";
const LONG = [
  "If we miss the deliverable or deadline, we initiate a full $490 refund within five business days.",
  "You keep the work.",
  "You may also request a full refund within 30 days of delivery."
];
const AGENCY = "Refundable in full within 30 days of delivery.";
const SHEET = new Set([SHORT, ...LONG, AGENCY,
  "If we miss the work or the deadline, we start the refund ourselves.",
  "Measured gain on the agreed test, or the full $3,900 back.",
  "If we do not deliver within 24 hours of payment, we refund the $19 in full.",
  "Agreed in writing before payment, with no automatic enrollment."]);
// Found and left, each with its reason in the batch record (C:/Users/saira/step33/b139/DECISIONS.md):
// the owner's Ready promise, which tests/current-entry.test.mjs pins byte for byte; the free run allowance,
// which is not money; and two link labels that name the terms page.
const LEFT = new Set([
  "If Ready still cannot be reached, you can cancel for a full refund.",
  "After three refunded failures in a day, further failed attempts use the network allowance.",
  "Delivery and refund terms.",
  "Read the dated delivery and refund terms."
]);
const REFUND = /refund|money back|back if|full \$|credited|cancel/i;

const visible = (html) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, " ")
  .replace(/<(?:p|li|h[1-6]|summary|details|div|section)\b[^>]*>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&");
const sentences = (text) => text.split(/\n+/).flatMap((line) => line.trim().split(/(?<=[.?])\s+(?=[A-Z$])/)).map((s) => s.trim()).filter(Boolean);
const jsonLdStrings = (html) => {
  const out = [];
  const walk = (value) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) walk(JSON.parse(m[1]));
  return out;
};

test("item 2: every refund sentence on the page, in its JSON-LD and in llms.txt is the owner's sentence or a listed exception", () => {
  const found = [
    ...sentences(visible(PAGE)),
    ...jsonLdStrings(PAGE).flatMap((s) => sentences(s)),
    ...sentences(LLMS.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^[-#>] ?/gm, "").replace(/: /g, ".\n"))
  ].filter((s) => REFUND.test(s));
  assert.ok(found.length >= 10, "the scan reads the refund sentences (" + found.length + ")");
  const stray = found.filter((s) => !SHEET.has(s) && !LEFT.has(s));
  assert.deepEqual(stray, []);
});

test("item 2: the short form, the long form and the Agency sentence stand whole where they belong", () => {
  // The PHP2Shell result's Answer Repair card and llms.txt use the short form after the deadline sentence.
  assert.ok(PAGE.includes("Due 48 elapsed hours after recorded Ready. " + SHORT + "</p></section>"));
  assert.ok(LLMS.includes("due 48 elapsed hours after recorded Ready. " + SHORT + "\n"));
  // The buy path, the repair section and the Service description carry the long form.
  assert.equal(PAGE.split(LONG.join(" ")).length - 1, 3);
  // The Agency Deadline Audit's refund is its own sentence after the findings deadline (page twice, JSON-LD once).
  assert.equal(PAGE.split("Findings within 48 hours of recorded scope confirmation. " + AGENCY).length - 1, 3);
  for (const old of ["with the published full-refund terms", "; refundable in full", "with full refund terms", "Full refund if we miss the work or deadline", "and on request within 30 days of delivery"]) {
    assert.ok(!PAGE.includes(old) && !LLMS.includes(old), old);
  }
  assert.doesNotMatch(PAGE + LLMS, /\$471/);
  assert.equal(read("public/embed.html"), PAGE, "the frame serves the same bytes");
});

test("item 3: the account card ends at the runs, and the limit stays on the check page and in the closed state", () => {
  for (const cut of ["while free runs are open", "Free runs have no end date", "They close only if the free check reaches its overall limit", "the check says so when that happens"]) {
    assert.ok(!PAGE.includes(cut) && !LLMS.includes(cut), cut);
  }
  const keep = PAGE.slice(PAGE.indexOf('<li id="next-keep">'), PAGE.indexOf('<li id="next-second">'));
  assert.ok(keep.includes("<p>Create a free account, no card. It keeps this check, and for 14 days it opens the tracking screens on ten buyer questions for your category, with up to three one-engine runs.</p>"));
  assert.ok(PAGE.includes("<p>Runs are limited per network and per day. The allowance resets at 00:00 UTC.</p>"));
  // The closed state is the handler's own sentence (lib/audit.js, unchanged), shown as the handler sends it.
  assert.ok(read("lib/audit.js").includes("This check has reached its overall limit, so no run was started and this attempt was not counted."));
});
