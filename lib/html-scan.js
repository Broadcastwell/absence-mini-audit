// Broadcastwell Fix: reading HTML in one pass (PLUG IN wave 1, section 10.2). A page is whatever a
// stranger's server sends, up to the size limit, so the time it takes to read must grow with its
// length and no faster. A pattern such as "an opening tag, anything, its closing tag" looks again
// to the end of the page for every opening tag that is never closed, and a page built of nothing
// but such tags would hold the worker for minutes. Every function here walks forward through the
// text with plain searches instead, and once a search has reached the end without a find it is not
// made again.
//
// Each function gives the answer the pattern it replaces would give: the patterns are named beside
// them, and test/fix-site-read.test.js holds the two equal on ordinary pages and times the walk on
// hostile ones.
//
// The same bytes are lib/html-scan.js of the audit site (absence-mini-audit), where the free check
// reads a visitor's pages with them, and functions/lib/fix/html-scan.js of the app. A test on each
// side pins the SHA-256 of this file (tests/reader-drift.test.mjs in the audit site,
// test/fix-freecheck-drift.test.js in the app), so a change made on one side alone fails a test.

const WORD = /[A-Za-z0-9_]/;
const TAG_CHARS_MAX = 8192;

// Tag names are looked for in a copy of the page set in lower case, and what is found there is cut
// from the page itself, so the copy must keep every character in its place. Two characters do not
// survive String.toLowerCase: U+0130, a capital I with a dot, becomes two characters and moves
// everything after it by one, and U+212A, the kelvin sign, becomes a plain k. A page that holds
// either is set in lower case around them, and they stay as they are. The patterns this file
// replaces matched a tag name against plain letters only, and so does this.
const cp = (code) => String.fromCodePoint(code);
const MOVED = new RegExp(`[${cp(0x130)}${cp(0x212a)}]`);
const BETWEEN_MOVED = new RegExp(`[^${cp(0x130)}${cp(0x212a)}]+`, 'g');
export function lowerInPlace(text) {
  const source = String(text || '');
  return MOVED.test(source) ? source.replace(BETWEEN_MOVED, (run) => run.toLowerCase()) : source.toLowerCase();
}

// text.replace(/<[^>]*>/g, ' '): a less-than sign to the next greater-than sign, whatever is between.
export function stripTags(text) {
  const source = String(text || '');
  let out = '', from = 0;
  for (;;) {
    const open = source.indexOf('<', from);
    if (open === -1) break;
    const close = source.indexOf('>', open + 1);
    if (close === -1) break;
    out += `${source.slice(from, open)} `;
    from = close + 1;
  }
  return out + source.slice(from);
}

// The two marks of an HTML comment. They are built from single hyphens, because the copy scans of
// this repository let two hyphens in a row stand in no file under functions/.
const COMMENT_OPEN = `<!${'-'.repeat(2)}`;
const COMMENT_CLOSE = `${'-'.repeat(2)}>`;

// Every comment, from its opening mark to the first closing mark after it, set as one space: what
// a pattern of "the opening mark, as little as possible, the closing mark" would replace.
export function stripComments(text) {
  const source = String(text || '');
  let out = '', from = 0;
  for (;;) {
    const open = source.indexOf(COMMENT_OPEN, from);
    if (open === -1) break;
    const close = source.indexOf(COMMENT_CLOSE, open + COMMENT_OPEN.length);
    if (close === -1) break;
    out += `${source.slice(from, open)} `;
    from = close + COMMENT_CLOSE.length;
  }
  return out + source.slice(from);
}

// The next "<name" at or after `from` that is a whole tag name, or -1. `lower` is the text in lower case.
export function opener(lower, name, from) {
  const mark = `<${name}`;
  for (let at = lower.indexOf(mark, from); at !== -1; at = lower.indexOf(mark, at + 1)) {
    const after = lower[at + mark.length];
    if (after === undefined || !WORD.test(after)) return at;
  }
  return -1;
}

const CODE_TAGS = Object.freeze(['script', 'style', 'noscript', 'svg', 'template']);

// html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
export function stripCode(html) {
  const source = String(html || ''), lower = lowerInPlace(source);
  // For each name: where its next opener is, -1 when it has none left or can never close again.
  const next = Object.fromEntries(CODE_TAGS.map((name) => [name, -2]));
  let out = '', from = 0;
  for (;;) {
    let first = null;
    for (const name of CODE_TAGS) {
      if (next[name] === -1) continue;
      if (next[name] < from) next[name] = opener(lower, name, from);
      if (next[name] !== -1 && (first === null || next[name] < next[first])) first = name;
    }
    if (first === null) break;
    const close = lower.indexOf(`</${first}>`, next[first]);
    if (close === -1) { next[first] = -1; continue; }
    out += `${source.slice(from, next[first])} `;
    from = close + first.length + 3;
  }
  return out + source.slice(from);
}

// The matches of /<name\b[^>]*>([\s\S]*?)<\/name>/gi, in order: for each, what stands inside the
// opening tag after the name, and what stands between the tags. `visit` returns false to stop.
export function eachElement(html, name, visit) {
  const source = String(html || ''), lower = lowerInPlace(source), closer = `</${name}>`;
  for (let from = 0; ;) {
    const at = opener(lower, name, from);
    if (at === -1) return;
    const end = source.indexOf('>', at + name.length + 1);
    if (end === -1) return;
    const close = lower.indexOf(closer, end + 1);
    if (close === -1) return;
    if (visit(source.slice(at + name.length + 1, end), source.slice(end + 1, close)) === false) return;
    from = close + closer.length;
  }
}

// The first such element's inside, or null.
export function firstElement(html, name) {
  let inner = null;
  eachElement(html, name, (_attrs, inside) => { inner = inside; return false; });
  return inner;
}

// The matches of /<name\b[^>]*>/gi, in order: the whole opening tag. `visit` returns false to stop.
export function eachOpenTag(html, name, visit) {
  const source = String(html || ''), lower = lowerInPlace(source);
  for (let from = 0; ;) {
    const at = opener(lower, name, from);
    if (at === -1) return;
    const end = source.indexOf('>', at + name.length + 1);
    if (end === -1) return;
    if (visit(source.slice(at, end + 1), end + 1) === false) return;
    from = end + 1;
  }
}

// The attributes of one tag, by name in lower case. A tag is read to its first 8,192 characters.
export function attributes(tag) {
  const out = {};
  const pattern = /([a-zA-Z_:.-]{1,64})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  const text = String(tag || '').slice(0, TAG_CHARS_MAX);
  let match;
  while ((match = pattern.exec(text))) out[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
  return out;
}

const LD_JSON = /type\s{0,20}=\s{0,20}["']?application\/ld\+json/i;

// The contents of every <script type="application/ld+json">, in order, at most `most` of them.
export function ldJsonBlocks(html, most) {
  const source = String(html || ''), lower = lowerInPlace(source), blocks = [];
  for (let from = 0; blocks.length < most;) {
    const at = opener(lower, 'script', from);
    if (at === -1) break;
    const end = source.indexOf('>', at + 7);
    if (end === -1) break;
    if (!LD_JSON.test(source.slice(at + 7, Math.min(end, at + 7 + TAG_CHARS_MAX)))) { from = end + 1; continue; }
    const close = lower.indexOf('</script>', end + 1);
    if (close === -1) break;
    blocks.push(source.slice(end + 1, close));
    from = close + 9;
  }
  return blocks;
}
