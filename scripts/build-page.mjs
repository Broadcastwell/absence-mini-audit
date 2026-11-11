/**
 * Keeps the page, its headers, the brand package and the wheel module in step. Run after any edit
 * to public/index.html, public/404.html, public/assets/wheel.js, public/assets/report.js,
 * public/_headers, scripts/site-chrome.mjs or vendor/brand/ (after `node vendor/brand/sync.mjs`):
 *
 *   node scripts/build-page.mjs           write
 *   node scripts/build-page.mjs --check   exit 1 if anything has drifted (npm test fails the same way)
 *
 * 1. The brand block of the page's one inline style block, between "brand: begin" and "brand: end":
 *    vendor/brand/tokens.css (font addresses made absolute, and only the two faces this site serves)
 *    followed by vendor/brand/components.css, byte for byte.
 * 2. The navigation and footer between the "site header", "page notes" and "site footer" markers,
 *    drawn by scripts/site-chrome.mjs (SHARED_NAV decides which links).
 * 3. The fictional Kalvenor sample, drawn as an answer record by the brand's own function between
 *    the "sample record" markers, from public/assets/sample/kalvenor-wheel.json.
 * 4. The page's one inline script: vendor/brand/nav.js, vendor/brand/answer-record.js,
 *    public/assets/wheel.js, the question bank and the report module, each between its markers, and
 *    the one font rule exported images embed (Geist, from the vendored file).
 * 5. public/embed.html (the same bytes as the page) and public/404.html (the same style block, the
 *    same chrome, no script).
 * 6. The served brand files under public/assets/brand/, byte for byte from vendor/brand/.
 * 7. The sha256 hashes of the inline script, the inline style block and the font rule in every
 *    policy in public/_headers, and lib/headers.js from its "/*" block.
 * 8. The page's JSON-LD: the one Broadcastwell Organization of scripts/entity.mjs first in the graph,
 *    and every other mention of the company a reference to it by @id (brief 13.4).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderChrome, SHARED_NAV } from "./site-chrome.mjs";
import { withOrganizationInPage } from "./entity.mjs";

const path = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
// Editors can write CRLF even with .gitattributes. Hash the LF bytes browsers parse.
const textFile = (p) => readFileSync(path(p), "utf8").replace(/\r\n?/g, "\n");
const check = process.argv.includes("--check");

// Served path -> vendored name: the brand files this site serves as files.
export const SERVED = {
  "public/assets/brand/answer-record.js": "answer-record.js",
  "public/assets/brand/fonts/geist-latin-var.woff2": "fonts/geist-latin-var.woff2",
  "public/assets/brand/fonts/newsreader-headline-latin.woff2": "fonts/newsreader-headline-latin.woff2",
  "public/assets/brand/fonts/LICENSE-Geist-OFL.txt": "fonts/LICENSE-Geist-OFL.txt",
  "public/assets/brand/fonts/LICENSE-Newsreader-OFL.txt": "fonts/LICENSE-Newsreader-OFL.txt",
};
export const FONT_BASE = "/assets/brand/fonts/";
// The faces this site serves; tokens.css declares four, two of which no element here uses.
export const FACES = ["Geist", "Geist Fallback", "Newsreader Display", "Newsreader Display Fallback"];

/** tokens.css for this site: font addresses absolute (the page is also served at /r/<id>), and only the served faces. */
export function brandTokens(css) {
  const kept = css.replace(/@font-face\{[^}]*\}\n?/g, (rule) => {
    const family = (/font-family:"([^"]+)"/.exec(rule) || [])[1];
    return FACES.includes(family) ? rule : "";
  });
  return kept.replace(/url\("fonts\//g, 'url("' + FONT_BASE);
}

export function brandBlock() {
  return "/* brand: begin */\n" + brandTokens(textFile("vendor/brand/tokens.css")).trim() + "\n" + textFile("vendor/brand/components.css").trim() + "\n/* brand: end */";
}

/** The one font rule exported images embed: Geist, from the vendored file, as data. */
export function exportFace() {
  return "@font-face{font-family:Geist;font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64," + readFileSync(path("vendor/brand/fonts/geist-latin-var.woff2")).toString("base64") + ") format('woff2')}";
}

function between(text, begin, end, body, file) {
  const at = text.indexOf(begin);
  const stop = text.indexOf(end, at + begin.length);
  if (at < 0 || stop < 0) throw new Error(file + " is missing its markers " + begin);
  return text.slice(0, at + begin.length) + body + text.slice(stop);
}

async function sampleRecord() {
  await import("../public/assets/brand/answer-record.js");
  await import("../public/assets/wheel.js");
  const data = JSON.parse(textFile("public/assets/sample/kalvenor-wheel.json"));
  const problems = globalThis.BwWheel.validate(data);
  if (problems.length) throw new Error("the Kalvenor sample cannot be drawn: " + problems.join("; "));
  return globalThis.BwWheel.draw(data, { id: "sample-record" }).html;
}

function chrome(html, current, file, sharedNav) {
  const parts = renderChrome({ sharedNav, current });
  let out = between(html, "<!-- site header: begin -->", "<!-- site header: end -->", parts.header, file);
  out = between(out, "<!-- page notes: begin -->", "<!-- page notes: end -->", parts.notes, file);
  return between(out, "<!-- site footer: begin -->", "<!-- site footer: end -->", parts.footer, file);
}

function region(text, name, body, file) {
  return between(text, "/* " + name + ": begin */", "/* " + name + ": end */", "\n" + body.trim() + "\n", file);
}

const inline = (html, tag) => {
  const open = html.indexOf("<" + tag + ">");
  if (open < 0) return null;
  const body = open + tag.length + 2;
  return html.slice(body, html.indexOf("</" + tag + ">", body));
};
const hash = (text) => "'sha256-" + createHash("sha256").update(text, "utf8").digest("base64") + "'";

// sharedNav: the switch to draw with; the committed files follow SHARED_NAV in scripts/site-chrome.mjs.
export async function expected({ sharedNav = SHARED_NAV } = {}) {
  const files = {};
  // The page.
  let page = withOrganizationInPage(textFile("public/index.html"));
  page = between(page, "/* brand: begin */", "/* brand: end */", "", "public/index.html").replace("/* brand: begin *//* brand: end */", brandBlock());
  page = chrome(page, "https://audit.broadcastwell.com/", "public/index.html", sharedNav);
  page = between(page, "<!-- sample record: begin -->", "<!-- sample record: end -->", await sampleRecord(), "public/index.html");
  page = region(page, "brand nav", textFile("vendor/brand/nav.js"), "public/index.html");
  page = region(page, "answer record", textFile("vendor/brand/answer-record.js"), "public/index.html");
  page = region(page, "wheel module", textFile("public/assets/wheel.js"), "public/index.html");
  page = region(page, "question bank", textFile("public/assets/question-bank.js"), "public/index.html");
  page = region(page, "report module", textFile("public/assets/report.js"), "public/index.html");
  const face = exportFace();
  page = region(page, "report font", "var REPORT_FONT_CSS = " + JSON.stringify(face) + ";", "public/index.html");
  files["public/index.html"] = page;
  // /embed serves the same bytes, so the same two hashes cover it; its script switches to the
  // compact embed mode by path. Only its frame-ancestors differ (public/_headers, /embed block).
  files["public/embed.html"] = page;
  // The 404 page: the page's own style block, so the same hash covers it, and no script.
  const style = inline(page, "style");
  let missing = textFile("public/404.html");
  missing = missing.slice(0, missing.indexOf("<style>") + 7) + style + missing.slice(missing.indexOf("</style>"));
  files["public/404.html"] = chrome(missing, "", "public/404.html", sharedNav);
  if (inline(files["public/404.html"], "script") !== null) throw new Error("public/404.html carries no script");
  files["public/assets/fonts/geist-embed.css"] = face;

  let headers = textFile("public/_headers");
  // Every policy that governs the page (the site-wide one and the /embed one) gets the hashes.
  headers = headers.replace(/script-src '[^']+'/g, "script-src " + hash(inline(page, "script")));
  headers = headers.replace(/style-src 'self' '[^']+'( '[^']+')?/g, "style-src 'self' " + hash(style) + " " + hash(face));
  headers = headers.replace(/default-src 'none'; style-src '[^']+'; font-src data:/, "default-src 'none'; style-src " + hash(face) + "; font-src data:");
  files["public/_headers"] = headers;

  const start = headers.indexOf("/*\n");
  const next = headers.slice(start + 3).search(/^\//m);
  const block = next === -1 ? headers.slice(start) : headers.slice(start, start + 3 + next);
  const pairs = block.split("\n").slice(1).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes(":")).map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]);
  const lines = pairs.map(([name, value]) => "  " + JSON.stringify(name) + ": " + JSON.stringify(value) + ",");
  files["lib/headers.js"] = "// Generated by scripts/build-page.mjs from the \"/*\" block of public/_headers. Do not edit.\n// A page served by a function carries these, exactly as the static page does.\nexport const PAGE_HEADERS = {\n" + lines.join("\n") + "\n};\n";
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const drift = [];
  for (const [served, name] of Object.entries(SERVED)) {
    const want = readFileSync(path("vendor/brand/" + name));
    if (check) { if (!existsSync(path(served)) || !readFileSync(path(served)).equals(want)) drift.push(served); continue; }
    mkdirSync(dirname(path(served)), { recursive: true });
    writeFileSync(path(served), want);
  }
  for (const [file, text] of Object.entries(await expected())) {
    if (check) { if (!existsSync(path(file)) || textFile(file) !== text) drift.push(file); continue; }
    writeFileSync(path(file), text);
  }
  if (check && drift.length) { console.error("page build drift: " + drift.join(", ") + ". Run node scripts/build-page.mjs"); process.exit(1); }
  console.log(check ? "page, headers and brand files are in step" : "page, headers, lib/headers.js and brand files are in step (SHARED_NAV " + SHARED_NAV + ")");
}
