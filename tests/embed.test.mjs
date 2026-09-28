// The find-your-company frame: ?site= prefill and the /embed route.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

let passed = 0, failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log("PASS  " + name); } else { failed += 1; console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : "")); }
}
const file = p => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
const page = file("public/index.html");
const headers = file("public/_headers");

check("/embed serves the same bytes as the page, so the same hashes cover it", file("public/embed.html") === page, "run node scripts/build-page.mjs");

const block = (path) => { const at = headers.indexOf("\n" + path + "\n"); if (at < 0) return ""; const rest = headers.slice(at + 1); const next = rest.slice(path.length + 1).search(/^\S/m); return next < 0 ? rest : rest.slice(0, path.length + 1 + next); };
const site = block("/*"), embed = block("/embed");
const cspOf = text => (/Content-Security-Policy:\s*(.+)/.exec(text) || [])[1] || "";
const directive = (csp, name) => ((csp.split(";").map(s => s.trim()).find(s => s.startsWith(name + " ")) || "").slice(name.length + 1));
const ALLOWED = "https://broadcastwell.com https://*.broadcastwell.com https://*.framer.app https://*.framer.website https://framer.com https://*.framercanvas.com";
check("every other path still refuses all framing", directive(cspOf(site), "frame-ancestors") === "'none'" && site.includes("X-Frame-Options: DENY"));
check("/embed removes the site-wide policy and X-Frame-Options before setting its own", /! Content-Security-Policy/.test(embed) && /! X-Frame-Options/.test(embed));
check("/embed may be framed by broadcastwell.com, its subdomains and Framer previews only", directive(cspOf(embed), "frame-ancestors") === ALLOWED, directive(cspOf(embed), "frame-ancestors"));
check("apart from framing, the /embed policy is the page's policy exactly", cspOf(embed).replace(/frame-ancestors [^;]+/, "") === cspOf(site).replace(/frame-ancestors [^;]+/, ""));

// The page's one inline script, found the way scripts/build-page.mjs finds it for the hash.
const scriptAt = page.indexOf("<script>") + 8;
const script = page.slice(scriptAt, page.indexOf("</script>", scriptAt));
const arriving = /var arriving[\s\S]{0,400}?if \(arriving\) \{ siteInput\.value = arriving; readSite\(true\); \}/.exec(script);
check("?site= (then ?domain=) fills the website and starts only the free read", Boolean(arriving) && /query\.get\('site'\) \|\| query\.get\('domain'\)/.test(arriving[0]) && !/runCheck|\/api\/run/.test(arriving[0]));

const embedAt = script.indexOf("// Embed mode (/embed)");
const embedCode = script.slice(embedAt);
check("embed mode is its own block at the end of the page script", embedAt > 0 && /^\/\/ Embed mode[\s\S]*\}\)\(\);\s*$/.test(embedCode));
check("embed mode measures the root element, never a viewport-floored measure", /root\.getBoundingClientRect\(\)\.height/.test(embedCode) && !/scrollHeight|innerHeight|clientHeight/.test(embedCode));
check("embed mode hides the site chrome and long sections in CSS", /html\.embed \.site-header,html\.embed \.site-footer,html\.embed \.detail\{display:none\}/.test(page));
check("embed mode keeps the intro and its h1 for screen readers, visually hidden, with nothing focusable in it",
  /html\.embed \.intro\{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect\(0 0 0 0\);white-space:nowrap;border:0\}/.test(page)
  && (() => { const intro = page.slice(page.indexOf('<section class="intro"'), page.indexOf("</section>", page.indexOf('<section class="intro"'))); return /<h1[ >]/.test(intro) && !/<a |<button|<input|tabindex="0"/.test(intro); })());
check("a read that starts on arrival moves no focus, and scrolls nothing inside the frame",
  /readSite\(true\)/.test(script) && /function readSite\(auto\) \{\s*readAuto = auto === true;/.test(script)
  && /if \(!readAuto\) title\.focus\(\{ preventScroll: true \}\);/.test(script)
  && /if \(!readAuto \|\| !document\.documentElement\.classList\.contains\('embed'\)\) title\.scrollIntoView/.test(script)
  && (script.match(/readSite\(\)/g) || []).length === 1, "the visitor's own read calls readSite() once, without the flag");

// Run the block in a small simulated window.
function simulate(pathname, parentIsSelf = false) {
  const messages = [], observers = [];
  const classes = new Set();
  let height = 812;
  const links = [{ host: "broadcastwell.com", target: "" }, { host: "audit.broadcastwell.com", target: "" }, { host: "docs.broadcastwell.com", target: "" }, { host: "www.perplexity.ai", target: "_blank" }];
  const root = { classList: { add: c => classes.add(c) }, getBoundingClientRect: () => ({ height }) };
  const win = { postMessage() {}, addEventListener() {} };
  const parent = parentIsSelf ? null : { postMessage: (data, origin) => messages.push({ data, origin }) };
  const sandbox = {
    location: { pathname, host: "audit.broadcastwell.com" },
    document: { documentElement: root, body: {}, querySelectorAll: () => links },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    ResizeObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    setInterval() {}
  };
  sandbox.window = Object.assign(win, sandbox, { MutationObserver: sandbox.MutationObserver, ResizeObserver: sandbox.ResizeObserver });
  sandbox.window.parent = parentIsSelf ? sandbox.window : parent;
  vm.runInNewContext(embedCode, sandbox);
  return { messages, classes, links, grow: h => { height = h; observers.forEach(fn => fn()); } };
}
const framed = simulate("/embed");
check("in /embed the page marks itself and reports its height to the parent", framed.classes.has("embed") && framed.messages.length === 1 && framed.messages[0].data.type === "broadcastwell:free-check:height" && framed.messages[0].data.height === 812);
framed.grow(1490); framed.grow(1490); framed.grow(640);
check("the height follows the page as it grows and shrinks, once per change", framed.messages.map(m => m.data.height).join(",") === "812,1490,640");
check("links that leave the check open in the top window; links on the check stay", framed.links[0].target === "_top" && framed.links[2].target === "_top" && framed.links[1].target === "");
check("links that already open a new tab keep their new tab", framed.links[3].target === "_blank");
const plain = simulate("/");
check("the ordinary page never enters embed mode or posts anything", !plain.classes.has("embed") && plain.messages.length === 0 && plain.links.slice(0, 3).every(l => l.target === "") && plain.links[3].target === "_blank");
check("an /embed page opened on its own posts nothing", simulate("/embed", true).messages.length === 0);

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
