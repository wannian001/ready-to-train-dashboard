// Today › Training detail (app.R tabPanel "Training detail" and its server outputs):
//   training_load (+ _data) with the 8 / 12 weeks switch and training_load_callout (story_visuals.R): clicking a point
//     only INSPECTS that day, the selected day stays locked, "Open this day" opens the inspected one;
//   monthly_title, monthly_totals, monthly_types (+ _data), monthly_note (training.R monthly_training, visuals.R);
//   the energy ledger fold: battery_lede with the reader's own settings, the two numbers with the clamping note and
//     Reset, battery_plot (+ _data), battery_note (training.R battery_series / battery_agreement / battery_conclusion).
// The ledger depends on the two numbers and on which check-ins are visible, so it is computed here, exactly as R does
// (tests/training.test.mjs checks it against R); the sessions per month come from tools/export/training.R.
import { draw, esc, niceStep } from "../../kit/js/charts.js";
import { t, fmt, rround, signed, dayLabel, shortDate, monthLabel, monthShort, getLang, finite } from "../i18n.js";
import "../i18n/training.js";
import { addDays, diffDays, wday, indexOf, trainingLoadSeries, loadChangePct, LOAD_MIN_DAYS } from "../model.js";
import { metricHeading, cardTop, detailHeader, chartBox, dataTable, dayButton, evidenceTag, scopeChip } from "../ui.js";
import { loadAreaPerson } from "../data.js";

// ---- small helpers shared with the Steps section ---------------------------------------------------------------
// R's fmt()/formatC rounds half to even at exact halves; i18n.fmt rounds half up, so round like R first
export const fmtR = (x, digits = 0) => (finite(x) ? fmt(rround(x, digits), digits) : "—");
const titleCase = (s) => (getLang() === "en" ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);
// about how wide a label is (CJK characters are square, Latin ones about 0.56 em)
export const textW = (s, size = 11) => [...String(s)].reduce((w, ch) => w + (/[⺀-鿿＀-￯]/.test(ch) ? size : size * 0.56), 0);
// the empty state of a chart (visuals.R health_empty)
export const emptyChart = (w, h, text) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(text)}">
  <text x="${(w / 2).toFixed(1)}" y="${(h / 2).toFixed(1)}" text-anchor="middle" font-size="13" fill="var(--ink-3)">${esc(text)}</text></svg>`;
export const svgOpen = (w, h, label) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="group" aria-label="${esc(label)}">`;
const tipAttr = (s) => esc(s).replace(/\n/g, "&#10;");
export { tipAttr };
// an axis label centred on x but kept inside 0..w (the first and last labels of a padded axis would be cut)
export function axisLabel(x, y, text, w, size = 11) {
  const half = textW(text, size) / 2;
  const at = x - half < 1 ? 'x="1" text-anchor="start"' : x + half > w - 1 ? `x="${w - 1}" text-anchor="end"` : `x="${x.toFixed(1)}" text-anchor="middle"`;
  return `<text ${at} y="${y}" font-size="${size}" fill="var(--ink-3)">${esc(text)}</text>`;
}
// the Monday on or before a day (cut.Date weeks start on Monday, as ggplot's weekly date breaks do)
export const mondayOf = (iso) => addDays(iso, -((wday(iso) + 6) % 7));
// keeps the open/closed state of the "Show the data" folds and other <details> across re-renders
const openFolds = new Set();
export function keepFolds(el, prefix) {
  el.querySelectorAll("figure.chart-shell").forEach((fig) => {
    const box = fig.querySelector(".chart"), det = fig.querySelector("details.chart-data");
    if (!box || !det) return;
    const key = `${prefix}:${box.id}`;
    if (openFolds.has(key)) det.open = true;
    det.addEventListener("toggle", () => (det.open ? openFolds.add(key) : openFolds.delete(key)));
  });
}

// ---- training.R battery_series(): the energy ledger --------------------------------------------------------
// Start at 100 on the first recorded day; each day subtract what yesterday's session cost and add back a share of
// what is missing, clamped to 0–100. A day with no session, or a session with a blank load, costs 0 (and is flagged).
// `p` is the VISIBLE record (ctx.pv): the check-ins it is compared with stop before the selected day until Reveal.
export const BATTERY_DEFAULTS = { cost_per_100_load: 3, recovery_pct: 25 };
export function batterySeries(p, cost = BATTERY_DEFAULTS.cost_per_100_load, recovery = BATTERY_DEFAULTS.recovery_pct) {
  const n = p && p.n;
  if (!n) return null;
  const load = new Array(n).fill(0), reported = new Array(n).fill(false), unknown = new Array(n).fill(false);
  p.train.forEach((tr, date) => {
    const i = indexOf(p, date);
    if (i < 0) return;
    reported[i] = true; unknown[i] = !finite(tr.load); load[i] = finite(tr.load) ? tr.load : 0;
  });
  const level = new Array(n).fill(0), drain = new Array(n).fill(0), gain = new Array(n).fill(0);
  level[0] = 100;
  for (let i = 1; i < n; i++) {
    drain[i] = load[i - 1] / 100 * cost;            // yesterday's session is what costs you
    gain[i] = (100 - level[i - 1]) * recovery / 100;
    level[i] = Math.max(0, Math.min(100, level[i - 1] - drain[i] + gain[i]));
  }
  return p.dates.map((date, i) => ({
    date, level: level[i], drain: drain[i], gain: gain[i],
    load_prev: i ? load[i - 1] : 0, reported_prev: i ? reported[i - 1] : false, unknown_prev: i ? unknown[i - 1] : false,
    readiness: p.d.readiness[i] ?? null, soreness: p.d.soreness[i] ?? null,
  }));
}
const sd = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
function pearson(x, y) {
  const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
}
const Z975 = 1.959963984540054;
// battery_agreement(): the ledger against readiness and soreness (cor.test: r and its 95% interval)
export function batteryAgreement(series) {
  if (!series || !series.length) return null;
  const fit = (key) => {
    const x = [], y = [];
    series.forEach((r) => { if (finite(r.level) && finite(r[key])) { x.push(r.level); y.push(r[key]); } });
    const n = x.length;
    if (n < 30 || sd(x) < 1e-9 || sd(y) < 1e-9) return { n, r: NaN, lo: NaN, hi: NaN };
    const r = pearson(x, y), z = Math.atanh(r), s = 1 / Math.sqrt(n - 3);
    return { n, r, lo: Math.tanh(z - Z975 * s), hi: Math.tanh(z + Z975 * s) };
  };
  return { readiness: fit("readiness"), soreness: fit("soreness") };
}
// battery_conclusion(): both correlations side by side; one is called higher only when they differ by 0.1 or more
export function batteryConclusion(series, ag, who) {
  const why = (key, e) => {
    const lv = series.filter((r) => finite(r.level) && finite(r[key])).map((r) => r.level);
    return e.n < 30 ? t("trb.why_n", { n: e.n }) : sd(lv) < 1e-9 ? t("trb.why_flat") : t("trb.why_same");
  };
  const rr = ag.readiness.r, rs = ag.soreness.r;
  const wr = why("readiness", ag.readiness), ws = why("soreness", ag.soreness);
  if (!finite(rr) && !finite(rs)) return t("trb.c_none", { who, why: wr === ws ? wr : t("trb.both_why", { wr, ws }) });
  if (!finite(rr) || !finite(rs)) {
    const have = finite(rr) ? "readiness" : "soreness", miss = finite(rr) ? "soreness" : "readiness";
    return t("trb.c_one", { who, r: signed(finite(rr) ? rr : rs, 2), have: t(`trb.${have}`), miss: t(`trb.${miss}`), why: finite(rr) ? ws : wr });
  }
  const tail = Math.abs(rs - rr) < 0.1 ? t("trb.c_close") : t("trb.c_higher", { which: t(rs > rr ? "trb.soreness" : "trb.readiness"), d: fmtR(Math.abs(rs - rr), 2) });
  return t("trb.c_two", { who, rr: signed(rr, 2), rs: signed(rs, 2), tail });
}
// app.R in_range(): a number outside the range is clamped, a blank one falls back to the default
export function inRange(raw, lo, hi, fallback) {
  const v = typeof raw === "number" ? raw : parseFloat(raw);
  return finite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}

// ---- story_visuals.R: the training-load callout ---------------------------------------------------------------
export function loadWords(pct) {
  if (!finite(pct)) return t("trd.words.none");
  return t(`trd.words.${pct <= -50 ? -2 : pct <= -20 ? -1 : pct < 20 ? 0 : pct < 50 ? 1 : 2}`);
}
// day_view.R train_types_text(), title-cased as the R app writes it
export function typesText(tr) {
  const types = ["running", "endurance", "strength", "team"].filter((k) => tr[k]).map((k) => t(`type.${k}`));
  return titleCase(types.length ? types.join(" + ") : t("type.none"));
}
// training_load_callout(): the inspected day (or the selected one), never moving the selected day by itself
export function loadCallout(p, day, pick, span) {
  const z = trainingLoadSeries(p, day, span, p.first);
  const when = pick && z.some((r) => r.date === pick) ? pick : day;
  const r = z.find((x) => x.date === when), pct = loadChangePct(r);
  const tr = p.train.get(when);
  const thatDay = !tr ? t("trd.no_session") : finite(tr.load) ? t("trd.day_load", { types: typesText(tr), v: fmtR(tr.load) }) : t("trd.day_blank", { types: typesText(tr) });
  const locked = when === day;
  return {
    when, locked,
    date: t(locked ? "trd.selected" : "trd.inspecting", { day: dayLabel(when, { year: false }) }),
    words: loadWords(pct),
    pct: finite(pct) ? `${pct >= 0 ? "+" : "−"}${fmtR(Math.abs(pct))}%` : "—",
    facts: [
      finite(r.load7) ? t("trd.total", { v: fmtR(r.load7) }) : t("trd.total_none", { n: r.days7 }),
      finite(r.load28) ? t("trd.usual", { v: fmtR(r.load28) }) : t("trd.usual_none", { n: r.days28, min: LOAD_MIN_DAYS }),
      thatDay,
    ],
  };
}
function calloutHtml(c) {
  return `<div class="load-callout ${c.locked ? "locked" : "inspecting"}" role="status">
    <div class="load-callout-main"><span class="load-callout-date">${esc(c.date)}</span><strong>${esc(c.words)}</strong><span class="load-callout-pct">${esc(c.pct)}</span></div>
    <div class="load-callout-facts">${c.facts.map((f) => `<span>${esc(f)}</span>`).join("")}</div>
    ${c.locked ? "" : `<button type="button" class="btn load-open" data-day="${c.when}">${esc(t("trd.open"))}</button>`}</div>`;
}

// ---- story_visuals.R health_training_load_plot(): 7-day total (amber) against the 28-day weekly average (ink) ----
function loadChart(z, day, pick, w) {
  const H = 320, narrow = w < 480;
  const has7 = z.filter((r) => finite(r.load7)), has28 = z.filter((r) => finite(r.load28));
  if (!has7.length && !has28.length) return emptyChart(w, H, t("trd.empty"));
  const legendH = narrow ? 42 : 24;
  const m = { l: 58, r: 14, t: legendH + 14, b: 26 };
  const n = z.length - 1, pad = Math.max(0.6, 0.05 * n);
  const x = (i) => m.l + ((i + pad) / (n + 2 * pad)) * (w - m.l - m.r);
  const top = Math.max(1, ...has7.map((r) => r.load7), ...has28.map((r) => r.load28)) * 1.1;
  const y = (v) => H - m.b - (v / top) * (H - m.t - m.b);
  const out = [svgOpen(w, H, t("trd.chart"))];
  const step = niceStep(top, 4);
  for (let v = 0; v <= top + 1e-9; v += step) {
    out.push(`<line x1="${m.l}" x2="${w - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--c-grid)"/>`,
      `<text x="${m.l - 7}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink-3)" class="num">${esc(fmt(v, step < 1 ? 1 : 0))}</text>`);
  }
  out.push(`<text transform="translate(13 ${((m.t + H - m.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(t("trd.y"))}</text>`);
  // a date every week (Mondays), every two weeks at phone width, and further apart when the labels would touch
  const perDay = (x(1) - x(0)), longest = Math.max(...z.map((r) => textW(shortDate(r.date))));
  let every = narrow ? 14 : 7;
  while (every * perDay < longest + 10 && every < n) every += 7;
  const first = z[0].date;
  for (let d = mondayOf(first); diffDays(d, first) <= n + pad; d = addDays(d, every)) {
    const i = diffDays(d, first);
    if (i < -pad) continue;
    out.push(axisLabel(x(i), H - 7, shortDate(d), w));
  }
  const idx = new Map(z.map((r, i) => [r.date, i]));
  const pts = (rows, key) => rows.map((r) => `${x(idx.get(r.date)).toFixed(1)},${y(r[key]).toFixed(1)}`);
  if (has7.length) {
    const a = idx.get(has7[0].date), b = idx.get(has7[has7.length - 1].date);
    out.push(`<polygon points="${x(a).toFixed(1)},${y(0).toFixed(1)} ${pts(has7, "load7").join(" ")} ${x(b).toFixed(1)},${y(0).toFixed(1)}" fill="var(--c-load)" fill-opacity=".09"/>`);
  }
  // a line needs two points: a series with a single value so far is drawn as its point only
  if (has7.length >= 2) out.push(`<polyline points="${pts(has7, "load7").join(" ")}" fill="none" stroke="var(--c-load)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`);
  if (has28.length >= 2) out.push(`<polyline points="${pts(has28, "load28").join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`);
  else if (has28.length === 1) out.push(`<circle cx="${x(idx.get(has28[0].date)).toFixed(1)}" cy="${y(has28[0].load28).toFixed(1)}" r="2.6" fill="var(--ink)"/>`);
  const last = z[z.length - 1];
  has7.forEach((r) => {
    const cx = x(idx.get(r.date)).toFixed(1), cy = y(r.load7).toFixed(1);
    // the inspected point is drawn as a white ring with a thick ink edge (the R app's selection style)
    if (r.date === pick && pick !== day) out.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"/>`);
    else out.push(`<circle cx="${cx}" cy="${cy}" r="3.4" fill="var(--c-load)"/>`);
  });
  // the locked selected day: a large hollow ring at the right-hand end
  if (finite(last.load7)) out.push(`<circle cx="${x(n).toFixed(1)}" cy="${y(last.load7).toFixed(1)}" r="7.5" fill="var(--surface)" stroke="var(--c-load)" stroke-width="2.2"/>`);
  // hit targets: hover for the numbers, click (or Enter) to inspect
  has7.forEach((r) => {
    const tip = t("trd.tip7", { day: dayLabel(r.date), v: fmtR(r.load7) }) + (r.unknown7 > 0 ? t("trd.tip_blank", { n: r.unknown7 }) : "") + t("trd.tip_inspect");
    out.push(`<circle class="trd-hit" cx="${x(idx.get(r.date)).toFixed(1)}" cy="${y(r.load7).toFixed(1)}" r="9" fill="transparent" data-inspect="${r.date}"
      tabindex="0" role="button" aria-pressed="${r.date === pick}" aria-label="${esc(t("trd.point", { day: dayLabel(r.date) }))}" data-tip="${tipAttr(tip)}"/>`);
  });
  // legend at the top left (two rows at phone width)
  const k1 = t("trd.s7"), k2 = t("trd.s28");
  const lx2 = narrow ? m.l - 40 : m.l - 40 + 30 + textW(k1) + 18, ly2 = narrow ? 32 : 12;
  out.push(`<g font-size="11" fill="var(--ink-2)">
    <line x1="${m.l - 40}" x2="${m.l - 18}" y1="12" y2="12" stroke="var(--c-load)" stroke-width="2.4"/><circle cx="${m.l - 29}" cy="12" r="5" fill="var(--surface)" stroke="var(--c-load)" stroke-width="2"/>
    <text x="${m.l - 12}" y="16">${esc(k1)}</text>
    <line x1="${lx2}" x2="${lx2 + 22}" y1="${ly2}" y2="${ly2}" stroke="var(--ink)" stroke-width="2.4"/><text x="${lx2 + 28}" y="${ly2 + 4}">${esc(k2)}</text></g>`);
  out.push("</svg>");
  return out.join("");
}
// training_load_table()
function loadTable(z) {
  return dataTable(t("trd.table", { min: LOAD_MIN_DAYS }),
    [t("trd.h.date"), t("trd.h.load7"), t("trd.h.load28"), t("trd.h.days28"), t("trd.h.blank7"), t("trd.h.blank28")],
    z.map((r) => [dayButton(r.date), esc(fmtR(r.load7)), esc(fmtR(r.load28)), esc(t("trd.of28", { n: r.days28 })), String(r.unknown7), String(r.unknown28)]));
}

// ---- sessions per month (visuals.R health_monthly_totals / health_monthly_types, accessibility.R monthly_table) ----
const TYPE_KEYS = ["running", "endurance", "strength", "team", "untyped"];
const monthsBetween = (a, b) => { const out = []; let y = +a.slice(0, 4), mo = +a.slice(5, 7); for (;;) { const iso = `${y}-${String(mo).padStart(2, "0")}-01`; if (iso > b) break; out.push(iso); if (++mo > 12) { mo = 1; y++; } } return out; };
const partial = (r) => finite(r.days_covered) && r.days_covered < r.days_in_month;
function monthlyTotals(m, w) {
  const H = 230;
  if (!m.length) return emptyChart(w, H, t("trm.none"));
  const months = monthsBetween(m[0].month, m[m.length - 1].month), by = new Map(m.map((r) => [r.month, r]));
  const pad = { l: 48, r: 10, t: 20, b: 26 };
  const cap = Math.max(1, ...m.map((r) => r.sessions)), top = cap * 1.2;
  const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const slot = (w - pad.l - pad.r) / months.length, bw = Math.min(90, slot * 0.66);
  const out = [svgOpen(w, H, t("trm.totals"))];
  const step = niceStep(top, 4);
  for (let v = 0; v <= top + 1e-9; v += step) out.push(`<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--c-grid)"/>`,
    `<text x="${pad.l - 7}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink-3)" class="num">${fmt(v, step < 1 ? 1 : 0)}</text>`);
  out.push(`<text transform="translate(13 ${((pad.t + H - pad.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(t("trm.y"))}</text>`);
  months.forEach((mo, i) => {
    const cx = pad.l + slot * (i + 0.5);
    out.push(`<text x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(monthShort(mo))}</text>`);
    const r = by.get(mo);
    if (!r) return;
    const part = partial(r);
    const tip = t("trm.tip", { month: monthLabel(mo), n: r.sessions, h: rround(r.minutes / 60) }) + (part ? t("trm.tip_partial", { c: r.days_covered, d: r.days_in_month }) : "");
    out.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${y(r.sessions).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(r.sessions)).toFixed(1)}" rx="3"
      fill="${part ? "var(--ink-3)" : "var(--ink-2)"}" fill-opacity="${part ? 0.42 : 1}" data-tip="${tipAttr(tip)}"/>`,
      `<text x="${cx.toFixed(1)}" y="${(y(r.sessions) - 5).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink)" class="num">${r.sessions}${part ? "*" : ""}</text>`);
  });
  out.push("</svg>");
  return out.join("");
}
function monthlyTypes(m, w) {
  const H = 230;
  if (!m.length) return emptyChart(w, H, t("trm.none_types"));
  const months = monthsBetween(m[0].month, m[m.length - 1].month), by = new Map(m.map((r) => [r.month, r]));
  const labels = TYPE_KEYS.map((k) => t(`trm.type.${k}`));
  const lw = Math.max(...labels.map((s) => textW(s, 11))) + 12;
  const pad = { l: lw, r: 4, t: 4, b: 26 };
  const rowH = (H - pad.t - pad.b) / TYPE_KEYS.length, slot = (w - pad.l - pad.r) / months.length;
  const counts = m.flatMap((r) => TYPE_KEYS.map((k) => r[k]));
  const lo = Math.min(...counts), hi = Math.max(...counts);
  const out = [svgOpen(w, H, t("trm.types"))];
  TYPE_KEYS.forEach((k, j) => {
    const cy = pad.t + rowH * (j + 0.5);
    out.push(`<text x="${lw - 8}" y="${(cy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink)">${esc(labels[j])}</text>`);
    months.forEach((mo, i) => {
      const r = by.get(mo);
      if (!r) return;
      const c = r[k], f = hi > lo ? (c - lo) / (hi - lo) : 0.5, cx = pad.l + slot * (i + 0.5);
      const tw = slot * 0.87, th = rowH * 0.9;
      out.push(`<rect x="${(cx - tw / 2).toFixed(1)}" y="${(cy - th / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="2"
        fill="var(--ink-2)" fill-opacity="${(0.06 + 0.84 * f).toFixed(3)}" data-tip="${tipAttr(t("trm.type_tip", { month: monthLabel(mo), type: labels[j], n: c }))}"/>`,
        `<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="11" class="num" fill="${c > hi * 0.55 ? "var(--surface)" : "var(--ink)"}" pointer-events="none">${c}</text>`);
    });
  });
  months.forEach((mo, i) => out.push(`<text x="${(pad.l + slot * (i + 0.5)).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(monthShort(mo))}</text>`));
  out.push("</svg>");
  return out.join("");
}
// label: which chart the table belongs to, so the two copies have different names for screen readers
function monthlyTable(m, label) {
  if (!m.length) return `<p class="empty-note">${esc(t("trm.none_note"))}</p>`;
  const num = (v) => (Number.isInteger(v) ? fmt(v) : String(v));
  return dataTable(`${label} · ${t("trm.table")}`,
    [t("trm.h.month"), t("trm.h.days"), t("trm.h.sessions"), t("trm.h.minutes"), t("trm.h.load"), t("trm.h.blank"), t("trm.h.rpe"),
      ...["running", "endurance", "strength", "team"].map((k) => t(`trm.type.${k}`)), t("trm.h.untyped")],
    m.map((r) => [esc(monthLabel(r.month)), finite(r.days_covered) ? `${r.days_covered}/${r.days_in_month}` : "—", String(r.sessions), String(r.minutes),
      esc(num(r.load)), String(r.load_unknown), esc(viewValue(r.rpe)),
      String(r.running), String(r.endurance), String(r.strength), String(r.team), String(r.untyped)]));
}
// app.R output$monthly_note
export function monthlyNote(m, who) {
  if (!m.length) return null;
  const busiest = m.reduce((b, r) => (r.sessions > b.sessions ? r : b), m[0]);   // which.max: the first of a tie
  return t("trm.note", { id: who, n: m.reduce((s, r) => s + r.sessions, 0), month: monthLabel(busiest.month), k: busiest.sessions });
}

// ---- visuals.R health_battery_plot(): the ledger as a model (blue), never as a reading ----------------------------
function batteryChart(g, day, w) {
  const H = 260;
  if (!g || !g.length) return emptyChart(w, H, t("trb.empty"));
  const m = { l: 50, r: 12, t: 10, b: 24 };
  const n = g.length - 1, pad = Math.max(0.6, 0.05 * n), first = g[0].date;
  const x = (i) => m.l + ((i + pad) / (n + 2 * pad)) * (w - m.l - m.r);
  const y = (v) => H - m.b - ((v + 8) / 112) * (H - m.t - m.b);
  const out = [svgOpen(w, H, t("trb.chart"))];
  for (let v = 0; v <= 100; v += 25) out.push(`<line x1="${m.l}" x2="${w - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--c-grid)"/>`,
    `<text x="${m.l - 7}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink-3)" class="num">${v}</text>`);
  out.push(`<text transform="translate(13 ${((m.t + H - m.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(t("trb.y"))}</text>`);
  // a label at the first of each month (inside the padded range, as ggplot's monthly breaks)
  const lastDay = g[n].date;
  for (let mo = `${addDays(first, -Math.ceil(pad)).slice(0, 7)}-01`; mo <= addDays(lastDay, Math.ceil(pad)); mo = addDays(mo, 32).slice(0, 8) + "01") {
    const i = diffDays(mo, first);
    if (i < -pad || i > n + pad) continue;
    out.push(axisLabel(x(i), H - 7, monthShort(mo), w));
  }
  const line = g.map((r, i) => `${x(i).toFixed(1)},${y(r.level).toFixed(1)}`);
  out.push(`<polygon points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${line.join(" ")} ${x(n).toFixed(1)},${y(0).toFixed(1)}" fill="var(--c-expected)" fill-opacity=".12"/>`,
    `<polyline points="${line.join(" ")}" fill="none" stroke="var(--c-expected)" stroke-width="1.8" stroke-linejoin="round"/>`);
  // triangles under the axis: the day before's load (bigger = more), hollow = a session with a blank load
  const trained = g.filter((r) => r.load_prev > 0), loads = trained.map((r) => r.load_prev);
  const lo = Math.min(...loads), hi = Math.max(...loads);
  const tri = (cx, s, filled) => `<path d="M${cx.toFixed(1)} ${(y(-4) - s * 0.62).toFixed(1)} l${(s * 0.58).toFixed(1)} ${s.toFixed(1)} h${(-s * 1.16).toFixed(1)}z"
    ${filled ? 'fill="var(--ink-2)" fill-opacity=".8"' : 'fill="none" stroke="var(--ink-2)" stroke-width="1"'}/>`;
  g.forEach((r, i) => {
    if (r.load_prev > 0) out.push(tri(x(i), 2.6 + 7.2 * Math.sqrt(hi > lo ? (r.load_prev - lo) / (hi - lo) : 0.5), true));
    if (r.unknown_prev) out.push(tri(x(i), 5.2, false));
  });
  if (day >= first && day <= lastDay) {
    const fx = x(diffDays(day, first)).toFixed(1);
    out.push(`<line x1="${fx}" x2="${fx}" y1="${m.t}" y2="${H - m.b}" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="1.5 3"/>`);
  }
  // one column per day: hover for the numbers, click to open that day (the table below has the same days as buttons)
  const cw = (x(1) - x(0));
  g.forEach((r, i) => {
    const before = !r.reported_prev ? t("trb.tip_none") : r.unknown_prev ? t("trb.tip_blank") : t("trb.tip_load", { l: fmtR(r.load_prev), d: fmtR(r.drain, 1) });
    const tip = t("trb.tip", { day: dayLabel(r.date), v: fmtR(r.level, 1), before, g: fmtR(r.gain, 1) })
      + (finite(r.readiness) ? t("trb.tip_ready", { r: r.readiness }) : "") + t("trb.tip_open");
    out.push(`<rect x="${(x(i) - cw / 2).toFixed(1)}" y="${m.t}" width="${cw.toFixed(2)}" height="${H - m.t - m.b}" fill="transparent" data-day="${r.date}" data-tip="${tipAttr(tip)}"/>`);
  });
  out.push("</svg>");
  return out.join("");
}
// accessibility.R battery_table(): days after a reported session and the start of each week
const viewValue = (x, d = 1) => (finite(x) ? rround(x, d).toFixed(d) : t("trb.no_record"));
function batteryTable(g) {
  if (!g || !g.length) return `<p class="empty-note">${esc(t("trb.empty_note"))}</p>`;
  const rows = g.filter((r, i) => r.reported_prev || i % 7 === 0);
  return dataTable(t("trb.table"), [t("trb.h.date"), t("trb.h.before"), t("trb.h.used"), t("trb.h.gain"), t("trb.h.level"), t("trb.h.ready")],
    rows.map((r) => [dayButton(r.date),
      esc(!r.reported_prev ? t("trb.c.none") : r.unknown_prev ? t("trb.c.blank") : t("trb.c.load", { v: rround(r.load_prev) })),
      esc(viewValue(r.drain)), esc(viewValue(r.gain)), esc(viewValue(r.level)), finite(r.readiness) ? `${r.readiness}/10` : "—"]));
}
export const batteryRows = (g) => g.filter((r, i) => r.reported_prev || i % 7 === 0).map((r) => r.date);

// ---- module state (kept across re-renders) --------------------------------------------------------------------------
let span = 56;                                   // the 8 / 12 weeks switch
let pick = null;                                 // { key, day }: the inspected day, reset when the participant, day or range changes
let costRaw = String(BATTERY_DEFAULTS.cost_per_100_load), recRaw = String(BATTERY_DEFAULTS.recovery_pct);
let ledgerOpen = false;
const pickKey = (ctx) => `${ctx.id}|${ctx.focus}|${span}`;
const picked = (ctx) => (pick && pick.key === pickKey(ctx) ? pick.day : null);
const settings = (study) => {
  const d = (study && study.battery_defaults) || BATTERY_DEFAULTS;
  const cost = inRange(costRaw, 1, 10, d.cost_per_100_load), rec = inRange(recRaw, 5, 60, d.recovery_pct);
  const asNum = (raw) => parseFloat(raw);
  return { cost, rec, clamped: !(asNum(costRaw) === cost && asNum(recRaw) === rec), defaults: d };
};

// the parts of the ledger that follow the two numbers (redrawn in place while typing, so the input keeps focus)
function ledgerLede(s) {
  return `<p class="chart-lede"><strong>${esc(t("trb.what_t"))}</strong> ${esc(t("trb.what"))}</p>
    <p class="chart-lede"><strong>${esc(t("trb.rule_t"))}</strong> ${esc(t("trb.rule", { cost: fmtR(s.cost, 1), c350: fmtR(3.5 * s.cost, 1), rec: fmtR(s.rec, 0), g60: fmtR((40 * s.rec) / 100, 0) }))}</p>`;
}
function ledgerNote(ctx, g, s) {
  if (!g) return `<p class="empty-note">${esc(t("trb.empty_note"))}</p>`;
  const ag = batteryAgreement(g);
  return `${s.clamped ? `<p class="forecast-stale-note">${esc(t("trb.clamped", { cost: fmtR(s.cost, 1), rec: fmtR(s.rec, 0) }))}</p>` : ""}
    <p class="comparison-conclusion">${esc(batteryConclusion(g, ag, ctx.pid))}</p>
    <p class="fine-print">${esc(t("trb.fine"))}</p>`;
}
const ledgerChartBox = (g) => chartBox("trb-plot", { label: t("trb.chart"), hint: t("trb.hint"), height: 260, table: batteryTable(g) });

export default {
  load: (ctx) => loadAreaPerson("training", ctx.id).catch(() => ({ monthly: [] })),

  render(ctx, data) {
    const { person: p, focus } = ctx;
    const z = trainingLoadSeries(p, focus, span, p.first);
    const c = loadCallout(p, focus, picked(ctx), span);
    const ink = t(ctx.dark ? "trd.ink_dark" : "trd.ink");
    const seg = `<div class="trd-range" role="group" aria-label="${esc(t("trd.range"))}"><span>${esc(t("trd.range"))}</span><div class="seg">
      ${[[56, "trd.w8"], [84, "trd.w12"]].map(([v, k]) => `<button type="button" data-span="${v}" aria-pressed="${span === v}">${esc(t(k))}</button>`).join("")}</div></div>`;
    const trend = `<section class="health-card rolling-load-card">
      ${cardTop(metricHeading("compare", esc(t("trd.trend")), "model"), scopeChip(t("trd.scope")), seg)}
      <p class="chart-lede">${esc(t("trd.trend_lede", { ink, inkl: getLang() === "en" ? ink.toLowerCase() : ink }))}</p>
      <div class="trd-callout">${calloutHtml(c)}</div>
      ${chartBox("trd-load", { label: t("trd.chart"), hint: t("trd.hint"), height: 320, table: loadTable(z) })}</section>`;

    const m = (data && data.monthly) || [];
    const note = monthlyNote(m, ctx.pid);
    const monthly = `<section class="health-card review-card">
      ${cardTop(metricHeading("calendar", esc(t("trm.title", { id: ctx.pid })), "blue"), evidenceTag("record", t("trm.tag")))}
      <p class="chart-lede">${esc(t("trm.lede"))}</p>
      ${chartBox("trm-totals", { label: t("trm.totals"), height: 230, table: monthlyTable(m, t("trm.totals")) })}
      ${chartBox("trm-types", { label: t("trm.types"), height: 230, table: monthlyTable(m, t("trm.types")) })}
      ${note ? `<p class="comparison-conclusion">${esc(note)}</p>` : `<p class="empty-note">${esc(t("trm.none_note"))}</p>`}</section>`;

    const s = settings(ctx.study), g = batterySeries(ctx.pv, s.cost, s.rec);
    const input = (id, key, raw, min, max, step) => `<label class="trb-field"><span>${esc(t(key))}</span>
      <input type="number" id="${id}" value="${esc(raw)}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;
    const ledger = `<details class="health-card lower-module battery-card" id="trb-fold" ${ledgerOpen ? "open" : ""}>
      <summary><span class="summary-title">${esc(t("trb.summary"))}</span>${evidenceTag("hypothesis", t("trb.tag"))}</summary>
      <div class="trb-lede">${ledgerLede(s)}</div>
      <div class="battery-controls">${input("trb-cost", "trb.cost", costRaw, 1, 10, 0.5)}${input("trb-rec", "trb.recovery", recRaw, 5, 60, 5)}
        <button type="button" class="btn text" id="trb-reset">${esc(t("trb.reset"))}</button></div>
      <div class="trb-live">${ledgerChartBox(g)}<div class="trb-note">${ledgerNote(ctx, g, s)}</div></div></details>`;

    return `${detailHeader(t("trd.title"), esc(t("trd.lede")))}${trend}${monthly}${ledger}`;
  },

  mount(el, ctx, data) {
    const { person: p, focus } = ctx;
    const m = (data && data.monthly) || [];
    const boxLoad = el.querySelector("#trd-load");
    const drawLoad = () => {
      const z = trainingLoadSeries(p, focus, span, p.first);
      draw(boxLoad, (w) => loadChart(z, focus, picked(ctx) || focus, w));
    };
    drawLoad();
    draw(el.querySelector("#trm-totals"), (w) => monthlyTotals(m, w));
    draw(el.querySelector("#trm-types"), (w) => monthlyTypes(m, w));
    const drawLedger = () => {
      const s = settings(ctx.study), g = batterySeries(ctx.pv, s.cost, s.rec);
      draw(el.querySelector("#trb-plot"), (w) => batteryChart(g, focus, w));
    };
    drawLedger();
    keepFolds(el, "training");

    // the range switch
    el.querySelectorAll("[data-span]").forEach((b) => b.addEventListener("click", () => { span = +b.dataset.span; pick = null; ctx.refresh(); }));
    // inspecting a point: only the callout and the chart change; the selected day stays locked
    const inspect = (day) => {
      pick = { key: pickKey(ctx), day };
      el.querySelector(".trd-callout").innerHTML = calloutHtml(loadCallout(p, focus, day, span));
      drawLoad();
      const again = boxLoad.querySelector(`[data-inspect="${day}"]`);
      if (again && document.activeElement !== again) again.focus({ preventScroll: true });
    };
    boxLoad.addEventListener("click", (e) => { const hit = e.target.closest("[data-inspect]"); if (hit) inspect(hit.dataset.inspect); });
    boxLoad.addEventListener("keydown", (e) => {
      const hit = e.target.closest && e.target.closest("[data-inspect]");
      if (hit && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inspect(hit.dataset.inspect); }
    });

    // the energy ledger: typing redraws the lede, chart, note and table in place (the inputs keep focus)
    const fold = el.querySelector("#trb-fold");
    fold.addEventListener("toggle", () => { ledgerOpen = fold.open; if (fold.open) drawLedger(); });
    const cost = el.querySelector("#trb-cost"), rec = el.querySelector("#trb-rec");
    const update = () => {
      const s = settings(ctx.study), g = batterySeries(ctx.pv, s.cost, s.rec);
      el.querySelector(".trb-lede").innerHTML = ledgerLede(s);
      const live = el.querySelector(".trb-live");
      live.innerHTML = `${ledgerChartBox(g)}<div class="trb-note">${ledgerNote(ctx, g, s)}</div>`;
      drawLedger();
      keepFolds(live, "training");
    };
    cost.addEventListener("input", () => { costRaw = cost.value; update(); });
    rec.addEventListener("input", () => { recRaw = rec.value; update(); });
    el.querySelector("#trb-reset").addEventListener("click", () => {
      const d = settings(ctx.study).defaults;
      costRaw = String(d.cost_per_100_load); recRaw = String(d.recovery_pct);
      cost.value = costRaw; rec.value = recRaw;
      update();
    });
  },
};
