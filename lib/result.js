/**
 * GET /api/result/<id>: the stored result of one result link, as JSON, for the app's free account
 * (STEP 3.3 brief section 10.3 step 4). The app fetches it server to server by id when a visitor who
 * pressed "Keep this result" signs in; a result never enters an account from the browser.
 *
 * Read only. It answers only for a record POST /api/link stored (lib/link.js), and /api/link stores
 * only a result this handler sealed, so nothing else can be served here. The record is cleaned again
 * on the way out with the link's own cleanResult. The answer carries what the result link page already
 * shows (company name, website, category, the result and its two dates) and nothing about the visitor:
 * no email, no network, no delete token. It is marked noindex and is never cached. A preview record is
 * served on a preview host only. A missing, expired, deleted, malformed or preview-only id answers the
 * same 404. Nothing here calls the upstream or writes to the key-value store.
 *
 * Its own module, so lib/audit.js and lib/link.js keep their pinned bytes
 * (tests/current-entry-logic-hashes.json); it reuses their exports and changes neither.
 */

import { cleanResult } from "./link.js";
import { previewHost } from "./audit.js";

const ID = /^\/api\/result\/([0-9a-f]{32})$/;

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" }, extra || {}),
  });
}

export async function storedResult(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ message: "This result is read only.", reason: "method" }, 405, { allow: "GET, HEAD" });
  const match = ID.exec(new URL(request.url).pathname);
  const missing = json({ message: "This result is not available.", reason: "not_found" }, 404);
  if (!match) return missing;
  if (!env || !env.AUDIT) return json({ message: "Result links are not available right now.", reason: "unavailable" }, 503);
  let record = null;
  try { record = await env.AUDIT.get("link:" + match[1], "json"); } catch (_) { record = null; }
  const result = record && record.v === 1 && record.id === match[1] ? cleanResult(record.result) : null;
  if (!result || (record.preview && !previewHost(request))) return missing;
  const body = { id: record.id, brand: String(record.brand || ""), category: String(record.category || ""), website: String(record.website || ""), result: result, created_on: record.created_on, expires_on: record.expires_on };
  if (record.preview) body.preview = true;
  const response = json(body, 200);
  return request.method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
}

export default { fetch: storedResult };
