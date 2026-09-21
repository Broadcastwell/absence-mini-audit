/**
 * The analyze step and its fetch guard, against a stubbed network. Nothing in this file
 * reaches the internet: every request the handler makes goes to `net`, which answers
 * from the table below and records what it was asked.
 *
 * Run: node tests/analyze.test.mjs
 */

import audit from "../lib/audit.js";
import { analyze, readPage, classify, proposeBrand, questionTemplate } from "../lib/analyze.js";
import { checkAddress, blockedV4, blockedV6, fetchBudget, MAX_BYTES, USER_AGENT } from "../lib/guard.js";
import { LEXICON } from "../lib/lexicon.js";

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail: detail || "" });
}

// A tiny DNS and web, keyed by host name.
const DNS = {
  "acmefield.com": ["93.184.216.34"],
  "www.acmefield.com": ["93.184.216.34"],
  "blocked.example.org": ["93.184.216.35"],
  "shell.example.org": ["93.184.216.36"],
  "slow.example.org": ["93.184.216.37"],
  "huge.example.org": ["93.184.216.38"],
  "loop.example.org": ["93.184.216.39"],
  "vague.example.org": ["93.184.216.40"],
  "rebind.example.org": ["10.0.0.5"],
  "metadata.example.org": ["169.254.169.254"],
  "mapped.example.org": ["::ffff:127.0.0.1"],
  "pdf.example.org": ["93.184.216.41"],
  "hops.example.org": ["93.184.216.42"],
  "dental.example.org": ["93.184.216.43"],
};

const ACME = `<!doctype html><html><head><title>Acme Field | Field service management software for HVAC and plumbing teams</title>
<meta name="description" content="Schedule, dispatch and pay your technicians from one field service platform.">
<meta property="og:site_name" content="Acme Field">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme Field"},{"@type":"SoftwareApplication","name":"Acme Field","applicationCategory":"Field service management"}]}</script>
</head><body><h1>Dispatch every technician &amp; every work order</h1><a href="/about">About</a><a href="https://other.example.net/about">Off site</a><p>Work orders, dispatch and invoicing for service technicians.</p></body></html>`;

const VAGUE = `<!doctype html><html><head><title>Vague Co</title><meta name="description" content="We help teams do better work."></head><body><h1>Better work, together</h1><p>Our mission is to help people.</p><a href="/about">About</a><a href="/product">Product</a><a href="/careers">Careers</a></body></html>`;
const VAGUE_ABOUT = `<html><head><title>About Vague Co</title></head><body><h1>About us</h1><p>Vague Co builds dental practice management software for dental offices and orthodontic clinics.</p></body></html>`;
const VAGUE_PRODUCT = `<html><head><title>Product</title></head><body><h2>Scheduling for dentists</h2><p>Charting and billing for dental practices.</p></body></html>`;

const requests = [];
function page(body, status, headers) {
  return new Response(body, { status: status || 200, headers: Object.assign({ "content-type": "text/html; charset=utf-8" }, headers || {}) });
}
async function net(url, init) {
  const target = new URL(url);
  requests.push({ url: url, init: init || {} });
  if (target.hostname === "cloudflare-dns.com") {
    const name = target.searchParams.get("name");
    const type = target.searchParams.get("type");
    const all = DNS[name] || [];
    const wanted = all.filter((address) => (type === "A" ? !address.includes(":") : address.includes(":")));
    return new Response(JSON.stringify({ Status: 0, Answer: wanted.map((data) => ({ name: name, type: type === "A" ? 1 : 28, data: data })) }), { headers: { "content-type": "application/dns-json" } });
  }
  switch (target.hostname) {
    case "acmefield.com": return page("", 301, { location: "https://www.acmefield.com/" });
    case "www.acmefield.com": return target.pathname === "/about" ? page("<html><title>About</title><body>About Acme Field</body></html>") : page(ACME);
    case "blocked.example.org": return page("Forbidden", 403);
    case "shell.example.org": return page("<html><head></head><body><div id=root></div><script src=/app.js></script></body></html>");
    case "slow.example.org": { const error = new Error("timed out"); error.name = "TimeoutError"; throw error; }
    case "huge.example.org": return page(ACME + "x".repeat(MAX_BYTES * 2));
    case "loop.example.org": return page("", 302, { location: "https://loop.example.org/again" + Math.random() });
    case "hops.example.org": return page("", 302, { location: "http://rebind.example.org/" });
    case "vague.example.org": return target.pathname === "/about" ? page(VAGUE_ABOUT) : target.pathname === "/product" ? page(VAGUE_PRODUCT) : page(VAGUE);
    case "pdf.example.org": return new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    case "dental.example.org": return page(VAGUE_ABOUT);
    default: return page("not found", 404);
  }
}

function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(key, type) { const raw = store.get(key); if (raw === undefined) return null; return type === "json" ? JSON.parse(raw) : raw; },
    async put(key, value) { store.set(key, String(value)); },
  };
}

function post(body, host, ip) {
  return new Request("https://" + (host || "audit.broadcastwell.com") + "/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip || "203.0.113.50" },
    body: JSON.stringify(body),
  });
}

async function run(website, env, ip) {
  const response = await analyze(post({ website }, null, ip), env || { AUDIT: fakeKV() }, { fetcher: net });
  return { status: response.status, body: await response.json() };
}

// The address shape rules
{
  const refused = [
    ["ftp://acmefield.com", "scheme"], ["file:///etc/passwd", "scheme"], ["javascript:alert(1)", "scheme"], ["gopher://acmefield.com", "scheme"],
    ["https://acmefield.com:8080/", "port"], ["http://acmefield.com:22", "port"],
    ["http://127.0.0.1/", "literal"], ["http://2130706433/", "literal"], ["http://0x7f.0.0.1/", "literal"], ["http://0177.0.0.1/", "literal"],
    ["http://127.1/", "literal"], ["http://[::1]/", "literal"], ["http://[::ffff:169.254.169.254]/", "literal"], ["http://169.254.169.254/latest/meta-data/", "literal"],
    ["http://8.8.8.8/", "literal"], ["http://localhost/", "private"], ["http://intranet/", "private"], ["http://printer.local/", "private"],
    ["http://metadata.google.internal/", "private"], ["http://router.home.arpa/", "private"], ["https://user:pass@acmefield.com/", "address"],
    ["", "address"], ["acme field.com", "address"],
  ];
  for (const [input, reason] of refused) {
    const result = checkAddress(input);
    check("guard refuses " + (input || "an empty address") + " as " + reason, !result.ok && result.reason === reason, JSON.stringify(result));
  }
  for (const input of ["acmefield.com", "https://www.acmefield.com/", "http://acmefield.com:80/", "https://acmefield.com:443/pricing?x=1#top"]) {
    const result = checkAddress(input);
    check("guard accepts " + input, result.ok, JSON.stringify(result));
  }
  check("a bare name is taken as https", checkAddress("acmefield.com").url.protocol === "https:", "scheme default");
}

// The address ranges
{
  for (const address of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1"]) {
    check("range " + address + " is blocked", blockedV4(address), address);
  }
  for (const address of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1"]) check("range " + address + " is allowed", !blockedV4(address), address);
  for (const address of ["::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1", "2001:db8::1", "ff02::1", "not an address"]) {
    check("range " + address + " is blocked", blockedV6(address), address);
  }
  for (const address of ["2606:4700::6810:84e5", "2a00:1450:4001:80b::200e"]) check("range " + address + " is allowed", !blockedV6(address), address);
}

// The fetch budget: redirects are checked again, the count is capped, and so is the size
{
  requests.length = 0;
  const loop = fetchBudget(net);
  const looped = await loop.get("https://loop.example.org/");
  check("a redirect loop stops at three fetches", !looped.ok && loop.state.used === 3, JSON.stringify(looped) + " used " + loop.state.used);

  const hop = fetchBudget(net);
  const hopped = await hop.get("https://hops.example.org/");
  check("a redirect to a private address is refused after the hop", !hopped.ok && hopped.reason === "private", JSON.stringify(hopped));
  check("the private address is never requested", !requests.some((r) => new URL(r.url).hostname === "rebind.example.org"), requests.map((r) => r.url).join(" "));

  const rebind = await fetchBudget(net).get("https://rebind.example.org/");
  check("a name that resolves to a private address is refused", !rebind.ok && rebind.reason === "private", JSON.stringify(rebind));
  const meta = await fetchBudget(net).get("https://metadata.example.org/");
  check("a name that resolves to the metadata address is refused", !meta.ok && meta.reason === "private", JSON.stringify(meta));
  const mapped = await fetchBudget(net).get("https://mapped.example.org/");
  check("a name that resolves to a mapped loopback address is refused", !mapped.ok && mapped.reason === "private", JSON.stringify(mapped));
  const nowhere = await fetchBudget(net).get("https://nowhere.example.org/");
  check("a name that resolves to nothing is refused", !nowhere.ok && nowhere.reason === "unresolved", JSON.stringify(nowhere));

  const huge = await fetchBudget(net).get("https://huge.example.org/");
  check("a page is read to 1 MB and no further", huge.ok && huge.truncated && huge.html.length <= MAX_BYTES, huge.ok ? String(huge.html.length) : JSON.stringify(huge));

  requests.length = 0;
  await fetchBudget(net).get("https://acmefield.com/");
  const sent = requests.filter((r) => new URL(r.url).hostname !== "cloudflare-dns.com");
  check("every site request carries the honest user agent", sent.length === 2 && sent.every((r) => r.init.headers["user-agent"] === USER_AGENT) && /Broadcastwell/.test(USER_AGENT) && /https:\/\/audit\.broadcastwell\.com/.test(USER_AGENT), sent.map((r) => r.init.headers["user-agent"]).join(","));
  check("every site request follows redirects by hand and has a timeout", sent.every((r) => r.init.redirect === "manual" && r.init.signal), "manual redirects");
}

// Reading a page
{
  const read = readPage(ACME, "https://www.acmefield.com/");
  check("the title is read verbatim", read.title === "Acme Field | Field service management software for HVAC and plumbing teams", read.title);
  check("the description is read verbatim", read.description === "Schedule, dispatch and pay your technicians from one field service platform.", read.description);
  check("the first heading has its entities decoded", read.h1 === "Dispatch every technician & every work order", read.h1);
  check("structured data names are read", read.orgNames.length >= 1 && read.orgNames[0].name === "Acme Field", JSON.stringify(read.orgNames));
  check("only same site pages are followed", read.links.length === 1 && read.links[0] === "https://www.acmefield.com/about", read.links.join(","));
  check("the brand is what the site calls itself", proposeBrand([read], "www.acmefield.com") === "Acme Field", proposeBrand([read], "www.acmefield.com"));
  check("the category is proposed in buyer words", classify([read])[0].label === "field service management software", JSON.stringify(classify([read]).slice(0, 3)));
  const dashed = readPage("<title>Acme — dispatch – now -- today</title>", "https://acmefield.com/");
  check("text read back never carries a dash the site does not print", !/[–—]|--/.test(dashed.title), dashed.title);
}

// The handler end to end
{
  const env = { AUDIT: fakeKV(), UPSTREAM_URL: "https://upstream.invalid/run", UPSTREAM_TOKEN: "test-token" };
  requests.length = 0;
  const ok = await run("acmefield.com", env);
  check("a readable site proposes brand and category", ok.status === 200 && ok.body.found === true && ok.body.brand === "Acme Field" && ok.body.category === "field service management software", JSON.stringify(ok.body).slice(0, 200));
  check("it offers up to three alternatives", Array.isArray(ok.body.alternatives) && ok.body.alternatives.length <= 3, JSON.stringify(ok.body.alternatives));
  check("it shows what it read, verbatim", ok.body.read.title.startsWith("Acme Field | Field service") && ok.body.read.description.startsWith("Schedule, dispatch"), JSON.stringify(ok.body.read));
  check("it hands back the ten question sentences", ok.body.questions_template.length === 10 && ok.body.questions_template.every((q) => q.includes("{category}")), JSON.stringify(ok.body.questions_template));
  check("the analyze step never calls the upstream", !requests.some((r) => r.url.includes("upstream.invalid") || (r.init.headers && r.init.headers.authorization)), requests.map((r) => r.url).join(" "));
  check("a confident homepage reads no further pages", ok.body.pages.length === 1, JSON.stringify(ok.body.pages));

  const vague = await run("vague.example.org", env, "203.0.113.51");
  check("a vague homepage reads at most two more same site pages", vague.body.found === true && vague.body.pages.length === 3 && vague.body.category === "dental practice management software", JSON.stringify(vague.body).slice(0, 240));

  for (const [site, reason] of [["blocked.example.org", "blocked"], ["shell.example.org", "empty"], ["slow.example.org", "timeout"], ["pdf.example.org", "not_html"], ["nowhere.example.org", "unresolved"], ["rebind.example.org", "private"]]) {
    const r = await run(site, env, "203.0.113.52");
    check("a site that is " + reason + " falls back to typing, never a dead end", r.status === 200 && r.body.found === false && r.body.reason === reason && r.body.questions_template.length === 10, JSON.stringify(r.body).slice(0, 160));
  }

  const literal = await run("http://169.254.169.254/", env);
  check("an address literal is refused before any request", literal.status === 400 && literal.body.reason === "address", JSON.stringify(literal.body));
  const empty = await run("", env);
  check("an empty website is refused as input", empty.status === 400 && empty.body.reason === "input", JSON.stringify(empty.body));
}

// The analyze allowance, held in the limits record
{
  const day = new Date().toISOString().slice(0, 10);
  const env = { AUDIT: fakeKV({ "config:limits": JSON.stringify({ per_address_per_day: 1, per_ip_per_day: 3, global_per_day: 100, analyze_per_ip_per_day: 2, analyze_global_per_day: 3 }) }) };
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await run("acmefield.com", env, "198.51.100.200")).status);
  check("the analyze network limit refuses the third read", statuses.join(",") === "200,200,429", statuses.join(","));
  const other = await run("acmefield.com", env, "198.51.100.201");
  const capped = await run("acmefield.com", env, "198.51.100.202");
  check("the analyze daily allowance refuses once spent", other.status === 200 && capped.status === 503 && capped.body.reason === "global", other.status + "," + capped.status);
  check("a network refusal does not spend the daily allowance", env.AUDIT.store.get(`count:analyze:global:${day}`) === "3", env.AUDIT.store.get(`count:analyze:global:${day}`));
  check("the analyze counters never touch the run counters", ![...env.AUDIT.store.keys()].some((key) => /^count:(global|ip|addr):/.test(key)), [...env.AUDIT.store.keys()].join(","));

  const defaults = { AUDIT: fakeKV() };
  const r = await run("acmefield.com", defaults, "198.51.100.203");
  check("the analyze allowance has defaults with no limits record", r.status === 200 && defaults.AUDIT.store.get(`count:analyze:ip:${day}:198.51.100.203`) === "1", String(r.status));
}

// Routing: the route answers POST only, and a live host with no store bound fails safe
{
  const get = await audit.fetch(new Request("https://audit.broadcastwell.com/api/analyze"), {}, {});
  check("the analyze route answers POST only", get.status === 405, String(get.status));
  const live = await analyze(post({ website: "acmefield.com" }), {}, { fetcher: net });
  check("a live host with no store reads nothing", live.status === 503, String(live.status));
  requests.length = 0;
  const preview = await analyze(post({ website: "acmefield.com" }, "abc123.absence-mini-audit.pages.dev"), {}, { fetcher: net, preview: true });
  check("a preview host with no store still reads the site", preview.status === 200 && (await preview.json()).found === true, String(preview.status));
}

// The lexicon's shape
{
  const ids = new Set();
  const labels = new Set();
  let shapeOk = true;
  for (const entry of LEXICON) {
    if (!/^[a-z0-9_]+$/.test(entry.id) || ids.has(entry.id)) shapeOk = false;
    if (labels.has(entry.label.toLowerCase())) shapeOk = false;
    if (!["horizontal", "vertical"].includes(entry.group)) shapeOk = false;
    if (!Array.isArray(entry.terms) || !entry.terms.length || entry.terms.some((t) => t !== t.toLowerCase() || !t.trim())) shapeOk = false;
    ids.add(entry.id);
    labels.add(entry.label.toLowerCase());
  }
  check("every lexicon entry has a unique id, a unique label, a group and lower case terms", shapeOk, LEXICON.length + " entries");
  check("the lexicon covers the horizontal staples and the vertical list", ["crm", "project_management", "core_hr", "lms", "help_desk", "marketing_automation", "dealership", "field_service", "radiology", "dental", "veterinary", "behavioral_health", "home_health", "pharmacy", "medical_billing", "legal_practice", "accounting_practice", "optometry", "chiropractic", "construction", "property_management", "self_storage", "title_escrow", "mortgage", "insurance_agency", "claims", "credit_union", "lending", "restaurant", "salon_spa", "fitness", "tms", "fleet", "freight_brokerage", "agriculture", "energy", "k12", "higher_ed", "church", "nonprofit_crm", "public_safety", "mes", "quality", "food_safety", "equipment_rental"].every((id) => ids.has(id)), "coverage");
  check("every label reads as a buyer's category in the questions", LEXICON.every((entry) => /(software|platform|system|EHR|CRM)$/.test(entry.label) && !/[–—]|--/.test(entry.label)), "label endings");
  check("the question sentences carry the category marker", questionTemplate()[0] === "What is the best {category}?", questionTemplate()[0]);
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? "  (" + r.detail + ")" : ""}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
