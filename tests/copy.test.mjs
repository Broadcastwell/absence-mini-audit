// Always available: the owner's ruling of 5 October 2026. Every offer is always buyable, the
// $990 Diagnostic is retired and the AI Fact Check is removed, so nothing this site serves may
// carry a word that reads as a closure, a pause, a cap or a count of orders. This suite scans
// every served text file byte for byte (comments included; embedded base64 fonts excluded), the
// page's visible text, its meta, alt and label attributes and its structured data, and every
// message the handlers can send back.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0, failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log("PASS  " + name); } else { failed += 1; console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : "")); }
}
const root = (p) => fileURLToPath(new URL("../" + p, import.meta.url));
const file = (p) => readFileSync(root(p), "utf8");

// Section 0 item 5 of the ruling, plus the retired names. Each pattern is word bounded and case
// blind, so "diagnosis" and "full" on their own stay allowed.
const BANNED = [
  ["pause or paused", /\bpaus(?:e|ed|es|ing)\b/i],
  ["pilot", /\bpilots?\b/i],
  ["closed", /\bclosed\b/i],
  ["not currently offered", /\bnot currently offered\b/i],
  ["not open", /\bnot open\b/i],
  ["reopens", /\breopen(?:s|ed|ing)?\b/i],
  ["is full", /\b(?:is|are) full\b/i],
  ["orders in total", /\borders in total\b/i],
  ["an order count", /\(\s*\d+\s+orders?\s*\)|\b\d[\d,]*\s+orders?\b/i],
  ["waitlist", /\bwait[\s-]?list/i],
  ["temporarily", /\btemporar(?:y|ily)\b/i],
  ["limited availability", /\blimited availability\b/i],
  ["next batch", /\bnext batch\b/i],
  ["capacity", /\bcapacity\b/i],
  ["the retired Diagnostic", /\bdiagnostic\b/i],
  ["the retired $990 price", /\$990\b/],
  ["the removed AI Fact Check", /\bfact[\s-]?check/i],
  ["free audit", /\bfree (?:mini-|ai visibility )?audit\b/i],
];
function hits(text) {
  return BANNED.filter(([, pattern]) => pattern.test(text)).map(([name, pattern]) => {
    const at = pattern.exec(text);
    return name + " at " + JSON.stringify(text.slice(Math.max(0, at.index - 40), at.index + at[0].length + 40));
  });
}

// The scanner itself: every pattern catches its word, and leaves the words the page must keep.
{
  const caught = ["The Diagnostic is paused.", "Pause", "a pilot offer", "Orders are closed", "not currently offered", "It is not open", "It reopens soon", "The queue is full", "five orders in total", "(5 orders)", "12 orders", "join the waitlist", "temporarily unavailable", "limited availability", "the next batch", "at capacity", "$990 once", "AI Fact Check", "a free audit", "the free mini-audit"];
  const missed = caught.filter((text) => hits(text).length === 0);
  check("the scanner catches every banned word", missed.length === 0, missed.join(" | "));
  const kept = ["a position, not a diagnosis", "Refundable in full within 30 days of delivery.", "The $490 Category Audit is available now.", "one run on one engine", "The check could not answer just now."];
  const flagged = kept.filter((text) => hits(text).length > 0);
  check("the scanner leaves the page's own words alone", flagged.length === 0, flagged.join(" | "));
}

// Every text file Cloudflare Pages serves from public/, byte for byte.
const TEXT_FILE = /\.(?:html|css|js|mjs|svg|txt|json|xml)$/i;
function publicFiles(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? publicFiles(path) : [path];
  });
}
const publicRoot = root("public/");
const served = publicFiles(publicRoot).filter((path) => TEXT_FILE.test(path));
const withoutData = (text) => text.replace(/data:[a-z0-9.+\/-]+;base64,[A-Za-z0-9+\/=]+/gi, "data:");
check("the scan covers the page, the frame, robots.txt, the sitemap, the social cards, the wheel module and the sample wheel",
  ["index.html", "embed.html", "robots.txt", "sitemap.xml", "absence-mini-audit-2026-09.svg", "wheel.js", "kalvenor-wheel.svg", "kalvenor-wheel.json"].every((name) => served.some((path) => path.endsWith(name))), served.length + " files");
for (const path of served) {
  const found = hits(withoutData(readFileSync(path, "utf8")));
  check("served file " + relative(publicRoot, path).split("\\").join("/") + " carries none of the banned words", found.length === 0, found.join(" | "));
}

// The page as a visitor meets it: visible text, buttons and links, alt text, meta, labels and the
// structured data.
const page = file("public/index.html");
const body = page.slice(page.indexOf("<body>"), page.lastIndexOf("</body>"));
const visible = body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const attributes = [...page.matchAll(/\b(?:alt|content|aria-label|title|placeholder)="([^"]*)"/g)].map((match) => match[1]);
const ld = JSON.parse((/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page) || [])[1] || "{}");
const ldStrings = [];
(function walk(node) { if (typeof node === "string") ldStrings.push(node); else if (node && typeof node === "object") Object.values(node).forEach(walk); })(ld);
check("the visible text, buttons and links carry none of the banned words", hits(visible).length === 0, hits(visible).join(" | "));
check("alt text, meta and labels carry none of the banned words", attributes.length > 10 && hits(attributes.join("\n")).length === 0, hits(attributes.join("\n")).join(" | "));
check("the structured data carries none of the banned words", ldStrings.length > 10 && hits(ldStrings.join("\n")).length === 0, hits(ldStrings.join("\n")).join(" | "));
const dashes = [visible, attributes.join("\n"), ldStrings.join("\n")].join("\n").match(/.{0,30}(?:[\u2013\u2014]|--).{0,30}/g) || [];
check("no em dash, en dash or double hyphen in anything a visitor reads", dashes.length === 0, dashes.join(" | "));

// The offers the ruling allows, in its words.
const buyLinks = [...page.matchAll(/https:\/\/broadcastwell\.com\/buy\/[a-z0-9-]*/g)].map((match) => match[0]);
check("every purchase control goes to the $490 Audit through https://broadcastwell.com/buy/audit", buyLinks.length >= 3 && buyLinks.every((url) => url === "https://broadcastwell.com/buy/audit"), [...new Set(buyLinks)].join(","));
const CREDIT = "The $490 credits once against the $2,900 Fix Sprint within 30 days of delivery, so the Sprint is $2,410.";
check("every credit the page states is the published credit line", visible.includes(CREDIT) && !/\bcredit/i.test(visible.split(CREDIT).join(" ")) && !/\bcredit/i.test(ldStrings.join("\n")), "credit");
const said = [visible, ldStrings.join("\n")].join("\n");
const promises = (said.match(/within 48 hours/gi) || []).length, published = (said.match(/within 48 hours of your category confirmation/g) || []).length;
check("every delivery promise reads within 48 hours of your category confirmation", promises >= 4 && promises === published, published + " of " + promises);

// Every sentence the handlers can send back: the run refusals, the website read and result link
// messages, and the result link page's title.
const auditSource = file("lib/audit.js");
const responsesAt = auditSource.indexOf("const RESPONSES = {");
const runMessages = [...auditSource.slice(responsesAt, auditSource.indexOf("};", responsesAt)).matchAll(/^\s+[a-z_]+: "([^"]+)",$/gm)].map((match) => match[1]);
check("the scan reads all six run refusals", runMessages.length === 6, runMessages.length + " found");
const sentLines = ["lib/analyze.js", "lib/link.js", "lib/event.js", "lib/seal.js", "lib/guard.js"].flatMap((path) => file(path).split("\n").filter((line) => /message: |<title>/.test(line)));
const sent = runMessages.concat(sentLines.flatMap((line) => [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])));
check("the scan reads the website read, result link and result page messages", sent.length >= 16, sent.length + " strings");
check("no message the handlers can send carries a banned word", hits(sent.join("\n")).length === 0, hits(sent.join("\n")).join(" | "));
check("a run the engine could not answer says so plainly, with what to do next", /unavailable: 'The check could not answer just now\.'/.test(page) && runMessages.includes("We could not complete this run. Your daily check has not been used. Try again in a few minutes, or email hello@broadcastwell.com."), "unavailable copy");

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
