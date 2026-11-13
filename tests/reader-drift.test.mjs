/**
 * The free check and the app's fix engine read a page with the same code and refuse the same
 * addresses. This test fails when the two drift apart, and when the free check's reading of an
 * ordinary page changes at all.
 *
 *   1. Three files are shared with the app (bw-client-data), byte for byte: the scanner
 *      (lib/html-scan.js), the reader of structured data (lib/ld-read.js) and the fetch guard
 *      (lib/guard.js). Each is pinned here by its SHA-256, and the app pins the same three hashes
 *      in test/fix-freecheck-drift.test.js. A pin may change only in a pull request that names
 *      the matching commit of the other repository.
 *   2. Twenty-one ordinary pages, seven pages longer than the check reads and twenty-five sites
 *      (tests/fixtures/reader/) are read, and every value must equal what the code of main
 *      c64f480 answered for them before the reader was changed (expected.json). If a value
 *      differs, the code is wrong, not the fixture.
 *   3. Every fixture, every page that oversized.mjs builds, expected.json, the table of
 *      addresses and the three shared files are pinned by MANIFEST.json, and MANIFEST.json by
 *      its hash here and in the app's test, which reads the same pages with the app's reader
 *      and runs the same table of addresses.
 *   4. On small awkward pages the reader gives what the reader of c64f480 gave
 *      (tests/reader-reference.mjs), so a page with broken markup reads the same too.
 *   5. With both repositories on one machine, set BW_READER_TWIN to the app's folder and the
 *      files themselves are compared, byte for byte. This is the one check that no change to
 *      one side alone can pass, and it is the check to run before either side ships.
 *
 * One rule differs between the two on purpose (owner's ruling R-224): the free check reads the
 * first 1,048,576 bytes of a longer page, and the app's engine refuses a longer page whole. The
 * scanner and the reader of structured data are the same in both, and both must read a page
 * that was cut anywhere.
 *
 * Run: node --test tests/reader-drift.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FIXTURE_DIR, SHARED_FILES, fixtureIndex, fixtureManifest, fixtureText, readerOutputs, sha256 } from "../scripts/reader-fixtures.mjs";
import { decodeEntities, proposeProducts, readPage } from "../lib/analyze.js";
import { blockedV4, blockedV6, checkResolves } from "../lib/guard.js";
import { firstElement, stripCode, stripTags } from "../lib/html-scan.js";
import { LD_LIMITS, textOf, typesOf } from "../lib/ld-read.js";
import { proposeProductsBefore, readPageBefore } from "./reader-reference.mjs";
import { CUT_BYTES, cutText, oversizedPages } from "./fixtures/reader/oversized.mjs";

// The files this repository shares with the app, byte for byte.
const SHARED = {
  // bw-client-data: functions/lib/fix/html-scan.js. The scanner changes in both repositories in the same release, or the twin test fails.
  "lib/html-scan.js": "1bac3a0112a8eeb80907c277a30e1438a25111fa4da87ae11d078df9817f706f",
  // bw-client-data: functions/lib/fix/ld-read.js. The reader of structured data changes in both repositories in the same release, or the twin test fails.
  "lib/ld-read.js": "61d8623564c022e4d279b174f913e7f6d42bd5b64935bb924b20feb8271386ed",
  // bw-client-data: functions/lib/fix/vendor/guard.js. The fetch guard changes in both repositories in the same release, or the twin test fails.
  "lib/guard.js": "c0e1150b9953bbb315ad31863624432fcc4450cf274cecdb21e616386a59c151",
};
// tests/fixtures/reader/MANIFEST.json, which names every fixture and the three files above. The app pins the same hash, so the fixtures change in both repositories in the same release, or the twin test fails.
const MANIFEST_SHA256 = "45c0cc0b27de3ff76f135b179f5969b3dfb0be2f4b75690adb55175fb163cfca";

test("the shared files are the pinned bytes, the same bytes the app holds", () => {
  for (const [file, hash] of Object.entries(SHARED)) {
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.includes(13), false, `${file} has a carriage return: the hash covers LF line endings`);
    assert.equal(sha256(bytes), hash, `${file} changed. Change the app's copy and both pins with it, in one release.`);
  }
  assert.deepEqual(Object.values(SHARED_FILES).sort(), Object.keys(SHARED).sort());
});

test("the fixtures are the pinned ones: every page, the built pages, the index, the expected answers and the shared files", async () => {
  const manifest = JSON.parse(fixtureText("MANIFEST.json"));
  assert.deepEqual(await fixtureManifest(), manifest, "a fixture or a shared file changed, was added or was removed");
  assert.equal(sha256(fs.readFileSync(path.join(FIXTURE_DIR, "MANIFEST.json"))), MANIFEST_SHA256, "MANIFEST.json changed. The app pins the same hash.");
  const index = fixtureIndex();
  assert.ok(index.pages.length >= 12, `${index.pages.length} pages`);
  for (const { file } of index.pages) assert.ok(manifest[file], file);
  for (const name of ["expected.json", "index.json", "oversized.mjs", "guard-addresses.json"]) assert.ok(manifest[name], name);
  for (const [key, file] of Object.entries(SHARED_FILES)) assert.equal(manifest[key], SHARED[file], key);
});

// The one check a change to one side alone cannot pass.
test("with the app's repository beside this one, the shared files and the fixtures are the same bytes in both", (t) => {
  const twin = process.env.BW_READER_TWIN;
  if (!twin) { t.skip("set BW_READER_TWIN to the folder of bw-client-data to compare the two repositories"); return; }
  const pairs = { "lib/html-scan.js": "functions/lib/fix/html-scan.js", "lib/ld-read.js": "functions/lib/fix/ld-read.js", "lib/guard.js": "functions/lib/fix/vendor/guard.js" };
  for (const [here, there] of Object.entries(pairs)) assert.equal(sha256(fs.readFileSync(path.join(twin, there))), sha256(fs.readFileSync(here)), `${here} and the app's ${there} differ`);
  const theirs = path.join(twin, "test", "fixtures", "freecheck-reader");
  const names = fs.readdirSync(FIXTURE_DIR).sort();
  assert.deepEqual(fs.readdirSync(theirs).sort(), names, "the two fixture folders hold different files");
  for (const name of names) assert.equal(sha256(fs.readFileSync(path.join(theirs, name))), sha256(fs.readFileSync(path.join(FIXTURE_DIR, name))), name);
});

test("the limits on structured data stand where an ordinary page never meets them", () => {
  assert.deepEqual({ ...LD_LIMITS }, { blocks: 100, visited: 20_000, nodes: 60, depth: 4 });
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
  assert.equal(values, 218, "28 pages of 6 values and 25 sites of 2");
  // The whole answer of every site, key for key and in the same order: what a visitor's page is sent.
  for (const [name, recorded] of Object.entries(expected.sites)) assert.equal(JSON.stringify(now.sites[name].body), JSON.stringify(recorded.body), name);
});

// Owner's ruling R-224: a page longer than the check reads is read up to its first 1,048,576
// bytes, as before. The cut pages read as the reader of c64f480 read the same bytes, wherever
// the cut falls, and the answer of the whole check is the recorded one.
test("a page longer than the limit reads, up to the cut, as the reader of c64f480 read it", () => {
  const expected = JSON.parse(fixtureText("expected.json"));
  const pages = oversizedPages();
  assert.deepEqual(pages.map((page) => page.name), ["oversized-1.2-mib", "oversized-2-mib", "oversized-5-mib", "cut-mid-tag", "cut-mid-character", "cut-mid-script", "cut-mid-structured-data"]);
  for (const { name, url, website, html } of pages) {
    const bytes = Buffer.byteLength(html, "utf8");
    assert.ok(bytes > CUT_BYTES, `${name} is ${bytes} bytes`);
    const cut = cutText(html);
    assert.deepEqual(readPage(cut, url), readPageBefore(cut, url), name);
    assert.equal(expected.pages[name].readPage.title, "Graniteworks | Construction management software for general contractors", name);
    assert.deepEqual([expected.sites[website].body.found, expected.sites[website].body.brand, expected.sites[website].body.category], [true, "Graniteworks", "construction management software"], name);
  }
  const sizes = pages.slice(0, 3).map((page) => Math.round(Buffer.byteLength(page.html, "utf8") / CUT_BYTES * 10) / 10);
  assert.deepEqual(sizes, [1.2, 2, 5]);
  // The four chosen cuts fall where they are meant to.
  const tail = (name) => cutText(pages.find((page) => page.name === name).html).slice(-24);
  assert.match(tail("cut-mid-tag"), /<a class="butt$/);
  assert.equal(tail("cut-mid-character").endsWith(String.fromCodePoint(0xfffd)), true, "the last bytes are half a character");
  assert.match(tail("cut-mid-script"), /site photo/);
  assert.match(tail("cut-mid-structured-data"), /"name$/);
});

// The two characters that String.toLowerCase moves: a page that holds them must still be read
// at the right places. The engine's first scanner lost the title of any such page.
test("a page that holds a dotted capital I or a kelvin sign is read at the right places", () => {
  const I = String.fromCodePoint(0x130), K = String.fromCodePoint(0x212a);
  const html = `<p>${I}stanbul ${I}zmir 300 ${K}</p><TITLE>Acme Yaz${I}l${I}m</TITLE><SCRIPT>var a = 1;</script><H1>Merhaba ${K}</h1><lin${K} rel=x><a href="/about">${I}</a>`;
  assert.equal(firstElement(html, "title"), `Acme Yaz${I}l${I}m`);
  assert.equal(firstElement(html, "h1"), `Merhaba ${K}`);
  assert.equal(stripCode(html), html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " "));
  assert.deepEqual(readPage(html, "https://acme.example.com/"), readPageBefore(html, "https://acme.example.com/"));
  // A tag name is matched against plain letters only: a kelvin sign is no k, and a dotless i is no i.
  assert.equal(firstElement(`<lin${K}>x</lin${K}><link>y</link>`, "link"), "y");
  assert.equal(firstElement(`<t${String.fromCodePoint(0x131)}tle>x</t${String.fromCodePoint(0x131)}tle>`, "title"), null);
});

test("taking the tags out of a text gives what the pattern gave, whole or at its start", () => {
  const texts = ["plain", "", "a < b", "a > b", "<b>bold</b> and <i", "<<<>>>", "x<a href=\">\">y</a>z<", "<p>one</p><p>two</p> tail < open", ">", "<", "a<b>c<d>e<f"];
  for (const text of texts) {
    const whole = text.replace(/<[^>]*>/g, " ");
    assert.equal(stripTags(text), whole, JSON.stringify(text));
    for (const enough of [0, 1, 3, 8, 100]) {
      const start = stripTags(text, enough);
      assert.equal(whole.startsWith(start), true, `${JSON.stringify(text)} at ${enough}`);
      assert.ok(start.length >= Math.min(enough, whole.length), `${JSON.stringify(text)} at ${enough}`);
    }
  }
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
  "https://fuzz.example.com/overview", "//www.fuzz.example.com/solutions", "https://other.example.net/about", "mailto:a@b.example", "&amp;", "&#65;", "&#x41;", "&nbsp;", "&", ";", "&bogus;", "&#000000065;", "&#99999999999;",
  "<h1>", "<h1 class=x>", "</h1>", "<H1>", "</H1>", "<h2>", "</h2>", "<h2", "<H2>", "</H2>", "<h2x>", "<h10>", "<title>", "</title>", "<TITLE lang=en>", "</TITLE>", "<title",
  "<script>", "</script>", "<SCRIPT>", "</SCRIPT>", "<script ", "<style>", "</style>", "<noscript>", "</noscript>", "<svg", "<svg>", "</svg>", "<template>", "</template>", "<abbr>", "<article>",
  "<script type=\"application/ld+json\">", "<script type='application/ld+json'>", "<script type=application/ld+json>", "<SCRIPT TYPE = \"application/ld+json\">", `<script type=${" ".repeat(24)}"application/ld+json">`,
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
    // One page in eight is cut at a byte chosen by chance, as a page over the limit is.
    if (n % 8 === 0) html = cutText(html, Math.floor(random() * Buffer.byteLength(html, "utf8")));
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

// What is past a limit of the structured data is not read, and what is inside it still is. The
// limits stand far past any ordinary page (ruling R-222), and time stays bounded by them.
const numbers = (count) => "0,".repeat(count - 1) + "0";
const structured = (json) => `<html><head><title>Acme</title></head><body><script type="application/ld+json">${json}</script><p>Acme sells widgets.</p></body></html>`;
test("structured data is read inside its limits, in the order it always was", () => {
  const at = (html) => readPage(html, "https://acme.example.com/").orgNames;
  const org = (name) => `{"@type":"Organization","name":"${name}"}`;
  const block = (json) => `<script type="application/ld+json">${json}</script>`;
  assert.deepEqual(at(block("0").repeat(99) + block(org("Block 100")) + block(org("Block 101"))), [{ name: "Block 100", type: "Organization" }], "100 blocks are read, and the 101st is not");
  assert.deepEqual(at(structured(`[${numbers(19_999)},${org("Entry 20000")}]`)), [{ name: "Entry 20000", type: "Organization" }], "the 20,000th entry is looked at");
  assert.deepEqual(at(structured(`[${numbers(20_000)},${org("Entry 20001")}]`)), [], "the 20,001st is not");
  assert.equal(at(structured(`[${Array(100).fill(org("N")).join(",")}]`)).length, LD_LIMITS.nodes, "60 nodes, as before");
  const nested = (depth) => structured("{\"@graph\":[".repeat(depth) + org("Deep") + "]}".repeat(depth));
  assert.deepEqual(at(nested(4)), [{ name: "Deep", type: "Organization" }], "a list inside a list is followed 4 deep");
  assert.deepEqual(at(nested(5)), [], "and no deeper");
  const large = structured(`{"@type":"FAQPage","text":"${"x".repeat(600_000)}"}`) + block(org("After"));
  assert.deepEqual(at(large), [{ name: "After", type: "Organization" }], "structured data has no size limit of its own: a block of 600,000 bytes is read, and the block after it");
  const ordinary = readPage(structured(`[{"@type":"WebSite","name":"Site"},{"@graph":[${org("Org")},{"@type":["SoftwareApplication"],"name":"App","applicationCategory":"CRM software","description":"Tracks deals."}]}]`), "https://acme.example.com/");
  assert.deepEqual([ordinary.orgNames.map((one) => one.name), ordinary.appCategories, ordinary.ldText, ordinary.productNames], [["Site", "Org", "App"], ["CRM software"], ["Tracks deals."], ["App", "Acme"]]);
});

test("a value of structured data is set as text the way String sets it, and one that cannot be set gives nothing", () => {
  for (const value of ["Organization", "", 7, 0, null, undefined, true, ["a", ["b"]], { a: 1 }]) assert.equal(textOf(value), String(value || ""), JSON.stringify(value));
  assert.equal(textOf({ toString: 1, valueOf: 1 }), "");
  assert.equal(textOf(JSON.parse("[".repeat(20_000) + "1" + "]".repeat(20_000))), "");
  assert.deepEqual(typesOf({ "@type": ["Organization", { toString: null }, 7] }), ["Organization", "", "7"]);
  assert.deepEqual(typesOf({}), [""]);
});

// The fetch guard (owner's ruling R-224, finding F-029). One table of addresses, the same file
// in both repositories, with the answer for each.
const TABLE = JSON.parse(fixtureText("guard-addresses.json"));
const answering = (address) => async (url) => new Response(JSON.stringify({ Status: 0, Answer: /type=AAAA/.test(url) ? [{ type: 28, data: address }] : [] }), { headers: { "content-type": "application/dns-json" } });

test("the guard gives the recorded answer for every address of the shared table", () => {
  assert.deepEqual([TABLE.v4.length, TABLE.v6.length], [24, 88]);
  for (const [address, answer, why] of TABLE.v4) assert.equal(blockedV4(address) ? "blocked" : "allowed", answer, `${address} (${why})`);
  for (const [address, answer, why] of TABLE.v6) assert.equal(blockedV6(address) ? "blocked" : "allowed", answer, `${address} (${why})`);
});

const KINDS = {
  "an IPv4 address translated into IPv6 (::ffff:0:a.b.c.d) is judged by the address it carries": { refused: ["::ffff:0:169.254.169.254", "::ffff:0:7f00:1", "::ffff:0:10.0.0.1", "0:0:0:0:ffff:0:c0a8:101"], passed: ["::ffff:0:93.184.216.34"] },
  "the documentation block 3fff::/20 is refused": { refused: ["3fff::1", "3fff:0fff:ffff:ffff:ffff:ffff:ffff:ffff"], passed: ["3fff:1000::1"] },
  "the segment routing block 5f00::/16 is refused": { refused: ["5f00::1", "5f00:ffff::1"], passed: [] },
  // The second review: what the owner's words ask for past the three named kinds.
  "local NAT64 refuses the entire /48, including /56 and /64 layouts": { refused: TABLE.v6.filter(([address]) => address.startsWith("64:ff9b:1:")).map(([address]) => address), passed: ["64:ff9b::5db8:d822"] },
  "the ISATAP forms (::5efe:a.b.c.d and ::200:5efe:a.b.c.d) are refused": { refused: ["::5efe:127.0.0.1", "::200:5efe:10.0.0.1", "::5efe:93.184.216.34", "::200:5efe:a9fe:a9fe"], passed: ["2a00:1450:1:2:0:5efe:7f00:1"] },
  "an address outside 2000::/3 is refused, unless it carries an IPv4 address the guard judges": { refused: ["1::1", "4000::1", "8000::1", "fbff::1", "100:0:0:1::1", "5eff::1", "5f01::1", "64:ff9b:2::808:808"], passed: ["::ffff:93.184.216.34", "::ffff:0:93.184.216.34", "64:ff9b::5db8:d822", "2001:200::1", "3ffe::1"] },
};
test("unknown HTML entities remain literal even when they name an inherited property", () => {
  assert.equal(decodeEntities("&amp; &CoNsTrUcToR; &unknown;"), "& &CoNsTrUcToR; &unknown;");
});
for (const [kind, { refused, passed }] of Object.entries(KINDS)) {
  test(`the guard: ${kind}`, async () => {
    for (const address of refused) {
      assert.equal(blockedV6(address), true, address);
      assert.deepEqual(await checkResolves("name.example.com", answering(address)), { ok: false, reason: "private" }, `a name that resolves to ${address}`);
    }
    for (const address of passed) assert.equal(blockedV6(address), false, address);
  });
}

test("the guard: public IPv6 addresses still pass, and a name that resolves to one is read", async () => {
  const open = TABLE.v6.filter((row) => row[2] === "public").map((row) => row[0]);
  assert.equal(open.length, 21, "the twenty addresses of the second review's table and one more");
  for (const address of open) {
    assert.equal(blockedV6(address), false, address);
    assert.deepEqual(await checkResolves("name.example.com", answering(address)), { ok: true, addresses: 1 });
  }
});

// The review's findings H1 and L8: the one-pass reader must not cost an ordinary page more than
// the reader it replaced. Both readers read the same pages in the same run, turn about, and the
// median of the paired times is compared. A sample is the quicker of two short runs, and the
// pages that take the reader of c64f480 under a tenth of a millisecond are timed together as
// one, so that a page of twenty lines is not judged on the noise of the clock. The machine
// that runs the suite runs other work too: a measure that fails is taken again, twice, and
// the test fails only when every one of the three is over.
const SLOWER_AT_MOST = 1.10;
const median = (list) => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];
function slowerBy(work, samples) {
  const loops = (read) => { const started = performance.now(); let n = 0; do { work(read); n += 1; } while (performance.now() - started < 3); return n; };
  const rounds = Math.max(1, Math.min(loops(readPage), loops(readPageBefore)));
  const once = (read) => { const started = performance.now(); for (let n = 0; n < rounds; n += 1) work(read); return (performance.now() - started) / rounds; };
  const timed = (read) => Math.min(once(read), once(read));
  const ratios = [];
  for (let sample = 0; sample < samples; sample += 1) { const before = timed(readPageBefore); ratios.push(timed(readPage) / before); }
  return median(ratios);
}

test("an ordinary page is read no more than a tenth slower than the reader of c64f480 read it", () => {
  const pages = fixtureIndex().pages.map(({ file, url }) => ({ file, url, html: fixtureText(file) }));
  for (const read of [readPage, readPageBefore]) for (let warm = 0; warm < 50; warm += 1) for (const page of pages) read(page.html, page.url);
  const small = [], works = [];
  for (const page of pages) {
    const started = performance.now();
    for (let n = 0; n < 20; n += 1) readPageBefore(page.html, page.url);
    if ((performance.now() - started) / 20 < 0.1) small.push(page); else works.push([page.file, (read) => read(page.html, page.url)]);
  }
  works.push([`${small.length} small pages together`, (read) => { for (const page of small) read(page.html, page.url); }]);
  const all = pages.map((page) => page.html).join("\n");
  works.push([`all ${pages.length} pages as one page of ${all.length.toLocaleString("en-US")} characters`, (read) => read(all, "https://ordinary.example.com/")]);
  for (const [name, work] of works) {
    const measures = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      measures.push(slowerBy(work, 11));
      if (measures[attempt] <= SLOWER_AT_MOST) break;
    }
    assert.ok(Math.min(...measures) <= SLOWER_AT_MOST, `${name}: ${measures.map((ratio) => `${Math.round((ratio - 1) * 100)} percent`).join(", ")} slower than the reader of c64f480, in ${measures.length} measures`);
  }
});
