// Brand system 3 on audit.broadcastwell.com (brief 8.7, 11.1 step 4).
//
// The vendored brand package is ON-SYSTEM only when every copy's hash matches VERSION.json. This
// suite fails on a hand edit, a partial sync, a served copy that drifted from vendor/brand/, a page
// that drifted from the build, a navigation switch that is not one boolean, or a 404 that is soft.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { FILES, expectedHash, sha256 } from "../vendor/brand/sync.mjs";
import { SERVED, expected, brandTokens } from "../scripts/build-page.mjs";
import { SHARED_NAV, SHARED, LEGACY, renderChrome } from "../scripts/site-chrome.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor", "brand");
const read = (p) => readFileSync(join(root, p), "utf8");
const version = JSON.parse(readFileSync(join(vendor, "VERSION.json"), "utf8"));
const vendored = JSON.parse(readFileSync(join(vendor, "VENDORED.json"), "utf8"));

test("the vendored record names the package version it was copied from", () => {
  assert.equal(vendored.version, version.version);
  assert.equal(vendored.built_at, version.built_at);
  assert.match(version.version, /^3\.\d+\.\d+$/);
  assert.match(vendored.source_commit, /^[0-9a-f]{40}$/);
});

test("every vendored file is listed, present and byte-identical to VERSION.json", () => {
  assert.deepEqual(Object.keys(vendored.files).sort(), Object.keys(FILES).sort());
  for (const [name, from] of Object.entries(FILES)) {
    const file = join(vendor, name);
    assert.ok(existsSync(file), `${name} is missing from vendor/brand`);
    assert.equal(vendored.files[name].from, from);
    assert.ok(expectedHash(version, from), `VERSION.json does not list ${from}`);
    assert.equal(sha256(file), expectedHash(version, from), `${name} differs from VERSION.json`);
  }
});

test("a copy that differs from VERSION.json is caught", () => {
  // The hash the check compares against is the package's own, never one this repository computes.
  const tokens = expectedHash(version, FILES["tokens.css"]);
  assert.notEqual(sha256(join(root, "package.json")), tokens);
  assert.equal(sha256(join(vendor, "tokens.css")), tokens);
});

test("every served copy of a brand file equals its vendored copy", () => {
  assert.ok(Object.keys(SERVED).length >= 5);
  for (const [served, name] of Object.entries(SERVED)) {
    assert.equal(sha256(join(root, served)), sha256(join(vendor, name)), `${served} drifted from vendor/brand/${name}`);
  }
});

test("the page carries the vendored tokens and components byte for byte, and the vendored navigation script", () => {
  const page = read("public/index.html");
  const block = page.slice(page.indexOf("/* brand: begin */") + 18, page.indexOf("/* brand: end */")).trim();
  assert.equal(block, brandTokens(read("vendor/brand/tokens.css")).trim() + "\n" + read("vendor/brand/components.css").trim());
  // Only the two faces this site serves, with absolute addresses (the page is also served at /r/<id>).
  assert.equal((block.match(/@font-face/g) || []).length, 4);
  assert.doesNotMatch(block, /url\("fonts\//);
  assert.ok(page.includes("/* brand nav: begin */\n" + read("vendor/brand/nav.js").trim() + "\n/* brand nav: end */"));
});

test("fonts on first view: two families, two files, each 60 KB or less", () => {
  for (const name of ["geist-latin-var.woff2", "newsreader-headline-latin.woff2"]) {
    assert.ok(statSync(join(root, "public/assets/brand/fonts", name)).size <= 60 * 1024, name);
  }
  const page = read("public/index.html");
  const families = new Set([...page.matchAll(/@font-face\{font-family:"([^"]+)";src:url/g)].map((m) => m[1]));
  assert.deepEqual([...families].sort(), ["Geist", "Newsreader Display"]);
});

test("the page, the frame, the 404 page, the headers and the served brand files are in step with the build", () => {
  execFileSync(process.execPath, [join(root, "scripts/build-page.mjs"), "--check"], { stdio: "pipe" });
});

test("SHARED_NAV is one boolean constant, off by default on this branch, and the committed pages follow it", async () => {
  const source = read("scripts/site-chrome.mjs");
  assert.equal((source.match(/^export const SHARED_NAV = (true|false);$/gm) || []).length, 1);
  assert.equal(typeof SHARED_NAV, "boolean");
  const built = await expected();
  assert.equal(built["public/index.html"], read("public/index.html"));
  assert.equal(built["public/404.html"], read("public/404.html"));
});

test("the switch both ways: off draws today's links in the brand markup, on draws brand/nav.json, and nothing else changes", async () => {
  const off = await expected({ sharedNav: false });
  const on = await expected({ sharedNav: true });
  const outside = (html) => html.replace(/<!-- site header: begin -->[\s\S]*?<!-- site header: end -->/, "").replace(/<!-- page notes: begin -->[\s\S]*?<!-- page notes: end -->/, "").replace(/<!-- site footer: begin -->[\s\S]*?<!-- site footer: end -->/, "");
  for (const file of ["public/index.html", "public/404.html"]) assert.equal(outside(off[file]), outside(on[file]), file);
  const offPage = off["public/index.html"], onPage = on["public/index.html"];
  const labels = (html) => [...((/<ul class="bw-site-nav__list">([\s\S]*?)<\/ul><\/nav>/.exec(html) || ["", ""])[1]).matchAll(/<(?:a|summary) class="bw-site-nav__trigger[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(labels(offPage), LEGACY.items.map((item) => item.label));
  assert.deepEqual(labels(onPage), SHARED.items.map((item) => item.label));
  assert.ok(offPage.includes('data-buy>Fix one answer, $490</a>') && !offPage.includes('>Start free</a>'));
  assert.ok(onPage.includes('<a class="bw-button bw-button--primary" href="https://audit.broadcastwell.com/">Start free</a>') && !/<header[\s\S]*buy\/answer-repair[\s\S]*<\/header>/.test(onPage));
  assert.ok(offPage.includes('<time datetime="2026-10-26">') && !/Last updated|<time/.test(onPage.slice(onPage.indexOf("<footer"))));
  assert.ok(onPage.includes(SHARED.footer.brand_line) && onPage.includes('<aside class="page-notes"'));
  // One navigation variant per state: the same renderer markup in both (no fifth variant).
  for (const page of [offPage, onPage]) {
    assert.equal((page.match(/<header class="bw-site-nav" data-bw-nav>/g) || []).length, 1);
    assert.equal((page.match(/<footer class="bw-site-footer">/g) || []).length, 1);
    assert.ok(page.indexOf('<a class="bw-skip" href="#main">Skip to content</a>') < page.indexOf("<header") && page.includes('<main id="main"'));
  }
  const chromeOff = renderChrome({ sharedNav: false }), chromeOn = renderChrome({ sharedNav: true });
  assert.notEqual(chromeOff.header, chromeOn.header);
  assert.equal(chromeOff.notes, "");
});

test("a real 404: an unknown path gets 404.html, which says where the visitor is and offers the two doors and the way back", () => {
  // Cloudflare Pages answers an unmatched path with a top-level 404.html and status 404; without one
  // it serves the index with 200 (a soft 404). functions/ routes only /api/* and /r/*.
  assert.ok(existsSync(join(root, "public/404.html")));
  const page = read("public/404.html");
  assert.match(page, /<title>Page not found \| Free 10-question check \(one engine\) \| Broadcastwell<\/title>/);
  assert.match(page, /<h1>This page is not here\.<\/h1>/);
  assert.ok(page.includes("You are on audit.broadcastwell.com, the home of the Free 10-question check (one engine)."));
  assert.ok(page.includes('<a class="bw-button bw-button--primary" href="https://audit.broadcastwell.com/">Run the free check</a>'));
  assert.ok(page.includes('<a class="bw-button bw-button--secondary" href="https://broadcastwell.com/contact">Talk to us</a>'));
  assert.ok(page.includes('<a href="https://broadcastwell.com/">Go back to broadcastwell.com</a>'));
  assert.equal((page.match(/bw-button--primary/g) || []).length, (page.slice(0, page.indexOf("<main")).match(/bw-button--primary/g) || []).length + 1, "one primary action in the page body");
  assert.doesNotMatch(page, /<script/);
  assert.doesNotMatch(page, /<meta name="robots" content="index/);
  // The same style block as the page, so the page's one style hash covers it.
  const style = (html) => html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
  assert.equal(style(page), style(read("public/index.html")));
  const files = execFileSync("git", ["ls-files", "functions"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  assert.ok(files.every((file) => /^functions\/(api\/|r\/)/.test(file)), files.join(","));
  assert.ok(!existsSync(join(root, "public/_routes.json")) && !existsSync(join(root, "public/_redirects")));
});

test("the 404 page follows the writing rules", () => {
  const page = read("public/404.html");
  const main = page.slice(page.indexOf("<main"), page.indexOf("</main>")).replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(main, /[–—!]|--|\b(I|me|my)\b|sorry|oops|free audit|paused|coming soon/i);
  assert.doesNotMatch(main, /\bfrom \$|starting at/i);
});
