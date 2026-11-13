// Ordinary pages that are longer than the free check reads, built the same way every time, so
// that neither repository has to hold eight megabytes of filler. The free check reads the first
// 1,048,576 bytes of such a page and runs on that part (owner's ruling R-224), so what matters
// is the cut: where it falls, and that the part before it reads as it always did.
//
// Three pages differ in length (1.2, 2 and 5 MiB). Four are built so that the cut falls at a
// chosen place: in the middle of a tag, of a character of several bytes, of a script block and
// of a block of structured data. The company is invented.
//
// This file is one of the recorded fixtures: MANIFEST.json holds its hash, and both the audit
// site and the app build their pages with it. It uses nothing but the language itself.

export const CUT_BYTES = 1024 * 1024;

const encoder = new TextEncoder();
const bytesOf = (text) => encoder.encode(text).length;

const HEAD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Graniteworks | Construction management software for general contractors</title>
<meta name="description" content="Graniteworks is construction management software for bids, schedules, daily logs and job costing.">
<meta property="og:site_name" content="Graniteworks">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Graniteworks","description":"Graniteworks makes construction project management software for general contractors."},{"@type":"SoftwareApplication","name":"Graniteworks Site","applicationCategory":"Construction management software","description":"Bids, schedules, daily logs and job costing for construction teams."}]}</script>
</head>
<body>
<header><a href="/">Graniteworks</a> <a href="/product">Product</a> <a href="/about">About</a> <a href="/customers">Customers</a></header>
<h1>Build on schedule, and know what it cost</h1>
<p>Graniteworks keeps the bid, the schedule and the daily log of every job in one place, so the office and the site read the same page.</p>
<h2>Bids and estimates</h2>
<p>Price a job from your own cost book and send the bid the same afternoon.</p>
<h2>Schedules</h2>
<p>A construction schedule the foreman can change from a phone.</p>
<h2>Projects our customers have built</h2>
`;

const TRADES = ['concrete', 'framing', 'roofing', 'glazing', 'plumbing', 'electrical', 'drywall', 'paving', 'steel', 'masonry'];
const TOWNS = ['Aldbury', 'Brackley', 'Carrow', 'Denholm', 'Eastmere', 'Farleigh', 'Gowerton', 'Hallam', 'Inverby', 'Jessop'];

// One project of the long list that makes the page long. Every seventh has a small script, every
// eleventh a block of structured data, and every fifth a name with letters of several bytes.
function project(n) {
  const trade = TRADES[n % TRADES.length], town = TOWNS[Math.floor(n / TRADES.length) % TOWNS.length];
  const name = n % 5 === 0 ? `Café ${town} – ${trade}` : `${town} ${trade} yard`;
  let html = `<section class="project" id="project-${n}">\n<h3>${name}, job ${n}</h3>\n<p>A ${trade} job in ${town}: ${40 + (n % 60)} working days, ${3 + (n % 9)} crews, closed inside its budget. The daily log has ${120 + (n % 300)} entries and every change order was priced before work began.</p>\n<a href="/projects/${n}">Read about job ${n}</a>\n</section>\n`;
  if (n % 7 === 0) html += `<script>window.projects = window.projects || []; window.projects.push({ id: ${n}, trade: "${trade}", note: "<p>not page text</p>" });</script>\n`;
  if (n % 11 === 0) html += `<script type="application/ld+json">{"@context":"https://schema.org","@type":"CreativeWork","name":"${town} ${trade} job ${n}","description":"A finished ${trade} job."}</script>\n`;
  return html;
}

// Projects from number `first` on, until the text is at least `bytes` long.
function projects(first, bytes) {
  let html = '', size = 0;
  for (let n = first; size < bytes; n += 1) { const one = project(n); html += one; size += bytesOf(one); }
  return html;
}

const FOOT = '<footer><a href="/company">Company</a> <a href="/why-graniteworks">Why Graniteworks</a><p>Graniteworks, 2026</p></footer>\n</body>\n</html>\n';

function long(mebibytes, first) {
  return HEAD + projects(first, Math.round(mebibytes * CUT_BYTES) - bytesOf(HEAD) - bytesOf(FOOT)) + FOOT;
}

// A page whose byte number CUT_BYTES falls `inside` bytes into `piece`. The text before the piece
// is brought to the exact length with spaces inside a paragraph.
function cutInside(piece, inside) {
  const before = HEAD + projects(1, CUT_BYTES - bytesOf(HEAD) - 4096);
  const room = CUT_BYTES - inside - bytesOf(before) - bytesOf('<p></p>\n');
  if (room < 0) throw new Error('the page before the cut is too long');
  return `${before}<p>${' '.repeat(room)}</p>\n${piece}${projects(5000, 100000)}${FOOT}`;
}

const EURO = String.fromCodePoint(0x20ac);

/** Every oversized page: its name, the address it is read at, the website a visitor types, and its whole text. */
export function oversizedPages() {
  return [
    { name: 'oversized-1.2-mib', website: 'graniteworks.example.com', html: long(1.2, 1) },
    { name: 'oversized-2-mib', website: 'graniteworks-two.example.com', html: long(2, 4) },
    { name: 'oversized-5-mib', website: 'graniteworks-five.example.com', html: long(5, 9) },
    { name: 'cut-mid-tag', website: 'graniteworks-tag.example.com', html: cutInside('<a class="button" href="/about">About the company</a>\n', 14) },
    { name: 'cut-mid-character', website: 'graniteworks-character.example.com', html: cutInside(`<p>Jobs from ${EURO}40,000 to ${EURO}4 million.</p>\n`, bytesOf('<p>Jobs from ') + 2) },
    { name: 'cut-mid-script', website: 'graniteworks-script.example.com', html: cutInside(`<script>window.gallery = ["${'site photo", "'.repeat(200)}last"];</script>\n`, 900) },
    { name: 'cut-mid-structured-data', website: 'graniteworks-data.example.com', html: cutInside('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Graniteworks Holdings","description":"The group behind Graniteworks."}</script>\n', 96) },
  ].map((page) => ({ ...page, url: `https://${page.website}/` }));
}

/** The part of a page the free check reads: its first CUT_BYTES bytes, set as text the way the fetch guard sets them. */
export function cutText(html, limit = CUT_BYTES) {
  return new TextDecoder('utf-8', { fatal: false }).decode(encoder.encode(html).slice(0, limit));
}
