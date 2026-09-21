/**
 * The daily funnel count. No personal data and no third party: the page sends one word
 * when a visitor confirms a run, saves an image or clicks either purchase button, and this
 * handler adds one to that word's count for the day. Nothing else is kept: no address, no
 * network, no time of day, no identifier.
 *
 * One record per day, `funnel:<YYYY-MM-DD>`, kept 90 days. Writes are capped per day
 * (`funnel_writes_per_day` in the limits record) so a flood of beacons can never spend the
 * key-value store's free write allowance; past the cap the count stops and says so.
 *
 * The other funnel steps are already counted where they happen, so they cost no extra
 * write: website reads started (`count:analyze:global:<day>`), runs completed
 * (`count:global:<day>`, which a failed run gives back) and links created
 * (`count:link:global:<day>`). scripts/funnel.mjs reads all of them.
 *
 * There is no public route that reads the counts. They are read with the owner's own
 * Cloudflare sign in, through scripts/funnel.mjs.
 */

const LIMITS_KEY = "config:limits";
export const EVENTS = ["confirmed", "export", "buy_490", "buy_990"];
export const FUNNEL_DEFAULTS = { funnel_writes_per_day: 100 };
const KEEP_SECONDS = 90 * 86400;

function none() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function event(request, env) {
  let word = "";
  try {
    const text = (await request.text()).slice(0, 200);
    word = String(JSON.parse(text).e || "");
  } catch (_) {
    return none();
  }
  if (EVENTS.indexOf(word) === -1 || !env || !env.AUDIT) return none();
  const stored = await env.AUDIT.get(LIMITS_KEY, "json");
  const cfg = Object.assign({}, FUNNEL_DEFAULTS, stored || {});
  const key = "funnel:" + new Date().toISOString().slice(0, 10);
  const counts = (await env.AUDIT.get(key, "json")) || {};
  const writes = Number(counts.writes) || 0;
  if (writes >= cfg.funnel_writes_per_day) {
    if (!counts.capped) {
      // One last write records that the day hit its cap, so a reader knows the counts are floors.
      counts.capped = true;
      await env.AUDIT.put(key, JSON.stringify(counts), { expirationTtl: KEEP_SECONDS });
    }
    return none();
  }
  counts[word] = (Number(counts[word]) || 0) + 1;
  counts.writes = writes + 1;
  await env.AUDIT.put(key, JSON.stringify(counts), { expirationTtl: KEEP_SECONDS });
  return none();
}
