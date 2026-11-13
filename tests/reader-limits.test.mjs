/**
 * The limits of one website read, held against four hostile pages: a page that stalls before
 * its first byte, a page whose body never ends, a page that is too large, and a redirect loop.
 * Each must be dropped inside a fixed limit, the pages already read must still count, the check
 * must carry on to its result, and the result must say that the page could not be read.
 *
 * The network here is a table, and the clock is the test's own: time moves only when the test
 * moves it, so a wait of five seconds takes a few milliseconds and its length is exact. Nothing
 * in this file reaches the internet.
 *
 * Run: node --test tests/reader-limits.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../lib/audit.js";
import { analyze, FALLBACK_REASONS } from "../lib/analyze.js";
import { FETCH_TIMEOUT_MS, MAX_BYTES, MAX_FETCHES } from "../lib/guard.js";
import { READ_LIMITS } from "../lib/bounded-fetch.js";

// The limits a read is held to. They are the check's own: the guard has always named them.
const REQUEST_MS = FETCH_TIMEOUT_MS; // one request, from the moment it is sent to the last byte of its page
const LOOKUP_MS = 3000; // one lookup of a name
const BODY_BYTES = MAX_BYTES; // one page
const REQUESTS = MAX_FETCHES; // the requests of one check, redirects included
const CHECK_MS = REQUESTS * (LOOKUP_MS + REQUEST_MS); // the longest a whole check can wait on a network
const STEP_MS = 100;

const HOME = `<!doctype html><html><head><title>Acme Field | Field service management software for HVAC and plumbing teams</title>
<meta name="description" content="Schedule, dispatch and pay your technicians from one field service platform.">
<meta property="og:site_name" content="Acme Field"></head><body><h1>Dispatch every technician and every work order</h1><a href="/about">About</a><p>Work orders, dispatch and invoicing for service technicians.</p></body></html>`;
const VAGUE = `<!doctype html><html><head><title>Vague Co</title><meta name="description" content="We help teams do better work."></head><body><h1>Better work, together</h1><p>Our mission is to help people.</p><a href="/about">About</a><a href="/product">Product</a><a href="/careers">Careers</a></body></html>`;
const VAGUE_ABOUT = `<html><head><title>About Vague Co</title></head><body><h1>About us</h1><p>Vague Co builds dental practice management software for dental offices and orthodontic clinics.</p></body></html>`;
const VAGUE_PRODUCT = `<html><head><title>Product</title></head><body><h2>Scheduling for dentists</h2><p>Charting and billing for dental practices.</p></body></html>`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const turn = async () => { for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

// What a page of the table can do when it is asked for.
const serves = (body) => () => html(body);
const redirects = (to) => () => html("", 302, { location: to });
const stalls = () => () => new Promise(() => {});
const after = (ms, answer) => async () => { await sleep(ms); return answer(); };
// A body that sends one byte, waits, and sends the next, for ever.
const drips = (everyMs, seen) => () => html(new ReadableStream({
  async pull(controller) { seen.bytes += 1; controller.enqueue(new Uint8Array([120])); await sleep(everyMs); },
  cancel() { seen.let_go = true; },
}));
// A body that sends 65,536 bytes every time it is asked, for ever.
const pours = (seen) => () => html(new ReadableStream({
  pull(controller) { seen.bytes += 65536; controller.enqueue(new Uint8Array(65536).fill(120)); },
  cancel() { seen.let_go = true; },
}));
// A real page followed by enough filler to pass the size limit.
const oversized = () => () => html(HOME + "x".repeat(BODY_BYTES));

function network(pages, lookup) {
  const asked = [];
  const net = async (address) => {
    const target = new URL(address);
    if (target.hostname === "cloudflare-dns.com") {
      if (lookup) await lookup();
      const name = target.searchParams.get("name");
      const answer = target.searchParams.get("type") === "A" ? [{ name, type: 1, data: "93.184.216.34" }] : [];
      return new Response(JSON.stringify({ Status: 0, Answer: answer }), { headers: { "content-type": "application/dns-json" } });
    }
    asked.push(target.toString());
    const page = pages[target.toString()];
    return page ? page() : html("not found", 404);
  };
  net.asked = asked;
  return net;
}

// Runs one check on the test's clock. Answers with the result and the moment it came, or null
// when the check is still reading after the longest wait a check may have.
async function check(t, website, net) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const request = new Request("https://audit.broadcastwell.com/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website }) });
  const started = Date.now();
  let settled = null;
  analyze(request, {}, { fetcher: net, preview: true }).then(
    async (response) => { const at = Date.now() - started; settled = { at, status: response.status, body: await response.json() }; },
    (error) => { settled = { at: Date.now() - started, error }; },
  );
  for (let waited = 0; !settled && waited <= CHECK_MS + 1000; waited += STEP_MS) {
    await turn();
    if (!settled) t.mock.timers.tick(STEP_MS);
  }
  await turn();
  return settled;
}

function assertDropped(result, { at, reason }) {
  assert.ok(result, `the check was still reading after ${(CHECK_MS + 1000).toLocaleString("en-US")} ms`);
  assert.equal(result.error, undefined, String(result.error));
  assert.ok(result.at <= at, `it took ${result.at} ms, and the limit is ${at} ms`);
  assert.equal(result.status, 200);
  assert.equal(result.body.found, false);
  assert.equal(result.body.reason, reason);
  assert.ok(FALLBACK_REASONS.includes(result.body.reason), "the reason is one the page has a sentence for");
  assert.equal(result.body.questions_template.length, 10, "the visitor can still type a name and a category");
}

const SITE = "https://hostile.example.org/";

test("the limits are the check's own: five seconds a request, 1,048,576 bytes a page, three requests a check", () => {
  assert.deepEqual([REQUEST_MS, LOOKUP_MS, BODY_BYTES, REQUESTS, CHECK_MS], [5000, 3000, 1048576, 3, 24000]);
  assert.match(fs.readFileSync("lib/guard.js", "utf8"), /const RESOLVE_TIMEOUT_MS = 3000;/);
  // They are named constants of the code, in one place, and they are these.
  assert.deepEqual({ ...READ_LIMITS }, { lookup_ms: LOOKUP_MS, request_ms: REQUEST_MS, body_bytes: BODY_BYTES, requests: REQUESTS, check_ms: CHECK_MS });
});

test("a homepage that stalls before its first byte is dropped at five seconds", async (t) => {
  const result = await check(t, "hostile.example.org", network({ [SITE]: stalls() }));
  assertDropped(result, { at: REQUEST_MS, reason: "timeout" });
  assert.ok(result.at > REQUEST_MS - STEP_MS, `it was dropped early, at ${result.at} ms`);
});

test("a homepage whose body never ends is dropped at five seconds, though a byte arrives every 4,900 ms", async (t) => {
  const seen = { bytes: 0, let_go: false };
  const result = await check(t, "hostile.example.org", network({ [SITE]: drips(REQUEST_MS - 100, seen) }));
  assertDropped(result, { at: REQUEST_MS, reason: "timeout" });
  assert.ok(result.at > REQUEST_MS - STEP_MS, `it was dropped early, at ${result.at} ms`);
  assert.equal(seen.let_go, true, "the body is let go, not left open");
  assert.ok(seen.bytes <= 3, `${seen.bytes} bytes were taken`);
});

test("a homepage whose body never ends is dropped at five seconds, though a byte arrives every millisecond", async (t) => {
  const seen = { bytes: 0, let_go: false };
  const result = await check(t, "hostile.example.org", network({ [SITE]: drips(1, seen) }));
  assertDropped(result, { at: REQUEST_MS, reason: "timeout" });
  assert.equal(seen.let_go, true);
});

test("an oversized homepage is dropped whole: nothing of it is read", async (t) => {
  const result = await check(t, "hostile.example.org", network({ [SITE]: oversized() }));
  assertDropped(result, { at: 0, reason: "unreachable" });
  assert.equal(result.body.brand, "", "no name is proposed from a page that was dropped");
});

test("a homepage that pours bytes without end is dropped at the size limit, with no wait", async (t) => {
  const seen = { bytes: 0, let_go: false };
  const result = await check(t, "hostile.example.org", network({ [SITE]: pours(seen) }));
  assertDropped(result, { at: 0, reason: "unreachable" });
  assert.equal(seen.let_go, true);
  assert.ok(seen.bytes <= BODY_BYTES + 4 * 65536, `${seen.bytes} bytes were taken`);
});

test("a redirect loop ends at the third request", async (t) => {
  const net = network({ [SITE]: redirects(SITE + "again"), [SITE + "again"]: redirects(SITE) });
  const result = await check(t, "hostile.example.org", net);
  assertDropped(result, { at: 0, reason: "unreachable" });
  assert.equal(net.asked.length, REQUESTS);
});

test("a redirect loop that waits as long as it may at every step ends inside 24 seconds", async (t) => {
  const slow = (to) => after(REQUEST_MS - 100, redirects(to));
  const net = network({ [SITE]: slow(SITE + "again"), [SITE + "again"]: slow(SITE) }, () => sleep(LOOKUP_MS - 100));
  const result = await check(t, "hostile.example.org", net);
  assertDropped(result, { at: CHECK_MS, reason: "unreachable" });
  assert.equal(net.asked.length, REQUESTS);
});

test("a name whose lookup never answers is dropped at three seconds", async (t) => {
  const result = await check(t, "hostile.example.org", network({ [SITE]: serves(HOME) }, () => new Promise(() => {})));
  assertDropped(result, { at: LOOKUP_MS, reason: "unresolved" });
});

// A second or third page that is hostile: the pages before it are still used, the check carries
// on to its result, and the result names the page that could not be read.
const VAGUE_SITE = "https://vague.example.org/";
const KINDS = {
  "stalls before its first byte": { page: () => stalls(), at: REQUEST_MS, reason: "timeout" },
  "never ends": { page: () => drips(REQUEST_MS - 100, { bytes: 0 }), at: REQUEST_MS, reason: "timeout" },
  "is oversized": { page: () => oversized(), at: 0, reason: "unreachable" },
  "redirects to itself without end": { page: (self) => redirects(self), at: 0, reason: "unreachable" },
};

for (const [kind, { page, at, reason }] of Object.entries(KINDS)) {
  test(`a third page that ${kind} is dropped, the two pages read before it still give the result, and the result says so`, async (t) => {
    const net = network({ [VAGUE_SITE]: serves(VAGUE), [VAGUE_SITE + "about"]: serves(VAGUE_ABOUT), [VAGUE_SITE + "product"]: page(VAGUE_SITE + "product") });
    const result = await check(t, "vague.example.org", net);
    assert.ok(result, "the check was still reading");
    assert.ok(result.at <= at, `it took ${result.at} ms, and the limit is ${at} ms`);
    assert.equal(result.status, 200);
    assert.equal(result.body.found, true);
    assert.equal(result.body.category, "dental practice management software");
    assert.equal(result.body.brand, "Vague Co");
    assert.deepEqual(result.body.pages, [VAGUE_SITE, VAGUE_SITE + "about"]);
    assert.deepEqual(result.body.unread, [{ page: VAGUE_SITE + "product", reason }]);
    assert.ok(FALLBACK_REASONS.includes(reason));
  });

  test(`a second page that ${kind} is dropped, and the homepage alone gives the result`, async (t) => {
    const net = network({ [VAGUE_SITE]: serves(VAGUE), [VAGUE_SITE + "about"]: page(VAGUE_SITE + "about"), [VAGUE_SITE + "product"]: serves(VAGUE_PRODUCT) });
    const result = await check(t, "vague.example.org", net);
    assert.ok(result, "the check was still reading");
    assert.ok(result.at <= at, `it took ${result.at} ms, and the limit is ${at} ms`);
    assert.equal(result.status, 200);
    assert.equal(result.body.brand, "Vague Co");
    assert.deepEqual(result.body.pages, [VAGUE_SITE]);
    assert.deepEqual(result.body.unread, [{ page: VAGUE_SITE + "about", reason }]);
    assert.equal(net.asked.includes(VAGUE_SITE + "product"), false, "reading stops at the first page that cannot be read, as it always has");
  });
}

test("a site whose pages are all read says nothing about unread pages", async (t) => {
  const net = network({ [VAGUE_SITE]: serves(VAGUE), [VAGUE_SITE + "about"]: serves(VAGUE_ABOUT), [VAGUE_SITE + "product"]: serves(VAGUE_PRODUCT) });
  const result = await check(t, "vague.example.org", net);
  assert.equal(result.at, 0);
  assert.equal(result.body.found, true);
  assert.deepEqual(result.body.pages, [VAGUE_SITE, VAGUE_SITE + "about", VAGUE_SITE + "product"]);
  assert.equal("unread" in result.body, false);
});

test("a page there was no request left for was never asked for, and is not called unread", async (t) => {
  const www = "https://www.vague.example.org/";
  const net = network({ [VAGUE_SITE]: redirects(www), [www]: serves(VAGUE), [www + "about"]: serves(VAGUE_ABOUT), [www + "product"]: serves(VAGUE_PRODUCT) });
  const result = await check(t, "vague.example.org", net);
  assert.equal(result.body.found, true);
  assert.deepEqual(result.body.pages, [www, www + "about"]);
  assert.equal("unread" in result.body, false);
  assert.deepEqual(net.asked, [VAGUE_SITE, www, www + "about"]);
});

test("a slow site that answers inside the limits is read as before", async (t) => {
  const bytes = new TextEncoder().encode(HOME);
  const pieces = Math.ceil(bytes.length / 100);
  const slowBody = () => html(new ReadableStream({
    async start(controller) {
      for (let at = 0; at < bytes.length; at += 100) { controller.enqueue(bytes.slice(at, at + 100)); await sleep(100); }
      controller.close();
    },
  }));
  const net = network({ [SITE]: after(4000, slowBody) }, () => sleep(LOOKUP_MS - 100));
  const result = await check(t, "hostile.example.org", net);
  assert.ok(result, "the check was still reading");
  assert.equal(result.body.found, true);
  assert.equal(result.body.brand, "Acme Field");
  assert.equal(result.body.category, "field service management software");
  assert.ok(4000 + pieces * 100 < REQUEST_MS, "the whole page arrives inside the five seconds of its request");
  assert.equal(result.at, LOOKUP_MS - 100 + 4000 + pieces * 100);
});

test("the page has a sentence for every reason a dropped page is given, and its five seconds are the limit", () => {
  const page = fs.readFileSync("public/index.html", "utf8");
  const sentences = /var READ_WHY = \{([^\n]*?)\};/.exec(page)[1];
  for (const reason of ["timeout", "unreachable", "unresolved"]) assert.match(sentences, new RegExp(`\\b${reason}: '`), reason);
  assert.match(sentences, /timeout: 'Your site took longer than five seconds to answer\.'/);
  assert.equal(REQUEST_MS, 5000);
});
