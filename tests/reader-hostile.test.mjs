/**
 * A hostile page must not hold the page reader. These are the pages of the two findings that
 * led to the owner's ruling R-218: one block of structured data of 1,000,000 bytes, an @graph
 * of 130,000 entries, and 300,000 bytes of tags that are never closed. Before the fix the first
 * took 95 seconds in one readPage, the second threw RangeError and the third took 28 seconds.
 * Each must be read in under half a second, and none may throw. After them comes a page of
 * 1,048,576 bytes of each piece that makes a careless reader look again and again to its end.
 *
 * Run: node --test tests/reader-hostile.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import "../lib/audit.js";
import { analyze, proposeProducts, readPage } from "../lib/analyze.js";

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

// Past the pages of the findings: a page as large as the check will read at all (1,048,576
// bytes), built of nothing but one piece that makes a reader look again and again to its end.
// Each was read in under 0.2 seconds when this was written. Two seconds is held, so that a busy
// machine does not fail the suite and a reader that has gone back to looking twice still does.
const PAGE_BYTES = 1024 * 1024;
const TWO_SECONDS_MS = 2000;
const whole = (piece) => filled(piece, PAGE_BYTES);
const between = (start, piece, end) => start + piece.repeat(Math.floor((PAGE_BYTES - start.length - end.length) / piece.length)) + end;
const DOTTED = String.fromCodePoint(0x130);
const PIECES = [
  "<a ", "<a>", "<a href=x>", "<script ", "<script>", "<style>", "<!--", "<", "<title", "<title>", "<meta ", "<meta a=\"", "<h1>", "<h2>", "&", "&a", "&#1", "&amp;",
  "<a <script <!-- <style> &amp <h2> </a ", "<script type=application/ld+json>", `<meta ${"a".repeat(5000)}>`, ">", " ", "href=", "href=\"", " href = ", "</a>",
  "<a href=\"", "<a href=\"#", "<a href=\"a#", "<a href=\"x>", "<a href=\"/products/", "<a href=\"/products/x/\">", "<a href=\"/products/x/\"></a>", "<a href=\"/products/x/\">x</a>",
  "<a href=\"/why-x\">", "<a href=\"/about\">a</a>", "/products/", `${DOTTED}<a `, `${DOTTED}<h2>`, `<a href="/why-${DOTTED}">`, "<svg <style <template <noscript <script ",
  "<script type=\"application/ld+json\">{\"@type\":\"Organization\",\"name\":\"N\"}</script>", "<script type=\"application/ld+json\">[",
];
const BUILT = {
  "product paths in one address, closed at the end": between("<a href=\"", "/products/", "\">x</a>"),
  "product paths in one address with a tag end inside it": between("<a href=\"x>", "/products/", "\""),
  "product links with one closer at the end": between("", "<a href=\"/products/x/\">", "</a>"),
  "one closer, then product links": between("</a>", "<a href=\"/products/x/\">", ""),
  "addresses in one tag, each cut short by a hash": between("<a href=\"/about\" ", "<a href=\"aaaaaaaaaaaaaaaa#", ">"),
  "a first heading of nothing but tags": between("<h1>", "<b>", "</h1>"),
  "structured data, a list of numbers in blocks of 10,000 bytes": whole(`<script type="application/ld+json">[${numbers(4981)}]</script>`),
  "structured data, lists nested 90,000 deep": structured("[".repeat(90_000) + "]".repeat(90_000)),
  "structured data, @graph inside @graph 20,000 deep": structured("{\"@graph\":[".repeat(20_000) + "{\"@type\":\"Organization\",\"name\":\"Deep\"}" + "]}".repeat(20_000)),
};

test(`a page of ${PAGE_BYTES.toLocaleString("en-US")} hostile bytes is read in a moment, whatever it is made of`, () => {
  const pages = Object.assign(Object.fromEntries(PIECES.map((piece) => [`all "${piece.slice(0, 40)}"`, whole(piece)])), BUILT);
  let slowest = 0;
  for (const [name, html] of Object.entries(pages)) {
    const started = performance.now();
    const page = readPage(html, "https://hostile.example.com/");
    const took = performance.now() - started;
    slowest = Math.max(slowest, took);
    assert.ok(took < TWO_SECONDS_MS, `${name}: readPage took ${Math.round(took).toLocaleString("en-US")} ms`);
    assert.ok(page.links.length <= 400 && page.h2s.length <= 12 && page.orgNames.length <= 60 && page.body.length <= 20000, name);
  }
  assert.ok(slowest < TWO_SECONDS_MS, `slowest: ${Math.round(slowest)} ms`);
});

// A page of nothing but links into a product section, each with its own words. Reading it gives
// tens of thousands of names, and the five that are proposed must not cost a pass over all of
// them for each one. Before the fix proposeProducts took 9 seconds on one such page.
const productLinks = (bytes) => {
  let html = "<a href=\"/about\">About</a><a href=\"/company\">Company</a>";
  for (let n = 1; html.length < bytes - 40; n += 1) html += `<a href="/products/x/">N${n}</a>`;
  return html;
};

test("a page of 32,000 different product links: five names are proposed in under half a second", () => {
  const html = productLinks(PAGE_BYTES);
  const started = performance.now();
  const page = readPage(html, "https://hostile.example.com/");
  const products = proposeProducts([page, page, page], "hostile.example.com");
  const took = performance.now() - started;
  assert.ok(page.productNames.length > 30_000, String(page.productNames.length));
  assert.deepEqual(products, ["N1", "N2", "N3", "N4", "N5"]);
  assert.ok(took < HALF_A_SECOND_MS, `reading and proposing took ${Math.round(took).toLocaleString("en-US")} ms`);
});

test("a whole check of three such pages ends in under two seconds", async () => {
  const html = productLinks(PAGE_BYTES);
  const net = async (address) => {
    const target = new URL(address);
    if (target.hostname === "cloudflare-dns.com") {
      const answer = target.searchParams.get("type") === "A" ? [{ name: target.searchParams.get("name"), type: 1, data: "93.184.216.34" }] : [];
      return new Response(JSON.stringify({ Status: 0, Answer: answer }), { headers: { "content-type": "application/dns-json" } });
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  };
  const request = new Request("https://audit.broadcastwell.com/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: "hostile.example.org" }) });
  const started = performance.now();
  const response = await analyze(request, {}, { fetcher: net, preview: true });
  const body = await response.json();
  const took = performance.now() - started;
  assert.equal(response.status, 200);
  assert.deepEqual(body.pages, ["https://hostile.example.org/", "https://hostile.example.org/about", "https://hostile.example.org/company"]);
  assert.deepEqual(body.product_names, ["N1", "N2", "N3", "N4", "N5"]);
  assert.ok(took < TWO_SECONDS_MS, `the check took ${Math.round(took).toLocaleString("en-US")} ms`);
});
