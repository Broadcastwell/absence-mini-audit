import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The exact static route must ship a text asset rather than the site's HTML fallback.
const text = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
assert.match(text, /^# Broadcastwell free check\n/);
assert.doesNotMatch(text, /<!doctype|<html|<script|<body/i);
assert.match(text, /Free 10-question check \(one engine\)/);
assert.match(text, /visitor confirms them before the check runs/i);
assert.match(text, /one run on one engine.*Answers vary between runs/s);
assert.match(text, /when the engine returns them/);
for (const url of [
  "https://broadcastwell.com/category-audit",
  "https://broadcastwell.com/methodology",
  "https://broadcastwell.com/company-facts",
  "https://docs.broadcastwell.com/",
  "https://docs.broadcastwell.com/llms.txt"
]) assert.ok(text.includes(`](${url})`), `missing canonical link: ${url}`);
assert.doesNotMatch(text, /Diagnostic|AI Fact Check|buy\.stripe\.com|api\/run|n8n|API key|guaranteed|crawlers? (?:can|have|will)/i);
console.log("PASS llms.txt is a scoped, plain-text public asset with canonical sources");
