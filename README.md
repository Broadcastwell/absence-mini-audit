# absence-mini-audit

The free 10-question check at [audit.broadcastwell.com](https://audit.broadcastwell.com).

Ten buyer questions, one AI answer engine, no call. The visitor types a website; the
page reads it and proposes the company name and the category in a buyer's words; the
visitor confirms with one click and the check runs. The result is drawn as the shortlist
wheel, with the visitor's position on the absence ladder and the chapter of
[The Absence Manual](https://docs.broadcastwell.com/) that addresses it.

## What is in here

| Path | What it is |
|-|-|
| `public/` | The whole front end. One page, no external requests. |
| `public/assets/wheel.js` | The shortlist wheel, one dependency free module. Its contract is [WHEEL_CONTRACT.md](WHEEL_CONTRACT.md). |
| `lib/audit.js` | The request handler: validation, the three limits, the spend cap, and the response contract. It also routes the calls below. |
| `lib/analyze.js`, `lib/guard.js`, `lib/lexicon.js` | `POST /api/analyze`: reads the visitor's homepage and at most two more pages through the fetch guard, and proposes a name and a category from the lexicon. Free: it never calls the upstream. |
| `lib/seal.js`, `lib/link.js` | `POST /api/link` and `GET /r/<id>`: result links, made only on request, kept 30 days, only for a result this handler sealed. |
| `lib/event.js` | `POST /api/event`: the daily funnel count. No personal data. |
| `functions/` | Entry points. Each does nothing but hand the request to `lib/audit.js`. |
| `scripts/build-page.mjs` | Inlines the wheel into the page and recomputes the CSP hashes. Run after editing the page. |
| `scripts/build-sample-wheel.mjs` | Rebuilds the Kalvenor sample wheel from the public sample endpoints. |
| `scripts/funnel.mjs` | Prints the daily funnel counts with the owner's own Cloudflare sign in. |
| `tests/` | The limit and contract suite, the analyze and guard suite, the wheel suite and the front door suite. `npm test`. |

## The response contract

Seven keys, and no more. Two of them are allow-listed rather than copied, so an
upstream that returns an unrecognised ladder position or an off-manual link
produces an error rather than putting either in a browser.

```json
{
  "named": 0,
  "asked": 10,
  "tier": "named 0 of 10",
  "chapter": "/category-door/",
  "engine": "Perplexity",
  "measured_on": "2026-08-18",
  "questions": [
    { "question": "What is the best contractor payroll software?", "status": "not named" }
  ]
}
```

The four tiers are verbatim from
[the published classification rules](https://docs.broadcastwell.com/absence-rules/).
The chapter is one of `/category-door/`, `/comparison-gate/` or
`/absence-ladder/`.

`questions` always carries the ten questions when a result is returned. The upstream
answers with counts only, so the handler rebuilds the ten questions from the category
with the same wording the upstream uses. A status is stated only where the count
settles it: `not named` on all ten at named 0, `named` on all ten at named 10, and
`not itemised` on every row for any count in between. Rows the upstream supplies itself,
in the narrow expected shape, take precedence.

## The limits

Held in the `config:limits` record in the key-value store, not in this
repository and not in environment variables, so every one changes without a
redeploy.

| Limit | Key | Value |
|-|-|-|
| Runs per address per day | `per_address_per_day` | 1 |
| Runs per network per day | `per_ip_per_day` | 3 |
| Runs for the whole site per day | `global_per_day` | 100 |
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
