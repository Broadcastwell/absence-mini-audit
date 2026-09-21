/**
 * The analyze step: the visitor types a website and nothing else, and this handler reads
 * the site's public pages and proposes a brand name and a category in the buyer's words.
 *
 * It is free by construction. It never calls the upstream, and it reads no more than
 * three pages through the fetch guard in lib/guard.js. Nothing here is spent until the
 * visitor confirms on the page and the page calls /api/run.
 *
 * It never leaves the visitor at a dead end. A site that blocks us, answers with an empty
 * shell that needs JavaScript, times out or cannot be classified still answers 200 with
 * `found: false` and a fixed reason word, and the page asks for the brand and category by
 * hand in a plain sentence.
 */

import { LEXICON } from "./lexicon.js";
import { fetchBudget, checkAddress } from "./guard.js";
import { QUESTION_TEMPLATES } from "./audit.js";

const LIMITS_KEY = "config:limits";
export const ANALYZE_DEFAULTS = { analyze_per_ip_per_day: 10, analyze_global_per_day: 150 };

// The words a caller can be told about why a read fell back to typing. The page owns
// the sentence for each.
export const FALLBACK_REASONS = ["blocked", "timeout", "empty", "unclassified", "unreachable", "not_html", "private", "unresolved"];

// Paths worth a second look when the homepage alone does not settle the category.
const MORE_PAGES = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(about(?:-us)?|company|product|products|platform|solution|solutions|features|what-we-do|how-it-works|overview|why-[a-z0-9-]+)\/?$/i;

// Scores at or above this settle the category from the homepage without reading more.
const CONFIDENT = 8;
// Below this the proposal is shown as a guess the visitor should check.
const MATCHED = 3;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilTomorrow() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(60, Math.floor((midnight - now) / 1000));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\"", middot: " ", bull: " ", trade: "", reg: "", copy: "" };

export function decodeEntities(text) {
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
export function readPage(html, pageUrl) {
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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TERM_PATTERNS = new Map();
function termPattern(term) {
  if (!TERM_PATTERNS.has(term)) TERM_PATTERNS.set(term, new RegExp("(^|[^a-z0-9])" + escapeRegExp(term) + "(?=$|[^a-z0-9])", "g"));
  return TERM_PATTERNS.get(term);
}

function countMatches(text, term) {
  const pattern = termPattern(term);
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) && count < 20) count += 1;
  return count;
}

// Every phrase in the lexicon, and for each one the longer phrases that contain it. An
// occurrence of "construction project management" is not also counted as an occurrence of
// "project management": the longer, more specific phrase wins.
const PHRASES = Array.from(new Set(LEXICON.flatMap((entry) => entry.terms.concat(entry.label.toLowerCase()))));
const CONTAINERS = new Map(PHRASES.map((phrase) => [phrase, PHRASES.filter((other) => other !== phrase && other.length > phrase.length && countMatches(other, phrase) > 0)]));

function countOwn(text, phrase) {
  let count = countMatches(text, phrase);
  if (!count) return 0;
  for (const longer of CONTAINERS.get(phrase) || []) count -= countMatches(text, longer);
  return Math.max(0, count);
}

/**
 * Score every lexicon entry against what was read. Fields that describe the company
 * (title, description, first heading, structured data) weigh more than body text, and a
 * phrase of two or more words counts double. The result is sorted, best first.
 */
export function classify(pages) {
  const fields = [];
  for (const page of pages) {
    fields.push([page.title, 3], [page.description, 3], [page.ogTitle, 2], [page.ogDescription, 2], [page.h1, 3], [page.appCategories.join(" "), 4], [page.ldText.join(" "), 2], [page.h2s.join(" "), 1], [page.body, 0.5]);
  }
  const lowered = fields.map(([text, weight]) => [String(text || "").toLowerCase(), weight]);
  const scored = LEXICON.map((entry) => {
    let score = 0;
    for (const term of entry.terms) {
      const multiplier = term.includes(" ") ? 2 : 1;
      for (const [text, weight] of lowered) {
        if (!text) continue;
        const hits = countOwn(text, term);
        if (hits) score += weight * multiplier * Math.min(hits, weight < 1 ? 6 : 3);
      }
    }
    const label = entry.label.toLowerCase();
    for (const [text, weight] of lowered) if (text && countOwn(text, label)) score += weight * 3;
    return { id: entry.id, label: entry.label, score: Math.round(score * 10) / 10 };
  });
  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function words(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Propose the brand: what the site calls itself, checked against its own domain. */
export function proposeBrand(pages, host) {
  const domainLabel = host.replace(/^www\./, "").split(".")[0];
  const squash = words(domainLabel);
  const candidates = [];
  const page = pages[0];
  if (page.siteName) candidates.push(page.siteName);
  for (const org of page.orgNames) if (/Organization|Corporation|Brand/.test(org.type)) candidates.push(org.name);
  for (const org of page.orgNames) candidates.push(org.name);
  for (const title of [page.ogTitle, page.title]) {
    for (const part of String(title || "").split(/\s+[|:\-\u00b7\u2022]\s+|\s*\|\s*/)) if (part.trim()) candidates.push(part.trim());
  }
  const usable = candidates.map((name) => clean(name, 60)).filter((name) => name && name.split(" ").length <= 5 && !/^(home|homepage|welcome)$/i.test(name));
  const matching = usable.find((name) => { const w = words(name); return w && (squash.includes(w) || w.includes(squash)); });
  if (matching) return matching;
  if (page.siteName && page.siteName.split(" ").length <= 4) return page.siteName;
  return domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1);
}

/** The ten questions for a category, in the order the upstream asks them. */
export function questionsFor(category) {
  return QUESTION_TEMPLATES.map((template) => template(category));
}

async function bump(env, key, cap, ttl) {
  const current = parseInt((await env.AUDIT.get(key)) || "0", 10);
  if (current >= cap) return false;
  await env.AUDIT.put(key, String(current + 1), { expirationTtl: ttl });
  return true;
}

export async function analyze(request, env, options) {
  const fetcher = (options && options.fetcher) || ((url, init) => fetch(url, init));
  const preview = options && options.preview;
  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ message: "Enter your website address.", reason: "input" }, 400);
  }
  const website = String((payload && payload.website) || "").trim().slice(0, 2048);
  const shape = checkAddress(website);
  if (!shape.ok) {
    // An address we will never fetch is answered before any counter is touched.
    const reason = shape.reason === "address" ? "input" : "address";
    return json({ message: reason === "input" ? "Enter your website address." : "Enter the public address of your website.", reason: reason }, 400);
  }

  // The analyze step has its own daily allowance, per network and for the whole site,
  // held in the same limits record as the run. Preview has no store bound, and skips it.
  if (env && env.AUDIT) {
    const stored = await env.AUDIT.get(LIMITS_KEY, "json");
    const cfg = Object.assign({}, ANALYZE_DEFAULTS, stored || {});
    const day = today();
    const ttl = secondsUntilTomorrow();
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const ipKey = `count:analyze:ip:${day}:${ip}`;
    const ipCount = parseInt((await env.AUDIT.get(ipKey)) || "0", 10);
    if (ipCount >= cfg.analyze_per_ip_per_day) return json({ message: "This network has read enough websites for today. Type your brand and category instead.", reason: "network" }, 429);
    if (!(await bump(env, `count:analyze:global:${day}`, cfg.analyze_global_per_day, ttl))) return json({ message: "Reading websites is paused for today. Type your brand and category instead.", reason: "global" }, 503);
    await env.AUDIT.put(ipKey, String(ipCount + 1), { expirationTtl: ttl });
  } else if (!preview) {
    return json({ message: "Type your brand and category instead.", reason: "unavailable" }, 503);
  }

  const budget = fetchBudget(fetcher);
  const host = shape.host.replace(/^www\./, "");
  const fallback = (reason, extra) => json(Object.assign({ found: false, reason: reason, website: host, questions_template: questionTemplate() }, extra || {}), 200);

  const home = await budget.get(shape.url.toString());
  if (!home.ok) return fallback(home.reason === "budget" ? "unreachable" : home.reason);
  const pages = [readPage(home.html, home.url)];
  if (pages[0].empty) return fallback("empty");

  let ranked = classify(pages);
  const read = [home.url];
  if (!ranked.length || ranked[0].score < CONFIDENT) {
    for (const link of pages[0].links.slice(0, 2)) {
      const more = await budget.get(link);
      if (!more.ok) break;
      pages.push(readPage(more.html, more.url));
      read.push(more.url);
    }
    if (pages.length > 1) ranked = classify(pages);
  }

  const finalHost = new URL(home.url).hostname.replace(/^www\./, "");
  const brand = proposeBrand(pages, finalHost);
  const said = { title: pages[0].title || pages[0].ogTitle, description: pages[0].description || pages[0].ogDescription };
  if (!ranked.length || ranked[0].score < MATCHED) {
    return fallback("unclassified", { brand: brand, read: said, pages: read, alternatives: ranked.slice(0, 3).map((entry) => entry.label) });
  }
  return json({
    found: true,
    website: finalHost,
    brand: brand,
    category: ranked[0].label,
    alternatives: ranked.slice(1, 4).map((entry) => entry.label),
    read: said,
    pages: read,
    questions_template: questionTemplate(),
  });
}

// The ten question sentences with a marker where the category goes, so the page can show
// the exact questions for whatever category the visitor settles on.
export function questionTemplate() {
  return QUESTION_TEMPLATES.map((template) => template("{category}"));
}
