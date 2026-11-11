// STEP 3.3 B142, writing gate 4 on the free check: the Kalvenor sample record's caption stated its base in one
// 42-word sentence. The base is now two sentences, each 35 words or fewer, with every count kept: 10 of 35
// questions, five engines, 50 question and engine pairs, three runs, at least 2 of 3. The words live in the
// sample data (public/assets/sample/kalvenor-wheel.json, written by scripts/build-sample-wheel.mjs), and
// scripts/build-page.mjs draws them into the page and /embed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const BASE = "10 of the sample's 35 buyer questions on each of the five engines, 50 question and engine pairs. Each pair had three runs, and a mark is filled where the company was named in at least 2 of its 3 runs";
const OLD = "50 question and engine pairs; each pair had three runs";
// The gate's word count (a run that starts with a letter, digit or currency sign).
const words = (s) => (s.match(/[A-Za-z0-9$%€£][A-Za-z0-9$%,.'’\-/]*/g) || []).length;

test("the sample base is two sentences of 35 words or fewer, with every count kept", () => {
  assert.equal(JSON.parse(read("public/assets/sample/kalvenor-wheel.json")).base, BASE);
  assert.ok(read("scripts/build-sample-wheel.mjs").includes('base: "' + BASE + '"'));
  const caption = "Base: " + BASE + ".";
  const parts = caption.split(/(?<=pairs\.) (?=Each)/);
  assert.equal(parts.length, 2);
  for (const sentence of parts) assert.ok(words(sentence) <= 35, words(sentence) + " words: " + sentence);
  for (const page of ["public/index.html", "public/embed.html"]) {
    assert.ok(read(page).includes("Base: " + BASE + ". Source: "), page);
  }
});

test("no served file keeps the 42-word form", () => {
  const served = [];
  (function walk(dir) {
    for (const entry of readdirSync(new URL("../" + dir, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(dir + entry.name + "/");
      else if (/\.(?:html|json|txt|svg|xml|js)$/.test(entry.name)) served.push(dir + entry.name);
    }
  })("public/");
  assert.ok(served.length > 10);
  assert.deepEqual(served.filter((p) => read(p).includes(OLD)), []);
});
