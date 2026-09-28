# CLAUDE.md: rules for every session in absence-mini-audit (audit.broadcastwell.com)

These rules come from the owner's standing brief (ZENITH, 28 Sep 2026). They override defaults. If a task conflicts with them, stop and say so.

## Money and secrets

- $0 new spend. No purchase, trial, upgrade, plan change, credit top-up, new paid API key, domain, seat or subscription. Free open-source packages from npm are not spend. Anything that asks for a card goes to the owner with the exact cost.
- A run of the check calls the upstream and costs money (about $0.15). Never run it from a session unless the owner's brief for that session allows a stated number of production runs, and count every one. Reading a website (`POST /api/analyze`) is free and never calls the upstream; use it for proofs.
- `UPSTREAM_URL` and `UPSTREAM_TOKEN` are production secrets. Never read, print, copy, rotate or create them, never open a `.dev.vars` or token file, and never add a secret to this repository.
- The limits live in the `config:limits` key-value record. Do not change them from a session.

## Lanes

- This repository is the free check and its `/embed` frame. The app (bw-client-data), the Framer site, bw-index-site, n8n, mailboxes and Stripe are other lanes. n8n is never edited, published or executed from here.
- Every purchase control goes to `https://broadcastwell.com/buy/<offer>`, never to a checkout address directly.

## The page

- One document, one inline script, one inline style block, each allowed by hash. After any edit to `public/index.html`, `public/assets/wheel.js` or `public/_headers`, run `node scripts/build-page.mjs`: it inlines the wheel, writes `public/embed.html` (the same bytes), and rewrites the hashes in every policy in `public/_headers` and in `lib/headers.js`. `npm test` fails on drift.
- `.gitattributes` pins LF; a hash covers exact bytes.
- `/embed` is the same page in compact mode, chosen by path. Its policy differs from the page's only in `frame-ancestors` (broadcastwell.com, its subdomains and Framer's hosts). It reports its height with `postMessage({type:'broadcastwell:free-check:height', height})`, measured on `document.documentElement.getBoundingClientRect().height`, never on a viewport-floored measure. Links leaving the check open in the top window.
- `?site=` (then `?domain=`) fills the website and reads it. Nothing runs until the visitor confirms.
- No external requests from the page beyond the favicon host already in the policy.

## Copy rules (every string a visitor can see)

- "Free 10-question check (one engine)", never "free audit". Prices: $490 Category Audit; $190 Index Brief; the Diagnostic ($990) shows Paused. Never "starting at", "from", or a percentage in sales copy.
- Five engines by name when all are meant: ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode.
- Never: em dashes, double hyphens, "founder-led", "early-stage", "startup", "studio", "boutique", "solo", "$1,500", "four engines", "120 observed answers", "free audit", "against the first month", "three month minimum", any model string, workflow ids, credential names, any guaranteed placement, any traffic or revenue result.
- One filled primary button per screen.

## Tests and deploy

- `npm test` (Node 24). Never weaken a test to make it pass. Add a test for every behaviour you add.
- Cloudflare Pages is Git connected: a pushed branch builds a preview at `<branch>.absence-mini-audit.pages.dev`; `main` builds production. Preview first, suite green, then production through a reviewed pull request. Record the deployment id and commit before and after every production change, and never leave production between two states.
