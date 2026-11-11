// The art director's live round 1 on the free check result (STEP 3.3 B122): one next action beside the
// score, a caption and a table form for both bar graphics, and the sample label as plain secondary text.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
await import("../public/assets/report.js");
const R = globalThis.BwReport;

for (const name of ["index.html", "embed.html"]) {
  const page = read("public/" + name);
  const result = page.slice(page.indexOf('<section id="result"'), page.indexOf('<section id="email-card"'));

  test(name + ": one next action stands beside the score, before the wheel, in the outlined style", () => {
    const at = (needle) => result.indexOf(needle);
    assert.ok(at('id="lead-line"') > 0 && at('id="measurement-company"') < at('id="score-next"') && at('id="score-next"') < at('id="wheel"'));
    assert.match(result, /<p class="score-next" id="score-next"><a id="score-next-link" class="small-button" href="https:\/\/broadcastwell\.com\/answer-repair">Fix this answer, \$490<\/a><\/p>/);
    assert.equal((result.match(/cta-filled/g) || []).length, 1, "the repair purchase stays the one filled button");
  });

  test(name + ": both bar graphics carry a caption and a Read as a table control for their table form", () => {
    for (const key of ["company", "source"]) {
      const figure = (new RegExp('<figure class="report-figure"><div id="' + key + '-chart" class="report-chart"></div>([\\s\\S]*?)</figure>').exec(result) || [])[1] || "";
      assert.match(figure, new RegExp('<div id="' + key + '-table" class="bw-table-wrap report-table hidden"></div>'), key + " table form");
      assert.match(figure, new RegExp('<button type="button" class="bw-button bw-button--text report-toggle hidden" id="' + key + '-toggle" aria-expanded="false" aria-controls="' + key + '-table">Read as a table</button>'), key + " toggle");
      assert.match(figure, new RegExp('<p class="meta hidden" id="' + key + '-caption"></p>'), key + " caption");
    }
  });
}

test("the page script fills each caption and table and opens the table only when asked", () => {
  const page = read("public/index.html");
  const script = page.slice(page.indexOf("<script>") + 8, page.indexOf("</script>", page.indexOf("<script>")));
  assert.match(script, /renderChartForm\('company',peers,'Company','Companies named, count of answers out of ten','named the company',data,ctx\);/);
  assert.match(script, /renderChartForm\('source',cited,'Cited domain','Cited domains, count of answers out of ten','cited the domain',data,ctx\);/);
  const fn = (/function renderChartForm\(name,rows,column,title,counted,data,ctx\)\{[\s\S]*?\n  \}\n/.exec(script) || [""])[0];
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, innerHTML: "", hidden: new Set(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const sandbox = { document: { getElementById: el }, window: { BwReport: R }, show: (e) => e.hidden.delete("hidden"), hide: (e) => e.hidden.add("hidden"), out: null };
  vm.runInNewContext(fn + "\nout = renderChartForm;", sandbox);
  const data = { engine: "Claude", measured_on: "2026-09-16", named: 3 };
  sandbox.out("company", [{ label: "Acme (you)", count: 3, own: true }, { label: "Peer A", count: 10, own: false }], "Company", "Companies named, count of answers out of ten", "named the company", data, { category: "AI visibility software" });
  assert.match(els["company-table"].innerHTML, /<td class="bw-num">10<\/td>/);
  assert.ok(els["company-table"].hidden.has("hidden"), "the table starts hidden");
  assert.equal(els["company-toggle"].attrs["aria-expanded"], "false");
  assert.ok(!els["company-toggle"].hidden.has("hidden") && !els["company-caption"].hidden.has("hidden"));
  assert.match(els["company-caption"].innerHTML, /Answers captured 16 September 2026\. Base: 10 buyer questions, one run on Claude/);
  sandbox.out("source", [], "Cited domain", "Cited domains", "cited the domain", data, { category: "x" });
  assert.ok(els["source-toggle"].hidden.has("hidden") && els["source-caption"].hidden.has("hidden"), "no rows, no control and no caption");
  assert.match(script, /toggle\.addEventListener\('click',function\(\)\{var open=toggle\.getAttribute\('aria-expanded'\)!=='true';toggle\.setAttribute\('aria-expanded',open\?'true':'false'\);if\(open\)show\(table\);else hide\(table\);\}\);/);
});

test("the second next step and the action beside the score are the same link, read from the visible step", () => {
  const page = read("public/index.html");
  const fn = (/function renderNextSteps\(data\) \{[\s\S]*?\n  \}\n/.exec(page) || [""])[0];
  const els = {
    "next-fix-link": { href: "https://broadcastwell.com/answer-repair", textContent: "Fix this answer, $490" },
    "next-live-link": { href: "https://app.broadcastwell.com/signin?next=credits", textContent: "Ask a live question, $19" }
  };
  const el = (id) => els[id] || (els[id] = { id, textContent: "", classList: { toggle() {} } });
  const sandbox = { document: { getElementById: el }, hide() {}, out: null };
  vm.runInNewContext(fn + "\nout = renderNextSteps;", sandbox);
  const rows = (n) => Array.from({ length: 10 }, (_, i) => ({ question: "Q" + i, status: i < n ? "named" : "not named" }));
  sandbox.out({ named: 3, questions: rows(3) });
  assert.equal(els["score-next-link"].href, "https://broadcastwell.com/answer-repair");
  assert.equal(els["score-next-link"].textContent, "Fix this answer, $490");
  sandbox.out({ named: 10, questions: rows(10) });
  assert.equal(els["score-next-link"].href, "https://app.broadcastwell.com/signin?next=credits");
  assert.equal(els["score-next-link"].textContent, "Ask a live question, $19");
});

test("a bar graphic's table form and caption: right-aligned counts, escaped labels, base, date and source", () => {
  const html = R.table([{ label: "Acme <b>(you)</b>", count: 3, own: true }, { label: "Peer A", count: 10, own: false }], "Companies named, count of answers out of ten", "Company");
  assert.match(html, /^<table class="bw-table"><caption>Companies named, count of answers out of ten<\/caption><thead><tr><th scope="col">Company<\/th><th scope="col" class="bw-num">Answers, of 10<\/th><\/tr><\/thead>/);
  assert.match(html, /<tr><th scope="row">Acme &lt;b&gt;\(you\)&lt;\/b&gt;<\/th><td class="bw-num">3<\/td><\/tr><tr><th scope="row">Peer A<\/th><td class="bw-num">10<\/td><\/tr>/);
  assert.equal(R.table([], "Empty", "Company"), "");
  const caption = R.caption({ engine: "Claude", measured_on: "2026-10-20" }, { category: "crm software", counted: "named the company" });
  assert.equal(caption, 'Free 10-question check (one engine). Crm software. Answers captured 20 October 2026. Base: 10 buyer questions, one run on Claude; each bar counts the answers that named the company. Source: <a href="https://broadcastwell.com/methodology">the published method</a>.');
  assert.match(R.caption({ engine: "Perplexity", measured_on: "2026-09-01" }, { category: "x", counted: "cited the domain" }), /one run on Perplexity; each bar counts the answers that cited the domain\./);
  assert.match(R.caption({ engine: "Claude", measured_on: "2026-09-16" }, { category: "x", counted: "named the company", preview: true }), /^Fictional preview data for layout review\. /);
  assert.match(R.caption({ engine: "Claude", measured_on: "2026-09-16" }, { category: "<x>", counted: "named the company" }), /&lt;x&gt;/);
  assert.match(R.caption({ engine: "Claude", measured_on: "2026-13-01" }, { category: "x", counted: "named the company" }), /Answers captured 2026-13-01\./, "a date it cannot read is printed as given");
});

test("the sample label is plain secondary text, not an amber tag, and keeps its words", () => {
  const page = read("public/index.html");
  const own = page.slice(page.indexOf("/* brand: end */"));
  assert.match(own, /\.bw-ar__sample, \.bw-tag--sample \{ padding: 0; background: none; color: var\(--bw-color-ink-secondary\); \}/);
  assert.match(page, /<p class="bw-ar__sample">Sample data, fictional company<\/p>/);
});
