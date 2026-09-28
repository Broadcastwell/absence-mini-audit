/**
 * The result seal. A result link must only ever hold a result this handler produced, or
 * anyone could store a made up "named in 10 of 10" under this site's name. So /api/run
 * seals what it returns with an HMAC, sent in the x-result-seal response header (the JSON
 * contract keeps its seven keys), and /api/link refuses any result whose seal does not
 * match.
 *
 * No new secret: the key is derived from the upstream token that is already bound, with a
 * fixed label, so the derived key is useless for anything else and the token never leaves
 * this file. Preview hosts have no token by design; there a fixed key that is not a secret
 * is used, which is safe because preview can never serve a real visitor.
 */

const LABEL = "free-check-result-link-v1";
const PREVIEW_KEY = "preview-only-this-is-not-a-secret";
const encoder = new TextEncoder();

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function base64url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The derived sealing key, or null when this host has nothing to derive it from. */
export async function sealKey(env, preview) {
  const base = env && env.UPSTREAM_TOKEN ? String(env.UPSTREAM_TOKEN) : preview ? PREVIEW_KEY : "";
  if (!base) return null;
  return hmac(encoder.encode(base), LABEL);
}

/**
 * The exact fields a seal covers, in a fixed order. Version 2 adds each row's receipt: the
 * answer excerpt, the cited URLs and the vendors named instead, so none of them can be
 * changed on the way to a result link either.
 */
export function canonical(brand, category, company, result) {
  const list = (value) => (Array.isArray(value) ? value.map(String) : []);
  const questions = Array.isArray(result && result.questions) ? result.questions.map((row) => [String(row.question), String(row.status), String(row.excerpt || ""), list(row.sources), list(row.named_instead)]) : [];
  return JSON.stringify(["v2", String(brand || ""), String(category || ""), String(company || ""), result.named, result.asked, String(result.tier), String(result.chapter), String(result.engine), String(result.measured_on), questions]);
}

export async function seal(key, brand, category, company, result) {
  return base64url(await hmac(key, canonical(brand, category, company, result)));
}

export async function verify(key, brand, category, company, result, given) {
  if (!key || typeof given !== "string" || given.length > 100) return false;
  const expected = await seal(key, brand, category, company, result);
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** The brand as the page sends it: trimmed, one line, at most 80 characters. */
export function cleanBrand(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
