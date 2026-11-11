# The shortlist wheel: data contract

The wheel is one module, [`public/assets/wheel.js`](public/assets/wheel.js), served at
`https://audit.broadcastwell.com/assets/wheel.js`. It turns one JSON object into the
Broadcastwell answer record (brand system 3, brief 8.2) and draws it with the brand's own
function, `BwAnswerRecord.draw`, from
[`public/assets/brand/answer-record.js`](public/assets/brand/answer-record.js), a byte for byte
copy of the brand package checked against its `VERSION.json`. Any surface can adopt it: load
`assets/brand/answer-record.js`, then `assets/wheel.js`, build the object below, call
`BwWheel.draw`, `BwWheel.svg` or `BwWheel.card`. For the same record the wheel and every other
surface draw the same marks; `tests/wheel.test.mjs` holds that parity against
`vendor/brand/answer-record.mjs`.

Rings are engines, in this order from the center out: ChatGPT, Claude, Perplexity, Google AI
Overviews, Google AI Mode. Only measured engines get a ring, so a one-engine Free 10-question
check draws one ring. Spokes are buyer questions. A mark is filled where the company was named,
open where it was not, and a short bar where there was no valid answer. The three marks differ
in shape, so the record reads without color. Every drawing carries its legend, its caption (the
release, the category, the capture date, the base and the source) and a "Read as a table"
control; on a phone the table form replaces the wheel whenever its marks would be smaller than
8 pixels.

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
  "release": "Fictional measurement sample",
  "base": "10 of the sample's 35 buyer questions on each of the five engines, 50 question and engine pairs. Each pair had three runs, and a mark is filled where the company was named in at least 2 of its 3 runs",
  "source_label": "the sample account",
  "count_unit": "question and engine pairs",
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
| `brand` | yes | The company, as it calls itself. It is the record's subject. A client's record is never drawn. |
| `category` | yes | The category in a buyer's words, as the questions were asked. |
| `website` | no | The company's site. Shown on no image; kept for the reader. |
| `measured_on` | yes | `YYYY-MM-DD`, the day the answers were collected. |
| `sample` | yes | `true` for the fictional sample. Every drawing then says "Sample data, fictional company" beside the record and never names the free check. The fictional company is drawn only as the sample. |
| `sample_url` | no | Where the sample can be inspected; the caption's source for a sample. |
| `release`, `base`, `source_url`, `source_label` | no | The caption. Without them a free check reads "Free 10-question check (one engine)", "N buyer questions, one run on" the engine, and the published method; a sample reads "Fictional measurement sample" and the sample account. |
| `count_unit` | no | What one mark counts, when it is not one valid answer. The drawing then reads "named in N of M" followed by this unit instead of "valid answers", so the count agrees with its base. The sample sets "question and engine pairs": each mark sums three runs of one question on one engine. |
| `summary` | no | `{ named, asked }` counts kept from the source. Leave it out and the module counts true and false marks on measured rings. |
| `engines` | yes | Exactly five, in the order above, each `{ id, measured }`; at least one measured. |
| `spokes` | yes | 3 to 12 questions, drawn clockwise in the order given. |
| `spokes[].question` | yes | The question text, shown in the table form. |
| `spokes[].type` | yes | A short machine word for the question type, for example `best_of`, `alternatives`, `comparison`, `evaluation`, `use_case`, `shortlist`, `role`. |
| `spokes[].type_label` | no | The type in words, sentence case. Falls back to `type`. |
| `spokes[].named` | yes | Per engine id: `true` named, `false` not named, `null` no valid answer. An engine left out of the map on a measured ring is drawn as `null`. A count that does not itemise its questions is not a record: `BwWheel.itemised(data)` is false and the page draws nothing. |
| `spokes[].named_instead` | no | Up to three names that were given instead. Not drawn; kept so a reader can show them beside it. |

Counts only: the module never prints a percentage, a score or a grade.

## The calls

```js
BwWheel.validate(data)                  // [] when usable, else a list of problems (the brand's rules included)
BwWheel.record(data)                    // the answer record the brand draws for this data
BwWheel.draw(data, { id })              // the brand drawing: html, svg, table, legend, caption, alt, stats
BwWheel.svg(data, { size, id })         // the wheel form alone, a standalone square SVG string
BwWheel.card(data, { width, height, fontCss })  // a shareable image with headline, legend and footer strip
BwWheel.png(svgString, width, height)   // a Promise of a PNG Blob (browser only)
BwWheel.fromFreeCheck(result, { brand, category, website })  // from a Free 10-question check result
BwWheel.itemised(data)                  // true when every measured mark is named or not named
BwWheel.enhance(figure)                 // wires "Read as a table" and the phone rule; returns a cleanup
```

`card` draws a footer strip on every image, in sentences: broadcastwell.com, "Free 10-question
check (one engine)", the engine and the measured date, then "One run on one engine. Answers
vary between runs." A sample card says "Sample data, fictional company" and the sample's own
caveat instead. `fontCss` is a CSS font face rule; pass it for files that leave the browser so
Geist travels with them.

The module sets no style attribute and no event handler, so it works under a strict
Content-Security-Policy: presentation attributes from the brand palette only. Exporting a PNG
needs `img-src blob: data:` and nothing else.

## Free check mapping

A Free 10-question check result has ten questions in the upstream's fixed order: three best
of, three alternatives, two comparison, one evaluation, one use case. `fromFreeCheck` marks
the Claude ring as measured for current results, retains the measured ring for legacy results,
maps `named` to true, `not named` to false and any other status to null, and carries the
result's own counts in `summary`.

## Sample wheel

`node scripts/build-sample-wheel.mjs` rebuilds `public/assets/sample/kalvenor-wheel.json`,
`.svg` (the wheel form) and `.png` (the card at 1080 by 1080) from the public sample endpoints
on app.broadcastwell.com: ten of the sample's 35 questions across its four types, each mark
named when the company was named in at least two of the three scheduled runs. With `--json` it
redraws the images from the committed JSON and makes no request. Kalvenor Systems is fictional.
The page draws the same sample as an inline answer record at build time
(`scripts/build-page.mjs`).
