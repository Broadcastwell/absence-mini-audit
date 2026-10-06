// Always available: the owner's ruling of 5 October 2026. Every offer is always buyable, the
// $990 Diagnostic is retired and the AI Fact Check is removed, so nothing this site serves may
// carry a word that reads as a closure, a pause, a cap or a count of orders. This suite scans
// every served text file byte for byte (comments included; embedded base64 fonts excluded), the
// page's visible text, its meta, alt and label attributes and its structured data, and every
// message the handlers can send back.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

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

// The result view. A check's result is built in the browser by revealing the #result section
// and filling its slots, /r/<id> serves the same bytes with a stored result, and /embed is the
// same document. So the credit line a visitor reads under a result is the section's own markup,
// and no script may write a credit, a Sprint or a Sprint price of its own.
function element(html, at, tag) {
  const pattern = new RegExp("<(/?)" + tag + "\\b[^>]*>", "g");
  pattern.lastIndex = at;
  let depth = 0, match;
  while ((match = pattern.exec(html))) { depth += match[1] ? -1 : 1; if (depth === 0) return html.slice(at, match.index + match[0].length); }
  return "";
}
const words = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
for (const name of ["index.html", "embed.html"]) {
  const doc = file("public/" + name);
  const result = element(doc, doc.indexOf('<section id="result"'), "section");
  const said = words(result);
  check(name + ": the result view states the credit line once, word for word, and no other credit", result.length > 1000 && said.split(CREDIT).length === 2 && !/\bcredit/i.test(said.split(CREDIT).join(" ")), (said.match(/[^.]*\bcredit[^.]*\./gi) || []).join(" | "));
  check(name + ": the result view's promise reads within 48 hours of your category confirmation", (said.match(/within 48 hours/gi) || []).length === (said.match(/within 48 hours of your category confirmation/g) || []).length && said.includes("Findings within 48 hours of your category confirmation."), "result promise");
  const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n");
  check(name + ": no script writes a credit, a Sprint or a Sprint price into the result", scripts.length > 10000 && !/\bcredit|\bSprint\b|\$2,900|\$2,410/i.test(scripts), "script scan");
  check(name + ": the result links the sample report beside its purchase path", /href="\/assets\/sample\/category-audit-sample\.pdf"/.test(result), "sample link");
}

// The sample report the result links to. Its text is read from the PDF's own page streams
// (ASCII85 and Flate, as written) through each font's ToUnicode map, page by page.
function pdfPages(bytes) {
  const pdf = bytes.toString("latin1");
  const objects = {};
  for (const match of pdf.matchAll(/(\d+) 0 obj\n([\s\S]*?)endobj/g)) objects[match[1]] = match[2];
  const ascii85 = (text) => {
    text = text.replace(/\s/g, "").replace(/~>$/, "");
    const out = [];
    for (let at = 0; at < text.length;) {
      if (text[at] === "z") { out.push(0, 0, 0, 0); at += 1; continue; }
      let chunk = text.slice(at, at + 5); at += 5;
      const pad = 5 - chunk.length; chunk += "u".repeat(pad);
      let value = 0; for (const c of chunk) value = value * 85 + (c.charCodeAt(0) - 33);
      out.push(...[Math.floor(value / 16777216) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].slice(0, 4 - pad));
    }
    return Buffer.from(out);
  };
  const stream = (id) => {
    const object = objects[id], at = object.indexOf("stream\n") + 7, dict = object.slice(0, at);
    let data = Buffer.from(object.slice(at, object.lastIndexOf("endstream")), "latin1");
    if (/ASCII85Decode/.test(dict)) data = ascii85(data.toString("latin1"));
    if (/FlateDecode/.test(dict)) data = inflateSync(data);
    return data.toString("latin1");
  };
  const unicode = (hex) => String.fromCharCode(...hex.match(/.{4}/g).map((unit) => parseInt(unit, 16)));
  const toUnicode = (id) => {
    const map = {}, cmap = stream(id);
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map[parseInt(pair[1], 16)] = unicode(pair[2]);
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const range of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) for (let code = parseInt(range[1], 16); code <= parseInt(range[2], 16); code++) map[code] = String.fromCharCode(parseInt(range[3], 16) + code - parseInt(range[1], 16));
    return map;
  };
  const tree = Object.values(objects).find((object) => /\/Type \/Pages\b/.test(object));
  const kids = [...tree.match(/\/Kids \[([^\]]*)\]/)[1].matchAll(/(\d+) 0 R/g)].map((match) => match[1]);
  const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
  const literal = (text) => text.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (all, c) => (c in escapes ? escapes[c] : String.fromCharCode(parseInt(c, 8))));
  const pages = kids.map((id) => {
    const page = objects[id];
    const fontsAt = (/\/Font (\d+) 0 R/.exec(page) || [])[1];
    const fonts = {};
    for (const entry of objects[fontsAt].matchAll(/\/([\w+]+) (\d+) 0 R/g)) { const tu = /\/ToUnicode (\d+) 0 R/.exec(objects[entry[2]]); fonts[entry[1]] = tu ? toUnicode(tu[1]) : null; }
    let font = null, text = "";
    const ops = /\/([\w+]+) [\d.]+ Tf|\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*Tj|\bT\*|\bET\b/g;
    for (const op of stream(/\/Contents (\d+) 0 R/.exec(page)[1]).matchAll(ops)) {
      if (op[1]) { font = fonts[op[1]]; continue; }
      if (op[0] === "T*" || op[0] === "ET") { text += "\n"; continue; }
      const strings = op[3] !== undefined ? [op[3]] : [...op[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((match) => match[1]);
      for (const raw of strings) for (const c of literal(raw)) text += font ? (font[c.charCodeAt(0)] !== undefined ? font[c.charCodeAt(0)] : "\uFFFD") : c;
    }
    return text.replace(/[ \t]*\n+/g, "\n");
  });
  const links = [...pdf.matchAll(/\/URI \(([^)]*)\)/g)].map((match) => match[1]);
  return { count: Number((/\/Count (\d+)/.exec(tree) || [])[1]), pages, links };
}
{
  const sample = pdfPages(readFileSync(root("public/assets/sample/category-audit-sample.pdf")));
  const text = sample.pages.join("\n");
  const flat = text.replace(/\s+/g, " ");
  check("the sample report keeps its four pages", sample.count === 4 && sample.pages.length === 4 && sample.pages.every((page) => page.length > 200), sample.count + " pages");
  check("the sample report's text decodes cleanly through its fonts", !text.includes("\uFFFD") && /Kalvenor Systems on the AI shortlist/.test(flat), "decode");
  check("the sample report's promise reads Findings within 48 hours of your category confirmation.", flat.includes("Ten buyer questions, five engines, three measured runs. Findings within 48 hours of your category confirmation.") && !/48 hours of category confirmation/.test(flat), (flat.match(/.{0,40}48 hours.{0,40}/g) || []).join(" | "));
  check("every delivery promise in the sample report uses the published words", (flat.match(/within 48 hours/gi) || []).length >= 1 && (flat.match(/within 48 hours/gi) || []).length === (flat.match(/within 48 hours of your category confirmation/g) || []).length, "sample promise");
  check("the sample report carries none of the banned words", hits(flat).length === 0, hits(flat).join(" | "));
  check("the sample report has no em dash, en dash or double hyphen", !/[\u2013\u2014]|--/.test(text), "dashes");
  check("every credit the sample report states is the published credit line", !/\bcredit/i.test(flat.split(CREDIT).join(" ")), "sample credit");
  check("the only price in the sample report is the $490 Category Audit", (flat.match(/\$[\d,]+/g) || []).length > 0 && (flat.match(/\$[\d,]+/g) || []).every((price) => price === "$490"), (flat.match(/\$[\d,]+/g) || []).join(","));
  check("the sample report's button goes to the $490 Audit through https://broadcastwell.com/buy/audit", sample.links.length === 1 && sample.links[0] === "https://broadcastwell.com/buy/audit", sample.links.join(","));
  check("every page of the sample report says it is fictional", sample.pages.every((page) => page.replace(/\s+/g, " ").includes("Sample. All companies, pages, quotes and figures are fictional.")), "fictional mark");
}

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
