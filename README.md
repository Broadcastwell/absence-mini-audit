# absence-mini-audit

The free 10-question check at [audit.broadcastwell.com](https://audit.broadcastwell.com).

Ten buyer questions, Claude, one run. The visitor types a website, confirms the proposed
company and category, and receives a measurement report with its score, the companies
named instead, cited domains and all ten answers. The page keeps question preview,
private result links, offline image exports and optional email through the visitor's
own email app.

## What is in here

| Path | What it is |
|-|-|
| `public/` | The whole front end. One page, no external requests. |
| `public/assets/report.js` | Responsive company and citation charts, plain answer display and offline report images. |
| `public/assets/wheel.js` | The shortlist wheel, one dependency free module. Its contract is [WHEEL_CONTRACT.md](WHEEL_CONTRACT.md). |
| `lib/audit.js` | The request handler: validation, the three limits, the spend cap, and the response contract. It also routes the calls below. |
| `lib/analyze.js`, `lib/guard.js`, `lib/lexicon.js` | `POST /api/analyze`: reads the visitor's homepage and at most two more pages through the fetch guard, and proposes a name and a category from the lexicon. Free: it never calls the upstream. |
| `lib/seal.js`, `lib/link.js` | `POST /api/link`, `POST /api/unlink` and `GET /r/<id>`: private, noindex result links, made only on request, kept 30 days, only for a result this handler sealed, and deletable sooner by the browser that made them. |
| `lib/event.js` | `POST /api/event`: the daily funnel count. No personal data. |
| `functions/` | Entry points. Each does nothing but hand the request to `lib/audit.js`. |
| `scripts/build-page.mjs` | Inlines the wheel and report modules, embeds the export font and recomputes the CSP hashes. Run after editing the page. |
| `scripts/build-sample-wheel.mjs` | Rebuilds the Kalvenor sample wheel from the public sample endpoints. |
| `scripts/funnel.mjs` | Prints the daily funnel counts with the owner's own Cloudflare sign in. |
| `tests/` | The limit and contract suite, the analyze and guard suite, the wheel suite, the front door suite, the frame suite and the served copy suite (`tests/copy.test.mjs`: no word that reads as a closure, pause, cap or order count, and no retired offer, in anything served). `npm test`. |

## The response contract

Nine top-level fields are returned: `named`, `asked`, `tier`, `chapter`, `engine`,
`measured_on`, `questions`, `named_instead` and `cited_sources`. The first seven retain
their meanings. `asked` is ten. Tier and chapter are allowlisted, and a partial enriched
answer set or a count inconsistent with its marks is refused.

Each of the ten question rows carries its question, named boolean, readable status,
full plain answer, company names as written, cited domains and name-extraction status.
The handler drops private fields. The existing optional excerpt and vendor-list fields
remain readable for older results.

`named_instead` is an array of `{company, count}`, ordered highest first, excluding the
visitor's company under the same host-label matching rule as the measurement.
`cited_sources` is `{domains: [{domain, count}], own_site_cited}`. Each count is a number
of answers out of ten, and each domain is counted once per answer.

Legacy responses without these details still render their score. When questions are
absent, the handler rebuilds them from the published Index frame for its fourteen
covered categories, or the original ten-question frame for other categories, and uses
`not itemised` wherever a count cannot establish individual marks. Missing citation
detail remains unknown rather than being presented as zero.

The result seal covers full answers, company names and both aggregates as well as the
original score. Older seals remain verifiable. Saved links preserve the enriched
contract and remain noindex for their 30-day lifetime.

## The buy path

Every purchase control uses `https://broadcastwell.com/buy/audit`. The filled result
button reads "Start with the $490 Category Audit". A result-linked purchase carries
`fc=<result link id>` and the existing `client_reference_id=fc_<id>`. The visitor's
optional email is added only when typed. Creating a link is still explicit, except
that buying from a fresh result creates its link first with a four-second fallback.

The Category Audit is refundable in full within 30 days of delivery. The $490 credits
once against the $2,900 Fix Sprint within 30 days of delivery, so the Sprint is $2,410.
The Sprint is secondary text. The sample Audit is a text link to
`https://app.broadcastwell.com/sample`.

A visitor arriving with `?site=example.com` (the find-your-company box on broadcastwell.com)
or `?domain=example.com` has the website filled in and read at once. Reading is free; nothing
runs until they confirm.

## The frame

`/embed` is the same page in a compact mode, for the find-your-company box on
broadcastwell.com: the check alone, full width, with no site header, footer or long sections.
It serves the same bytes as `/` (`scripts/build-page.mjs` writes `public/embed.html`), so the
same hashes cover it, and it switches mode by path. Its headers differ in one directive:
`frame-ancestors` allows broadcastwell.com, its subdomains and Framer's hosts; every other path
still refuses all framing.

The frame reports its height to the parent page whenever it changes:

```js
{ type: 'broadcastwell:free-check:height', height: 1490 }
```

The height is `document.documentElement.getBoundingClientRect().height`, rounded up, so it is
never floored at the frame's current height. Every link that leaves the check opens in the top
window, so a checkout never loads inside the frame; links that already open a new tab (the
receipts and "ask the engine yourself") keep doing so. `tests/embed.test.mjs` holds all of this.

## Run time

The page states an approximate measured wait and returns a result only when all ten
answers are usable. The handler waits up to 90 seconds, with a 95 second browser
window so a slower complete run can finish. An incomplete run receives an
opaque 502, with a readable outcome and no provider details. The browser retries once
after 20 seconds, then offers a later retry and the Category Audit.

The first three failed attempts per network per UTC day refund their reserved allowance.
Further failures consume it, which bounds retries during an outage. A workflow credit
stop has a distinct allowance-used outcome and never becomes a bare error.

## Result links

`POST /api/link` returns the id, the link, its expiry, `reference` (`fc_` plus the id) and a
one-time `revoke_token`. The record keeps a SHA-256 of that token and never the token. The
page keeps the token in the visitor's own browser storage and shows "Delete this link";
`POST /api/unlink` with the id and the token deletes the record at once, after which the
link answers 404 with the expired state. Links made before this change carry no token and
are deleted on request by email.

## The limits

Held in the `config:limits` record in the key-value store, not in this
repository and not in environment variables, so every one changes without a
redeploy. Existing stored values override defaults, so a deployment must also update
the two run limits in the existing record.

| Limit | Key | Value |
|-|-|-|
| Runs per address per day | `per_address_per_day` | 1 |
| Runs per network per day | `per_ip_per_day` | 5 |
| Runs for the whole site per day | `global_per_day` | 60 |
| Website reads per network per day | `analyze_per_ip_per_day` | 10 |
| Website reads for the whole site per day | `analyze_global_per_day` | 150 |
| Result links per network per day | `link_per_ip_per_day` | 10 |
| Result links for the whole site per day | `link_global_per_day` | 40 |
| Funnel count writes per day | `funnel_writes_per_day` | 100 |

The last five are sized so that a full day of every counter stays inside the
key-value store's free daily write allowance.

The check runs from the category and the website alone, and the result is on
the page before any email is asked for. An email address is optional in the
request: when one is sent it is validated and held to the per address limit
under the same key as before; when none is sent, no address record is written
and the network and global limits are the ones that apply. The page itself
sends no address. Below the result it offers "Email me this result with its
sources", which opens the visitor's own mail app addressed to
hello@broadcastwell.com.

The global cap is checked first, so a breach there consumes nobody's personal
allowance. A refused request costs nothing beyond the counter read: no request
leaves this handler. That is what the suite proves.

## Bindings

| Binding | Kind | What it is |
|-|-|-|
| `AUDIT` | Key-value namespace | Counters and the limits record |
| `UPSTREAM_URL` | Secret | Where a permitted request goes |
| `UPSTREAM_TOKEN` | Secret | The shared secret it is called with |

Both secrets are set in the deployment platform and appear nowhere in this
repository, in any commit, or in anything a browser can see. The result seal is an
HMAC with a key derived from `UPSTREAM_TOKEN` under a fixed label, so no new secret
is needed and the token itself never leaves the handler.

## Author

Sairam Sivakumar, Broadcastwell.

Broadcastwell ran the measurement behind The Absence Manual and sells services
in the category it measures. Broadcastwell is excluded from its own sample and
from every ranking.

Site code MIT.
