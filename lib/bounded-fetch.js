/**
 * Time, kept by the check itself.
 *
 * The fetch guard (lib/guard.js) gives every request five seconds and every lookup three, and it
 * asks the runtime to enforce both through an abort signal. A limit that only the runtime keeps
 * is a limit a hostile page can test: a server that sends its headers and then one byte of its
 * body every few seconds, or never sends a first byte to a client that does not act on the
 * signal, would hold a check for as long as it liked. So the same two limits are kept here as
 * well, by a timer of our own, around every request the guard makes:
 *
 *   - a lookup of a name has READ_LIMITS.lookup_ms to answer, headers and body
 *   - a page has READ_LIMITS.request_ms from the moment it is asked for to the last byte of its
 *     body. It is one deadline, not a wait between bytes, so a body that drips cannot renew it
 *   - a body still arriving at the deadline is let go, not left open
 *
 * The guard is not changed and does not know this is here: it is handed a fetcher that answers
 * in time or fails with a TimeoutError, which the guard already reports as "timeout" for a page
 * and as "unresolved" for a lookup. No request, header, address rule or count is touched.
 *
 * The values are the guard's own. With its three requests a check (redirects included), the
 * longest a whole check can wait on a network is READ_LIMITS.check_ms.
 */

import { FETCH_TIMEOUT_MS, MAX_BYTES, MAX_FETCHES } from "./guard.js";

// The guard's lookup timeout (RESOLVE_TIMEOUT_MS in lib/guard.js, which does not export it).
const LOOKUP_MS = 3000;

export const READ_LIMITS = Object.freeze({
  // One lookup of a name.
  lookup_ms: LOOKUP_MS,
  // One request for a page, from the moment it is sent to the last byte of its body.
  request_ms: FETCH_TIMEOUT_MS,
  // One page. A longer page is dropped whole (see analyze in lib/analyze.js).
  body_bytes: MAX_BYTES,
  // The requests of one check, redirects included. A redirect loop ends here.
  requests: MAX_FETCHES,
  // The longest one check can wait on a network: every request, each after its lookup.
  check_ms: MAX_FETCHES * (LOOKUP_MS + FETCH_TIMEOUT_MS),
});

class Deadline extends Error {
  constructor() { super("deadline"); this.name = "TimeoutError"; }
}

const ignore = () => {};

// `work` or the deadline, whichever comes first. The timer is cleared either way, and work that
// loses is not left to fail unheard.
function within(work, deadline) {
  const left = deadline - Date.now();
  const pending = Promise.resolve(work);
  if (left <= 0) { pending.catch(ignore); return Promise.reject(new Deadline()); }
  let timer;
  const late = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Deadline()), left); });
  return Promise.race([pending, late]).finally(() => clearTimeout(timer));
}

// The same response with a body that ends at the deadline. Only a response the guard will read
// is given one: a redirect, a refusal and an answer with no body pass through as they are.
function bodyWithin(response, deadline) {
  const body = response && response.ok ? response.body : null;
  if (!body || typeof body.getReader !== "function") return response;
  const reader = body.getReader();
  const bounded = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await within(reader.read(), deadline);
        if (done) controller.close(); else controller.enqueue(value);
      } catch (cause) {
        reader.cancel().catch(ignore);
        throw cause;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(bounded, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/**
 * A fetcher that keeps the time limits by itself. The guard asks for a page with
 * `redirect: "manual"`; everything else it asks for is a lookup.
 */
export function boundedFetcher(fetcher) {
  return async (url, init) => {
    const deadline = Date.now() + (init && init.redirect === "manual" ? READ_LIMITS.request_ms : READ_LIMITS.lookup_ms);
    const asked = Promise.resolve().then(() => fetcher(url, init));
    let response;
    try {
      response = await within(asked, deadline);
    } catch (cause) {
      // An answer that comes after the deadline is let go unread.
      asked.then((late) => { if (late && late.body && typeof late.body.cancel === "function") return late.body.cancel(); }).catch(ignore);
      throw cause;
    }
    return bodyWithin(response, deadline);
  };
}
