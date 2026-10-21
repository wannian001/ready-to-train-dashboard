// Today › Readiness detail (app.R tabPanel "Readiness detail" and its server code): expected → felt → gap
// (reference_summary), felt vs expected over 28 days (felt_expected + note + table), the hold-out accuracy
// (readiness_accuracy), how the expected value is built (the waterfall, readiness_factor_sequence, its key and
// table), and how days like this usually went (the 13 tracked signals as an interval chart, factors_plot, with the
// definition note and the method note). The interval chart, the verdicts and the BH note are shared with the
// Everyday habits page (pages/choices.js). Everything is drawn from the participant's visible record (ctx.pv), so
// the selected day's check-in stays out of every mark, tooltip and table until Reveal.
import { draw, esc } from "../../kit/js/charts.js";
import { t, fmt, dev, signed, pShort, dayLabel, shortDate, getLang, finite } from "../i18n.js";
import { addDays, dayRange, expectedSeries, signalOn, wday } from "../model.js";
import { evidenceTag, scopeChip, metricHeading, cardTop, detailHeader, chartBox, dataTable, dayButton, revealButton, hideButton, info } from "../ui.js";
import { modelMae } from "../about.js";
import { loadArea } from "../data.js";
import "../i18n/terms.js";
import "../i18n/readiness.js";

// ---- numbers and words built from R's rules ------------------------------------------------------------
// readiness_waterfall.R readiness_delta_label(): a step's size, three decimals when it is below .005
export function deltaLabel(v) {
  if (!finite(v) || Math.abs(v) < 1e-12) return "0.00";
  return signed(v, Math.abs(v) < 0.005 ? 3 : 2);
}
// R formatC(x, format = "g", digits = 2): two significant digits, trailing zeros dropped (the tables' BH p)
export function g2(x) {
  if (!finite(x)) return "—";
  if (x === 0) return "0";
  const trim = (s) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = Number((x / 10 ** e).toFixed(1));
  if (Math.abs(m) >= 10) { m /= 10; e += 1; }
  if (e < -4 || e >= 2) return `${trim(m.toFixed(1))}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  return trim(x.toFixed(Math.max(0, 1 - e)));
}
// app.R gap_words()
export function gapWords(felt, expected) {
  const g = felt - expected;
  if (Math.abs(g) < 0.05) return t("gap.as_expected");
  return t(g > 0 ? "gap.better" : "gap.worse", { v: fmt(Math.abs(g), 1) });
}
// visuals.R record_range(): "26 Feb – 18 Mar 2020"
export const recordRange = (a, b) => (a && b ? `${shortDate(a)} – ${dayLabel(b, { weekday: false })}` : "—");
// a translated sentence whose {slots} take ready-made HTML; the rest of the sentence is escaped
export function tHtml(key, html) { return esc(t(key)).replace(/\{(\w+)\}/g, (m, k) => (html[k] === undefined ? m : html[k])); }
// a sentence for an SVG attribute: escaped, line breaks kept as &#10;
const tipAttr = (text) => esc(text).replace(/\n/g, "&#10;");
const lower = (s) => (getLang() === "en" ? s.toLowerCase() : s);

// levers.R interval_clears_zero(), explain_verdict() and the verdicts of estimate_today_factors() / estimate_levers()
export const clearsZero = (r) => finite(r.lo) && finite(r.hi) && (r.lo > 0 || r.hi < 0);
export function verdict(r, isClear, kind) {
  if (!finite(r.effect)) return t("evd.v.few");
  const base = isClear ? t(kind === "day" ? "evd.v.clear_day" : "evd.v.clear_next", { dir: t(r.effect > 0 ? "evd.v.higher" : "evd.v.lower") }) : t("evd.v.none");
  return !isClear && clearsZero(r) ? t("evd.v.explain", { verdict: base, p: pShort(r.p_bh) }) : base;
}
// levers.R bh_interval_note(): the sentence under each interval chart, from the live estimates
export function bhNote(rows, isClear, what, labelOf) {
  const miss = rows.filter((r) => !isClear(r) && clearsZero(r));
  const base = t("evd.bh.base", { n: rows.filter((r) => finite(r.p)).length, what: t(`evd.bh.${what}`) });
  if (!miss.length) return base + t("evd.bh.all");
  return base + t("evd.bh.miss", { list: miss.map((r) => t("evd.bh.item", { label: labelOf(r), lo: dev(r.lo, 2), hi: dev(r.hi, 2), p: pShort(r.p_bh) })).join(t("evd.and")) });
}
// the p-values line added to each row's tooltip
export const pLine = (r) => t("evd.p", { p: pShort(r.p), bh: pShort(r.p_bh) });

// day_view.R interval_rows_height(): R's height for an interval chart of these rows
export function intervalRowsHeight(rows, groupOf = (r) => r.group) {
  if (!rows || !rows.length) return 120;
  return 90 + 50 * rows.length + 36 * new Set(rows.map(groupOf)).size;
}

// the estimates at R's full precision (data/readiness.json) over study.json's rounded ones, so a 2-decimal label
// rounds as R rounds it
export function preciseEffects(rows, extra = {}) {
  return rows.map((r) => { const x = extra[r.key]; return x ? { ...r, effect: x[0], lo: x[1], hi: x[2], p: x[3], p_bh: x[4] } : r; });
}

// ---- the 13 tracked signals on the selected day (evidence.R today_factor_state) ----------------------------
const LAYERS = ["Past 7 days", "2 days ago", "Yesterday", "Last night"];
export const stateWord = (v) => t(v === null || v === undefined ? "rdy.state.unknown" : v === 1 ? "rdy.state.true" : "rdy.state.false");
export function factorState(effects, person, day) {
  return effects.map((e) => {
    const v = signalOn(person, e.key, day);
    const value = v === undefined ? null : v;
    return { ...e, value, ring: value === 1, state: stateWord(value) };
  });
}
// day_view.R today_factor_rows(): the estimable ones, by layer then in the specs' order
export const factorRows = (state) => state.filter((r) => finite(r.effect))
  .map((r, i) => ({ r, i })).sort((a, b) => LAYERS.indexOf(a.r.layer) - LAYERS.indexOf(b.r.layer) || a.i - b.i).map((x) => x.r);

// ---- the shared interval-rows chart (day_view.R health_interval_rows) ----------------------------------------
// One row per condition, its label above its own interval. The diamond is the average difference (blue = true on
// the selected day), the line its 95% interval: thick ink = clear link after the BH correction, thin grey = not.
// rows: { key, group, label, effect, lo, hi, clear, ring, tip }. Click a row (data-pick) to show its definition.
const PX = 38, AX_TOP = 24, AX_BOTTOM = 46;
// about how wide a label is: CJK characters are square, Latin ones a bit over half an em (bold a little wider)
const textW = (s, size, bold = false) => [...String(s)].reduce((w, ch) => w + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? size : size * (bold ? 0.6 : 0.55)), 0);
// a label cut to fit `room` pixels, ending in "…" (the tooltip, the aria-label and the table keep it whole)
function fitLabel(s, size, bold, room) {
  if (textW(s, size, bold) <= room) return s;
  const chars = [...s];
  while (chars.length > 1 && textW(`${chars.join("")}…`, size, bold) > room) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
export function intervalLayout(rows) {
  let pos = 0;
  const items = [];
  rows.forEach((r, i) => {
    if (i === 0 || r.group !== rows[i - 1].group) { pos -= 0.9; items.push({ head: r.headText ?? r.group, u: pos }); }
    pos -= 1.25;
    items.push({ row: r, u: pos });
  });
  return { items, bottom: pos - 0.6 };
}
export function intervalHeight(rows, sides = true) {
  if (!rows.length) return 120;
  return Math.round(AX_TOP + ((sides ? 0.75 : 0.2) - intervalLayout(rows).bottom) * PX + AX_BOTTOM);
}
export function intervalChart(rows, { width, xlim, breaks, sides = null, xTitle, emptyText, picked = "", narrow = false }) {
  const H = intervalHeight(rows, !!sides);
  if (!rows.length) return `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="${esc(emptyText)}"><text x="${width / 2}" y="${H / 2}" text-anchor="middle" class="ic-empty">${esc(emptyText)}</text></svg>`;
  const { items, bottom } = intervalLayout(rows);
  const top = sides ? 0.75 : 0.2;
  const Y = (u) => AX_TOP + (top - u) * PX;
  const padL = narrow ? 8 : 14, padR = narrow ? 8 : 14, fs = narrow ? 12 : 13;
  const [l0, l1] = xlim, span = l1 - l0;
  const X = (v) => padL + ((v - l0) / span) * (width - padL - padR);
  const yTop = Y(top), yBot = Y(bottom);
  const first = Math.min(...breaks.filter((b) => b >= l0 - 1e-9));
  const labX = X(first + span * 0.008);
  const out = [];
  if (sides) {
    out.push(`<rect class="ic-lo" x="${X(l0)}" y="${yTop}" width="${(X(0) - X(l0)).toFixed(1)}" height="${(yBot - yTop).toFixed(1)}"/>`);
    out.push(`<rect class="ic-hi" x="${X(0).toFixed(1)}" y="${yTop}" width="${(X(l1) - X(0)).toFixed(1)}" height="${(yBot - yTop).toFixed(1)}"/>`);
  }
  for (const b of breaks) {
    const x = X(b).toFixed(1), half = textW(signed(b, 1), fs) / 2;
    // a tick label at either end of a narrow chart is pulled inside it
    const anchor = X(b) - half < 1 ? "start" : X(b) + half > width - 1 ? "end" : "middle";
    const tx = anchor === "start" ? Math.max(1, X(b) - 4).toFixed(1) : anchor === "end" ? Math.min(width - 1, X(b) + 4).toFixed(1) : x;
    out.push(`<line class="ic-grid" x1="${x}" x2="${x}" y1="${yTop}" y2="${yBot.toFixed(1)}"/>`);
    out.push(`<text class="ic-tick" x="${tx}" y="${AX_TOP - 8}" text-anchor="${anchor}">${esc(signed(b, 1))}</text>`);
    out.push(`<text class="ic-tick" x="${tx}" y="${(yBot + 16).toFixed(1)}" text-anchor="${anchor}">${esc(signed(b, 1))}</text>`);
  }
  out.push(`<line class="ic-zero" x1="${X(0).toFixed(1)}" x2="${X(0).toFixed(1)}" y1="${yTop}" y2="${yBot.toFixed(1)}"/>`);
  if (sides) {
    out.push(`<text class="ic-side lo" x="${X(-span * 0.01).toFixed(1)}" y="${(Y(0.38) + 4).toFixed(1)}" text-anchor="end">${esc(`← ${sides[0]}`)}</text>`);
    out.push(`<text class="ic-side hi" x="${X(span * 0.01).toFixed(1)}" y="${(Y(0.38) + 4).toFixed(1)}" text-anchor="start">${esc(`${sides[1]} →`)}</text>`);
  }
  for (const it of items) {
    if (it.head !== undefined) {
      // a heading too long for the chart takes two lines (the second one sits in the gap above the first row)
      const room = X(l1) - labX, hs = narrow ? 12.5 : 14;
      const lines = textW(it.head, hs, true) > room ? splitTitle(it.head).map((ln) => fitLabel(ln, hs, true, room)) : [it.head];
      lines.forEach((ln, k) => out.push(`<text class="ic-head" x="${labX.toFixed(1)}" y="${(Y(it.u + 0.2) + k * (hs + 2)).toFixed(1)}" font-size="${hs}">${esc(ln)}</text>`));
      continue;
    }
    const r = it.row, y = Y(it.u), cls = r.ring ? "ring" : r.clear ? "clear" : "plain";
    if (r.key === picked) out.push(`<rect class="ic-picked" x="${padL - 6}" y="${Y(it.u + 0.98).toFixed(1)}" width="${(width - padL - padR + 12).toFixed(1)}" height="${(1.22 * PX).toFixed(1)}" rx="8"/>`);
    const value = r.clear && !narrow ? t("evd.clear_value", { v: signed(r.effect, 2) }) : signed(r.effect, 2);
    const room = X(l1) - textW(value, fs, r.clear) - 10 - labX;
    out.push(`<text class="ic-label ${cls}" x="${labX.toFixed(1)}" y="${(Y(it.u + 0.6) + 4).toFixed(1)}" font-size="${fs}">${esc(fitLabel(r.label, fs, r.ring || r.clear, room))}</text>`);
    out.push(`<text class="ic-value ${r.clear ? "clear" : ""}" x="${X(l1).toFixed(1)}" y="${(Y(it.u + 0.6) + 4).toFixed(1)}" text-anchor="end" font-size="${fs}">${esc(value)}</text>`);
    if (finite(r.lo) && finite(r.hi)) out.push(`<line class="ic-ci ${r.clear ? "clear" : ""}" x1="${X(r.lo).toFixed(1)}" x2="${X(r.hi).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`);
    const s = r.ring ? 8 : 7, cx = X(r.effect);
    out.push(`<path class="ic-diamond ${r.ring ? "ring" : ""}" d="M${cx.toFixed(1)} ${(y - s).toFixed(1)}L${(cx + s).toFixed(1)} ${y.toFixed(1)}L${cx.toFixed(1)} ${(y + s).toFixed(1)}L${(cx - s).toFixed(1)} ${y.toFixed(1)}Z"/>`);
    out.push(`<rect class="ic-hit" x="${padL - 6}" y="${Y(it.u + 0.98).toFixed(1)}" width="${(width - padL - padR + 12).toFixed(1)}" height="${(1.22 * PX).toFixed(1)}" fill="transparent"
      data-pick="${esc(r.key)}" data-tip="${tipAttr(r.tip)}" tabindex="0" role="button" aria-pressed="${r.key === picked}" aria-label="${esc(r.tip.replace(/\n/g, ". "))}"/>`);
  }
  out.push(`<text class="ic-title" x="${(width / 2).toFixed(1)}" y="${(yBot + 36).toFixed(1)}" text-anchor="middle">${esc(xTitle)}</text>`);
  return `<svg class="ic-svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}">${out.join("")}</svg>`;
}
// the legend above an interval chart (app.R plot-legend)
export const intervalLegend = (withToday) => `<div class="ev-legend">
  ${withToday ? `<span class="lg-diamond today">${esc(t("evd.legend.today"))}</span><span class="lg-diamond">${esc(t("evd.legend.not"))}</span>`
    : `<span class="lg-diamond">${esc(t("evd.legend.avg"))}</span>`}
  <span class="lg-line clear">${esc(t("evd.legend.clear"))}</span><span class="lg-line">${esc(t("evd.legend.unclear"))}</span>
  <span class="lg-note">${esc(t("evd.legend.note"))}</span></div>`;
// clicks and Enter / Space on a row of an interval chart; onPick(key, byKeyboard)
export function wirePicks(el, onPick) {
  el.addEventListener("click", (e) => { const h = e.target.closest("[data-pick]"); if (h) onPick(h.dataset.pick, e.detail === 0); });
  el.addEventListener("keydown", (e) => {
    const h = e.target.closest && e.target.closest("[data-pick]");
    if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(h.dataset.pick, true); }
  });
}
// after the charts' first redraw (draw() redraws once more when its ResizeObserver starts, which drops the focus)
export const afterDraw = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
// a <details> keeps its open state across re-renders (render() rebuilds the page on every change)
export function keepOpen(root, store, onOpen = {}) {
  root.querySelectorAll("details").forEach((d, i) => {
    const chart = d.closest("figure") && d.closest("figure").querySelector(".chart");
    const key = d.dataset.keep || (chart ? `${chart.id}:data` : `d${i}`);
    if (store.has(key)) d.open = true;
    d.addEventListener("toggle", () => {
      if (d.open) { store.add(key); if (onOpen[key]) onOpen[key](); } else store.delete(key);
    });
  });
}

// a "Show the data" table that keeps a readable width and scrolls sideways on a phone
export const wide = (cls, caption, headers, rows) => `<div class="${cls}">${dataTable(caption, headers, rows)}</div>`;

// ---- felt vs expected over the last 4 weeks (story_visuals.R health_felt_expected_plot) ---------------------
export const feltDays = (focus) => dayRange(addDays(focus, -27), focus);
// story_visuals.R felt_expected_note()
export function feltNote(s, who) {
  const both = s.filter((r) => finite(r.felt) && finite(r.expected));
  if (both.length < 3) return { cls: "empty-note", text: t("rdy.fe.note_few") };
  const g = both.map((r) => r.felt - r.expected);
  return { cls: "comparison-conclusion", text: t("rdy.fe.note", { n: both.length, who, avg: fmt(g.reduce((a, x) => a + Math.abs(x), 0) / g.length, 1),
    better: g.filter((x) => x > 1).length, worse: g.filter((x) => x < -1).length }) };
}
function feltTip(r, focus, hasCheckin) {
  const lines = [dayLabel(r.date), t("rdy.fe.tip_expected", { v: fmt(r.expected, 1) })];
  if (finite(r.felt)) lines.push(finite(r.expected) ? t("rdy.fe.tip_felt", { v: r.felt, words: gapWords(r.felt, r.expected) }) : t("rdy.fe.tip_felt_only", { v: r.felt }));
  else lines.push(r.date === focus && hasCheckin ? t("rdy.fe.tip_hidden") : t("rdy.fe.tip_none"));
  lines.push(t("rdy.fe.tip_open"));
  return lines.join("\n");
}
function feltChart(s, focus, hasCheckin, width) {
  const H = 300;
  if (!s.some((r) => finite(r.expected))) return `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}"><text x="${width / 2}" y="${H / 2}" text-anchor="middle" class="ic-empty">${esc(t("rdy.fe.empty"))}</text></svg>`;
  // the whole 0–10 scale for every participant, so two people's gaps look the same size
  const lo = 0, hi = 10;
  const m = { l: 46, r: 10, t: 12, b: 30 }, pw = width - m.l - m.r, ph = H - m.t - m.b, n = s.length;
  const X = (i) => m.l + ((i + 0.6) / (n - 1 + 1.2)) * pw, Y = (v) => m.t + ((hi - v) / (hi - lo)) * ph, cw = pw / (n - 1 + 1.2);
  const out = [];
  const fi = s.findIndex((r) => r.date === focus);
  if (fi >= 0) out.push(`<rect class="fe-focus" x="${(X(fi) - cw / 2).toFixed(1)}" y="${m.t}" width="${cw.toFixed(1)}" height="${ph}"/>`);
  for (let v = lo; v <= hi; v += 2) {
    out.push(`<line class="fe-grid" x1="${m.l}" x2="${width - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`);
    out.push(`<text class="fe-tick" x="${m.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`);
  }
  out.push(`<text class="fe-ytitle" transform="translate(13 ${(m.t + ph / 2).toFixed(1)}) rotate(-90)" text-anchor="middle">${esc(t("rdy.fe.y"))}</text>`);
  s.forEach((r, i) => {
    if (wday(r.date) !== 1) return;
    const label = shortDate(r.date), half = textW(label, width < 520 ? 12 : 13) / 2;
    const anchor = X(i) + half > width - 1 ? "end" : "middle";
    out.push(`<text class="fe-tick" x="${(anchor === "end" ? width - 1 : X(i)).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${esc(label)}</text>`);
  });
  s.forEach((r, i) => { if (finite(r.felt) && finite(r.expected)) out.push(`<line class="fe-gap" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${Y(r.expected).toFixed(1)}" y2="${Y(r.felt).toFixed(1)}"/>`); });
  const pts = s.map((r, i) => (finite(r.expected) ? `${X(i).toFixed(1)},${Y(r.expected).toFixed(1)}` : null)).filter(Boolean);
  if (pts.length > 1) out.push(`<polyline class="fe-line" points="${pts.join(" ")}"/>`);
  s.forEach((r, i) => { if (finite(r.expected)) out.push(`<circle class="fe-exp" cx="${X(i).toFixed(1)}" cy="${Y(r.expected).toFixed(1)}" r="4"/>`); });
  s.forEach((r, i) => { if (finite(r.felt) && finite(r.expected)) out.push(`<circle class="fe-felt" cx="${X(i).toFixed(1)}" cy="${Y(r.felt).toFixed(1)}" r="5"/>`); });
  s.forEach((r, i) => {
    if (!finite(r.felt) && r.date !== focus) { const x = X(i), y = Y(lo + 0.25); out.push(`<path class="fe-miss" d="M${(x - 3.5).toFixed(1)} ${(y - 3.5).toFixed(1)}l7 7m-7 0l7 -7"/>`); }
  });
  if (fi >= 0 && !finite(s[fi].felt) && finite(s[fi].expected)) out.push(`<text class="fe-q" x="${X(fi).toFixed(1)}" y="${(Y(s[fi].expected + 0.55) + 6).toFixed(1)}" text-anchor="middle">?</text>`);
  // a click target per day that R makes clickable (an expected point, a felt point or a missing check-in)
  s.forEach((r, i) => {
    if (!(finite(r.expected) || !finite(r.felt))) return;
    const tip = feltTip(r, focus, hasCheckin);
    out.push(`<rect class="fe-hit" x="${(X(i) - cw / 2).toFixed(1)}" y="${m.t}" width="${cw.toFixed(1)}" height="${ph}" fill="transparent" data-day="${r.date}"
      data-tip="${tipAttr(tip)}" tabindex="0" role="button" aria-label="${esc(tip.replace(/\n/g, ". "))}"/>`);
  });
  return `<svg class="fe-svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}">${out.join("")}</svg>`;
}
// the chart's key: what each mark means, × included
const feltLegend = () => `<div class="ev-legend fe-legend">
  <span class="lg-exp">${esc(t("rdy.fe.lg.expected"))}</span><span class="lg-felt">${esc(t("rdy.fe.lg.felt"))}</span>
  <span class="lg-gap">${esc(t("rdy.fe.lg.gap"))}</span><span class="lg-miss">${esc(t("rdy.fe.lg.miss"))}</span><span class="lg-focus">${esc(t("rdy.fe.lg.focus"))}</span>
  <span class="lg-hint"><span aria-hidden="true">☝</span>${esc(t("rdy.fe.hint"))}</span></div>`;
function feltTable(s) {
  return wide("rdy-t6", t("rdy.fe.caption"), ["date", "level", "adj", "expected", "felt", "gap"].map((k) => t(`rdy.fe.h.${k}`)),
    [...s].reverse().map((r) => [dayButton(r.date), esc(fmt(r.level, 1)), esc(deltaLabel(r.adjustment)), esc(fmt(r.expected, 1)),
      finite(r.felt) ? `${r.felt}/10` : "—", finite(r.felt) && finite(r.expected) ? esc(dev(r.felt - r.expected, 1)) : "—"]));
}

// ---- how the expected value is built (story_visuals.R health_readiness_factor_sequence) ----------------------
// The usual level as a dashed baseline, the 13 signals added in order: coloured = true that day (colour = when),
// dark grey = not true (adds 0), light grey = unknown (adds weight × share). The line is the running estimate;
// the final expected value is written at its end, and after Reveal the felt value is a green line.
const STAGE_RANGE = { 1: "1–4", 2: "5–9", 3: "10–13" };
export const stageTitle = (stage) => t(`rdy.wf.stage.${stage}`);
function waterfallChart(r, felt, width) {
  const parts = r.parts, base = r.level.value, H = 360, narrow = width < 480;
  const vals = [base, ...parts.map((p) => p.before), ...parts.map((p) => p.after), ...(finite(felt) ? [felt] : [])];
  const half = Math.max(1, Math.max(...vals.map((v) => Math.abs(v - base))) * 1.25);
  const lo = Math.max(0, Math.floor((base - half) * 2) / 2), hi = Math.min(10, Math.ceil((base + half) * 2) / 2);
  const stepY = hi - lo <= 3 ? 0.5 : 1;
  const title = t("rdy.wf.x", { n: parts.length });
  const lines = narrow ? wrapTitle(title, 12, width - 54 - 8) : [title];
  const m = { l: narrow ? 46 : 58, r: narrow ? 8 : 24, t: 28, b: narrow ? 42 + 16 * lines.length : 68 };
  const pw = width - m.l - m.r, ph = H - m.t - m.b, cw = pw / parts.length, bw = Math.min(24, cw * 0.66);
  const X = (i) => m.l + (i + 0.5) * cw, Y = (v) => m.t + ((hi - v) / (hi - lo)) * ph;
  const out = [];
  // the R chart's ticks (echarts): from the bottom of the axis in steps, plus the top of the axis
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += stepY) ticks.push(Number(v.toFixed(6)));
  if (hi - ticks[ticks.length - 1] > 1e-9) ticks.push(hi);
  for (const v of ticks) {
    out.push(`<line class="wf-grid" x1="${m.l}" x2="${width - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`);
    out.push(`<text class="wf-tick" x="${m.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v.toFixed(1)}</text>`);
  }
  out.push(`<line class="wf-axis" x1="${m.l}" x2="${width - m.r}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}"/>`);
  out.push(`<text class="wf-ytitle" transform="translate(${narrow ? 12 : 16} ${(m.t + ph / 2).toFixed(1)}) rotate(-90)" text-anchor="middle">${esc(t("rdy.wf.y"))}</text>`);
  lines.forEach((ln, i) => out.push(`<text class="wf-xtitle" x="${(m.l + pw / 2).toFixed(1)}" y="${(Y(lo) + 40 + i * 16).toFixed(1)}" text-anchor="middle">${esc(ln)}</text>`));
  // the three stages: a thin divider between them and their names over the columns (the range when a name does not fit)
  [1, 2, 3].forEach((stage) => {
    const idx = parts.map((p, i) => (p.stage === stage ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const x0 = m.l + idx[0] * cw, x1 = m.l + (idx[idx.length - 1] + 1) * cw;
    if (idx[0] > 0) out.push(`<line class="wf-divider" x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${m.t - 18}" y2="${Y(lo).toFixed(1)}"/>`);
    const name = stageTitle(stage), fits = textW(name, narrow ? 12 : 13, true) <= x1 - x0 - 8;
    out.push(`<text class="wf-stage-name s${stage}" x="${((x0 + x1) / 2).toFixed(1)}" y="${m.t - 10}" text-anchor="middle">${esc(fits ? name : STAGE_RANGE[stage])}</text>`);
  });
  out.push(`<line class="wf-base" x1="${m.l}" x2="${width - m.r}" y1="${Y(base).toFixed(1)}" y2="${Y(base).toFixed(1)}"/>`);
  out.push(`<text class="wf-base-label" x="${m.l + 4}" y="${(Y(base) - 6).toFixed(1)}">${esc(t("rdy.wf.usual", { v: fmt(base, 1) }))}</text>`);
  if (finite(felt)) {
    out.push(`<line class="wf-felt" x1="${m.l}" x2="${width - m.r}" y1="${Y(felt).toFixed(1)}" y2="${Y(felt).toFixed(1)}"/>`);
    out.push(`<text class="wf-felt-label" x="${m.l + 4}" y="${(Y(felt) + 15).toFixed(1)}">${esc(t("rdy.wf.felt", { v: fmt(felt, 0) }))}</text>`);
  }
  let lastLabel = null;
  parts.forEach((p, i) => {
    const x = X(i), top = Y(Math.max(p.before, p.after)), bottom = Y(Math.min(p.before, p.after));
    const h = Math.max(2, bottom - top), y0 = bottom - top < 2 ? Y(p.before) - 2 : top;
    const kind = p.held ? `held s${p.stage}` : p.known ? "off" : "unknown";
    out.push(`<rect class="wf-bar ${kind} ${p.after < p.before ? "down" : ""}" style="--i:${i}" x="${(x - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(5, h / 2).toFixed(1)}"/>`);
    out.push(`<text class="wf-xtick" x="${x.toFixed(1)}" y="${(Y(lo) + 17).toFixed(1)}" text-anchor="middle">${p.number}</text>`);
    const d = deltaLabel(p.contribution);
    if (Math.abs(Number(d)) >= 0.005) {
      let ly = y0 - 6;
      if (lastLabel && i - lastLabel.i === 1 && Math.abs(lastLabel.y - ly) < 12 && cw < 44) ly = lastLabel.y - 12;   // neighbours stagger on a narrow chart
      out.push(`<text class="wf-label" style="--i:${i}" x="${x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(d)}</text>`);
      lastLabel = { i, y: ly };
    }
  });
  const line = parts.map((p, i) => `${X(i).toFixed(1)},${Y(p.after).toFixed(1)}`).join(" ");
  out.push(`<polyline class="wf-run" pathLength="1" points="${line}"/>`);
  parts.forEach((p, i) => out.push(`<circle class="wf-dot ${p.held ? `held s${p.stage}` : p.known ? "off" : "unknown"}" style="--i:${i}" cx="${X(i).toFixed(1)}" cy="${Y(p.after).toFixed(1)}" r="${p.held ? 4.5 : 3}"/>`));
  // the final expected value at the end of the line
  const last = parts.length - 1, ey = Y(parts[last].after);
  const below = ey + 20 < Y(lo) - 4;
  out.push(`<text class="wf-end" style="--i:${last}" x="${(X(last) + bw / 2 + 2).toFixed(1)}" y="${(below ? ey + 20 : ey - 22).toFixed(1)}" text-anchor="end">${esc(t("rdy.wf.expected", { v: fmt(r.value, 1) }))}</text>`);
  // hover / focus targets with each step's numbers
  parts.forEach((p, i) => {
    const tip = t("rdy.wf.tip", { num: p.number, label: t(`sig.${p.key}`), stage: stageTitle(p.stage), detail: t(`sig.${p.key}.detail`),
      state: stateWord(p.value), delta: deltaLabel(p.contribution), before: fmt(p.before, 2), after: fmt(p.after, 2) });
    out.push(`<rect class="wf-hit" x="${(X(i) - cw / 2).toFixed(1)}" y="${m.t}" width="${cw.toFixed(1)}" height="${ph}" fill="transparent" data-tip="${tipAttr(tip)}" tabindex="0" role="img" aria-label="${esc(tip.replace(/\n/g, ". "))}"/>`);
  });
  return `<svg class="wf-svg anim" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}">${out.join("")}</svg>`;
}
// a title in lines at most `room` pixels wide (CJK breaks anywhere, other text at spaces)
function wrapTitle(s, size, room) {
  const cjk = /[\u2e80-\u9fff]/.test(s), parts = cjk ? [...s] : s.split(" "), out = [];
  let cur = "";
  for (const w of parts) {
    const next = cur ? (cjk ? cur + w : `${cur} ${w}`) : w;
    if (cur && textW(next, size) > room) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
function splitTitle(s) {
  const words = s.split(" "), mid = s.length / 2;
  let acc = 0, cut = 1;
  for (let i = 0; i < words.length; i++) { acc += words[i].length + 1; if (acc >= mid) { cut = i + 1; break; } }
  if (words.length < 2) { const k = Math.ceil(s.length / 2); return [s.slice(0, k), s.slice(k)]; }
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}
// story_visuals.R readiness_factor_key_ui(): the three stages as numbered lists
function factorKey(parts) {
  if (!parts) return `<p class="empty-note">${esc(t("rdy.wf.key_none"))}</p>`;
  return `<div class="wf-key">${[1, 2, 3].map((stage) => {
    const one = parts.filter((p) => p.stage === stage);
    return `<div class="wf-stage stage-${stage}"><div class="wf-stage-head"><strong>${esc(stageTitle(stage))}</strong><span>${STAGE_RANGE[stage]}</span></div>
      <ol start="${one[0].number}">${one.map((p) => `<li class="${p.held ? "held" : ""} ${p.known ? "" : "unknown"}"><span>${esc(t(`sig.${p.key}`))}</span><small>${esc(
        p.held || !p.known ? t("rdy.wf.key_pts", { state: stateWord(p.value), delta: deltaLabel(p.contribution) }) + (p.known ? "" : t("rdy.wf.key_avg")) : stateWord(p.value))}</small></li>`).join("")}</ol></div>`;
  }).join("")}</div>`;
}
// readiness_waterfall.R readiness_waterfall_table()
function waterfallTable(parts) {
  if (!parts) return `<p class="empty-note">${esc(t("rdy.wf.table_none"))}</p>`;
  return wide("rdy-t6", t("rdy.wf.caption"), ["no", "group", "factor", "day", "step", "after"].map((k) => t(`rdy.wf.h.${k}`)),
    parts.map((p) => [String(p.number), esc(stageTitle(p.stage)), esc(t(`sig.${p.key}`)), esc(stateWord(p.value)), esc(deltaLabel(p.contribution)), esc(fmt(p.after, 2))]));
}

// ---- the 13 signals one at a time (day_view.R health_today_factors / today_factors_table) --------------------
function factorChartRows(state, narrow) {
  return factorRows(state).map((r) => {
    const label = t(`sig.${r.key}`);
    return { key: r.key, group: r.layer, headText: t(`layer.${r.layer}`), effect: r.effect, lo: r.lo, hi: r.hi, clear: r.clear, ring: r.ring,
      label: narrow ? label : t("rdy.fx.row", { label, people: r.people }) + (r.ring ? t("rdy.fx.row_true") : ""),
      tip: factorTip(r) };
  });
}
export function factorTip(r) {
  return t("rdy.fx.tip", { layer: t(`layer.${r.layer}`), label: t(`sig.${r.key}`), detail: t(`sig.${r.key}.detail`), yes: r.yes, n: fmt(r.n), people: r.people,
    effect: dev(r.effect, 2), lo: dev(r.lo, 2), hi: dev(r.hi, 2), p: pLine(r), verdict: verdict(r, r.clear, "day"), state: r.state });
}
function factorTable(state) {
  const z = state.map((r, i) => ({ r, i })).sort((a, b) => LAYERS.indexOf(a.r.layer) - LAYERS.indexOf(b.r.layer) || a.i - b.i).map((x) => x.r);
  return wide("rdy-t10", t("rdy.fx.caption", { n: z.length }),
    [t("rdy.fx.h.when"), t("rdy.fx.h.signal"), t("evd.h.definition"), t("rdy.fx.h.true"), t("evd.h.people"), t("rdy.fx.h.diff"), t("evd.h.ci"), t("evd.h.bh"), t("evd.h.verdict"), t("rdy.fx.h.day")],
    z.map((r) => [esc(t(`layer.${r.layer}`)), esc(t(`sig.${r.key}`)), esc(t(`sig.${r.key}.detail`)), esc(t("evd.of", { a: r.yes, b: fmt(r.n) })), String(r.people),
      finite(r.effect) ? esc(t("evd.pts", { v: dev(r.effect, 2) })) : "—", finite(r.lo) ? esc(t("evd.range", { lo: dev(r.lo, 2), hi: dev(r.hi, 2) })) : "—",
      esc(g2(r.p_bh)), esc(verdict(r, r.clear, "day")), esc(r.state)]));
}
// app.R factors_note: the conclusion sentence
export function factorsConclusion(effects) {
  const e = effects.filter((r) => finite(r.effect));
  const clear = e.filter((r) => r.clear).sort((a, b) => a.effect - b.effect);
  if (!clear.length) return t("rdy.fx.concl_none", { n: e.length });
  return t("rdy.fx.concl", { k: clear.length, n: e.length, list: clear.map((r) => t("rdy.fx.item", { label: lower(t(`sig.${r.key}`)), effect: dev(r.effect, 2) })).join(t("evd.and")) });
}

// ---- the section ------------------------------------------------------------------------------------------
let pickedFactor = "", pickedFor = "", refocus = "";
const opened = new Set();

export default {
  load: () => loadArea("readiness"),
  render(ctx, axes) {
    const { study, expected: r } = ctx;
    if (pickedFor !== `${ctx.id}|${ctx.focus}`) { pickedFactor = ""; pickedFor = `${ctx.id}|${ctx.focus}`; }
    const n = study.model.keys.length, ready = study.model.status === "ready";
    const felt = ctx.revealedValue("readiness"), lv = r.level, parts = r.parts;
    const active = parts ? parts.filter((p) => p.held).length : 0;

    // app.R reference_summary: expected → felt → gap, then how it is made
    const step = (label, value, unit, cls = "") => `<div class="rv-step ${cls}"><span class="rv-label">${esc(label)}</span><div class="rv-value"><strong>${esc(value)}</strong><span>${esc(unit)}</span></div></div>`;
    const arrow = `<span class="rv-arrow" aria-hidden="true">→</span>`;
    const feltStep = !ctx.hasCheckin ? step(t("rdy.felt"), "—", t("rdy.no_checkin"), "muted")
      : !ctx.revealed ? `<div class="rv-step rv-action"><span class="rv-label">${esc(t("rdy.felt"))}</span>${revealButton()}</div>`
        : step(t("rdy.felt"), fmt(felt, 0), t("rdy.checkin"), "felt");
    const gapStep = ctx.revealed && finite(felt) && finite(r.value) ? step(t("rdy.gap"), dev(felt - r.value, 1), gapWords(felt, r.value), "gap")
      : step(t("rdy.gap"), "?", t(ctx.hasCheckin ? "rdy.after_reveal" : "rdy.nothing"), "muted");
    const equation = tHtml("rdy.equation", {
      level: `<strong>${esc(finite(lv.value) ? fmt(lv.value, 1) : "—")}</strong>`,
      weeks: esc(lv.n ? t("rdy.weeks", { n: lv.n, range: recordRange(lv.start, lv.end) }) : t("rdy.weeks_none")),
      adj: `<strong>${esc(finite(r.adjustment) ? dev(r.adjustment, 2) : "—")}</strong>`, active, n });
    const summary = `${ready ? "" : `<p class="forecast-stale-note">${esc(t("rdy.stale"))}</p>`}
      <div class="rv-row">${step(t("rdy.expected"), finite(r.value) ? fmt(r.value, 1) : "—", t("rdy.of10"))}${arrow}${feltStep}${arrow}${gapStep}</div>
      <p class="rv-equation">${equation}${ctx.revealed ? ` ${hideButton(t("rdy.hide")).replace('class="btn text"', 'class="btn text rv-hide"')}` : ""}</p>`;

    // felt vs expected (felt from the visible record: the selected day stays hidden until Reveal)
    const s = expectedSeries(ctx.pv, study.model, study.signals, feltDays(ctx.focus));
    const note = feltNote(s, ctx.pid);
    const accuracy = info(t("rdy.acc.q"), `<p>${esc(t("rdy.acc.text", {
      ridge: modelMae(study, "test", "ridge"), level: modelMae(study, "test", "^level$"), all: modelMae(study, "test", "level_all"), last5: modelMae(study, "test", "last5") }))}</p>
      <p>${esc(t("rdy.acc.foot"))}</p>`);

    // how the expected value is built
    const headline = !ready ? `<p class="forecast-stale-note">${esc(t("rdy.stale"))}</p>`
      : !parts ? `<p class="empty-note">${esc(t("rdy.wf.none"))}</p>`
        : `<p class="comparison-conclusion">${esc(t("rdy.wf.headline", { n: active, adj: dev(r.adjustment, 2) }))}</p>`;
    const build = `<details class="rdy-build" data-keep="build"><summary><span class="summary-title">${esc(t("rdy.wf.summary", { n }))}</span></summary>
      ${headline}<p class="chart-lede">${esc(t("rdy.wf.lede", { n }))}</p>
      ${parts ? `<div class="rdy-actions"><button type="button" class="btn text" id="rdy-replay">${esc(t("rdy.wf.replay"))}</button></div>
        <figure class="chart-shell"><div class="chart wf-box" id="rdy-wf" role="group" aria-label="${esc(t("rdy.wf.aria"))}" style="min-height:360px"></div></figure>` : ""}
      ${factorKey(parts)}
      <details class="chart-data" data-keep="wf:data"><summary>${esc(t("ui.show_data"))}</summary>${waterfallTable(parts)}</details></details>`;

    // the 13 signals one at a time
    const effects = preciseEffects(study.today_effects, axes.today_effects);
    const state = factorState(effects, ctx.person, ctx.focus);
    const rowsWide = factorChartRows(state, false);
    const pick = pickedFactor && state.find((x) => x.key === pickedFactor);
    const definition = pick ? `<div class="insight-note definition-note"><h4>${esc(t(`sig.${pick.key}`))}</h4><p>${esc(t("rdy.fx.defined", { detail: t(`sig.${pick.key}.detail`), state: pick.state }))}</p></div>` : "";
    const how = info(t("rdy.fx.how"), `<p>${esc(t("rdy.fx.lede", { n }))}</p><p><strong>${esc(t("rdy.fx.why"))}</strong></p><p>${esc(t("rdy.fx.why1"))}</p>
      <p>${esc(t("rdy.fx.why2"))}</p><p>${esc(bhNote(effects, (x) => x.clear, "signals", (x) => t(`sig.${x.key}`)))}</p>`);

    return `${detailHeader(t("rdy.title"), esc(t("rdy.lede")))}
      <section class="health-card rdy-card">${cardTop(metricHeading("pulse", esc(t("rdy.card")), "blue"), evidenceTag("association", t("rdy.tag")),
        info(t("rdy.how.t"), `<p>${esc(t("rdy.equation.why"))}</p>`))}${summary}</section>
      <section class="health-card rdy-felt-card">${cardTop(metricHeading("compare", esc(t("rdy.fe.title")), "model"), scopeChip(t("rdy.fe.scope")), accuracy)}
        ${feltLegend()}
        ${chartBox("rdy-fe", { label: t("rdy.fe.label"), height: 300, table: feltTable(s) })}
        <p class="${note.cls}">${esc(note.text)}</p>${build}</section>
      <section class="health-card rdy-fx-card">${cardTop(metricHeading("compare", esc(t("rdy.fx.title")), "model"), scopeChip(t("rdy.fx.scope")), how)}
        ${intervalLegend(true)}
        ${chartBox("rdy-fx", { label: t("rdy.fx.label"), hint: t("evd.hint"), height: intervalHeight(rowsWide), table: factorTable(state) })}
        ${definition}<p class="comparison-conclusion">${esc(factorsConclusion(effects))}</p></section>`;
  },
  mount(el, ctx, axes) {
    const { study, expected: r } = ctx;
    const s = expectedSeries(ctx.pv, study.model, study.signals, feltDays(ctx.focus));
    draw(el.querySelector("#rdy-fe"), (w) => feltChart(s, ctx.focus, ctx.hasCheckin, w));
    const wf = el.querySelector("#rdy-wf");
    const drawWf = () => { if (wf && r.parts) draw(wf, (w) => waterfallChart(r, ctx.revealedValue("readiness"), w)); };
    drawWf();
    const replay = el.querySelector("#rdy-replay");
    if (replay) replay.onclick = drawWf;
    const state = factorState(preciseEffects(study.today_effects, axes.today_effects), ctx.person, ctx.focus);
    const fx = el.querySelector("#rdy-fx");
    draw(fx, (w) => intervalChart(factorChartRows(state, w < 480), { width: w, xlim: axes.factor_xlim, breaks: axes.factor_breaks, picked: pickedFactor, narrow: w < 480,
      sides: w < 480 ? [t("evd.lower"), t("evd.higher")] : [t("rdy.fx.lower"), t("rdy.fx.higher")], xTitle: t(w < 480 ? "rdy.fx.x_narrow" : "rdy.fx.x"), emptyText: t("rdy.fx.empty") }));
    wirePicks(fx, (key, byKeyboard) => { pickedFactor = key; refocus = byKeyboard ? key : ""; ctx.refresh(); });
    // a re-render rebuilds the page: the picked row keeps the keyboard focus
    if (refocus) { const key = refocus; refocus = ""; afterDraw(() => { const h = fx.querySelector(`[data-pick="${key}"]`); if (h) h.focus({ preventScroll: true }); }); }
    // the build fold: replay the steps when it opens
    keepOpen(el, opened, { build: drawWf });
  },
};
