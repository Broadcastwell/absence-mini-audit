/**
 * Builds the Kalvenor sample wheel, a static asset, from the public sample endpoints.
 *
 * Kalvenor Systems is fictional SAMPLE DATA. This script reads the three scheduled runs of
 * the public sample baseline (its displacement view), picks ten of its thirty five questions
 * across its four question types, and marks each question and engine pair named when the
 * company was named in at least two of the three scheduled runs (null when fewer than two of
 * the three were scored, because an engine error excluded them). It writes:
 *
 *   public/assets/sample/kalvenor-wheel.json   the wheel data, in the WHEEL_CONTRACT.md shape
 *   public/assets/sample/kalvenor-wheel.svg    the wheel as a standalone image, Inter embedded
 *
 * Run: node scripts/build-sample-wheel.mjs
 *      node scripts/build-sample-wheel.mjs --from <folder>   reads displacement.json and
 *      runs.json saved from the same two endpoints instead of fetching them
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SAMPLE = "https://app.broadcastwell.com/api/sample/";
const BASELINE = "baseline-kalvenor-v11";
const SCHEDULED = ["run-1", "run-2", "run-3"];
// Ten of the sample's thirty five questions: three shortlist, two role, three use case and
// two evaluation, so every question type the sample measures has a spoke.
const PICK = [[1, "shortlist", "Shortlist"], [2, "shortlist", "Shortlist"], [3, "shortlist", "Shortlist"], [11, "role", "Role"], [15, "role", "Role"], [21, "use_case", "Use case"], [23, "use_case", "Use case"], [24, "use_case", "Use case"], [31, "evaluation", "Evaluation"], [32, "evaluation", "Evaluation"]];
const ENGINES = ["chatgpt", "claude", "perplexity", "google_aio", "google_ai_mode"];

const root = (path) => fileURLToPath(new URL("../" + path, import.meta.url));
const from = process.argv.indexOf("--from") !== -1 ? process.argv[process.argv.indexOf("--from") + 1] : null;

async function load(name, path) {
  if (from) return JSON.parse(readFileSync(from + "/" + name + ".json", "utf8"));
  const response = await fetch(SAMPLE + path, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("sample endpoint answered " + response.status);
  const body = await response.json();
  // The public route marks every body as the sample. Anything else is not what this script
  // is allowed to publish.
  if (body.sample !== true) throw new Error("the endpoint did not mark its body as the public sample");
  return body;
}

const displacement = await load("displacement", "baselines/" + BASELINE + "/displacement");
const runList = await load("runs", "runs");
const measured = runList.runs.filter((run) => run.baseline_id === BASELINE && SCHEDULED.includes(run.run_id)).map((run) => run.completed_at).sort().slice(-1)[0];
if (!measured) throw new Error("no scheduled run dates in the sample");

const spokes = PICK.map(([id, type, label]) => {
  const row = displacement.questions.find((q) => q.question_id === id);
  if (!row) throw new Error("question " + id + " missing from the sample");
  const named = {};
  for (const engine of ENGINES) {
    const answers = ((row.per_engine[engine] || {}).answers || []).filter((answer) => SCHEDULED.includes(answer.run_id));
    const yes = answers.filter((answer) => answer.status === "named").length;
    const scored = answers.filter((answer) => answer.status === "named" || answer.status === "not_named").length;
    named[engine] = scored < 2 ? null : yes >= 2;
  }
  return {
    question: row.question_text,
    type: type,
    type_label: label,
    named: named,
    named_instead: (row.competitors_found || []).slice().sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3).map((found) => found.name),
  };
});

const data = {
  version: 1,
  brand: "Kalvenor Systems",
  category: "field service management software",
  website: "kalvenor.example",
  measured_on: String(measured).slice(0, 10),
  sample: true,
  sample_url: "https://app.broadcastwell.com/sample",
  engines: ENGINES.map((id) => ({ id: id, measured: true })),
  spokes: spokes,
};

await import("../public/assets/wheel.js");
const wheel = globalThis.BwWheel;
const problems = wheel.validate(data);
if (problems.length) throw new Error("the sample does not fit the contract: " + problems.join("; "));

// The same fixed rule the page embeds in exported files, so one hash in the page's policy
// covers both. scripts/build-page.mjs writes it.
const fontCss = readFileSync(root("public/assets/fonts/inter-embed.css"), "utf8");

mkdirSync(root("public/assets/sample"), { recursive: true });
writeFileSync(root("public/assets/sample/kalvenor-wheel.json"), JSON.stringify(data, null, 2) + "\n");
writeFileSync(root("public/assets/sample/kalvenor-wheel.svg"), wheel.svg(data, { size: 720, fontCss: fontCss }) + "\n");
const sum = wheel.summary(data);
console.log("Kalvenor sample wheel: " + spokes.length + " spokes, named in " + sum.named + " of " + sum.asked + " answers, measured " + data.measured_on);
