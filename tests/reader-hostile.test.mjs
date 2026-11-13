/**
 * A hostile page must not hold the page reader. These are the pages of the two findings that
 * led to the owner's ruling R-218: one block of structured data of 1,000,000 bytes, an @graph
 * of 130,000 entries, and 300,000 bytes of tags that are never closed. Before the fix the first
 * took 95 seconds in one readPage, the second threw RangeError and the third took 28 seconds.
 * Each must be read in under half a second, and none may throw.
 *
 * Run: node --test tests/reader-hostile.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readPage } from "../lib/analyze.js";

const HALF_A_SECOND_MS = 500;
const numbers = (count) => "0,".repeat(count - 1) + "0";
const structured = (json) => `<html><head><title>Acme</title></head><body><script type="application/ld+json">${json}</script><p>Acme sells widgets.</p></body></html>`;
const filled = (piece, bytes) => piece.repeat(Math.ceil(bytes / piece.length)).slice(0, bytes);

const FINDINGS = {
  "structured data that is one list of numbers, 1,000,000 bytes": structured(`[${numbers(499_941)}]`),
  "structured data whose @graph holds 130,000 entries": structured(`{"@graph":[${numbers(130_000)}]}`),
  "300,000 bytes of an opening link tag that is never closed": filled("<a ", 300_000),
  "300,000 bytes of less-than signs": filled("<", 300_000),
};

for (const [name, html] of Object.entries(FINDINGS)) {
  test(`${name}: read in under half a second, and nothing is thrown`, () => {
    const started = performance.now();
    let page = null, thrown = null;
    try { page = readPage(html, "https://hostile.example.com/"); } catch (error) { thrown = error; }
    const took = performance.now() - started;
    assert.equal(thrown, null, `readPage threw ${thrown && thrown.name}`);
    assert.ok(took < HALF_A_SECOND_MS, `readPage took ${Math.round(took).toLocaleString("en-US")} ms on ${html.length.toLocaleString("en-US")} bytes`);
    assert.equal(typeof page.body, "string");
  });
}

test("the first of those pages is 1,000,000 bytes, the size the review timed", () => {
  const bytes = Object.values(FINDINGS)[0].length;
  assert.ok(bytes >= 1_000_000 && bytes <= 1_000_100, String(bytes));
});
