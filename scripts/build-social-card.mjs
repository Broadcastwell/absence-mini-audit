/**
 * Builds the page's Open Graph image on brand system 3 (brief 8.6): 1200 by 630, from the page's
 * title and the answer record. The record is the fictional Kalvenor sample, drawn by the brand's
 * own function and labelled "Sample data, fictional company" beside it; no real company is drawn.
 *
 *   public/assets/absence-mini-audit-2026-11.svg   the card, Geist embedded
 *   public/assets/absence-mini-audit-2026-11.png   the same card drawn in a browser
 *
 * Run: node scripts/build-social-card.mjs   (after node scripts/build-page.mjs, which writes the
 * font rule). The PNG step needs Playwright: PLAYWRIGHT_MODULE may name its entry file and
 * CHROME_PATH a browser; without them the step says so and leaves the committed PNG unchanged.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = (path) => fileURLToPath(new URL("../" + path, import.meta.url));
await import("../public/assets/brand/answer-record.js");
await import("../public/assets/wheel.js");
const wheel = globalThis.BwWheel;
const sample = JSON.parse(readFileSync(root("public/assets/sample/kalvenor-wheel.json"), "utf8"));
const fontCss = readFileSync(root("public/assets/fonts/geist-embed.css"), "utf8");

const W = 1200, H = 630, PAD = 64;
const C = { paper: "#FFFFFF", ink: "#0B1220", secondary: "#4A5568", line: "#7F8BA0", accent: "#1D4ED8", notice: "#92400E" };
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const text = (x, y, value, size, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill || C.ink}" font-family="Geist, Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${o.weight || 400}">${esc(value)}</text>`;

const title = "Free 10-question check (one engine)";
const head = ["Find out whether Claude", "names your company in", "ten buyer questions."];
const drawn = wheel.draw(sample, { id: "og" });
const size = 400, wx = W - PAD - size, wy = 96;
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title + ". " + head.join(" ") + " " + drawn.alt)}">`,
  `<title>${esc(title)}</title>`,
  `<defs><style type="text/css">${fontCss}</style></defs>`,
  `<rect width="${W}" height="${H}" fill="${C.paper}"/><rect width="${W}" height="4" fill="${C.accent}"/>`,
  text(PAD, 104, "Broadcastwell", 25, { weight: 600 }),
  text(PAD, 168, title, 20, { fill: C.secondary, weight: 500 }),
  ...head.map((line, i) => text(PAD, 248 + i * 58, line, 49, { weight: 600 })),
  text(PAD, 452, "One run on one engine. No email needed.", 25, { fill: C.secondary }),
  drawn.svg.replace('<svg class="bw-ar__svg"', `<svg x="${wx}" y="${wy}" width="${size}" height="${size}" class="bw-ar__svg"`),
  text(wx + 64, 92, "Sample data, fictional company", 16, { fill: C.notice, weight: 600 }),
  text(wx + 64, 520, "Kalvenor Systems, five engines", 16, { fill: C.secondary }),
  `<rect x="0" y="${H - 72}" width="${W}" height="1" fill="${C.line}"/>`,
  text(PAD, H - 30, "audit.broadcastwell.com", 20, { weight: 600 }),
  "</svg>"
].join("");
writeFileSync(root("public/assets/absence-mini-audit-2026-11.svg"), svg + "\n");
console.log("Wrote public/assets/absence-mini-audit-2026-11.svg");

try {
  const where = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright";
  const { chromium } = await import(where);
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent("<html><body>" + svg + "</body></html>");
  await page.addStyleTag({ content: "body{margin:0;background:#FFFFFF}" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: root("public/assets/absence-mini-audit-2026-11.png"), clip: { x: 0, y: 0, width: W, height: H } });
  await browser.close();
  console.log("Wrote public/assets/absence-mini-audit-2026-11.png");
} catch (error) {
  console.log("PNG not drawn (" + (error && error.code === "ERR_MODULE_NOT_FOUND" ? "Playwright is not installed" : error.message) + ").");
}
