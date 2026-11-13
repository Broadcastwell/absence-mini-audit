/**
 * The fetch guard for the analyze step.
 *
 * The analyze step reads a visitor's public website. That makes this handler a machine
 * that fetches an address a stranger typed, so every address passes these rules before
 * a request leaves, and again after every redirect:
 *
 *   - http and https only, no user name or password in the address, ports 80 and 443 only
 *   - a host name, never an address literal in any spelling (dotted, decimal, octal, hex,
 *     IPv6, IPv4 mapped IPv6); the URL parser normalises the odd spellings to dotted form
 *     first, and every literal is then refused, public or not
 *   - no single label names, no local, internal or reserved suffixes
 *   - the name must resolve, and no address it resolves to may sit in a private, loopback,
 *     link local, carrier grade, benchmark, documentation, multicast, reserved or cloud
 *     metadata range (IPv4 and IPv6). What is refused in IPv4 is refused in IPv6 too: every
 *     recognized public translation form (mapped, translated, well-known NAT64, 6to4) is
 *     judged by its embedded address. Local NAT64, the compatible form, ISATAP, Teredo and
 *     other addresses outside 2000::/3 are refused whole
 *   - at most MAX_FETCHES requests per analyze, redirects included, each with a
 *     FETCH_TIMEOUT_MS timeout and a MAX_BYTES cap on what is read
 *   - an honest user agent that names Broadcastwell and links the page that explains it
 *
 * Name resolution uses a public DNS over HTTPS resolver, so the check does not depend on
 * the runtime's own resolver. It costs nothing and carries only the host name.
 */

export const MAX_FETCHES = 3;
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_BYTES = 1024 * 1024;
export const USER_AGENT = "Mozilla/5.0 (compatible; BroadcastwellCheck/1.0; +https://audit.broadcastwell.com/#how-we-read-your-site)";
const RESOLVER = "https://cloudflare-dns.com/dns-query";
const RESOLVE_TIMEOUT_MS = 3000;

const BLOCKED_SUFFIXES = [
  ".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".private",
  ".home.arpa", ".arpa", ".test", ".invalid", ".example", ".onion", ".localdomain",
];

// IPv4 ranges that must never be fetched, as [first octets as a number, prefix length].
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([base, bits]) => [v4ToInt(base), bits]);

function v4ToInt(text) {
  const parts = text.split(".").map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isV4(text) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) && text.split(".").every((part) => Number(part) <= 255);
}

export function blockedV4(text) {
  if (!isV4(text)) return true;
  const value = v4ToInt(text);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

/** Expand an IPv6 address to eight 16 bit groups, or null when it does not parse. */
function v6Groups(text) {
  let value = String(text).toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  if (value.includes("%")) return null;
  let tail = [];
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted) {
    if (value[dotted.index - 1] !== ":" || !isV4(dotted[1]) || /(?:^|\.)0\d/.test(dotted[1])) return null;
    const n = v4ToInt(dotted[1]);
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    value = value.slice(0, -dotted[1].length) + "0:0";
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = head.concat(Array(halves.length === 2 ? missing : 0).fill("0"), rest).map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (groups.length !== 8 || groups.some((g) => !Number.isFinite(g))) return null;
  if (tail.length) { groups[6] = tail[0]; groups[7] = tail[1]; }
  return groups;
}

export function blockedV6(text) {
  const g = v6Groups(text);
  if (!g) return true;
  const embedded = (hi, lo) => [(hi >>> 8), hi & 255, (lo >>> 8), lo & 255].join(".");
  if (g.every((x) => x === 0)) return true; // unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // loopback
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local, includes cloud metadata fd00:ec2::254
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site local, deprecated
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // protocol assignments, includes Teredo
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return true; // documentation, 3fff::/20
  if (g[0] === 0x5f00) return true; // segment routing identifiers, 5f00::/16
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedV4(embedded(g[6], g[7])); // IPv4 mapped
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return blockedV4(embedded(g[6], g[7])); // IPv4 translated, ::ffff:0:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return true; // IPv4 compatible, deprecated
  if (g[0] === 0x0064 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return blockedV4(embedded(g[6], g[7])); // NAT64, 64:ff9b::/96
  // Local NAT64 (64:ff9b:1::/48) can carry private addresses in several prefix layouts.
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 1) return true;
  if (g[0] === 0x2002) return blockedV4(embedded(g[1], g[2])); // 6to4
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard only
  if (g.slice(0, 4).every((x) => x === 0) && (g[4] === 0 || g[4] === 0x0200) && g[5] === 0x5efe) return true; // ISATAP, ::5efe:a.b.c.d and ::200:5efe:a.b.c.d
  // Every public address stands in 2000::/3. What is outside it and is none of the forms above
  // that carry an IPv4 address is refused.
  return (g[0] & 0xe000) !== 0x2000;
}

/**
 * Check an address's shape before anything is resolved. Returns { ok: true, url } with
 * the parsed URL, or { ok: false, reason } with one fixed reason word.
 */
export function checkAddress(input) {
  const raw = String(input || "").trim();
  if (!raw || raw.length > 2048) return { ok: false, reason: "address" };
  if (/[\s\\]/.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: "address" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : "https://" + raw;
  let url;
  try {
    url = new URL(withScheme);
  } catch (_) {
    return { ok: false, reason: "address" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "address" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "address" };
  // The URL parser has already turned 2130706433, 0x7f.1 and 0177.0.0.1 into 127.0.0.1,
  // so one test for a dotted quad catches every spelling. Brackets mean IPv6.
  if (isV4(host) || host.startsWith("[") || host.includes(":")) return { ok: false, reason: "literal" };
  if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: "literal" };
  if (!host.includes(".")) return { ok: false, reason: "private" };
  if (host === "localhost" || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: false, reason: "private" };
  if (!/^[a-z0-9.-]+$/.test(host) || host.length > 253 || host.split(".").some((label) => !label || label.length > 63)) return { ok: false, reason: "address" };
  url.hash = "";
  return { ok: true, url: url, host: host };
}

async function resolveType(host, type, fetcher) {
  const response = await fetcher(RESOLVER + "?name=" + encodeURIComponent(host) + "&type=" + type, {
    headers: { accept: "application/dns-json" },
    signal: timeoutSignal(RESOLVE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("resolver status");
  const body = await response.json();
  const wanted = type === "A" ? 1 : 28;
  return (Array.isArray(body.Answer) ? body.Answer : []).filter((answer) => answer && answer.type === wanted).map((answer) => String(answer.data));
}

/**
 * Resolve a host name and refuse it when any address it resolves to is in a blocked
 * range. A name that resolves to nothing, or a resolver that fails, is refused as well:
 * the guard fails closed.
 */
export async function checkResolves(host, fetcher) {
  let addresses;
  try {
    const [v4, v6] = await Promise.all([resolveType(host, "A", fetcher), resolveType(host, "AAAA", fetcher)]);
    addresses = v4.concat(v6);
  } catch (_) {
    return { ok: false, reason: "unresolved" };
  }
  if (!addresses.length) return { ok: false, reason: "unresolved" };
  const blocked = addresses.some((address) => (address.includes(":") ? blockedV6(address) : blockedV4(address)));
  return blocked ? { ok: false, reason: "private" } : { ok: true, addresses: addresses.length };
}

function timeoutSignal(ms) {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

/** Read at most MAX_BYTES of a response body, then stop reading. */
async function readCapped(response) {
  if (!response.body || !response.body.getReader) {
    const text = await response.text();
    return { text: text.slice(0, MAX_BYTES), truncated: text.length > MAX_BYTES };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = MAX_BYTES - size;
    if (value.byteLength > room) {
      chunks.push(value.slice(0, room));
      size += room;
      truncated = true;
      try { await reader.cancel(); } catch (_) { /* already closed */ }
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(joined), truncated: truncated };
}

/**
 * A fetch budget shared by every page one analyze reads. `get` follows redirects by hand
 * so each hop is checked again, and every hop spends one fetch from the budget.
 */
export function fetchBudget(fetcher, limit) {
  const state = { used: 0, limit: limit || MAX_FETCHES, log: [] };
  async function get(address) {
    let checked = checkAddress(address);
    for (;;) {
      if (!checked.ok) return { ok: false, reason: checked.reason };
      if (state.used >= state.limit) return { ok: false, reason: "budget" };
      const resolved = await checkResolves(checked.host, fetcher);
      if (!resolved.ok) return { ok: false, reason: resolved.reason };
      state.used += 1;
      let response;
      try {
        response = await fetcher(checked.url.toString(), {
          method: "GET",
          redirect: "manual",
          headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-language": "en" },
          signal: timeoutSignal(FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
        state.log.push({ host: checked.host, outcome: timedOut ? "timeout" : "unreachable" });
        return { ok: false, reason: timedOut ? "timeout" : "unreachable" };
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        state.log.push({ host: checked.host, outcome: "redirect" });
        if (!location) return { ok: false, reason: "unreachable" };
        let next;
        try { next = new URL(location, checked.url).toString(); } catch (_) { return { ok: false, reason: "address" }; }
        checked = checkAddress(next);
        continue;
      }
      if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 503) {
        state.log.push({ host: checked.host, outcome: "blocked" });
        return { ok: false, reason: "blocked" };
      }
      if (!response.ok) {
        state.log.push({ host: checked.host, outcome: "status" });
        return { ok: false, reason: "unreachable" };
      }
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (type && !type.includes("html")) {
        state.log.push({ host: checked.host, outcome: "not_html" });
        return { ok: false, reason: "not_html" };
      }
      let body;
      try {
        body = await readCapped(response);
      } catch (error) {
        return { ok: false, reason: error && error.name === "TimeoutError" ? "timeout" : "unreachable" };
      }
      state.log.push({ host: checked.host, outcome: "read" });
      return { ok: true, url: checked.url.toString(), host: checked.host, html: body.text, truncated: body.truncated };
    }
  }
  return { get: get, state: state };
}
