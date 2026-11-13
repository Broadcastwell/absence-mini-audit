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
 *   - a request that is dropped at its deadline is ended by a signal of our own, and a body still
 *     arriving at the deadline is let go, not left open
 *
 * The guard does not know this is here: it is handed a fetcher that answers in time or fails
 * with a TimeoutError, which the guard already reports as "timeout" for a page and as
 * "unresolved" for a lookup. No address, header, address rule or count is touched: a request
 * carries the guard's signal joined to ours.
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
  // One page. A longer page is read up to this many bytes and no further (the guard stops there).
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
// Nothing is read ahead: a piece of the body is asked for when the guard asks for it.
//
// A runtime that lets no script build a stream (workerd with a compatibility date before
// 30 November 2022) cannot be given such a body. There the response is handed on as it came,
// and the guard's own signal holds its body, as it did before this file was written.
function bodyWithin(response, deadline, stop) {
  const body = response && response.ok ? response.body : null;
  if (!body || typeof body.getReader !== "function") return response;
  try {
    let reader = null;
    const bounded = new ReadableStream({
      async pull(controller) {
        try {
          if (!reader) reader = body.getReader();
          const { done, value } = await within(reader.read(), deadline);
          if (done) controller.close(); else controller.enqueue(value);
        } catch (cause) {
          if (reader) reader.cancel().catch(ignore);
          stop(cause);
          throw cause;
        }
      },
      cancel(reason) {
        // The source may never acknowledge cancellation. Abort the request and
        // release the consumer as soon as the bounded prefix has been read.
        stop(reason);
        const cleanup = reader ? reader.cancel(reason) : body.cancel(reason);
        cleanup.catch(ignore);
      },
    }, { highWaterMark: 0 });
    return new Response(bounded, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (_) {
    return response;
  }
}

// A signal of our own for one request, joined to the one the guard gave, and the way to end
// the request with it. A request that is dropped at its deadline is ended here, so its socket
// is not left open on a runtime that does not act on the guard's signal.
function ownSignal(theirs) {
  if (typeof AbortController === "undefined") return { signal: theirs, stop: ignore };
  const controller = new AbortController();
  let signal = controller.signal;
  try {
    if (theirs && typeof AbortSignal.any === "function") signal = AbortSignal.any([theirs, controller.signal]);
  } catch (_) { /* our own signal alone: the deadline is the same one */ }
  return { signal, stop: (cause) => { try { controller.abort(cause); } catch (_) { /* already ended */ } } };
}

/**
 * A fetcher that keeps the time limits by itself. The guard asks for a page with
 * `redirect: "manual"`; everything else it asks for is a lookup.
 */
export function boundedFetcher(fetcher) {
  return async (url, init) => {
    const deadline = Date.now() + (init && init.redirect === "manual" ? READ_LIMITS.request_ms : READ_LIMITS.lookup_ms);
    const { signal, stop } = ownSignal(init && init.signal);
    const asked = Promise.resolve().then(() => fetcher(url, Object.assign({}, init, { signal })));
    let response;
    try {
      response = await within(asked, deadline);
    } catch (cause) {
      // The request is ended, and an answer that comes after the deadline is let go unread.
      stop(cause);
      asked.then((late) => { if (late && late.body && typeof late.body.cancel === "function") return late.body.cancel(); }).catch(ignore);
      throw cause;
    }
    return bodyWithin(response, deadline, stop);
  };
}
