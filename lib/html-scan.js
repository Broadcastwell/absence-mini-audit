// Broadcastwell Fix: reading HTML in one pass (PLUG IN wave 1, section 10.2). A page is whatever a
// stranger's server sends, up to the size limit, so the time it takes to read must grow with its
// length and no faster. A pattern such as "an opening tag, anything, its closing tag" looks again
// to the end of the page for every opening tag that is never closed, and a page built of nothing
// but such tags would hold the worker for minutes. Every function here walks forward through the
// text instead, looking for one fixed mark at a time (the start of a tag, its end, its closing
// tag), and once a search has reached the end without a find it is not made again.
//
// A mark is found whatever the case of its letters, by a pattern that is the mark and nothing
// else. The page is never copied into lower case: that copy cost more than the reading, and lower
// case moves two characters (U+0130 and U+212A), which put every place after them out by one.
//
// Each function gives the answer the pattern it replaces would give: the patterns are named beside
// them, and test/fix-site-read.test.js holds the two equal on ordinary pages and times the walk on
// hostile ones.
//
// The same bytes are lib/html-scan.js of the audit site (absence-mini-audit), where the free check
// reads a visitor's pages with them, and functions/lib/fix/html-scan.js of the app. A test on each
// side pins the SHA-256 of this file (tests/reader-drift.test.mjs in the audit site,
// test/fix-freecheck-drift.test.js in the app). The file changes in both repositories in the same
// release, or the test of the side that was left behind fails.

// One opening tag is read to this many characters: its attributes, and whether a script is
// structured data. A description of 20,000 characters in one meta tag is read whole.
const TAG_CHARS_MAX = 65536;

// The marks of a tag name: where it opens ("<name" as a whole name) and where it closes
// ("</name>"), in any case. Each is made once.
const OPENERS = new Map(), CLOSERS = new Map();
function markOf(made, name, source) {
  if (!made.has(name)) made.set(name, new RegExp(source, 'gi'));
  return made.get(name);
}
const openerOf = (name) => markOf(OPENERS, name, `<${name}\\b`);
const closerOf = (name) => markOf(CLOSERS, name, `</${name}>`);

// Where a mark next stands at or after `from`, or -1. A mark has one length, so its place is
// read from where the search stopped, and nothing is built for the find.
function next(mark, length, text, from) {
  mark.lastIndex = from;
  return mark.test(text) ? mark.lastIndex - length : -1;
}

// The next "<name" at or after `from` that is a whole tag name, or -1.
export function opener(text, name, from) {
  return next(openerOf(name), name.length + 1, text, from);
}

// The next "</name>" at or after `from`, or -1.
export function closer(text, name, from) {
  return next(closerOf(name), name.length + 3, text, from);
}

const TAG = /<[^>]*>/g;

// text.replace(/<[^>]*>/g, ' '): a less-than sign to the next greater-than sign, whatever is between.
// The pattern itself is used, on the part of the text up to its last greater-than sign: there
// every less-than sign has one to meet, so the pattern never looks to the end of the text and
// back. After that sign there is no tag to take out.
// With `enough`, the walk stops once that many characters are written: what is returned is then
// the start of the same answer, for a caller that keeps only the first words of a long text.
export function stripTags(text, enough = Infinity) {
  const source = String(text || '');
  if (enough === Infinity) {
    const lastOpen = source.lastIndexOf('<');
    if (lastOpen === -1) return source;
    const last = source.lastIndexOf('>');
    if (last > lastOpen) return source.replace(TAG, ' ');
    return last === -1 ? source : source.slice(0, last + 1).replace(TAG, ' ') + source.slice(last + 1);
  }
  let out = '', from = 0;
  while (out.length < enough) {
    const open = source.indexOf('<', from);
    if (open === -1) break;
    const close = source.indexOf('>', open + 1);
    if (close === -1) break;
    out += `${source.slice(from, open)} `;
    from = close + 1;
  }
  return out.length < enough ? out + source.slice(from) : out;
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

const CODE_OPENER = /<(script|style|noscript|svg|template)\b/gi;

// html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
// The openers are met in page order. One whose name has no closing tag left is passed over, and
// so is every later one of that name, without looking for its closing tag again.
export function stripCode(html) {
  const source = String(html || '');
  const closed = {};
  let out = '', from = 0, at = 0;
  for (;;) {
    CODE_OPENER.lastIndex = at;
    const found = CODE_OPENER.exec(source);
    if (!found) break;
    const name = found[1].toLowerCase();
    const close = closed[name] === false ? -1 : closer(source, name, found.index);
    if (close === -1) { closed[name] = false; at = found.index + 1; continue; }
    out += `${source.slice(from, found.index)} `;
    from = close + name.length + 3;
    at = from;
  }
  return out + source.slice(from);
}

// The matches of /<name\b[^>]*>([\s\S]*?)<\/name>/gi, in order: for each, what stands inside the
// opening tag after the name, and what stands between the tags. `visit` returns false to stop.
export function eachElement(html, name, visit) {
  const source = String(html || '');
  for (let from = 0; ;) {
    const at = opener(source, name, from);
    if (at === -1) return;
    const end = source.indexOf('>', at + name.length + 1);
    if (end === -1) return;
    const close = closer(source, name, end + 1);
    if (close === -1) return;
    if (visit(source.slice(at + name.length + 1, end), source.slice(end + 1, close)) === false) return;
    from = close + name.length + 3;
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
  const source = String(html || '');
  for (let from = 0; ;) {
    const at = opener(source, name, from);
    if (at === -1) return;
    const end = source.indexOf('>', at + name.length + 1);
    if (end === -1) return;
    if (visit(source.slice(at, end + 1), end + 1) === false) return;
    from = end + 1;
  }
}

const ATTRIBUTE = /([a-zA-Z_:.-]{1,64})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

// The attributes of one tag, by name in lower case. A tag is read to its first 65,536 characters.
export function attributes(tag) {
  const out = {};
  const text = String(tag || '').slice(0, TAG_CHARS_MAX);
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(text))) out[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
  return out;
}

const LD_JSON = /type\s*=\s*["']?application\/ld\+json/i;

// The contents of every <script type="application/ld+json">, in order, at most `most` of them.
export function ldJsonBlocks(html, most) {
  const source = String(html || ''), blocks = [];
  for (let from = 0; blocks.length < most;) {
    const at = opener(source, 'script', from);
    if (at === -1) break;
    const end = source.indexOf('>', at + 7);
    if (end === -1) break;
    if (!LD_JSON.test(source.slice(at + 7, Math.min(end, at + 7 + TAG_CHARS_MAX)))) { from = end + 1; continue; }
    const close = closer(source, 'script', end + 1);
    if (close === -1) break;
    blocks.push(source.slice(end + 1, close));
    from = close + 9;
  }
  return blocks;
}
