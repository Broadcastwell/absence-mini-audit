# The shortlist wheel: data contract

The wheel is one dependency free module, [`public/assets/wheel.js`](public/assets/wheel.js),
served at `https://audit.broadcastwell.com/assets/wheel.js`. It turns one JSON object into
SVG. Any surface can adopt it: load the file, build the object below, call `BwWheel.svg` or
`BwWheel.card`.

Rings are engines, five of them, always in this order from the centre out: ChatGPT, Claude,
Perplexity, Google AI Overviews, Google AI Mode. Spokes are buyer questions. On a measured
ring a node is filled where the company was named, open where it was not, and dashed where
the answer did not say. A ring that was not measured is drawn as a faint outline, labelled
"Measured in the $490 Category Audit". The difference between the marks reads without colour.

## The object

```json
{
  "version": 1,
  "brand": "Kalvenor Systems",
  "category": "field service management software",
  "website": "kalvenor.example",
  "measured_on": "2026-07-12",
  "sample": true,
  "sample_url": "https://app.broadcastwell.com/sample",
  "summary": { "named": 13, "asked": 50 },
  "engines": [
    { "id": "chatgpt", "measured": true },
    { "id": "claude", "measured": true },
    { "id": "perplexity", "measured": true },
    { "id": "google_aio", "measured": true },
    { "id": "google_ai_mode", "measured": true }
  ],
  "spokes": [
    {
      "question": "What is field service management software?",
      "type": "shortlist",
      "type_label": "Shortlist",
      "named": { "chatgpt": false, "claude": true, "perplexity": false, "google_aio": false, "google_ai_mode": false },
      "named_instead": ["Northvale FSM", "Trakwell", "Orbit Field"]
    }
  ]
}
```

| Field | Required | Meaning |
|-|-|-|
| `version` | yes | `1`. A change that breaks a reader gets a new number. |
| `brand` | yes | The company, as it calls itself. Drawn in the centre. |
| `category` | yes | The category in a buyer's words, as the questions were asked. |
| `website` | no | The company's site. Shown on no image; kept for the reader. |
| `measured_on` | yes | `YYYY-MM-DD`, the day the answers were collected. |
| `sample` | yes | `true` for fictional SAMPLE DATA. Every image then says SAMPLE DATA and never names the free check. |
| `sample_url` | no | Where the sample can be inspected. |
| `summary` | no | `{ named, asked }` counts for the centre line. Leave it out and the module counts true and false nodes on measured rings; give it when the source reports a count it did not itemise. |
| `engines` | yes | Exactly five, in the order above, each `{ id, measured }`. |
| `spokes` | yes | 3 to 12 questions, drawn clockwise from the top in the order given. Adjacent spokes with the same `type_label` share an arc. |
| `spokes[].question` | yes | The question text, shown on hover, focus and in lists. |
| `spokes[].type` | yes | A short machine word for the question type, for example `best_of`, `alternatives`, `comparison`, `evaluation`, `use_case`, `shortlist`, `role`. |
| `spokes[].type_label` | no | The words drawn on the arc. Falls back to `type`. Sentence case. |
| `spokes[].named` | yes | Per engine id: `true` named, `false` not named, `null` measured but not itemised or excluded. An engine left out of the map on a measured ring is drawn as `null`. |
| `spokes[].named_instead` | no | Up to three names that were given instead. Not drawn on the wheel yet; kept so a reader can show them beside it. |

Counts only: the module never prints a percentage, a score or a grade.

## The calls

```js
BwWheel.validate(data)                  // [] when usable, else a list of problems
BwWheel.svg(data, options)              // the wheel alone, a square SVG string
BwWheel.card(data, { width, height })   // a shareable image with headline, key and footer strip
BwWheel.png(svgString, width, height)   // a Promise of a PNG Blob (browser only)
BwWheel.fromFreeCheck(result, { brand, category, website })  // from a Free 10-question check result
```

`svg` options: `size` (side in px, default 720), `interactive` (focusable nodes, each with an
`aria-label` naming its question and status), `idPrefix` (unique per wheel on a page),
`labelScale` (raise when the wheel is shown smaller than 720 px), `nodeScale` (raise on
phones), `compact` (a phone centre: the name and "N of 10 named" only), `fontCss` (a CSS font face rule; pass it for files that leave the browser so Inter
travels with them).

`card` draws a footer strip on every image: broadcastwell.com, "Free 10-question check (one
engine)", the engine, the measured date and "One run on one engine. Answers vary between
runs." A sample card says SAMPLE DATA and the sample's own caveat instead.

The module sets no style attribute and no event handler, so it works under a strict
Content-Security-Policy: presentation attributes only. Exporting a PNG needs `img-src blob:
data:` and nothing else.

## Free check mapping

A Free 10-question check result has ten questions in the upstream's fixed order: three best
of, three alternatives, two comparison, one evaluation, one use case. `fromFreeCheck` marks
only the Perplexity ring as measured, maps `named` to true, `not named` to false and any other
status to null, and carries the result's own counts in `summary`.

## Sample wheel

`node scripts/build-sample-wheel.mjs` rebuilds `public/assets/sample/kalvenor-wheel.json` and
`.svg` from the public sample endpoints on app.broadcastwell.com: ten of the sample's 35
questions across its four types, each node named when the company was named in at least two
of the three scheduled runs. Kalvenor Systems is fictional.
