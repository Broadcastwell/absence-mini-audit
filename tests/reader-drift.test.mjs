/**
 * The free check and the app's fix engine read a page with the same code. This test fails when
 * the two drift apart, and when the free check's reading of an ordinary page changes at all.
 *
 *   1. The shared file is pinned by its SHA-256. The app (bw-client-data) holds the same bytes
 *      and pins the same hash in test/fix-freecheck-drift.test.js. A change to one side alone
 *      fails the test of that side: change both, and both pins, together.
 *   2. Fifteen ordinary pages and twelve sites (tests/fixtures/reader/) are read, and every
 *      value must equal what the code of main c64f480 answered for them before the reader was
 *      changed (expected.json). If a value differs, the code is wrong, not the fixture.
 *   3. Every fixture and expected.json are pinned by MANIFEST.json, and MANIFEST.json by its
 *      hash here and in the app's test, which reads the same pages with the app's reader.
 *   4. On small awkward pages the reader gives what the reader of c64f480 gave
 *      (tests/reader-reference.mjs), so a page with broken markup reads the same too.
 *
 * Run: node --test tests/reader-drift.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FIXTURE_DIR, fixtureIndex, fixtureManifest, fixtureText, readerOutputs, sha256 } from "../scripts/reader-fixtures.mjs";
import { proposeProducts, readPage } from "../lib/analyze.js";
import { firstElement, lowerInPlace, stripCode } from "../lib/html-scan.js";
import { LD_LIMITS } from "../lib/ld-read.js";
import { proposeProductsBefore, readPageBefore } from "./reader-reference.mjs";

// The files this repository shares with the app, byte for byte.
const SHARED = {
  // bw-client-data: functions/lib/fix/html-scan.js
  "lib/html-scan.js": "37a86e097e5c5b57954d6a8d51b85fde494d42bf30fd11074f5d9bd50462dc58",
};
// The structured data reader is the app's (functions/lib/fix/site-read.js, nodesOfBlock and
// jsonLdNodes, with LD_LIMITS of engine-config.js), held here as one file. A change to it is a
// change the app's reader needs too.
const PORTED = {
  "lib/ld-read.js": "bbcc111b9341449d5ac3c81115666d61144be06775c87df4cb514539f79aad6b",
};
// tests/fixtures/reader/MANIFEST.json. The app pins the same hash.
const MANIFEST_SHA256 = "c02d1d3fe73539048f014fed51cafd61a24442f91313312427cabcdd667c2724";

test("the shared reader files are the pinned bytes, the same bytes the app holds", () => {
  for (const [file, hash] of Object.entries({ ...SHARED, ...PORTED })) {
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.includes(13), false, `${file} has a carriage return: the hash covers LF line endings`);
    assert.equal(sha256(bytes), hash, `${file} changed. Change the app's copy and both pins with it.`);
  }
});

test("the limits on structured data are the fix engine's", () => {
  assert.deepEqual({ ...LD_LIMITS }, { bytes: 200_000, blocks: 20, visited: 2_000, nodes: 60, depth: 4 });
});

test("the fixtures are the pinned ones: every page, the index and the expected answers", () => {
  const manifest = JSON.parse(fixtureText("MANIFEST.json"));
  assert.deepEqual(fixtureManifest(), manifest, "a fixture changed, was added or was removed");
  assert.equal(sha256(fs.readFileSync(path.join(FIXTURE_DIR, "MANIFEST.json"))), MANIFEST_SHA256, "MANIFEST.json changed. The app pins the same hash.");
  const index = fixtureIndex();
  assert.ok(index.pages.length >= 12, `${index.pages.length} pages`);
  for (const { file } of index.pages) assert.ok(manifest[file], file);
  assert.ok(manifest["expected.json"] && manifest["index.json"]);
});

test("an ordinary company's pages read exactly as they did before the reader was changed", async () => {
  const expected = JSON.parse(fixtureText("expected.json"));
  const now = await readerOutputs();
  let values = 0;
  for (const group of ["pages", "sites"]) {
    assert.deepEqual(Object.keys(now[group]), Object.keys(expected[group]));
    for (const [name, recorded] of Object.entries(expected[group])) {
      for (const [key, value] of Object.entries(recorded)) {
        values += 1;
        assert.deepEqual(now[group][name][key], value, `${name}: ${key}`);
      }
      assert.deepEqual(Object.keys(now[group][name]), Object.keys(recorded), name);
    }
  }
  assert.equal(values, 154, "20 pages of 6 values and 17 sites of 2");
  // The whole answer of every site, key for key and in the same order: what a visitor's page is sent.
  for (const [name, recorded] of Object.entries(expected.sites)) assert.equal(JSON.stringify(now.sites[name].body), JSON.stringify(recorded.body), name);
});

// The two characters that String.toLowerCase moves: a page that holds them must still be read
// at the right places. The engine's first scanner lost the title of any such page.
test("a page that holds a dotted capital I or a kelvin sign is read at the right places", () => {
  const I = String.fromCodePoint(0x130), K = String.fromCodePoint(0x212a);
  const html = `<p>${I}stanbul ${I}zmir 300 ${K}</p><TITLE>Acme Yaz${I}l${I}m</TITLE><SCRIPT>var a = 1;</script><H1>Merhaba ${K}</h1><lin${K} rel=x><a href="/about">${I}</a>`;
  assert.equal(lowerInPlace(html).length, html.length);
  assert.equal(firstElement(html, "title"), `Acme Yaz${I}l${I}m`);
  assert.equal(firstElement(html, "h1"), `Merhaba ${K}`);
  assert.equal(stripCode(html), html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " "));
  assert.deepEqual(readPage(html, "https://acme.example.com/"), readPageBefore(html, "https://acme.example.com/"));
  assert.equal(lowerInPlace("<A HREF=X>"), "<a href=x>");
});

// Small pages built from the pieces that matter to a reader: tags opened and never closed,
// closers with no opener, quotes that do not pair, links inside links, code inside code,
// comments, entities, capitals. The order is fixed by the seed, so a failure repeats.
const I = String.fromCodePoint(0x130), K = String.fromCodePoint(0x212a), DASH = String.fromCodePoint(0x2014);
const PIECES = [
  "<a href=\"", "<a href=\"", "<a href='", "<a class=x href=\"", "<A HREF=\"", "<a href = \"", "<a\nhref=\"", " href=\"", " href='", " data-href=\"", "<a href=\"/about\">", "<a href='/company'>", "<a href=\"/why-us\" data-href=\"/platform\">",
  "<a href=\"/products/x/\">", "<a href='/platform/y/'>", "<a href=\"/product/z/\">", "<A HREF=\"/Products/Q/\">", "<a href=\"/about#team\">", "<a href=\"/features\">Features</a>", "<a href=\"/products/one/\">One</a>", "<a href=/about>",
  "\">", "'>", "\" >", "\"", "'", "/about\"", "/company'", "/products/a/\"", "/platform/b/'", "/how-it-works\">", "/solutions/\">Solutions</a>", "/overview?x=1#y\">", "/en-us/about/\">", "/why-fuzz\">",
  "<script type=\"application/ld+json\">{\"@type\":\"Organization\",\"name\":\"Org One\"}</script>", "<script type=\"application/ld+json\">[{\"@type\":\"Product\",\"name\":\"Prod\"},{\"@graph\":[{\"@type\":\"Brand\",\"name\":\"Brand\"}]}]</script>",
  "<script type=\"application/ld+json\">{\"@graph\":[{\"@type\":\"SoftwareApplication\",\"name\":\"App\",\"applicationCategory\":\"Payroll software\",\"description\":\"Runs payroll.\"},7,null,\"s\"]}</script>",
  "<title>Fuzz | CRM software</title>", "<h1>Fuzz Desk</h1>", "<h2>Heading</h2>", "<meta name=\"description\" content=\"Help desk software &amp; more\">",
  "<a", "<A", "<a ", "<a\n", " href=", " HREF=", " href = ", "href", "data-href=", "=", "\"", "\"", "'", ">", ">", ">", "</a>", "</A>", "</a", "<",
  "/products/", "/product/", "/platform/", "/Products/x/", "/about", "/company", "/why-us", "/de/features/", "#", "#top", "?x=1", "x", "Word", " ", " ", "\n", "\t",
  "https://fuzz.example.com/overview", "//www.fuzz.example.com/solutions", "https://other.example.net/about", "mailto:a@b.example", "&amp;", "&#65;", "&#x41;", "&nbsp;", "&", ";", "&bogus;",
  "<h1>", "<h1 class=x>", "</h1>", "<H1>", "</H1>", "<h2>", "</h2>", "<h2", "<H2>", "</H2>", "<h2x>", "<h10>", "<title>", "</title>", "<TITLE lang=en>", "</TITLE>", "<title",
  "<script>", "</script>", "<SCRIPT>", "</SCRIPT>", "<script ", "<style>", "</style>", "<noscript>", "</noscript>", "<svg", "<svg>", "</svg>", "<template>", "</template>", "<abbr>", "<article>",
  "<script type=\"application/ld+json\">", "<script type='application/ld+json'>", "<script type=application/ld+json>", "<SCRIPT TYPE = \"application/ld+json\">",
  "{\"@type\":\"Organization\",\"name\":\"Org One\"}", "{\"@type\":\"Product\",\"name\":\"Prod <b>One</b>\",\"description\":\"A product &amp; more\"}", "{\"@type\":[\"SoftwareApplication\"],\"name\":\"App\",\"applicationCategory\":\"CRM software\"}",
  "{\"@graph\":[", "]}", "[", "]", ",", "{\"@type\":\"WebSite\",\"name\":7}", "null", "42", "\"text\"", "{", "}",
  "<meta name=\"description\" content=\"", "<meta property=og:title content=Unquoted", "<META NAME=\"Description\" CONTENT='", "<meta property=\"og:site_name\" content=\"Site Name\">", "<meta itemprop=name content=x>", "<meta",
  "<!--", "-->", "--", DASH, I, I, K, "CRM software", "payroll", "dental practice management software", "Acme", "Fuzz", " | ", " - ",
];
const ADDRESSES = ["https://fuzz.example.com/", "https://www.fuzz.example.com/about", "not an address"];

test("on 4,000 small awkward pages the reader gives what the reader of c64f480 gave", () => {
  let seed = 20261113;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const gave = { title: 0, h2s: 0, orgNames: 0, links: 0, productNames: 0 };
  let earlier = readPage("", "https://fuzz.example.com/");
  for (let n = 0; n < 4000; n += 1) {
    const length = 1 + Math.floor(random() * (n % 3 === 0 ? 150 : 40));
    let html = "";
    for (let i = 0; i < length; i += 1) html += pick(PIECES);
    const address = pick(ADDRESSES);
    const now = readPage(html, address);
    assert.deepEqual(now, readPageBefore(html, address), `page ${n}: ${JSON.stringify(html)}`);
    // The names proposed from this page and the one before it, for a site with no known products
    // and for one with a list of its own.
    for (const host of ["fuzz.example.com", "salesforce.com"]) assert.deepEqual(proposeProducts([now, earlier], host), proposeProductsBefore([now, earlier], host), `page ${n}: products for ${host}`);
    earlier = now;
    for (const key of Object.keys(gave)) if (now[key].length) gave[key] += 1;
  }
  // The pages are not empty of what is compared: each field was given by hundreds of them.
  for (const [key, count] of Object.entries(gave)) assert.ok(count > 400, `${key}: ${count} pages`);
});

test("every fixture page reads as the reader of c64f480 read it, field for field", () => {
  for (const { file, url } of fixtureIndex().pages) assert.deepEqual(readPage(fixtureText(file), url), readPageBefore(fixtureText(file), url), file);
});

// proposeProducts stops at its fifth name. The names it gives are the ones it always gave.
test("the products proposed are the ones the code of c64f480 proposed, for one page and for many", () => {
  const pages = fixtureIndex().pages.map(({ file, url }) => readPage(fixtureText(file), url));
  const many = Array.from({ length: 40 }, (_unused, n) => ({ productNames: ["Home", "", `Name ${n % 7}`, `NAME ${n % 7}`, "x".repeat(81), `Other ${n}`] }));
  // Hosts with no known products, and with 3, 2, 4, 5 and 10 of their own.
  for (const host of ["fuzz.example.com", "salesforce.com", "www.hubspot.com", "avenhospitality.com", "vertafore.com", "oracle.com"]) {
    for (const set of [pages, pages.slice(1, 4), [pages[6]], many, many.slice(0, 1), [], [{}]]) assert.deepEqual(proposeProducts(set, host), proposeProductsBefore(set, host), host);
    for (const page of pages) assert.deepEqual(proposeProducts([page], host), proposeProductsBefore([page], host), host);
  }
});

// What is past a limit of the structured data is not read, and what is inside it still is.
const numbers = (count) => "0,".repeat(count - 1) + "0";
const structured = (json) => `<html><head><title>Acme</title></head><body><script type="application/ld+json">${json}</script><p>Acme sells widgets.</p></body></html>`;
test("structured data is read inside the engine's limits, in the order it always was", () => {
  const at = (html) => readPage(html, "https://acme.example.com/").orgNames;
  const org = (name) => `{"@type":"Organization","name":"${name}"}`;
  assert.equal(at(`<script type="application/ld+json">${org("N")}</script>`.repeat(5000)).length, LD_LIMITS.blocks, "20 blocks");
  assert.deepEqual(at(structured(`[${numbers(1_999)},${org("Entry 2000")}]`)), [{ name: "Entry 2000", type: "Organization" }], "the 2,000th entry is looked at");
  assert.deepEqual(at(structured(`[${numbers(2_000)},${org("Entry 2001")}]`)), [], "the 2,001st is not");
  assert.equal(at(structured(`[${Array(100).fill(org("N")).join(",")}]`)).length, LD_LIMITS.nodes, "60 nodes");
  const nested = (depth) => structured("{\"@graph\":[".repeat(depth) + org("Deep") + "]}".repeat(depth));
  assert.deepEqual(at(nested(4)), [{ name: "Deep", type: "Organization" }], "a list inside a list is followed 4 deep");
  assert.deepEqual(at(nested(5)), [], "and no deeper");
  const large = structured(`[${numbers(100_001)}]`) + `<script type="application/ld+json">${org("After")}</script>`;
  assert.deepEqual(at(large), [{ name: "After", type: "Organization" }], "a block over 200,000 bytes is passed over, and the block after it is read");
  const ordinary = readPage(structured(`[{"@type":"WebSite","name":"Site"},{"@graph":[${org("Org")},{"@type":["SoftwareApplication"],"name":"App","applicationCategory":"CRM software","description":"Tracks deals."}]}]`), "https://acme.example.com/");
  assert.deepEqual([ordinary.orgNames.map((one) => one.name), ordinary.appCategories, ordinary.ldText, ordinary.productNames], [["Site", "Org", "App"], ["CRM software"], ["Tracks deals."], ["App", "Acme"]]);
});

// The review's findings H1 and L8: the one-pass reader must not cost an ordinary page more than
// the reader it replaced. Both readers read the same page in the same run, turn about, and the
// medians are compared. Each sample is long enough for the clock to measure, and the pages
// that take the reader of c64f480 under a tenth of a millisecond are timed together as one, so
// that a page of twenty lines is not judged on the noise of the clock.
const SLOWER_AT_MOST = 1.10;
const median = (list) => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];
function medians(work, samples) {
  const loops = (read) => { const started = performance.now(); let n = 0; do { work(read); n += 1; } while (performance.now() - started < 4); return n; };
  const rounds = Math.max(1, Math.min(loops(readPage), loops(readPageBefore)));
  const timed = (read) => { const started = performance.now(); for (let n = 0; n < rounds; n += 1) work(read); return (performance.now() - started) / rounds; };
  const now = [], before = [];
  for (let sample = 0; sample < samples; sample += 1) { before.push(timed(readPageBefore)); now.push(timed(readPage)); }
  return { now: median(now), before: median(before) };
}

test("an ordinary page is read no more than a tenth slower than the reader of c64f480 read it", () => {
  const pages = fixtureIndex().pages.map(({ file, url }) => ({ file, url, html: fixtureText(file) }));
  for (const read of [readPage, readPageBefore]) for (let warm = 0; warm < 30; warm += 1) for (const page of pages) read(page.html, page.url);
  const small = [], results = [];
  for (const page of pages) {
    const one = medians((read) => read(page.html, page.url), 5);
    if (one.before < 0.1) small.push(page); else results.push([page.file, medians((read) => read(page.html, page.url), 15)]);
  }
  results.push([`${small.length} small pages together`, medians((read) => { for (const page of small) read(page.html, page.url); }, 15)]);
  const all = pages.map((page) => page.html).join("\n");
  results.push([`all ${pages.length} pages as one page of ${all.length.toLocaleString("en-US")} characters`, medians((read) => read(all, "https://ordinary.example.com/"), 15)]);
  for (const [name, { now, before }] of results) {
    assert.ok(now <= before * SLOWER_AT_MOST, `${name}: ${now.toFixed(3)} ms now, ${before.toFixed(3)} ms at c64f480, ${Math.round((now / before - 1) * 100)} percent slower`);
  }
});
