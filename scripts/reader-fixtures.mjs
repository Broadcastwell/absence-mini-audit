/**
 * The recorded fixtures of the page reader (tests/fixtures/reader/).
 *
 * The fixtures are ordinary company pages written for this repository. This script reads every
 * one of them with the code as it stands and gives back what readPage, classify, proposeBrand,
 * proposeProducts and questionsFor answer for each page, and what analyze answers for each site
 * over a network that serves only those files. tests/fixtures/reader/expected.json holds those
 * answers as they were at main c64f480, before the reader was changed, and
 * tests/reader-drift.test.mjs holds the code to them: a normal company's result reads the same
 * before and after.
 *
 *   node scripts/reader-fixtures.mjs            compare the code with expected.json
 *   node scripts/reader-fixtures.mjs --record   write expected.json (only at a commit whose
 *                                               answers are the ones to keep) and MANIFEST.json
 *   node scripts/reader-fixtures.mjs --manifest write MANIFEST.json alone
 *
 * Nothing here reaches the internet.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import "../lib/audit.js";
import { analyze, readPage, classify, proposeBrand, proposeProducts, questionsFor } from "../lib/analyze.js";

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "reader");
export const fixtureText = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
export const fixtureIndex = () => JSON.parse(fixtureText("index.json"));
export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// A network that serves the routes of one site and one public address for every name.
export function fixtureNetwork(routes) {
  return async (address) => {
    const target = new URL(address);
    if (target.hostname === "cloudflare-dns.com") {
      const type = target.searchParams.get("type");
      const answer = type === "A" ? [{ name: target.searchParams.get("name"), type: 1, data: "93.184.216.34" }] : [];
      return new Response(JSON.stringify({ Status: 0, Answer: answer }), { headers: { "content-type": "application/dns-json" } });
    }
    const route = routes[target.toString()];
    if (!route) return new Response("not found", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    if (route.redirect) return new Response("", { status: 301, headers: { location: route.redirect } });
    return new Response(route.html === undefined ? fixtureText(route.file) : route.html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
}

// The files this repository shares with the app, byte for byte. Their hashes stand in the
// manifest beside the fixtures, so one manifest says what both sides must hold.
export const SHARED_FILES = { "shared:html-scan.js": "lib/html-scan.js", "shared:ld-read.js": "lib/ld-read.js", "shared:guard.js": "lib/guard.js" };
const REPOSITORY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function checkRequest(website) {
  return new Request("https://audit.broadcastwell.com/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website }) });
}

/** What the code answers for every fixture page and every fixture site, as plain JSON. */
export async function readerOutputs() {
  const index = fixtureIndex();
  const pages = {};
  for (const { file, url } of index.pages) {
    const page = readPage(fixtureText(file), url);
    const host = new URL(url).hostname;
    const ranked = classify([page]);
    pages[file] = {
      url,
      readPage: page,
      classify: ranked,
      proposeBrand: proposeBrand([page], host),
      proposeProducts: proposeProducts([page], host),
      questionsFor: questionsFor(ranked.length ? ranked[0].label : "business software"),
    };
  }
  const sites = {};
  for (const { website, routes } of index.sites) {
    const response = await analyze(checkRequest(website), {}, { fetcher: fixtureNetwork(routes), preview: true });
    sites[website] = { status: response.status, body: await response.json() };
  }
  // The pages longer than the check reads (tests/fixtures/reader/oversized.mjs): what is read of
  // the first 1,048,576 bytes of each, and what a whole check of the site answers.
  const { oversizedPages, cutText } = await import(pathToFileURL(path.join(FIXTURE_DIR, "oversized.mjs")).href);
  for (const { name, website, url, html } of oversizedPages()) {
    const page = readPage(cutText(html), url);
    const ranked = classify([page]);
    pages[name] = {
      url,
      readPage: page,
      classify: ranked,
      proposeBrand: proposeBrand([page], website),
      proposeProducts: proposeProducts([page], website),
      questionsFor: questionsFor(ranked.length ? ranked[0].label : "business software"),
    };
    const response = await analyze(checkRequest(website), {}, { fetcher: fixtureNetwork({ [url]: { html } }), preview: true });
    sites[website] = { status: response.status, body: await response.json() };
  }
  return JSON.parse(JSON.stringify({ pages, sites }));
}

/**
 * The SHA-256 of every fixture file, the index and the expected answers, of every page that
 * oversized.mjs builds, and of the files shared with the app.
 */
export async function fixtureManifest() {
  const names = fs.readdirSync(FIXTURE_DIR).filter((name) => name !== "MANIFEST.json").sort();
  const manifest = Object.fromEntries(names.map((name) => [name, sha256(fs.readFileSync(path.join(FIXTURE_DIR, name)))]));
  const { oversizedPages } = await import(pathToFileURL(path.join(FIXTURE_DIR, "oversized.mjs")).href);
  for (const { name, html } of oversizedPages()) manifest[`built:${name}`] = sha256(Buffer.from(html, "utf8"));
  for (const [key, file] of Object.entries(SHARED_FILES)) manifest[key] = sha256(fs.readFileSync(path.join(REPOSITORY, file)));
  return manifest;
}

const asFile = (value) => JSON.stringify(value, null, 1) + "\n";

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const mode = process.argv[2] || "";
  if (mode === "--record") {
    fs.writeFileSync(path.join(FIXTURE_DIR, "expected.json"), asFile(await readerOutputs()));
    console.log("wrote expected.json");
  }
  if (mode === "--record" || mode === "--manifest") {
    fs.writeFileSync(path.join(FIXTURE_DIR, "MANIFEST.json"), asFile(await fixtureManifest()));
    console.log("wrote MANIFEST.json");
  } else {
    const expected = JSON.parse(fixtureText("expected.json"));
    const now = await readerOutputs();
    let differing = 0, values = 0;
    for (const group of ["pages", "sites"]) {
      for (const name of Object.keys(expected[group])) {
        for (const key of Object.keys(expected[group][name])) {
          values += 1;
          if (!isDeepStrictEqual(expected[group][name][key], (now[group][name] || {})[key])) { differing += 1; console.log("DIFFERS", group, name, key); }
        }
      }
    }
    console.log(`${Object.keys(expected.pages).length} pages, ${Object.keys(expected.sites).length} sites, ${values} recorded values, ${differing} differ`);
    process.exit(differing ? 1 : 0);
  }
}
