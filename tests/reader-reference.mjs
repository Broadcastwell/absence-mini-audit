/**
 * The page reader as it was at main c64f480, before it was changed to read in one forward pass.
 * These are the lines of lib/analyze.js at that commit, unchanged (lines 26 to 27, 56 to 109 and
 * 127 to 188), with readPage named readPageBefore. They are kept as the measure: on any page
 * that is small enough for the old patterns, the reader of today must give the same answer.
 * tests/reader-drift.test.mjs holds it to that. This file is used by tests only. Never read a
 * stranger's page with it: its patterns are the ones a hostile page can hold for minutes.
 */

// Paths worth a second look when the homepage alone does not settle the category.
const MORE_PAGES = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(about(?:-us)?|company|product|products|platform|solution|solutions|features|what-we-do|how-it-works|overview|why-[a-z0-9-]+)\/?$/i;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\"", middot: " ", bull: " ", trade: "", reg: "", copy: "" };

function decodeEntities(text) {
  return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    const known = ENTITIES[name.toLowerCase()];
    return known === undefined ? whole : known;
  });
}

// What a visitor reads back is shown verbatim, except that the dash characters the site
// never prints are set as plain hyphens and the text is trimmed to one line.
function clean(text, max) {
  return decodeEntities(String(text || "").replace(/<[^>]*>/g, " "))
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/--+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max || 300);
}

function attributes(tag) {
  const out = {};
  const pattern = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) out[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
  return out;
}

function jsonLdNodes(html) {
  const nodes = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) && nodes.length < 60) {
    let parsed;
    try { parsed = JSON.parse(match[1].trim()); } catch (_) { continue; }
    const queue = Array.isArray(parsed) ? parsed.slice() : [parsed];
    while (queue.length && nodes.length < 60) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      nodes.push(node);
    }
  }
  return nodes;
}

function typeOf(node) {
  const type = node["@type"];
  return (Array.isArray(type) ? type : [type]).map((value) => String(value || ""));
}

/** Read the parts of one page the proposal is built from. */
export function readPageBefore(html, pageUrl) {
  const source = String(html || "");
  const head = source.slice(0, 400000);
  const meta = {};
  const metaPattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(head))) {
    const attrs = attributes(match[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content !== undefined && meta[key] === undefined) meta[key] = attrs.content;
  }
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source);
  const h2s = [];
  const h2Pattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  while ((match = h2Pattern.exec(source)) && h2s.length < 12) h2s.push(clean(match[1], 200));
  const nodes = jsonLdNodes(source);
  const orgNames = [];
  const appCategories = [];
  const ldText = [];
  for (const node of nodes) {
    const types = typeOf(node);
    if (types.some((type) => /Organization|Corporation|SoftwareApplication|WebApplication|Product|WebSite|Brand/.test(type)) && typeof node.name === "string") {
      orgNames.push({ name: clean(node.name, 80), type: types[0] });
    }
    if (typeof node.applicationCategory === "string") appCategories.push(clean(node.applicationCategory, 120));
    if (typeof node.description === "string") ldText.push(clean(node.description, 400));
  }
  const body = clean(source.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").slice(0, 300000), 20000);
  const links = [];
  const linkPattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;
  let base;
  try { base = new URL(pageUrl); } catch (_) { base = null; }
  while (base && (match = linkPattern.exec(source)) && links.length < 400) {
    try {
      const target = new URL(decodeEntities(match[1]), base);
      if (target.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && MORE_PAGES.test(target.pathname)) {
        target.hash = "";
        target.search = "";
        if (links.indexOf(target.toString()) === -1 && target.toString() !== base.toString()) links.push(target.toString());
      }
    } catch (_) { /* not a link */ }
  }
  return {
    productNames: [...nodes.filter(n => typeOf(n).some(t=>/SoftwareApplication|WebApplication|Product/.test(t))).map(n=>clean(n.name||'',80)), ...[...source.matchAll(/<a\b[^>]*href=["'][^"']*\/(?:products?|platform)\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>clean(m[1],80)), ...[titleMatch?.[1],h1Match?.[1]].filter(Boolean).map(v=>clean(v,80)).filter(v=>/^[A-Z][A-Za-z0-9 &+.-]{1,45}$/.test(v))].filter(Boolean),
    title: clean(titleMatch ? titleMatch[1] : "", 200),
    description: clean(meta.description || "", 400),
    ogTitle: clean(meta["og:title"] || "", 200),
    ogDescription: clean(meta["og:description"] || "", 400),
    siteName: clean(meta["og:site_name"] || meta["application-name"] || "", 80),
    h1: clean(h1Match ? h1Match[1] : "", 200),
    h2s: h2s,
    orgNames: orgNames,
    appCategories: appCategories,
    ldText: ldText,
    body: body,
    links: links,
    // A page that needs JavaScript to show anything gives us almost no text.
    empty: body.length < 120 && !(titleMatch && titleMatch[1].trim()) && !meta.description && !meta["og:description"],
  };
}
