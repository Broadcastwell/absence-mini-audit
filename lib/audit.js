/**
 * audit.broadcastwell.com request handler.
 *
 * Serves the one API route the front end calls. The browser never learns
 * anything about what sits behind this handler: the upstream address is a
 * secret binding, it is never echoed, and no error path returns an upstream
 * body or hostname.
 *
 * Everything the caller can see is in this file. Read it as the
 * confidentiality boundary: if a string is not in RESPONSES or in the two
 * allow-lists below, the user never sees it.
 *
 * Limits live in the config record in the key-value store, not in this file
 * and not in environment variables, so all three can be changed without a
 * redeploy.
 *
 * The three daily counters are reserved before the upstream call. Failed runs
 * are refunded at most three times per network each day, so an outage cannot
 * permit unbounded calls.
 */

import { analyze } from "./analyze.js";
import { link, unlink, sharedPage } from "./link.js";
import { event } from "./event.js";
import { sealKey, seal, cleanBrand } from "./seal.js";
import "../public/assets/question-bank.js";
import { confirmedNames } from './identity.js';

const LIMITS_KEY = "config:limits";

const DEFAULT_LIMITS = {
  per_address_per_day: 1,
  per_ip_per_day: 5,
  global_per_day: 60,
};

// Slow complete runs need the same ninety second window the health check allows.
const UPSTREAM_TIMEOUT_MS = 90000;

// Every string the caller can ever see. Nothing here names a vendor, a model, a
// queue, a run count, a cost or a credit. Nothing here describes how a result is
// produced.
const RESPONSES = {
  bad_input: "Check the category and address and try again.",
  bad_email: "That does not look like a valid email address.",
  address_limit: "You have already run today's check for this address. Read the chapter your result pointed to, or start with the $490 Answer Repair.",
  ip_limit: "Runs are limited per network and per day. This network's allowance resets at 00:00 UTC.",
  global_limit: "Today's free checks have all been used. Come back after 00:00 UTC, or start with the $490 Answer Repair.",
  upstream: "Claude did not answer all ten questions. This check was not counted. Try again in a few minutes, or start with the $490 Answer Repair.",
};

// One fixed word per refusal, so the page can name the reason in its own sentence
// without ever being told anything about what sits behind the handler. These words
// are a closed set: a caller can learn only which of its own gates it met.
const REASONS = {
  bad_input: "input",
  bad_email: "email",
  address_limit: "address",
  ip_limit: "network",
  global_limit: "global",
  upstream: "unavailable",
};

const PHP_UNAVAILABLE="The PHP2Shell answer could not be completed. This check was not counted. Try again in a few minutes, or read the Statement Index.";
const PHP_STATUSES=['patched','patched partly','patching','mitigation only','not affected','customer must update','no public statement located'];
function phpDomain(value){
 const text=String(value??'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/\.$/,'').replace(/^www\./,'');
 return text.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(text)?text:'';
}
function phpSources(list){
 if(!Array.isArray(list))return [];
 const sources=[];
 for(const item of list){
  const raw=typeof item==='string'?item:item?.url;
  if(typeof raw!=='string'||raw.length>2000)continue;
  try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)continue;if(!sources.includes(u.href))sources.push(u.href);}catch{}
  if(sources.length===20)break;
 }
 return sources;
}
export function phpResult(data,company,domain){
 if(data?.mode!=='php2shell'||data.engine!=='Claude'||data.company!==company||phpDomain(data.domain)!==domain||typeof data.answer!=='string'||!data.answer.trim()||typeof data.question!=='string'||!data.question.includes('CVE-2026-109618')||!data.question.includes('CVE-2026-109619')||!/^\d{4}-\d{2}-\d{2}$/.test(data.measured_on??''))return null;
 let row=null;
 if(data.index_row!==null&&data.index_row!==undefined){
  const r=data.index_row;
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug??'')||!PHP_STATUSES.includes(r.status)||typeof r.statement_found!=='boolean'||!phpDomain(r.canonical_domain))return null;
  const statement=phpSources([r.statement_url])[0]??null;
  if(r.statement_found&&!statement)return null;
  row={slug:r.slug,company:oneLine(r.company,120),canonical_domain:phpDomain(r.canonical_domain),status:r.status,statement_found:r.statement_found,statement_url:statement,statement_date:oneLine(r.statement_date,250)||null,excerpt:oneLine(r.excerpt,900)||null,last_checked_utc:oneLine(r.last_checked_utc,50)||null};
 }
 const answer=data.answer.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,64000).split('\n').map(line=>/PHP_SESSION_UPLOAD_PROGRESS|multi-layered multipart payloads|tiered multipart POST probes/i.test(line)?'[Exploit mechanics omitted.]':line).join('\n');
 return {mode:'php2shell',company,domain,question:oneLine(data.question,500),engine:'Claude',measured_on:data.measured_on,answer,sources:phpSources(data.sources),index_row:row,index_note:row?'Listed in the PHP2Shell Statement Index':'Not yet in the Statement Index',index_url:row?'https://index.broadcastwell.com/php2shell/'+row.slug+'/':'https://index.broadcastwell.com/php2shell/',next_step:{label:'PHP2Shell Record Check, $490 once',url:'https://broadcastwell.com/buy/record-check'}};
}
function phpPreview(company,domain){
 return phpResult({mode:'php2shell',company,domain,question:'Is '+company+' affected by PHP2Shell (CVE-2026-109618 and CVE-2026-109619), and has it patched? Give the source.',engine:'Claude',measured_on:'2026-10-23',answer:'Fictional preview answer for layout review. A live check shows one dated answer and the published statement record separately.',sources:['https://example.com/statement'],index_row:null},company,domain);
}

// The hosts that serve real visitors. The double below is refused on every one of
// them by name, so a binding left set by accident cannot put a fixed answer in front
// of a paying visitor.
const LIVE_HOSTS = ["audit.broadcastwell.com", "absence-mini-audit.pages.dev"];

/**
 * True only on a preview alias of this Pages project, or on a local run. Preview has
 * no upstream address and no upstream secret by design, so acceptance there is done
 * against the double rather than against a real run. The check is by host name, not
 * by an environment variable, so it cannot be switched on where it must never be.
 */
export function previewHost(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (LIVE_HOSTS.indexOf(host) !== -1) return false;
  return host.endsWith(".absence-mini-audit.pages.dev") || host === "localhost" || host === "127.0.0.1";
}

// The fixed answers the double returns, one per state the page has to render.
const STUB_RESULT = {
  named: 3,
  asked: 10,
  tier: "named 1 to 3",
  chapter: "/category-door/",
  engine: "Claude",
  measured_on: "2026-09-16",
  questions: Array.from({ length: 10 }, (_, index) => ({
    question: "Buyer question " + (index + 1) + " for this category",
    status: index < 3 ? "named" : "not named",
    named: index < 3,
    answer: "Preview Vendor A" + (index < 7 ? " and Preview Vendor B" : "") + ". This is fictional preview data for layout review, not an engine answer.",
    named_companies: index < 7 ? ["Preview Vendor A", "Preview Vendor B"] : ["Preview Vendor A"],
    names_status: "extracted",
    // Preview only: fixed receipt fields, so the receipt layout can be accepted without a run.
    excerpt: "Preview answer text for question " + (index + 1) + ". A live run shows the start of the engine's own answer here.",
    sources: ["example.com"],
    named_instead: index < 3 ? ["Preview Vendor A"] : ["Preview Vendor A", "Preview Vendor B"],
  })),
  named_instead: [{ company: "Preview Vendor A", count: 10 }, { company: "Preview Vendor B", count: 7 }],
  cited_sources: { domains: [{ domain: "example.com", count: 10 }], own_site_cited: 0 },
};

function stubResponse(state, category) {
  if (state === "address") return refusal("address_limit", 429);
  if (state === "network") return refusal("ip_limit", 429);
  if (state === "global") return refusal("global_limit", 503);
  if (state === "unavailable") return refusal("upstream", 502);
  return json({ ...STUB_RESULT, questions: STUB_RESULT.questions.map((row,index) => ({ ...row, question: questionFrame(category)[index] })) }, 200);
}

// The four published ladder tiers, verbatim from the classification rules at
// https://docs.broadcastwell.com/absence-rules/. Anything else is refused.
export const TIERS = [
  "named 0 of 10",
  "named 1 to 3",
  "named 4 to 6",
  "named 7 to 10",
];

// The only chapters a result may point at. An upstream that returns anything
// else cannot put an arbitrary link in the browser.
export const CHAPTERS = [
  "/category-door/",
  "/comparison-gate/",
  "/absence-ladder/",
];

const QUESTION_STATUSES = ["named", "not named", "answer unavailable"];

// The receipt a row may carry when the upstream supplies it: a short verbatim excerpt of the
// answer, the URLs the answer cited, and the vendors it named instead. Each is optional, each
// is cut to a fixed size, and a cited URL is kept only when it is a plain http or https
// address. A row the upstream sends without them is shown with its mark alone.
export const EXCERPT_MAX = 320;
export const SOURCES_MAX = 5;
export const URL_MAX = 300;
export const VENDORS_MAX = 8;
export const VENDOR_MAX = 80;

function oneLine(value, max) {
  const text = String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, "") + "...";
}

export function cleanSources(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const raw = typeof item === "string" ? item : item && typeof item.url === "string" ? item.url : "";
    if (!raw || raw.length > URL_MAX) continue;
    if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(raw)) {
      const domain = raw.toLowerCase().replace(/^www\./, "");
      if (!out.includes(domain)) out.push(domain);
      if (out.length === SOURCES_MAX) break;
      continue;
    }
    let url;
    try { url = new URL(raw.trim()); } catch (_) { continue; }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) continue;
    const text = url.toString();
    if (text.length > URL_MAX || out.indexOf(text) !== -1) continue;
    out.push(text);
    if (out.length === SOURCES_MAX) break;
  }
  return out;
}

export function cleanVendors(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const name = oneLine(typeof item === "string" ? item : item && item.name, VENDOR_MAX);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === VENDORS_MAX) break;
  }
  return out;
}

/** The optional receipt fields of one row, cleaned. Absent or empty fields are left out. */
export function rowExtras(item) {
  const extras = {};
  const excerpt = oneLine(item && item.excerpt, EXCERPT_MAX);
  const sources = cleanSources(item && (Array.isArray(item.sources) ? item.sources : item.citations));
  const namedInstead = cleanVendors(item && item.named_instead);
  if (excerpt) extras.excerpt = excerpt;
  if (sources.length) extras.sources = sources;
  if (namedInstead.length) extras.named_instead = namedInstead;
  if (typeof item?.answer === "string") {
    extras.answer = item.answer.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 64000);
    extras.named_companies = cleanCompanies(item.named_companies);
    extras.sources = cleanDomains(item.sources);
    extras.names_status = item.names_status === "extracted" ? "extracted" : "names not extracted";
    if (Array.isArray(item.matched_names)) extras.matched_names = cleanCompanies(item.matched_names);
  }
  return extras;
}

export function cleanCompanies(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(name => typeof name === "string" && name.trim() && name.length <= 160).map(name => name.trim()).filter(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

export function cleanDomains(list) {
  if (!Array.isArray(list)) return [];
  const domains = new Set();
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    let host = raw.trim().toLowerCase();
    if (/^https?:\/\//.test(host)) {
      try { const url = new URL(host); if (url.username || url.password) continue; host = url.hostname; } catch { continue; }
    }
    host = host.replace(/^www\./, "");
    if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) domains.add(host);
  }
  return [...domains].slice(0, 100);
}

export function resultDetails(data, website = "") {
  const host = String(website).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const label = host.split(".")[0];
  const own = host ? new RegExp("(^|[^a-z0-9])" + escapeRe(label) + "([^a-z0-9]|$)|(^|[^a-z0-9.])" + escapeRe(host) + "([^a-z0-9.]|$)", "i") : null;
  const companies = new Map();
  for (const item of Array.isArray(data?.named_instead) ? data.named_instead : []) {
    if (!item || typeof item.company !== "string" || !Number.isInteger(item.count) || item.count < 1 || item.count > 10) continue;
    const company = cleanCompanies([item.company])[0];
    if (!company || (own && own.test(company))) continue;
    const key = company.toLowerCase();
    if (!companies.has(key)) companies.set(key, { company, count: item.count });
  }
  let cited = null;
  if (data?.cited_sources && Array.isArray(data.cited_sources.domains) && Number.isInteger(data.cited_sources.own_site_cited) && data.cited_sources.own_site_cited >= 0 && data.cited_sources.own_site_cited <= 10) {
    const domains = new Map();
    for (const item of data.cited_sources.domains) {
      const domain = cleanDomains([item?.domain])[0];
      if (domain && Number.isInteger(item.count) && item.count >= 1 && item.count <= 10 && !domains.has(domain)) domains.set(domain, { domain, count: item.count });
    }
    cited = { domains: [...domains.values()].sort((a,b) => b.count-a.count || a.domain.localeCompare(b.domain)), own_site_cited: data.cited_sources.own_site_cited };
  }
  return { named_instead: [...companies.values()].sort((a,b) => b.count-a.count || a.company.localeCompare(b.company)), cited_sources: cited };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

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

function refusal(key, status) {
  return json({ message: RESPONSES[key], reason: REASONS[key] }, status);
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 200;
}

// The ten questions the upstream asks, in the order it asks them, built from the category
// exactly as the upstream builds them (read on 14 September 2026): three best of, three
// alternatives, two comparison, one evaluation and one use case. When the upstream answers
// with counts only, the page still needs the ten questions, so they are rebuilt here from
// the same category the upstream received. The analyze step shows the same ten to the
// visitor before anything runs.
export const QUESTION_TEMPLATES = [
  (c) => "What is the best " + c + "?",
  (c) => "What are the top 10 " + c + " platforms in 2026?",
  (c) => "Which are the best " + c + " tools for a mid-sized company?",
  (c) => "What are the best alternatives to the market leader in " + c + "?",
  (c) => "What are good alternatives to the most widely used " + c + " product?",
  (c) => "Which " + c + " alternatives are worth considering for a growing team?",
  (c) => "How do the leading " + c + " products compare versus each other on implementation time?",
  (c) => "A comparison of the leading " + c + " vendors for enterprise buyers",
  (c) => "How should I evaluate pricing models when choosing a " + c + " vendor?",
  (c) => "How can " + c + " reduce manual work for an operations team?",
];

export function questionFrame(category) {
  return globalThis.BwQuestionBank.get(category) || QUESTION_TEMPLATES.map(template => template(category));
}

/**
 * The public row for each question. Rows the upstream supplies win. Without them a status
 * is stated only where the count settles it: named in none means every question is not
 * named, named in all means every question is named. Any other count says how many, not
 * which, so each row carries "not itemised" rather than a guessed status.
 */
function questionResults(data, asked, named, category) {
  const supplied = suppliedQuestions(data, asked);
  if (supplied.length) return supplied;
  if (asked !== QUESTION_TEMPLATES.length) return [];
  const status = named === 0 ? "not named" : named === asked ? "named" : "not itemised";
  return questionFrame(category).map((question) => ({ question, status }));
}

function suppliedQuestions(data, asked) {
  const source = Array.isArray(data.questions)
    ? data.questions
    : Array.isArray(data.question_results)
      ? data.question_results
      : [];
  if (source.length !== asked) return [];

  const normalized = source.map((item) => {
    const question = String(item?.question || item?.text || item?.prompt || "").trim().slice(0, 500);
    const rawStatus = String(item?.status || "").trim().toLowerCase();
    const status = QUESTION_STATUSES.includes(rawStatus)
      ? rawStatus
      : rawStatus === "not_named"
        ? "not named"
        : rawStatus === "unavailable"
          ? "answer unavailable"
          : item?.named === true
            ? "named"
            : item?.named === false
              ? "not named"
              : "";
    return Object.assign({ question, status }, typeof item?.named === "boolean" ? { named: item.named } : {}, rowExtras(item));
  });

  return normalized.every((item) => item.question && QUESTION_STATUSES.includes(item.status)) ? normalized : [];
}

async function limits(env) {
  const stored = await env.AUDIT.get(LIMITS_KEY, "json");
  return Object.assign({}, DEFAULT_LIMITS, stored || {});
}

/** Increment a daily counter and report whether it is now over its cap. */
async function bump(env, key, cap, ttlSeconds) {
  const current = parseInt((await env.AUDIT.get(key)) || "0", 10);
  if (current >= cap) return { allowed: false, count: current };
  await env.AUDIT.put(key, String(current + 1), { expirationTtl: ttlSeconds });
  return { allowed: true, count: current + 1 };
}

/** Give a reserved daily counter back after a run that returned no result. */
async function release(env, key, ttlSeconds) {
  const current = parseInt((await env.AUDIT.get(key)) || "0", 10);
  if (!Number.isFinite(current) || current <= 0) return;
  await env.AUDIT.put(key, String(current - 1), { expirationTtl: ttlSeconds });
}

/** Seconds remaining until the counters roll over, so keys expire on their own. */
function secondsUntilTomorrow() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(60, Math.floor((midnight - now) / 1000));
}

export async function run(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return refusal("bad_input", 400);
  }

  const php = payload.mode === 'php2shell';
  if(payload.mode&&payload.mode!=='php2shell'&&payload.mode!=='category')return refusal('bad_input',400);
  const category = php ? 'PHP2Shell' : (payload.category || "").toString().trim().slice(0, 120);
  const company = (payload.company || "").toString().trim().slice(0, 120);
  const domain = php ? phpDomain(payload.domain) : '';
  const email = (payload.email || "").toString().trim().toLowerCase();
  // The company name the visitor confirmed. It is never sent upstream; it is only part of
  // the seal, so a result link can show it and nobody can change it afterwards.
  const brand = cleanBrand(payload.brand);
  const product_names = confirmedNames('', payload.product_names);

  if (!category || !company) return refusal("bad_input", 400);
  if(php&&(!domain||company.length<2||company.length>80||!/^[\p{L}\p{N}][\p{L}\p{N}\p{M} &.,'’()+!-]*$/u.test(company)))return refusal('bad_input',400);
  // The check runs from the category and the website alone. An address is optional; when
  // one is sent it must be readable and it is held to the per address allowance exactly as
  // before. When none is sent, nothing is written for it: the network and global counters
  // are the only records the allowance needs.
  if (email && !validEmail(email)) return refusal("bad_email", 400);

  // Acceptance on a preview alias stops here. No counter is read, no address is
  // stored and no request leaves the handler.
  if (previewHost(request)) {
    if(php){const state=String(payload.state||'');if(['address','network','global'].includes(state))return stubResponse(state,category);if(state==='unavailable')return json({message:PHP_UNAVAILABLE,reason:'unavailable',refunded:true},502);const response=json(phpPreview(company,domain),200);response.headers.set('x-free-check-preview','1');return response;}
    return sealed(stubResponse(String(payload.state || ""), category), env, true, brand, category, company);
  }

  const authorization = request.headers.get('authorization') || '';
  const health = !!env.UPSTREAM_TOKEN && authorization === `Bearer ${env.UPSTREAM_TOKEN}`;

  const cfg = await limits(env);
  const day = today();
  const ttl = secondsUntilTomorrow();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  // Counters reserved by this request, in the order they were taken. A run that
  // returns no result hands every one of them back.
  const reserved = [];

  /**
   * End a run that produced no result: return every reserved allowance, record
   * one operational line for the log stream, and answer with the single opaque
   * refusal. The reason label is a fixed internal word and the upstream status
   * is a number; neither reaches the browser and neither names anything.
   */
  async function noResult(reason, detail) {
    const refund = health ? { allowed: true } : await bump(env, `count:refund:ip:${day}:${ip}`, 3, ttl);
    if (refund.allowed) for (const key of reserved.slice().reverse()) await release(env, key, ttl);
    console.warn(JSON.stringify(Object.assign({ event: "mini_audit_no_result", reason, released: refund.allowed ? reserved.length : 0 }, detail || {})));
    return json({ message: php ? (refund.allowed ? PHP_UNAVAILABLE : "The PHP2Shell answer could not be completed. This attempt used the network's daily allowance. Read the Statement Index or the $490 Record Check.") : (refund.allowed ? RESPONSES.upstream : "Claude did not answer all ten questions. This attempt used the network's daily allowance. Try again in a few minutes, or start with the $490 Answer Repair."), reason: "unavailable", refunded: refund.allowed, reset_at: new Date(Date.now()+86400000).toISOString().slice(0,10)+"T00:00:00Z" }, 502);
  }

  // Global cap first: a breach there should not consume anybody's personal
  // allowance, and it is the cap that protects spend.
  if (!health) {
  const global = await bump(env, `count:global:${day}`, cfg.global_per_day, ttl);
  if (!global.allowed) return refusal("global_limit", 503);
  reserved.push(`count:global:${day}`);

  if (email) {
    const byAddress = await bump(env, `count:addr:${day}:${email}`, cfg.per_address_per_day, ttl);
    if (!byAddress.allowed) {
      for (const key of reserved.slice().reverse()) await release(env, key, ttl);
      return refusal("address_limit", 429);
    }
    reserved.push(`count:addr:${day}:${email}`);
  }

  const byIp = await bump(env, `count:ip:${day}:${ip}`, cfg.per_ip_per_day, ttl);
  if (!byIp.allowed) {
    for (const key of reserved.slice().reverse()) await release(env, key, ttl);
    return refusal("ip_limit", 429);
  }
  reserved.push(`count:ip:${day}:${ip}`);
  }

  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(env.UPSTREAM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.UPSTREAM_TOKEN}`,
      },
      body: JSON.stringify(php?{mode:'php2shell',company,domain,lane:health?'health':'public'}:{ category, company, email, brand, product_names, lane: health ? 'health' : 'public' }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) : undefined,
    });
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return noResult(timedOut ? "timeout" : "request_failed", { ms: Date.now() - started, name: error && error.name ? String(error.name) : "unknown" });
  }

  if (!upstream.ok) {
    if (upstream.status === 503) {
      let stopped;
      try { stopped = await upstream.json(); } catch {}
      if (stopped?.status === "allowance_used") {
        for (const key of reserved.slice().reverse()) await release(env, key, ttl);
        if (health) return json({ message: 'Free check closed: daily credit stop reached', reason: 'allowance', public_sum: Number(stopped.public_sum || 0) }, 503);
        return json({ message: "Today's allowance for this check is used. Start with the $490 Category Audit.", reason: "allowance" }, 503);
      }
    }
    // Deliberately opaque to the caller. The upstream status, body and hostname
    // never reach the browser. The status is kept in the log line only, because
    // an outage cannot be diagnosed without it.
    return noResult("status", { ms: Date.now() - started, status: upstream.status });
  }

  let data;
  try {
    data = await upstream.json();
  } catch (_) {
    return noResult("body_not_json", { ms: Date.now() - started, status: upstream.status });
  }

  // One operational line naming the keys the upstream answered with, never their values,
  // so the log shows whether per question rows arrived.
  // It also carries the run time, so the median can be read from the log stream and published
  // in place of any promised figure.
  console.log(JSON.stringify({ event: "mini_audit_upstream_keys", ms: Date.now() - started, keys: Object.keys(data || {}).sort(), rows: Array.isArray(data && data.questions) ? data.questions.length : Array.isArray(data && data.question_results) ? data.question_results.length : 0 }));

  if(php){const result=phpResult(data,company,domain);return result?json(result,200):noResult('php2shell_contract',{ms:Date.now()-started});}

  // Re-shape rather than pass through, so an upstream field added later cannot
  // leak into the browser by accident. Question entries, when supplied, are
  // reduced to their public prompt, one of three public statuses and the cleaned
  // receipt fields above.
  const named = Number(data.named);
  const asked = Number(data.asked);
  const tier = String(data.tier || "");
  const chapter = String(data.chapter || "");
  if (!Number.isInteger(named) || !Number.isInteger(asked) || asked !== 10 || named < 0 || named > asked) {
    return noResult("counts", { ms: Date.now() - started });
  }
  if (TIERS.indexOf(tier) === -1 || CHAPTERS.indexOf(chapter) === -1) {
    return noResult("allow_list", { ms: Date.now() - started, tierKnown: TIERS.indexOf(tier) !== -1, chapterKnown: CHAPTERS.indexOf(chapter) !== -1 });
  }

  const questions = questionResults(data, asked, named, category);
  const hasDetails = data.cited_sources != null || (Array.isArray(data.questions) && data.questions.some(row => Object.hasOwn(row || {}, "answer")));
  if (hasDetails && (!Array.isArray(data.questions) || data.questions.length !== 10 || data.questions.some(row => typeof row.answer !== "string" || !row.answer.trim() || typeof row.named !== "boolean" || !Array.isArray(row.named_companies) || row.named_companies.some(name => typeof name !== "string") || !Array.isArray(row.sources) || row.sources.some(domain => typeof domain !== "string")))) return noResult("answer_contract", { ms: Date.now() - started });
  if (questions.some(row => Object.hasOwn(row, "answer")) && (questions.some(row => !row.answer || typeof row.named !== "boolean") || questions.filter(row => row.named).length !== named)) return noResult("answer_contract", { ms: Date.now() - started });
  if (Object.hasOwn(data, "cited_sources") && data.cited_sources !== null && (!resultDetails(data, company).cited_sources || !Array.isArray(data.named_instead))) return noResult("details_contract", { ms: Date.now() - started });
  return sealed(json({
    named: named,
    asked: asked,
    tier: tier,
    chapter: chapter,
    engine: String(data.engine || "").slice(0, 60),
    measured_on: String(data.measured_on || day).slice(0, 10),
    questions,
    ...resultDetails(data, company),
  }), env, false, brand, category, company);
}

/**
 * Add the result seal to a successful run. The body is untouched, so the seven key contract
 * is exactly what it was; the seal travels in a header. A refusal is returned as it is.
 */
async function sealed(response, env, preview, brand, category, company) {
  if (response.status !== 200) return response;
  if (preview) response.headers.set("x-free-check-preview", "1");
  const key = await sealKey(env, preview);
  if (!key) return response;
  const body = await response.clone().json();
  response.headers.set("x-result-seal", await seal(key, brand, category, company, body));
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze") {
      if (request.method !== "POST") return refusal("bad_input", 405);
      return analyze(request, env, { preview: previewHost(request) });
    }

    if (url.pathname === "/api/run") {
      if (request.method !== "POST") return refusal("bad_input", 405);
      return run(request, env);
    }

    if (url.pathname === "/api/link") {
      if (request.method !== "POST") return refusal("bad_input", 405);
      return link(request, env, { preview: previewHost(request) });
    }

    if (url.pathname === "/api/unlink") {
      if (request.method !== "POST") return refusal("bad_input", 405);
      return unlink(request, env);
    }

    if (url.pathname === "/api/event") {
      if (request.method !== "POST") return refusal("bad_input", 405);
      return event(request, env);
    }

    if (url.pathname.startsWith("/r/")) return sharedPage(request, env);

    // Everything else is the static front end.
    return env.ASSETS.fetch(request);
  },
};
