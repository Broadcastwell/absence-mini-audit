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
 */

const LIMITS_KEY = "config:limits";

const DEFAULT_LIMITS = {
  per_address_per_day: 1,
  per_ip_per_day: 3,
  global_per_day: 100,
};

// Every string the caller can ever see. Nothing here names a vendor, a model, a
// queue, a run count, a cost or a credit. Nothing here describes how a result is
// produced.
const RESPONSES = {
  bad_input: "Check the category and address and try again.",
  bad_email: "That does not look like a valid email address.",
  address_limit: "That is one result per address per day. Try again tomorrow.",
  ip_limit: "That is three results per network per day. Try again tomorrow.",
  global_limit: "The mini-audit is at its limit for today. Try again tomorrow.",
  upstream: "Something went wrong on our side. Try again later.",
};

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

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 200;
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
    return json({ message: RESPONSES.bad_input }, 400);
  }

  const category = (payload.category || "").toString().trim().slice(0, 120);
  const company = (payload.company || "").toString().trim().slice(0, 120);
  const email = (payload.email || "").toString().trim().toLowerCase();

  if (!category || !company) return json({ message: RESPONSES.bad_input }, 400);
  if (!validEmail(email)) return json({ message: RESPONSES.bad_email }, 400);

  const cfg = await limits(env);
  const day = today();
  const ttl = secondsUntilTomorrow();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  // Global cap first: a breach there should not consume anybody's personal
  // allowance, and it is the cap that protects spend.
  const global = await bump(env, `count:global:${day}`, cfg.global_per_day, ttl);
  if (!global.allowed) return json({ message: RESPONSES.global_limit }, 503);

  const byAddress = await bump(env, `count:addr:${day}:${email}`, cfg.per_address_per_day, ttl);
  if (!byAddress.allowed) return json({ message: RESPONSES.address_limit }, 429);

  const byIp = await bump(env, `count:ip:${day}:${ip}`, cfg.per_ip_per_day, ttl);
  if (!byIp.allowed) return json({ message: RESPONSES.ip_limit }, 429);

  let upstream;
  try {
    upstream = await fetch(env.UPSTREAM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.UPSTREAM_TOKEN}`,
      },
      body: JSON.stringify({ category, company, email }),
    });
  } catch (_) {
    return json({ message: RESPONSES.upstream }, 502);
  }

  if (!upstream.ok) {
    // Deliberately opaque. The upstream status, body and hostname never reach
    // the caller, and nothing is logged that would put them in a browser.
    return json({ message: RESPONSES.upstream }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (_) {
    return json({ message: RESPONSES.upstream }, 502);
  }

  // Re-shape rather than pass through, so an upstream field added later cannot
  // leak into the browser by accident. These six keys are the whole contract,
  // and two of them are allow-listed rather than copied.
  const named = Number(data.named);
  const asked = Number(data.asked);
  const tier = String(data.tier || "");
  const chapter = String(data.chapter || "");
  if (!Number.isFinite(named) || !Number.isFinite(asked) || asked <= 0) {
    return json({ message: RESPONSES.upstream }, 502);
  }
  if (TIERS.indexOf(tier) === -1 || CHAPTERS.indexOf(chapter) === -1) {
    return json({ message: RESPONSES.upstream }, 502);
  }

  return json({
    named: named,
    asked: asked,
    tier: tier,
    chapter: chapter,
    engine: String(data.engine || "").slice(0, 60),
    measured_on: String(data.measured_on || day).slice(0, 10),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/run") {
      if (request.method !== "POST") return json({ message: RESPONSES.bad_input }, 405);
      return run(request, env);
    }

    // Everything else is the static front end.
    return env.ASSETS.fetch(request);
  },
};
