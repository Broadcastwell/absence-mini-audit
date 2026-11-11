/*
 * The shortlist wheel, drawn as the Broadcastwell answer record (brand system 3, brief 8.2).
 * This module turns the data contract in WHEEL_CONTRACT.md into an answer record and hands it
 * to the brand's own drawing function, BwAnswerRecord.draw, from assets/brand/answer-record.js
 * (a byte for byte copy of the brand package, checked against its VERSION.json). So the wheel
 * and every other surface draw the same marks for the same record: one ring per measured engine
 * in the fixed order from the center out, one spoke per buyer question, a filled mark where the
 * company was named, an open mark where it was not, and a short bar where there was no valid
 * answer. A one-engine Free 10-question check draws one ring. tests/wheel.test.mjs holds the parity.
 *
 * Runs in a browser and in Node, after assets/brand/answer-record.js. It defines BwWheel:
 *   BwWheel.validate(data)             list of problems, empty when the data is usable
 *   BwWheel.record(data)               the answer record the brand draws for the contract data
 *   BwWheel.draw(data, options)        the brand drawing: html, svg, table, legend, caption, alt
 *   BwWheel.svg(data, options)         the wheel form alone, as a standalone SVG string
 *   BwWheel.card(data, options)        a shareable image card, as an SVG string
 *   BwWheel.png(svg, width, height)    a PNG Blob of an SVG string (browser only)
 *   BwWheel.fromFreeCheck(result, ctx) contract data from a Free 10-question check result
 *   BwWheel.itemised(data)             true when every measured mark is named or not named
 *   BwWheel.enhance(figure)            wires the "Read as a table" control of a drawn record
 *
 * No style attributes and no inline event handlers, so the wheel can sit inside a page with
 * a strict Content-Security-Policy. Colors are presentation attributes from the brand palette.
 */
(function (root) {
  "use strict";

  // The contract's engine ids, in the brand's fixed order from the center out.
  var ENGINES = [
    { id: "chatgpt", label: "ChatGPT" },
    { id: "claude", label: "Claude" },
    { id: "perplexity", label: "Perplexity" },
    { id: "google_aio", label: "Google AI Overviews" },
    { id: "google_ai_mode", label: "Google AI Mode" }
  ];
  var FREE_CHECK = "Free 10-question check (one engine)";
  // Geist is the face the brand embeds in files that leave the browser (fontCss).
  var FONT = "Geist, Arial, Helvetica, sans-serif";

  // The brand palette, as brand/tokens.css defines it (the record's own marks carry the same values).
  var PALETTE = { paper: "#FFFFFF", ink: "#0B1220", inkSecondary: "#4A5568", line: "#7F8BA0", accent: "#1D4ED8", notice: "#92400E" };
  var SAMPLE_LABEL = "Sample data, fictional company";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // The brand's answer record (assets/brand/answer-record.js), read when it is needed, so the two
  // files may load in either order.
  function brand() {
    if (!root.BwAnswerRecord || typeof root.BwAnswerRecord.draw !== "function") throw new Error("BwWheel draws with the brand answer record: load assets/brand/answer-record.js first");
    return root.BwAnswerRecord;
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function num(value) { var rounded = Math.round(value * 100) / 100; return String(Object.is(rounded, -0) ? 0 : rounded); }
  function date(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : String(iso || "");
  }
  function list(items) { return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1]; }
  function circle(x, y, r) { return "M " + num(x - r) + " " + num(y) + " a " + num(r) + " " + num(r) + " 0 1 0 " + num(2 * r) + " 0 a " + num(r) + " " + num(r) + " 0 1 0 " + num(-2 * r) + " 0 Z"; }

  function validate(data) {
    var problems = [];
    if (!data || typeof data !== "object") return ["data must be an object"];
    if (!data.brand || typeof data.brand !== "string") problems.push("brand is required");
    if (!data.category || typeof data.category !== "string") problems.push("category is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.measured_on || ""))) problems.push("measured_on must be YYYY-MM-DD");
    if (!Array.isArray(data.engines) || data.engines.length !== 5) problems.push("engines must list the five engines");
    else {
      ENGINES.forEach(function (engine, i) {
        var given = data.engines[i] || {};
        if (given.id !== engine.id) problems.push("engine " + (i + 1) + " must be " + engine.id);
        if (typeof given.measured !== "boolean") problems.push("engine " + engine.id + " needs measured true or false");
      });
      if (!data.engines.some(function (engine) { return engine && engine.measured === true; })) problems.push("at least one engine must be measured");
    }
    if (!Array.isArray(data.spokes) || data.spokes.length < 3 || data.spokes.length > 12) problems.push("spokes must hold 3 to 12 questions");
    else data.spokes.forEach(function (spoke, i) {
      if (!spoke || !spoke.question) problems.push("spoke " + (i + 1) + " needs a question");
      if (!spoke || !spoke.type) problems.push("spoke " + (i + 1) + " needs a type");
      var named = (spoke && spoke.named) || {};
      Object.keys(named).forEach(function (id) {
        if (named[id] !== true && named[id] !== false && named[id] !== null) problems.push("spoke " + (i + 1) + " engine " + id + " must be true, false or null");
      });
    });
    ["release", "base", "source_url", "source_label"].forEach(function (key) {
      if (data[key] !== undefined && typeof data[key] !== "string") problems.push(key + " must be text");
    });
    // The brand's own rules for any record it draws (a client's record is never drawn, the
    // fictional company is always marked as the sample, the caption names its source).
    return problems.length ? problems : brand().validate(record(data));
  }

  function measuredEngines(data) {
    return ENGINES.filter(function (engine, i) { var given = data.engines[i]; return given && given.measured === true; });
  }

  /** The answer record for contract data: measured rings only, true named, false not named, null no valid answer. */
  function record(data) {
    var measured = measuredEngines(data);
    var label = measured.length === 1 ? measured[0].label : measured.length === 5 ? "five engines" : measured.length + " engines";
    var n = data.spokes.length;
    return {
      subject: data.brand,
      sample: data.sample === true,
      engines: measured.map(function (engine) { return engine.label; }),
      questions: data.spokes.map(function (spoke) {
        var marks = {};
        measured.forEach(function (engine) {
          var v = spoke.named ? spoke.named[engine.id] : null;
          marks[engine.label] = v === true ? "named" : v === false ? "not_named" : "unavailable";
        });
        return { text: spoke.question, marks: marks };
      }),
      caption: {
        release: data.release || (data.sample ? "Fictional measurement sample" : FREE_CHECK),
        category: data.category.charAt(0).toUpperCase() + data.category.slice(1),
        dates: [String(data.measured_on)],
        base: data.base || (n + " buyer questions, one run on " + label),
        source_url: data.source_url || (data.sample ? (data.sample_url || "https://app.broadcastwell.com/sample") : "https://broadcastwell.com/methodology"),
        source_label: data.source_label || (data.sample ? "the sample account" : "the published method")
      }
    };
  }

  function summary(data) {
    if (data.summary && Number.isInteger(data.summary.named) && Number.isInteger(data.summary.asked)) return data.summary;
    var named = 0, asked = 0;
    measuredEngines(data).forEach(function (engine) {
      data.spokes.forEach(function (spoke) {
        var v = spoke.named ? spoke.named[engine.id] : undefined;
        if (v === true) { named++; asked++; } else if (v === false) asked++;
      });
    });
    return { named: named, asked: asked };
  }

  function measuredLabel(data) {
    var measured = measuredEngines(data);
    if (measured.length === 1) return measured[0].label;
    return measured.length === 5 ? "Five engines" : measured.length + " engines";
  }

  /** The brand drawing of the contract data. Options: id (unique per page), animate, wide, note. */
  function draw(data, options) {
    var o = options || {};
    return brand().draw(record(data), { id: o.id || o.idPrefix || "bw-wheel", animate: o.animate === true, wide: o.wide === true, note: o.note });
  }

  // The wheel form as a standalone image: the brand's SVG with a namespace and a size.
  // Options: size (the square's side in px, default 720), id, fontCss (kept for files that leave
  // the browser; the wheel form itself draws no text).
  function standalone(data, o) {
    var size = (o && o.size) || 720;
    var svg = draw(data, o).svg;
    return svg.replace('<svg class="bw-ar__svg"', '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" class="bw-ar__svg"');
  }

  function text(x, y, value, o) {
    o = o || {};
    return '<text x="' + num(x) + '" y="' + num(y) + '" fill="' + (o.fill || PALETTE.ink) + '" font-family="' + FONT + '" font-size="' + num(o.size || 16) + '" font-weight="' + (o.weight || 400) + '" text-anchor="' + (o.anchor || "start") + '">' + esc(value) + "</text>";
  }
  // Geist's average advance is a little over half an em; close enough to keep text inside.
  function width(value, size, weight) { return String(value).length * size * (weight >= 600 ? 0.56 : 0.52); }
  function wrap(value, max, size, lines, weight) {
    var words = String(value).split(/\s+/), out = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + " " + words[i] : words[i];
      if (width(next, size, weight) > max && line) { out.push(line); line = words[i]; } else line = next;
    }
    if (line) out.push(line);
    if (out.length > lines) { out = out.slice(0, lines); out[lines - 1] = out[lines - 1].replace(/\s+\S*$/, "") + "…"; }
    return out;
  }
  // The legend marks, the same three shapes the record draws.
  function legendMark(state, x, y, s) {
    var c = PALETTE, r = 7 * s;
    if (state === "named") return '<path d="' + circle(x + r, y, r) + '" fill="' + c.accent + '"/>';
    if (state === "not_named") return '<path d="' + circle(x + r, y, r - 1.25 * s) + '" fill="' + c.paper + '" stroke="' + c.inkSecondary + '" stroke-width="' + num(2.5 * s) + '"/>';
    return '<path d="M ' + num(x + 1.5 * s) + " " + num(y) + " L " + num(x + 2 * r - 1.5 * s) + " " + num(y) + '" fill="none" stroke="' + c.inkSecondary + '" stroke-width="' + num(3 * s) + '" stroke-linecap="round"/>';
  }

  /**
   * A shareable card at any size, on the brand: the wheel form, the headline, the legend, the ring
   * order and a footer strip with the site, the offer name, the engine, the date and the caveat.
   * Options: width, height, fontCss (a CSS font face rule, so the file draws in Geist anywhere).
   */
  function card(data, options) {
    var o = options || {};
    var W = o.width || 1200, H = o.height || 630, c = PALETTE;
    var s = Math.min(W / 1200, H / 630) * (W / H < 1.4 ? 1.3 : 1);
    var foot = Math.round(Math.max(96, H * 0.16)), pad = Math.round(W * 0.05);
    var rec = record(data), drawn = draw(data, { id: "card" }), stats = drawn.stats, engine = measuredLabel(data);
    var kind = data.sample ? SAMPLE_LABEL : FREE_CHECK;
    var head = data.sample ? "A full shortlist wheel, five engines" : "Is " + data.brand + " on the AI shortlist?";
    var sub = data.sample
      ? "Kalvenor Systems is a fictional company. Named in " + stats.total.named + " of " + stats.total.of + " answers about " + data.category + "."
      : engine + " named " + data.brand + " in " + stats.total.named + " of " + stats.total.of + " buyer answers about " + data.category + ".";
    var out = ['<rect width="' + W + '" height="' + H + '" fill="' + c.paper + '"/>', '<rect width="' + W + '" height="' + num(4 * s) + '" fill="' + c.accent + '"/>'];
    var wide = W / H >= 1.4, wheelSize, wx, wy, colW, x = pad, y;
    if (wide) { wheelSize = H - foot - pad; wx = W - wheelSize - pad * 0.6; wy = (H - foot - wheelSize) / 2; colW = wx - pad * 1.6; }
    else { wheelSize = Math.min(W - pad * 2, (H - foot) * 0.52); wx = (W - wheelSize) / 2; colW = W - pad * 2; }
    var hs = 39 * s, bs = 20 * s, ks = 16 * s;
    y = pad + ks;
    out.push(text(x, y, kind, { size: ks, weight: 600, fill: data.sample ? c.notice : c.inkSecondary }));
    y += hs * 1.4;
    wrap(head, colW, hs, 3, 600).forEach(function (line) { out.push(text(x, y, line, { size: hs, weight: 600 })); y += hs * 1.12; });
    y += bs * 0.6;
    wrap(sub, colW, bs, 4).forEach(function (line) { out.push(text(x, y, line, { size: bs, fill: c.inkSecondary })); y += bs * 1.5; });
    if (!wide) { wy = y + 8 * s; }
    var inner = drawn.svg.replace('<svg class="bw-ar__svg"', '<svg x="' + num(wx) + '" y="' + num(wy) + '" width="' + num(wheelSize) + '" height="' + num(wheelSize) + '" class="bw-ar__svg"');
    out.push(inner);
    var ly = wide ? y + 24 * s : wy + wheelSize + 24 * s, words = { named: "Named", notNamed: "Not named", unavailable: "No valid answer" }, items = [["named", words.named], ["not_named", words.notNamed], ["unavailable", words.unavailable]];
    var lx = x;
    items.forEach(function (item) {
      out.push(legendMark(item[0], lx, ly - 5 * s, s), text(lx + 22 * s, ly, item[1], { size: ks, fill: c.inkSecondary }));
      if (wide) ly += 28 * s; else lx += (40 + width(item[1], 16)) * s;
    });
    var rings = "Rings from the center out: " + list(rec.engines) + ".";
    out.push(text(x, wide ? ly + 8 * s : ly + 30 * s, rings, { size: ks, fill: c.inkSecondary }));
    var fy = H - foot;
    out.push('<rect x="0" y="' + num(fy) + '" width="' + W + '" height="' + foot + '" fill="' + c.paper + '"/><rect x="0" y="' + num(fy) + '" width="' + W + '" height="1" fill="' + c.line + '"/>');
    var parts = data.sample
      ? ["broadcastwell.com", SAMPLE_LABEL, "Fictional measurement sample", "Five engines", "Measured " + date(data.measured_on)]
      : ["broadcastwell.com", FREE_CHECK, engine, "Measured " + date(data.measured_on)];
    var fsz = Math.max(16, Math.round(16 * Math.min(W / 1200, H / 630)));
    // The strip's facts are sentences, wrapped between facts, never inside one.
    var lines = [], current = "";
    parts.forEach(function (part) {
      var next = current ? current + " " + part + "." : part + ".";
      if (current && width(next, fsz, 600) > W - pad * 2) { lines.push(current); current = part + "."; } else current = next;
    });
    lines.push(current);
    var caveat = data.sample ? "Illustrative. Three measured runs per question and engine. Answers vary between runs." : "One run on one engine. Answers vary between runs.";
    var lead = fsz * 1.6, top = fy + (foot - lead * (lines.length + 1)) / 2 + fsz;
    lines.forEach(function (line, i) { out.push(text(pad, top + lead * i, line, { size: fsz, weight: 600 })); });
    out.push(text(pad, top + lead * lines.length, caveat, { size: fsz, fill: c.inkSecondary }));
    var title = drawn.alt;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(title) + '"><title>' + esc(title) + "</title>" + (o.fontCss ? '<defs><style type="text/css">' + o.fontCss + "</style></defs>" : "") + out.join("") + "</svg>";
  }

  /** Render an SVG string to a PNG Blob at an exact size. Browser only. */
  function png(svgText, w, h) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      var img = new Image();
      img.onload = function () {
        var paint = function () {
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) { URL.revokeObjectURL(url); if (blob) resolve(blob); else reject(new Error("png")); }, "image/png");
        };
        // An embedded face can land a frame after the image reports it has loaded.
        (img.decode ? img.decode().catch(function () {}) : Promise.resolve()).then(function () { setTimeout(paint, 120); });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }

  var TYPES = [["best_of", "Best of"], ["best_of", "Best of"], ["best_of", "Best of"], ["alternatives", "Alternatives"], ["alternatives", "Alternatives"], ["alternatives", "Alternatives"], ["comparison", "Comparison"], ["comparison", "Comparison"], ["evaluation", "Evaluation"], ["use_case", "Use case"]];

  /** Contract data from a Free 10-question check result and the brand and category the visitor confirmed. */
  function fromFreeCheck(result, ctx) {
    var rows = Array.isArray(result.questions) ? result.questions : [];
    var measuredId = String(result.engine).toLowerCase() === "claude" ? "claude" : "perplexity";
    return {
      version: 1,
      brand: ctx.brand || ctx.website || "Your company",
      category: ctx.category,
      website: ctx.website || "",
      measured_on: String(result.measured_on || "").slice(0, 10),
      sample: false,
      summary: { named: result.named, asked: result.asked },
      engines: ENGINES.map(function (e) { return { id: e.id, label: e.label, measured: e.id === measuredId }; }),
      spokes: rows.map(function (row, i) {
        var status = String(row.status || "");
        var named = {}; named[measuredId] = status === "named" ? true : status === "not named" ? false : null;
        return { question: row.question, type: (TYPES[i] || TYPES[9])[0], type_label: (TYPES[i] || TYPES[9])[1], named: named };
      })
    };
  }

  /** True when every measured mark is named or not named: a count that does not itemise is never drawn. */
  function itemised(data) {
    var measured = measuredEngines(data);
    return data.spokes.every(function (spoke) { return measured.every(function (engine) { var v = spoke.named ? spoke.named[engine.id] : null; return v === true || v === false; }); });
  }

  root.BwWheel = { ENGINES: ENGINES, validate: validate, record: record, draw: draw, svg: standalone, card: card, png: png, fromFreeCheck: fromFreeCheck, summary: summary, itemised: itemised, enhance: function (figure) { return brand().enhance(figure); }, date: date, SAMPLE_LABEL: SAMPLE_LABEL };
})(typeof globalThis !== "undefined" ? globalThis : this);
