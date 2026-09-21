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
 * A run that does not return a result does not spend anybody's allowance. The
 * three daily counters are reserved before the upstream call and given back on
 * every failure path, so a visitor whose run fails can try again the same day.
 */

import { analyze } from "./analyze.js";

const LIMITS_KEY = "config:limits";

const DEFAULT_LIMITS = {
  per_address_per_day: 1,
  per_ip_per_day: 3,
  global_per_day: 100,
};

// How long the handler waits for a result before it gives up and gives the
// allowance back. The page promises a result in under a minute.
const UPSTREAM_TIMEOUT_MS = 55000;

// Every string the caller can ever see. Nothing here names a vendor, a model, a
// queue, a run count, a cost or a credit. Nothing here describes how a result is
// produced.
const RESPONSES = {
  bad_input: "Check the category and address and try again.",
  bad_email: "That does not look like a valid email address.",
  address_limit: "You have already run today's check for this address. Read the chapter your result pointed to, or request the AI Visibility Diagnostic.",
  ip_limit: "This network has reached its daily check limit. Try again tomorrow.",
  global_limit: "Today's runs are full. Come back after 00:00 UTC, or request the AI Visibility Diagnostic.",
  upstream: "We could not complete this run. Your daily check has not been used. Try again in a few minutes, or email hello@broadcastwell.com.",
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
  engine: "Perplexity",
  measured_on: "2026-09-16",
  questions: Array.from({ length: 10 }, (_, index) => ({
    question: "Buyer question " + (index + 1) + " for this category",
    status: index < 3 ? "named" : "not named",
  })),
};

function stubResponse(state) {
  if (state === "address") return refusal("address_limit", 429);
  if (state === "network") return refusal("ip_limit", 429);
  if (state === "global") return refusal("global_limit", 503);
  if (state === "unavailable") return refusal("upstream", 502);
  return json(STUB_RESULT, 200);
}

// The four published ladder tiers, verbatim from the classification rules at
// https://docs.broadcastwell.com/absence-rules/. Anything else is refused.
const TIERS = [
  "named 0 of 10",
  "named 1 to 3",
  "named 4 to 6",
  "named 7 to 10",
];

// The only chapters a result may point at. An upstream that returns anything
// else cannot put an arbitrary link in the browser.
const CHAPTERS = [
  "/category-door/",
  "/comparison-gate/",
  "/absence-ladder/",
];

const QUESTION_STATUSES = ["named", "not named", "answer unavailable"];

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
  return QUESTION_TEMPLATES.map((template) => ({ question: template(category), status: status }));
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
    return { question, status };
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

  const category = (payload.category || "").toString().trim().slice(0, 120);
  const company = (payload.company || "").toString().trim().slice(0, 120);
  const email = (payload.email || "").toString().trim().toLowerCase();

  if (!category || !company) return refusal("bad_input", 400);
  // The check runs from the category and the website alone. An address is optional; when
  // one is sent it must be readable and it is held to the per address allowance exactly as
  // before. When none is sent, nothing is written for it: the network and global counters
  // are the only records the allowance needs.
  if (email && !validEmail(email)) return refusal("bad_email", 400);

  // Acceptance on a preview alias stops here. No counter is read, no address is
  // stored and no request leaves the handler.
  if (previewHost(request)) return stubResponse(String(payload.state || ""));

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
    for (const key of reserved.slice().reverse()) await release(env, key, ttl);
    console.warn(JSON.stringify(Object.assign({ event: "mini_audit_no_result", reason: reason, released: reserved.length }, detail || {})));
    return refusal("upstream", 502);
  }

  // Global cap first: a breach there should not consume anybody's personal
  // allowance, and it is the cap that protects spend.
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

  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(env.UPSTREAM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.UPSTREAM_TOKEN}`,
      },
      body: JSON.stringify({ category, company, email }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) : undefined,
    });
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return noResult(timedOut ? "timeout" : "request_failed", { ms: Date.now() - started, name: error && error.name ? String(error.name) : "unknown" });
  }

  if (!upstream.ok) {
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
  console.log(JSON.stringify({ event: "mini_audit_upstream_keys", keys: Object.keys(data || {}).sort(), rows: Array.isArray(data && data.questions) ? data.questions.length : Array.isArray(data && data.question_results) ? data.question_results.length : 0 }));

  // Re-shape rather than pass through, so an upstream field added later cannot
  // leak into the browser by accident. Question entries, when supplied, are
  // reduced to their public prompt and one of three public statuses.
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

  return json({
    named: named,
    asked: asked,
    tier: tier,
    chapter: chapter,
    engine: String(data.engine || "").slice(0, 60),
    measured_on: String(data.measured_on || day).slice(0, 10),
    questions: questionResults(data, asked, named, category),
  });
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

    // Everything else is the static front end.
    return env.ASSETS.fetch(request);
  },
};
