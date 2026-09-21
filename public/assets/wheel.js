/*
 * The shortlist wheel. One dependency free module that turns the data contract in
 * WHEEL_CONTRACT.md into SVG: five rings for the engines, one spoke per buyer question,
 * a filled node where the company was named, an open node where it was not, and a dashed
 * node where the answer did not say.
 *
 * Runs in a browser and in Node. It defines one global, BwWheel:
 *   BwWheel.validate(data)             list of problems, empty when the data is usable
 *   BwWheel.svg(data, options)         the wheel alone, as an SVG string
 *   BwWheel.card(data, options)        a shareable image card, as an SVG string
 *   BwWheel.png(svg, width, height)    a PNG Blob of an SVG string (browser only)
 *   BwWheel.fromFreeCheck(result, ctx) contract data from a Free 10-question check result
 *
 * No style attributes and no inline event handlers, so the wheel can sit inside a page with
 * a strict Content-Security-Policy. Colours are presentation attributes.
 */
(function (root) {
  "use strict";

  var ENGINES = [
    { id: "chatgpt", label: "ChatGPT" },
    { id: "claude", label: "Claude" },
    { id: "perplexity", label: "Perplexity" },
    { id: "google_aio", label: "Google AI Overviews" },
    { id: "google_ai_mode", label: "Google AI Mode" }
  ];
  var C = { ground: "#0A0A0B", raised: "#0A0E1A", ink: "#F8FAFC", body: "#CBD5E1", muted: "#94A3B8", accent: "#1D4ED8", rule: "#3B82F6", pale: "#BFDBFE", faint: "rgba(203,213,225,0.22)", spoke: "rgba(203,213,225,0.12)" };
  var FONT = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  var UNMEASURED = "Measured in the $490 Category Audit";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function num(value) { return Math.round(value * 100) / 100; }
  function date(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : String(iso || "");
  }
  // Inter's average advance is a little over half an em; close enough to keep text inside.
  function width(text, size, weight) { return String(text).length * size * (weight >= 600 ? 0.56 : 0.52); }
  function fit(text, max, size, min, weight) {
    var s = size;
    while (s > min && width(text, s, weight) > max) s -= 1;
    var t = String(text);
    while (t.length > 4 && width(t, s, weight) > max) t = t.slice(0, -2).replace(/\s+$/, "") + "\u2026";
    return { text: t.replace(/\u2026\u2026$/, "\u2026"), size: s };
  }
  function wrap(text, max, size, lines) {
    var words = String(text).split(/\s+/), out = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + " " + words[i] : words[i];
      if (width(next, size) > max && line) { out.push(line); line = words[i]; } else line = next;
    }
    if (line) out.push(line);
    if (out.length > lines) { out = out.slice(0, lines); out[lines - 1] = fit(out[lines - 1] + "\u2026", max, size, size).text; }
    return out;
  }
  function text(x, y, value, o) {
    o = o || {};
    return '<text x="' + num(x) + '" y="' + num(y) + '" fill="' + (o.fill || C.ink) + '" font-family="' + FONT + '" font-size="' + (o.size || 14) + '" font-weight="' + (o.weight || 400) + '" text-anchor="' + (o.anchor || "start") + '"' + (o.knock ? ' stroke="' + o.knock + '" stroke-width="5" stroke-linejoin="round" paint-order="stroke"' : "") + (o.cls ? ' class="' + o.cls + '"' : "") + ">" + esc(value) + "</text>";
  }

  function validate(data) {
    var problems = [];
    if (!data || typeof data !== "object") return ["data must be an object"];
    if (!data.brand || typeof data.brand !== "string") problems.push("brand is required");
    if (!data.category || typeof data.category !== "string") problems.push("category is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.measured_on || ""))) problems.push("measured_on must be YYYY-MM-DD");
    if (!Array.isArray(data.engines) || data.engines.length !== 5) problems.push("engines must list the five engines");
    else ENGINES.forEach(function (engine, i) {
      var given = data.engines[i] || {};
      if (given.id !== engine.id) problems.push("engine " + (i + 1) + " must be " + engine.id);
      if (typeof given.measured !== "boolean") problems.push("engine " + engine.id + " needs measured true or false");
    });
    if (!Array.isArray(data.spokes) || data.spokes.length < 3 || data.spokes.length > 12) problems.push("spokes must hold 3 to 12 questions");
    else data.spokes.forEach(function (spoke, i) {
      if (!spoke || !spoke.question) problems.push("spoke " + (i + 1) + " needs a question");
      if (!spoke || !spoke.type) problems.push("spoke " + (i + 1) + " needs a type");
      var named = (spoke && spoke.named) || {};
      Object.keys(named).forEach(function (id) {
        if (named[id] !== true && named[id] !== false && named[id] !== null) problems.push("spoke " + (i + 1) + " engine " + id + " must be true, false or null");
      });
    });
    return problems;
  }

  function summary(data) {
    if (data.summary && Number.isInteger(data.summary.named) && Number.isInteger(data.summary.asked)) return data.summary;
    var named = 0, asked = 0;
    data.engines.forEach(function (engine) {
      if (!engine.measured) return;
      data.spokes.forEach(function (spoke) {
        var v = spoke.named ? spoke.named[engine.id] : undefined;
        if (v === true) { named++; asked++; } else if (v === false) asked++;
      });
    });
    return { named: named, asked: asked };
  }

  function measuredLabel(data) {
    var measured = data.engines.filter(function (e) { return e.measured; });
    if (measured.length === 1) return ENGINES.filter(function (e) { return e.id === measured[0].id; })[0].label;
    return measured.length === 5 ? "Five engines" : measured.length + " engines";
  }

  function statusWord(value) { return value === true ? "Named" : value === false ? "Not named" : "Not itemised"; }

  /**
   * The wheel alone. Options: size (the square's side in px, default 720), idPrefix,
   * interactive (focusable nodes with labels), x and y (to place it inside a card).
   */
  function svg(data, options) {
    var o = options || {};
    var size = o.size || 720, s = size / 720, cx = (o.x || 0) + size / 2, cy = (o.y || 0) + size / 2;
    // Label scale: 1 draws labels at their size in a 720 square; a wheel shown smaller
    // than that passes more so its words stay readable.
    var L = Math.max(0.8, Math.min(1.8, o.labelScale || 1));
    // Node scale: a wheel drawn small passes more, so its marks stay big enough to see and tap.
    var N = Math.max(1, Math.min(2, o.nodeScale || 1));
    var n = data.spokes.length, gap = 58, step = (360 - gap) / n;
    var radii = [128, 158, 188, 218, 248];
    var out = [];
    function at(angle, r) { var a = (angle - 90) * Math.PI / 180; return [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s]; }
    function angle(i) { return gap / 2 + step * (i + 0.5); }

    // Spokes first, under everything.
    for (var i = 0; i < n; i++) {
      var p1 = at(angle(i), 112), p2 = at(angle(i), 258);
      out.push('<line x1="' + num(p1[0]) + '" y1="' + num(p1[1]) + '" x2="' + num(p2[0]) + '" y2="' + num(p2[1]) + '" stroke="' + C.spoke + '" stroke-width="' + num(1 * s) + '"/>');
    }
    // Rings, drawn as arcs that leave the top open for their labels.
    data.engines.forEach(function (engine, k) {
      var r = radii[k], a = at(gap / 2 - 4, r), b = at(360 - gap / 2 + 4, r);
      var d = "M " + num(a[0]) + " " + num(a[1]) + " A " + num(r * s) + " " + num(r * s) + " 0 1 1 " + num(b[0]) + " " + num(b[1]);
      out.push(engine.measured
        ? '<path d="' + d + '" fill="none" stroke="' + C.rule + '" stroke-opacity="0.6" stroke-width="' + num(1.6 * s) + '"/>'
        : '<path d="' + d + '" fill="none" stroke="' + C.faint + '" stroke-width="' + num(1 * s) + '" stroke-dasharray="' + num(3 * s) + " " + num(5 * s) + '"/>');
      var label = ENGINES[k].label;
      out.push(text(cx, cy - r * s + 4 * s * L, label, { size: num((engine.measured ? 12 : 11) * s * L), weight: engine.measured ? 700 : 500, fill: engine.measured ? C.ink : C.muted, anchor: "middle", cls: "wheel-ring-label" }));
    });
    // Question type arcs outside the outer ring, with their labels.
    var groups = [];
    data.spokes.forEach(function (spoke, i2) {
      var last = groups[groups.length - 1];
      var label = spoke.type_label || spoke.type;
      if (last && last.label === label) last.end = i2; else groups.push({ label: label, start: i2, end: i2 });
    });
    function arc(a0, a1, r, reverse) {
      var p = at(reverse ? a1 : a0, r), q = at(reverse ? a0 : a1, r);
      return "M " + num(p[0]) + " " + num(p[1]) + " A " + num(r * s) + " " + num(r * s) + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " " + (reverse ? 0 : 1) + " " + num(q[0]) + " " + num(q[1]);
    }
    // The type labels run along their arcs, so a long label never leaves the square. Arcs in
    // the lower half run the other way, so no label is ever upside down.
    groups.forEach(function (g, gi) {
      var a0 = angle(g.start) - step / 2 + 2, a1 = angle(g.end) + step / 2 - 2, mid = (a0 + a1) / 2;
      var lower = mid > 95 && mid < 265, fs = 12 * L;
      out.push('<path d="' + arc(a0, a1, 270) + '" fill="none" stroke="' + C.rule + '" stroke-opacity="0.7" stroke-width="' + num(1.4 * s) + '"/>');
      var id = (o.idPrefix || "bw") + "-arc-" + gi;
      out.push('<path id="' + id + '" d="' + arc(a0 - 20, a1 + 20, lower ? 276 + fs * 0.78 : 277, lower) + '" fill="none"/>');
      out.push('<text class="wheel-arc-label" fill="' + C.body + '" font-family="' + FONT + '" font-size="' + num(fs * s) + '" font-weight="600" text-anchor="middle"><textPath href="#' + id + '" xlink:href="#' + id + '" startOffset="50%">' + esc(g.label) + "</textPath></text>");
    });
    // Question numbers inside the inner ring.
    for (var j = 0; j < n; j++) {
      var t = at(angle(j), 112);
      out.push(text(t[0], t[1] + 4 * s * L, String(j + 1), { size: num(10 * s * L), weight: 600, fill: C.muted, anchor: "middle" }));
    }
    // Nodes.
    data.engines.forEach(function (engine, k) {
      var r = radii[k];
      data.spokes.forEach(function (spoke, i3) {
        var c = at(angle(i3), r), x = num(c[0]), y = num(c[1]);
        if (!engine.measured) { out.push('<circle cx="' + x + '" cy="' + y + '" r="' + num(2.5 * s) + '" fill="' + C.faint + '"/>'); return; }
        var v = spoke.named ? spoke.named[engine.id] : null;
        if (v === undefined) v = null;
        var mark = v === true
          ? '<circle cx="' + x + '" cy="' + y + '" r="' + num(9 * s * N) + '" fill="' + C.rule + '" stroke="' + C.pale + '" stroke-width="' + num(1.5 * s * N) + '"/>'
          : v === false
            ? '<circle cx="' + x + '" cy="' + y + '" r="' + num(8 * s * N) + '" fill="' + C.ground + '" stroke="' + C.body + '" stroke-width="' + num(2 * s * N) + '"/>'
            : '<circle cx="' + x + '" cy="' + y + '" r="' + num(8 * s * N) + '" fill="' + C.ground + '" stroke="' + C.muted + '" stroke-width="' + num(1.5 * s * N) + '" stroke-dasharray="' + num(2.5 * s * N) + " " + num(2.5 * s * N) + '"/>';
        if (o.interactive) {
          var label = "Question " + (i3 + 1) + ", " + ENGINES[k].label + ": " + statusWord(v) + ". " + spoke.question;
          out.push('<g class="wheel-node" tabindex="0" role="img" data-spoke="' + i3 + '" data-engine="' + engine.id + '" aria-label="' + esc(label) + '"><circle cx="' + x + '" cy="' + y + '" r="' + num(14 * s * N) + '" fill="transparent"/>' + mark + "</g>");
        } else out.push(mark);
      });
    });
    // Centre.
    var sum = summary(data);
    // A wheel drawn at phone size keeps only what can be read there: the name and the count.
    if (o.compact) {
      var cb = fit(data.brand, 190 * s, 30 * s, 16 * s, 700);
      out.push(text(cx, cy - 26 * s, cb.text, { size: num(cb.size), weight: 700, anchor: "middle" }));
      out.push(text(cx, cy + 30 * s, sum.named + " of " + sum.asked, { size: num(52 * s), weight: 800, anchor: "middle" }));
      out.push(text(cx, cy + 62 * s, data.sample ? "named, SAMPLE DATA" : "named", { size: num(22 * s), fill: C.body, anchor: "middle" }));
      return out.join("");
    }
    // The centre holds four lines inside the inner ring's numbers, about 180 units across.
    var k = Math.min(L, 1.3), room = 176 * s;
    var brand = fit(data.brand, room, 22 * s * k, 12 * s, 700);
    var catSize = Math.max(10 * s, Math.min(12 * s * k, 12 * s * 1.15));
    var cat = wrap(data.category, room, catSize, 2);
    var namedLine = fit("Named in " + sum.named + " of " + sum.asked + " answers", room, 15 * s * k, 10 * s, 700);
    var dateLine = fit(measuredLabel(data) + ", " + date(data.measured_on), room, 11 * s * k, 9 * s, 400);
    var lh = catSize * 1.3, top = cy - (brand.size * 0.9 + cat.length * lh + namedLine.size * 1.5 + dateLine.size * 1.3 + (data.sample ? dateLine.size * 1.5 : 0)) / 2 + brand.size * 0.8;
    out.push(text(cx, top, brand.text, { size: num(brand.size), weight: 700, anchor: "middle" }));
    var y = top + brand.size * 0.35;
    cat.forEach(function (line) { y += lh; out.push(text(cx, y, line, { size: num(catSize), fill: C.body, anchor: "middle" })); });
    y += namedLine.size * 1.6;
    out.push(text(cx, y, namedLine.text, { size: num(namedLine.size), weight: 700, anchor: "middle" }));
    y += dateLine.size * 1.5;
    out.push(text(cx, y, dateLine.text, { size: num(dateLine.size), fill: C.muted, anchor: "middle" }));
    if (data.sample) out.push(text(cx, y + dateLine.size * 1.5, "SAMPLE DATA", { size: num(dateLine.size), weight: 700, fill: C.pale, anchor: "middle" }));
    return out.join("");
  }

  function wrapSvg(inner, w, h, title, fontCss) {
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(title) + '">' +
      "<title>" + esc(title) + "</title>" + (fontCss ? '<defs><style type="text/css">' + fontCss + "</style></defs>" : "") + inner + "</svg>";
  }

  function title(data) {
    var sum = summary(data);
    return "Shortlist wheel for " + data.brand + ", " + data.category + ": named in " + sum.named + " of " + sum.asked + " answers" + (data.sample ? " (SAMPLE DATA)" : "");
  }

  function legend(x, y, s, data, vertical) {
    var out = [], items = [["filled", "Named"], ["open", "Not named"]];
    if (data.spokes.some(function (sp) { return data.engines.some(function (e) { return e.measured && sp.named && sp.named[e.id] === null; }); })) items.push(["dashed", "Not itemised"]);
    if (data.engines.some(function (e) { return !e.measured; })) items.push(["ring", UNMEASURED]);
    var cx = x;
    items.forEach(function (item, i) {
      var ix = vertical ? x : cx, iy = vertical ? y + i * 26 * s : y;
      var mark = item[0] === "filled" ? '<circle cx="' + num(ix + 8 * s) + '" cy="' + num(iy - 5 * s) + '" r="' + num(7 * s) + '" fill="' + C.rule + '" stroke="' + C.pale + '" stroke-width="' + num(1.2 * s) + '"/>'
        : item[0] === "open" ? '<circle cx="' + num(ix + 8 * s) + '" cy="' + num(iy - 5 * s) + '" r="' + num(6.5 * s) + '" fill="none" stroke="' + C.body + '" stroke-width="' + num(1.8 * s) + '"/>'
          : item[0] === "dashed" ? '<circle cx="' + num(ix + 8 * s) + '" cy="' + num(iy - 5 * s) + '" r="' + num(6.5 * s) + '" fill="none" stroke="' + C.muted + '" stroke-width="' + num(1.4 * s) + '" stroke-dasharray="' + num(2 * s) + " " + num(2 * s) + '"/>'
            : '<line x1="' + num(ix) + '" y1="' + num(iy - 5 * s) + '" x2="' + num(ix + 18 * s) + '" y2="' + num(iy - 5 * s) + '" stroke="' + C.muted + '" stroke-width="' + num(1.2 * s) + '" stroke-dasharray="' + num(3 * s) + " " + num(3 * s) + '"/>';
      out.push(mark + text(ix + 24 * s, iy, item[0] === "ring" ? "Faint rings: " + item[1] : item[1], { size: num(13 * s), fill: C.body }));
      cx += (32 + width(item[1], 13) + (item[0] === "ring" ? 80 : 0) + 20) * s;
    });
    return out.join("");
  }

  /**
   * A shareable card at any size: the wheel, a short headline, the legend and a footer
   * strip that carries the site, the offer name, the engine, the date and the caveat.
   * Options: width, height, fontCss (a CSS font face rule, so the file draws in Inter
   * anywhere), sampleUrl (printed on sample cards).
   */
  function card(data, options) {
    var o = options || {};
    var W = o.width || 1200, H = o.height || 630;
    var s = Math.min(W / 1200, H / 630) * (W / H < 1.4 ? 1.35 : 1);
    var foot = Math.round(Math.max(72, H * 0.12));
    var out = ['<rect width="' + W + '" height="' + H + '" fill="' + C.ground + '"/>', '<rect width="' + W + '" height="' + Math.max(4, Math.round(H * 0.008)) + '" fill="' + C.rule + '"/>'];
    var sum = summary(data), engine = measuredLabel(data);
    var head = data.sample ? "A full shortlist wheel" : "Is " + data.brand + " on the AI shortlist?";
    var sub = data.sample
      ? "Kalvenor Systems is fictional. SAMPLE DATA from the $490 Category Audit sample."
      : engine + " named " + data.brand + " in " + sum.named + " of " + sum.asked + " buyer answers about " + data.category + ".";
    var pad = Math.round(W * 0.05);
    if (W / H >= 1.4) {
      var wheelSize = H - foot - pad * 0.9;
      var wx = W - wheelSize - pad * 0.6, wy = (H - foot - wheelSize) / 2 + 4;
      out.push(svg(data, { size: wheelSize, x: wx, y: wy, labelScale: Math.max(1.2, 720 / wheelSize), idPrefix: "card" }));
      var colW = wx - pad * 1.4, ts = Math.min(1.25, colW / 560);
      var hs = fit(head, colW, 40 * ts, 22 * ts, 700);
      var y = pad + 60 * ts;
      wrap(head, colW, hs.size, 3).forEach(function (line, i) { out.push(text(pad, y + i * hs.size * 1.15, line, { size: num(hs.size), weight: 700 })); y += 0; });
      y += wrap(head, colW, hs.size, 3).length * hs.size * 1.15 + 18 * ts;
      wrap(sub, colW, 20 * ts, 4).forEach(function (line, i) { out.push(text(pad, y + i * 28 * ts, line, { size: num(20 * ts), fill: C.body })); });
      y += wrap(sub, colW, 20 * ts, 4).length * 28 * ts + 36 * ts;
      out.push(legend(pad, y, ts, data, true));
    } else {
      var hs2 = Math.round(34 * s);
      var yy = pad + hs2;
      wrap(head, W - pad * 2, hs2, 2).forEach(function (line) { out.push(text(W / 2, yy, line, { size: hs2, weight: 700, anchor: "middle" })); yy += hs2 * 1.15; });
      wrap(sub, W - pad * 2, 17 * s, 2).forEach(function (line) { out.push(text(W / 2, yy + 4 * s, line, { size: num(17 * s), fill: C.body, anchor: "middle" })); yy += 24 * s; });
      var lg = 46 * s;
      // The wheel's square has empty corners above and below the rings, so it may run a
      // little past the space between the headline and the legend.
      var size2 = Math.min(W - pad * 1.2, (H - foot - yy - lg - pad * 0.4) / 0.86);
      out.push(svg(data, { size: size2, x: (W - size2) / 2, y: yy - size2 * 0.06, labelScale: Math.max(1.2, 720 / size2), idPrefix: "card" }));
      out.push(legend(pad, H - foot - pad * 0.45, s * 0.95, data, false));
    }
    // Footer strip.
    var fy = H - foot;
    out.push('<rect x="0" y="' + fy + '" width="' + W + '" height="' + foot + '" fill="' + C.raised + '"/><rect x="0" y="' + fy + '" width="' + W + '" height="1" fill="' + C.rule + '"/>');
    var parts = data.sample
      ? ["broadcastwell.com", "SAMPLE DATA, fictional company", "$490 Category Audit sample", "Five engines", "Measured " + date(data.measured_on)]
      : ["broadcastwell.com", "Free 10-question check (one engine)", engine, "Measured " + date(data.measured_on)];
    var fsz = Math.max(15, Math.round(16 * Math.min(W / 1200, H / 630)));
    var lines = [], current = "";
    parts.forEach(function (part) {
      var next = current ? current + "   \u00b7   " + part : part;
      if (current && width(next, fsz, 600) > W - pad * 2) { lines.push(current); current = part; } else current = next;
    });
    lines.push(current);
    var caveat = data.sample ? "Illustrative. Three measured runs per question and engine. Answers vary between runs." : "One run on one engine. Answers vary between runs.";
    var rows = lines.length + 1, gapY = foot / (rows + 0.9);
    lines.forEach(function (line, i) { out.push(text(pad, fy + gapY * (i + 1) + fsz * 0.35, line, { size: fsz, weight: 600, fill: C.ink })); });
    out.push(text(pad, fy + gapY * rows + fsz * 0.35, caveat, { size: fsz - 2, fill: C.muted }));
    return wrapSvg(out.join(""), W, H, title(data), o.fontCss);
  }

  /** Render an SVG string to a PNG Blob at an exact size. Browser only. */
  function png(svgText, w, h) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      var img = new Image();
      img.onload = function () {
        var draw = function () {
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) { URL.revokeObjectURL(url); if (blob) resolve(blob); else reject(new Error("png")); }, "image/png");
        };
        // An embedded face can land a frame after the image reports it has loaded.
        (img.decode ? img.decode().catch(function () {}) : Promise.resolve()).then(function () { setTimeout(draw, 120); });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }

  var TYPES = [["best_of", "Best of"], ["best_of", "Best of"], ["best_of", "Best of"], ["alternatives", "Alternatives"], ["alternatives", "Alternatives"], ["alternatives", "Alternatives"], ["comparison", "Comparison"], ["comparison", "Comparison"], ["evaluation", "Evaluation"], ["use_case", "Use case"]];

  /** Contract data from a Free 10-question check result and the brand and category the visitor confirmed. */
  function fromFreeCheck(result, ctx) {
    var rows = Array.isArray(result.questions) ? result.questions : [];
    return {
      version: 1,
      brand: ctx.brand || ctx.website || "Your company",
      category: ctx.category,
      website: ctx.website || "",
      measured_on: String(result.measured_on || "").slice(0, 10),
      sample: false,
      summary: { named: result.named, asked: result.asked },
      engines: ENGINES.map(function (e) { return { id: e.id, label: e.label, measured: e.id === "perplexity" }; }),
      spokes: rows.map(function (row, i) {
        var status = String(row.status || "");
        return { question: row.question, type: (TYPES[i] || TYPES[9])[0], type_label: (TYPES[i] || TYPES[9])[1], named: { perplexity: status === "named" ? true : status === "not named" ? false : null } };
      })
    };
  }

  root.BwWheel = { ENGINES: ENGINES, UNMEASURED: UNMEASURED, validate: validate, svg: function (data, o) { var size = (o && o.size) || 720; return wrapSvg(svg(data, o), size, size, title(data), o && o.fontCss); }, inner: svg, card: card, png: png, fromFreeCheck: fromFreeCheck, summary: summary, date: date };
})(typeof globalThis !== "undefined" ? globalThis : this);
