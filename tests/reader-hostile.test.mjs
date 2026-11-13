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
import { analyze, classify, proposeBrand, proposeProducts, readPage } from "../lib/analyze.js";

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

// The review's costliest page (finding H1), and its like. One run of text is read as the title,
// the first heading, a second heading, the words of a product link and a structured data name at
// once. The run is made of a piece that costs the most to clean: an entity beside the letter
// that lower case moves, tags, entities that vanish, spaces, hyphens. The page is as large as
// the check reads at all. Each page is read three times and the quickest is held, so that a
// busy machine does not fail the suite and a slow reader still does.
const ONE_PAGE_MS = 300;
const ONE_CHECK_MS = 900;
const encoder = new TextEncoder();
const utf8 = (text) => encoder.encode(text).length;
function costly(piece) {
  const fill = (bytes) => piece.repeat(Math.max(0, Math.floor(bytes / utf8(piece))));
  const start = "<a href=\"/about\">a</a><a href=\"/company\">c</a><title><h1><h2><a href=\"/products/x/\">";
  const inTitle = fill(399_000 - start.length);
  const open = "</title><script type=\"application/ld+json\">{\"@type\":\"Product\",\"name\":\"";
  const close = "\",\"description\":\"d\"}</script>";
  const inName = /["\\<]/.test(piece) ? "" : fill(199_000);
  const end = "</a></h2></h1>";
  const used = utf8(start) + utf8(inTitle) + utf8(open) + utf8(inName) + utf8(close) + utf8(end);
  return start + inTitle + open + inName + close + fill(PAGE_BYTES - used) + end;
}
const EM_DASH = String.fromCodePoint(0x2014);
const COSTLY = Object.fromEntries([`&a;${DOTTED}`, `&lt;${DOTTED}`, `&amp;${DOTTED}`, "&copy;", "&#0;", "<b>", `<i>${DOTTED}`, " ", "-", `&amp;<b>-${DOTTED} `, EM_DASH, `x${DOTTED}`].map((piece) => [piece, costly(piece)]));
const quickest = (rounds, work) => { let best = Infinity; for (let round = 0; round < rounds; round += 1) { const started = performance.now(); work(); best = Math.min(best, performance.now() - started); } return best; };

test(`the costliest page that could be built is read in under ${ONE_PAGE_MS} ms`, () => {
  for (const [piece, html] of Object.entries(COSTLY)) {
    assert.ok(utf8(html) <= PAGE_BYTES && utf8(html) > PAGE_BYTES - 16, `${JSON.stringify(piece)}: ${utf8(html)} bytes`);
    const took = quickest(3, () => readPage(html, "https://hostile.example.org/"));
    assert.ok(took < ONE_PAGE_MS, `${JSON.stringify(piece)}: readPage took ${Math.round(took)} ms`);
  }
  for (const [name, html] of Object.entries(Object.assign(Object.fromEntries(PIECES.map((piece) => [`all "${piece.slice(0, 40)}"`, whole(piece)])), BUILT))) {
    const took = quickest(2, () => readPage(html, "https://hostile.example.com/"));
    assert.ok(took < ONE_PAGE_MS, `${name}: readPage took ${Math.round(took)} ms`);
  }
});

const lookupAnswer = (target) => new Response(JSON.stringify({ Status: 0, Answer: target.searchParams.get("type") === "A" ? [{ name: target.searchParams.get("name"), type: 1, data: "93.184.216.34" }] : [] }), { headers: { "content-type": "application/dns-json" } });
const checkOf = (website) => new Request("https://audit.broadcastwell.com/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website }) });

test(`a whole check of three of the costliest pages ends in under ${ONE_CHECK_MS} ms`, async () => {
  for (const [piece, html] of Object.entries(COSTLY)) {
    const net = async (address) => {
      const target = new URL(address);
      return target.hostname === "cloudflare-dns.com" ? lookupAnswer(target) : new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    };
    let best = Infinity, pages = 0;
    for (let round = 0; round < 3; round += 1) {
      const started = performance.now();
      const response = await analyze(checkOf("hostile.example.org"), {}, { fetcher: net, preview: true });
      const body = await response.json();
      best = Math.min(best, performance.now() - started);
      pages = (body.pages || []).length;
    }
    assert.equal(pages, 3, `${JSON.stringify(piece)}: three pages were read`);
    assert.ok(best < ONE_CHECK_MS, `${JSON.stringify(piece)}: the check took ${Math.round(best)} ms`);
  }
});

// Finding M1: readPage must never throw, whatever a page holds. A structured data value is
// whatever JSON can spell: a type that is an object with a toString of its own, a name that is
// a list nested thousands deep. Before the fix two such pages of 400 bytes made readPage throw,
// and the route then gave no answer at all.
const vague = (json) => `<html><head><title>Vague Co</title><meta name="description" content="We help teams do better work."></head><body><h1>Better work</h1><a href="/about">About</a><p>${"Our mission is to help people. ".repeat(6)}</p><script type="application/ld+json">${json}</script></body></html>`;
const deep = (depth, leaf) => "[".repeat(depth) + leaf + "]".repeat(depth);
const THROWERS = {
  "a type that is an object with toString and valueOf set to 1": "{\"@type\":{\"toString\":1,\"valueOf\":1},\"name\":\"x\"}",
  "a product whose name is such an object": "{\"@type\":\"Product\",\"name\":{\"toString\":1,\"valueOf\":1}}",
  "a type that is a list nested 4,000 deep": `{"@type":${deep(4000, "1")}}`,
  "a product whose name is a list nested 4,000 deep": `{"@type":"Product","name":${deep(4000, "1")}}`,
  "a type list that holds such values beside a plain one": `{"@type":["Organization",{"toString":null},${deep(9000, "\"x\"")},7],"name":"Kept"}`,
};

for (const [name, json] of Object.entries(THROWERS)) {
  test(`${name}: the page is read and nothing is thrown`, async () => {
    const html = vague(json);
    const page = readPage(html, "https://vague.example.org/");
    assert.equal(page.title, "Vague Co");
    classify([page]);
    proposeBrand([page], "vague.example.org");
    proposeProducts([page], "vague.example.org");
    // And through the route, as the homepage and as the second page: an answer is made.
    for (const table of [{ "/": html }, { "/": vague("{}"), "/about": html }]) {
      const net = async (address) => {
        const target = new URL(address);
        if (target.hostname === "cloudflare-dns.com") return lookupAnswer(target);
        return table[target.pathname] ? new Response(table[target.pathname], { headers: { "content-type": "text/html" } }) : new Response("no", { status: 404 });
      };
      const response = await analyze(checkOf("vague.example.org"), {}, { fetcher: net, preview: true });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).website, "vague.example.org");
    }
  });
}

test("a value that cannot be set as text is read as nothing, and the values beside it are read as before", () => {
  const page = readPage(vague(THROWERS["a type list that holds such values beside a plain one"]), "https://vague.example.org/");
  assert.deepEqual(page.orgNames, [{ name: "Kept", type: "Organization" }]);
});

// 20,000 pages of structured data in hostile shapes, made from a seed so that a failure repeats.
// Every value is one JSON can spell. None may make the reader throw, and the whole run has a
// bound on its time: the pages are small, so a read that is slow here is slow for a reason.
const FUZZ_PAGES = 20_000;
const FUZZ_MS = 30_000;
test(`${FUZZ_PAGES.toLocaleString("en-US")} pages of hostile structured data: nothing is thrown, and the run ends in under ${FUZZ_MS / 1000} seconds`, () => {
  let seed = 222;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const KEYS = ["@type", "@type", "@type", "@graph", "@graph", "name", "name", "description", "applicationCategory", "toString", "valueOf", "length", "__proto__", "constructor", "hasOwnProperty", "then", "0", "@context", "@id"];
  const LEAVES = ["null", "true", "false", "0", "-1", "1e308", "1e-9", "\"\"", "\"Organization\"", "\"Product\"", "\"SoftwareApplication\"", "\"Brand\"", "\"toString\"", "\"<b>x</b> &amp; y\"", `"${"n".repeat(5000)}"`, `"${DOTTED}"`, "{}", "[]", "1", "\"WebSite\""];
  const DEPTHS = [2, 5, 40, 600, 3000, 6000, 12000];
  const value = (room) => {
    const roll = random();
    if (room <= 0 || roll < 0.35) return pick(LEAVES);
    if (roll < 0.45) return deep(pick(DEPTHS), pick(LEAVES));
    if (roll < 0.5) { const graphs = pick([1, 3, 4, 5, 9, 200]); return "{\"@graph\":[".repeat(graphs) + value(room - 1) + "]}".repeat(graphs); }
    if (roll < 0.7) return `[${Array.from({ length: Math.floor(random() * 5) }, () => value(room - 1)).join(",")}]`;
    return `{${Array.from({ length: 1 + Math.floor(random() * 5) }, () => `${JSON.stringify(pick(KEYS))}:${value(room - 1)}`).join(",")}}`;
  };
  const started = performance.now();
  let read = 0, slowest = 0, kept = 0;
  for (let n = 0; n < FUZZ_PAGES; n += 1) {
    let json = value(4);
    // A part of the pages are cut short, as broken pages are.
    if (n % 11 === 0) json = json.slice(0, Math.floor(json.length * random()));
    const html = `<title>Fuzz</title><script type="application/ld+json">${json}</script>${n % 7 === 0 ? `<script type="application/ld+json">${value(3)}</script>` : ""}`;
    const one = performance.now();
    let page;
    try {
      page = readPage(html, "https://fuzz.example.com/");
      classify([page]);
      proposeBrand([page], "fuzz.example.com");
      proposeProducts([page], "fuzz.example.com");
    } catch (error) {
      assert.fail(`page ${n} threw ${error.name}: ${String(error.message).slice(0, 80)}; the page: ${html.slice(0, 300)}`);
    }
    slowest = Math.max(slowest, performance.now() - one);
    read += 1;
    kept += page.orgNames.length + page.productNames.length;
    assert.ok(page.orgNames.length <= 60 && page.title === "Fuzz", `page ${n}`);
  }
  const took = performance.now() - started;
  assert.equal(read, FUZZ_PAGES);
  assert.ok(kept > 1000, `the pages are not empty of structured data: ${kept} names were kept`);
  assert.ok(slowest < ONE_PAGE_MS, `the slowest of these small pages took ${Math.round(slowest)} ms`);
  assert.ok(took < FUZZ_MS, `the run took ${Math.round(took).toLocaleString("en-US")} ms`);
});

// Owner's ruling R-224: a page longer than 1,048,576 bytes is read up to that length, and the
// cut can fall anywhere: in a tag, in a character of several bytes, in a script, in a block of
// structured data, or inside one of the costly pages above. The cut is made here as the fetch
// guard makes it (the first bytes, set as text without complaint). Whatever it leaves must be
// read without an error and inside the same bounds as any other page.
const cutAsTheGuardDoes = (html) => new TextDecoder("utf-8", { fatal: false }).decode(encoder.encode(html).slice(0, PAGE_BYTES));
const ORDINARY_START = "<!doctype html><html><head><title>Acme Field | Field service management software</title><meta name=\"description\" content=\"Dispatch software for service teams.\"></head><body><h1>Dispatch every technician</h1><a href=\"/about\">About</a><p>Work orders, dispatch and invoicing for service technicians.</p>";
const endingWith = (piece, inside) => {
  const room = PAGE_BYTES - utf8(ORDINARY_START) - inside;
  return ORDINARY_START + "<p>" + "word ".repeat(Math.floor((room - 7) / 5)) + " ".repeat((room - 7) % 5) + "</p>" + piece + "<p>the rest of the page, which is never read</p>".repeat(3000);
};
const CUTS = {
  "in the middle of a tag": endingWith("<a class=\"button\" href=\"/products/desk/\">Acme Desk</a>", 11),
  "in the middle of a tag's quoted address": endingWith("<a class=\"button\" href=\"/products/desk/\">Acme Desk</a>", 30),
  "in the middle of a character of three bytes": endingWith(`<h2>Prices from ${String.fromCodePoint(0x20ac)}40</h2>`, 17),
  "in the middle of a character of four bytes": endingWith(`<p>${String.fromCodePoint(0x1f680)} fast</p>`, 5),
  "in the middle of an entity": endingWith("<p>Fish &amp; chips</p>", 11),
  "inside a script block": endingWith(`<script>var photos = ["${"photo\", \"".repeat(500)}last"];</script>`, 2000),
  "inside a style block": endingWith(`<style>${".a{color:red}".repeat(400)}</style>`, 2000),
  "inside a block of structured data": endingWith("<script type=\"application/ld+json\">{\"@type\":\"Organization\",\"name\":\"Acme Field Holdings\",\"description\":\"The group.\"}</script>", 70),
  "inside a comment": endingWith(`<!-- ${"note ".repeat(600)} -->`, 1500),
  "inside the first heading that was opened": "<title>Acme Field</title><h1>" + "word ".repeat(PAGE_BYTES / 4),
  "inside the title": "<title>" + "word ".repeat(PAGE_BYTES / 4),
};
for (const [piece, html] of Object.entries(COSTLY)) {
  // The same costly pages, half as long again, so that the cut falls inside the run of text that
  // is the heading, the link and the name at once, and none of them is ever closed.
  CUTS[`inside the costliest page made of ${JSON.stringify(piece)}`] = html.replace("</a></h2></h1>", "") + piece.repeat(Math.ceil(PAGE_BYTES / 2 / utf8(piece)));
}

test(`a page cut at ${PAGE_BYTES.toLocaleString("en-US")} bytes is read without an error in under ${ONE_PAGE_MS} ms, wherever the cut falls`, () => {
  for (const [name, html] of Object.entries(CUTS)) {
    assert.ok(utf8(html) > PAGE_BYTES, `${name}: the page is ${utf8(html)} bytes, longer than the limit`);
    const cut = cutAsTheGuardDoes(html);
    let page;
    const took = quickest(2, () => { page = readPage(cut, "https://cut.example.org/"); });
    assert.ok(took < ONE_PAGE_MS, `${name}: readPage took ${Math.round(took)} ms`);
    assert.equal(typeof page.title, "string", name);
    classify([page]);
    proposeBrand([page], "cut.example.org");
    proposeProducts([page], "cut.example.org");
  }
  // What stood before the cut is read as on any page, and a block cut in two is passed over.
  const data = readPage(cutAsTheGuardDoes(CUTS["inside a block of structured data"]), "https://cut.example.org/");
  assert.deepEqual([data.title, data.h1, data.orgNames, data.links], ["Acme Field | Field service management software", "Dispatch every technician", [], ["https://cut.example.org/about"]]);
  const tag = readPage(cutAsTheGuardDoes(CUTS["in the middle of a tag's quoted address"]), "https://cut.example.org/");
  assert.deepEqual([tag.title, tag.productNames], ["Acme Field | Field service management software", ["Dispatch every technician"]], "a link cut in two gives no product name");
});

test(`a whole check of pages longer than the limit ends in under ${ONE_CHECK_MS} ms, and the answer is made from the part that was read`, async () => {
  for (const name of ["in the middle of a tag", "in the middle of a character of three bytes", "inside a script block", "inside a block of structured data", `inside the costliest page made of ${JSON.stringify(`&a;${DOTTED}`)}`, "inside the costliest page made of \"<b>\""]) {
    const html = CUTS[name];
    const net = async (address) => {
      const target = new URL(address);
      return target.hostname === "cloudflare-dns.com" ? lookupAnswer(target) : new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    };
    let best = Infinity, body = null;
    for (let round = 0; round < 2; round += 1) {
      const started = performance.now();
      const response = await analyze(checkOf("acmefield.example.org"), {}, { fetcher: net, preview: true });
      body = await response.json();
      best = Math.min(best, performance.now() - started);
      assert.equal(response.status, 200, name);
    }
    assert.ok(best < ONE_CHECK_MS, `${name}: the check took ${Math.round(best)} ms`);
    assert.equal("unread" in body, false, `${name}: a page read in part is not called unread`);
    if (!name.startsWith("inside the costliest")) assert.deepEqual([body.found, body.brand, body.category], [true, "Acme Field", "field service management software"], name);
  }
});

// The first words of a text are looked for in its first 300,000 characters and no further, as
// the words of the body always were. An ordinary heading has its words at its start. One that
// opens with more than 300,000 characters of tags gives none, and costs no more to find out.
test("the first words of a heading, a link or a name are looked for in its first 300,000 characters", () => {
  const tags = "<b>".repeat(100_000);
  const near = readPage(`<title>Acme</title><h1>${tags.slice(0, 297_000)}Near words</h1><h2>${tags.slice(0, 297_000)}Second</h2>`, "https://acme.example.org/");
  assert.deepEqual([near.h1, near.h2s], ["Near words", ["Second"]]);
  const far = readPage(`<title>Acme</title><h1>${tags}Far words</h1><h2>${tags}Second</h2><a href="/products/x/">${tags}Link</a>`, "https://acme.example.org/");
  assert.deepEqual([far.title, far.h1, far.h2s, far.productNames], ["Acme", "", [""], ["Acme"]]);
});
