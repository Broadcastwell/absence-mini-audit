/**
 * Prints the daily funnel counts. There is no public route for them: this reads the
 * key-value store with the owner's own Cloudflare sign in, through wrangler.
 *
 * Run: node scripts/funnel.mjs [days]        (default 7, newest first)
 *
 * Columns: website reads started, runs confirmed, runs completed, images saved, result
 * links created, $490 clicks, $990 clicks. "capped" means that day hit
 * funnel_writes_per_day, so the click and save counts are floors.
 */

import { execFileSync } from "node:child_process";

const NAMESPACE = "d3fa650f1d134372ab91a759a91eab99";
const days = Number(process.argv[2]) || 7;

function get(key) {
  try {
    const out = execFileSync("npx", ["wrangler", "kv", "key", "get", key, "--namespace-id", NAMESPACE, "--remote"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32" }).trim();
    return /^value not found/i.test(out) ? null : out;
  } catch (_) {
    return null;
  }
}

const rows = [];
for (let i = 0; i < days; i++) {
  const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
  let funnel = {};
  try { funnel = JSON.parse(get("funnel:" + day) || "{}"); } catch (_) { funnel = {}; }
  rows.push({
    day,
    reads: Number(get("count:analyze:global:" + day) || 0),
    confirmed: funnel.confirmed || 0,
    completed: Number(get("count:global:" + day) || 0),
    exports: funnel.export || 0,
    links: Number(get("count:link:global:" + day) || 0),
    buy_490: funnel.buy_490 || 0,
    buy_990: funnel.buy_990 || 0,
    capped: funnel.capped ? "capped" : "",
  });
}
console.table(rows);
