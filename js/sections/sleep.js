// Today › Sleep (app.R "Sleep detail"): the week of main-sleep windows (output$sleep_window: story_visuals.R
// sleep_window_data, health_sleep_window_plot, sleep_window_table, sleep_window_note) and last night against the
// participant's usual (output$compare_rows: day_view.R usual_stats, compare_row_ui, likert_cells_ui).
// Sleep times, hours asleep and resting heart rate come at R's own precision (web/data/body/<id>.json, written by
// tools/export/body.R), and medians, quantiles and roundings follow R step by step, so every clock time and duration
// matches the app (tests/body.test.mjs checks every participant-day).
import { draw, esc } from "../../kit/js/charts.js";
import { t, getLang, dayLabel, shortDate, weekdayShort, finite } from "../i18n.js";
import { round0, fixed, rfmt, rdur, rgap, rclock } from "../i18n/body.js";
import { addDays, diffDays, at } from "../model.js";
import { evidenceTag, metricHeading, cardTop, detailHeader, chartBox, dataTable, dayButton, likertCells } from "../ui.js";
import { loadAreaPerson } from "../data.js";

const SPAN = 7;
const NARROW = 480;
// about how wide an 11 px label is: CJK characters are square, Latin ones about 0.56 em
const labelWidth = (s) => [...String(s)].reduce((w, ch) => w + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 11 : 6.2), 0);

// ---- R's statistics, operation for operation (arm64 R: long double is double) -----------------------------------
// mean(): the sum divided by n, then one correction pass
export function rMean(v) {
  const n = v.length;
  if (!n) return NaN;
  let s = 0;
  for (const x of v) s += x;
  s /= n;
  if (Number.isFinite(s)) { let c = 0; for (const x of v) c += x - s; s += c / n; }
  return s;
}
// median(): the middle value, or mean() of the middle two
export function rMedian(values) {
  const v = values.filter(finite).sort((a, b) => a - b), n = v.length;
  if (!n) return NaN;
  const half = Math.floor((n + 1) / 2);
  return n % 2 === 1 ? v[half - 1] : rMean([v[half - 1], v[half]]);
}
// quantile(type = 7) on sorted values: (1 − h) · x[lo] + h · x[hi]
export function rQuantile(sorted, p) {
  const n = sorted.length, index = 1 + Math.max(n - 1, 0) * p, lo = Math.floor(index), hi = Math.ceil(index);
  let q = sorted[lo - 1];
  if (index > lo && sorted[hi - 1] !== q) { const h = index - lo; q = (1 - h) * q + h * sorted[hi - 1]; }
  return q;
}
// day_view.R usual_stats(): the participant's usual value (median over the whole record), middle half, range
export function usualStatsR(values) {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (v.length < 5) return null;
  return { n: v.length, q25: rQuantile(v, 0.25), median: rQuantile(v, 0.5), q75: rQuantile(v, 0.75), lo: v[0], hi: v[v.length - 1] };
}

// ---- one participant's sleep record ------------------------------------------------------------------------
// start_hour / end_hour / sleep_hours / resting_hr at full precision; the minute counts from the person record
export function sleepRecord(person, exact) {
  const get = (key, iso) => {
    if (key in exact && Array.isArray(exact[key])) {
      const i = diffDays(iso, exact.first);
      return i >= 0 && i < exact.n ? exact[key][i] ?? null : null;
    }
    return at(person, key, iso);
  };
  return { person, get, first: person.first, last: person.last, dates: person.dates };
}

// story_visuals.R sleep_window_data(): the nights dated span−1 days before the day up to the day. Times are hours
// from midnight; a start before noon and an end before 18:00 move to the next day so a night is one span.
export function sleepWindowData(rec, day, span = SPAN) {
  const out = [];
  for (let i = span - 1; i >= 0; i--) {
    const date = addDays(day, -i);
    const start = rec.get("start_hour", date), end = rec.get("end_hour", date), hours = rec.get("sleep_hours", date);
    const asleep = rec.get("sleep_minutes", date), awake = rec.get("awake_minutes", date);
    const startPlot = finite(start) ? (start < 12 ? start + 24 : start) : NaN;
    const endPlot = finite(end) ? (end < 18 ? end + 24 : end) : NaN;
    const valid = finite(startPlot) && finite(endPlot) && endPlot > startPlot && endPlot - startPlot <= 18;
    const both = finite(asleep) && finite(awake) ? asleep + awake : NaN;
    const eff = finite(both) && both > 0 ? 100 * asleep / both : NaN;
    out.push({ date, start, end, hours, startPlot, endPlot, valid, eff });
  }
  return out;
}
// the whole record's usual bedtime and wake time (medians of the valid nights)
export function sleepUsual(rec) {
  const all = sleepWindowData(rec, rec.last, rec.dates.length).filter((r) => r.valid);
  return { start: rMedian(all.map((r) => r.startPlot)), end: rMedian(all.map((r) => r.endPlot)) };
}
const mod24 = (h) => ((h % 24) + 24) % 24;
// sleep_window_note()
export function sleepWindowNote(rec, day, span = SPAN, usual = sleepUsual(rec)) {
  const z = sleepWindowData(rec, day, span).filter((r) => r.valid);
  if (!z.length) return { empty: t("sld.note_empty") };
  return {
    line: t("sld.note", { n: z.length, span, start: rclock(mod24(rMedian(z.map((r) => r.startPlot)))), end: rclock(mod24(rMedian(z.map((r) => r.endPlot)))),
      dur: rdur(rMean(z.map((r) => r.hours).filter(finite))) }),
    usual: t("sld.note_usual", { start: rclock(mod24(usual.start)), end: rclock(mod24(usual.end)) }),
  };
}
// the tooltip of a night (sleep_window_data()$tip, one line per <br>)
export function nightTip(r) {
  return t("sld.tip", { day: dayLabel(r.date), start: rclock(r.start), end: rclock(r.end), dur: rdur(r.hours), eff: finite(r.eff) ? t("sld.tip_eff", { eff: rfmt(r.eff, 0) }) : "" });
}
// sleep_window_table(): one row per night
export function nightCells(r) {
  const none = t("sld.no_record");
  return [r.valid ? rclock(r.start) : none, r.valid ? rclock(r.end) : none, finite(r.hours) ? rdur(r.hours) : none, finite(r.eff) ? `${rfmt(r.eff)}%` : "—"];
}
// the y axis of health_sleep_window_plot(): whole hours around the shown nights and the usual times, reversed
export function sleepAxis(rows, usual) {
  const shown = rows.filter((r) => r.valid);
  if (!shown.length) return null;
  const lo = Math.floor(Math.min(...shown.map((r) => r.startPlot), ...(finite(usual.start) ? [usual.start] : [])) - 0.7);
  const hi = Math.ceil(Math.max(...shown.map((r) => r.endPlot), ...(finite(usual.end) ? [usual.end] : [])) + 1.6);
  const breaks = [];
  for (let b = lo; b <= hi + 1e-9; b += 2) breaks.push(b);
  const pad = (hi - lo) * 0.05;
  return { lo, hi, breaks, labels: breaks.map((b) => `${String(((Math.round(b) % 24) + 24) % 24).padStart(2, "0")}:00`), range: [lo - pad, hi + pad] };
}

// ---- the week chart --------------------------------------------------------------------------------------
// fill: a light → dark violet ramp over 80–100% efficiency (scale_fill_gradient interpolates in Lab), squished at both ends
export function effFill(eff) {
  if (!finite(eff)) return "var(--c-gap)";
  const f = Math.max(0, Math.min(1, (eff - 80) / 20));
  return `color-mix(in lab, var(--sleep-eff-hi) ${(f * 100).toFixed(1)}%, var(--sleep-eff-lo))`;
}
export function sleepWindowSvg(rows, usual, focus, w) {
  const axis = sleepAxis(rows, usual);
  const narrow = w < NARROW, H = 380;
  if (!axis) return `<div class="sleep-empty" style="height:${H}px"><p>${esc(t("sld.empty"))}</p></div>`;
  const legendH = 48, bottom = 38, left = 44, right = 10, top = legendH + 6;
  const plotW = Math.max(40, w - left - right), plotH = H - top - bottom;
  const slot = plotW / rows.length, cx = (i) => left + (i + 0.5) * slot;
  const [r0, r1] = axis.range, y = (h) => top + ((h - r0) / (r1 - r0)) * plotH;
  const bw = Math.min(24, slot * 0.66), parts = [];
  // legend: title, the ramp, its three labels
  const lw = Math.min(227, w - 16), lx = 4;
  parts.push(`<text class="sw-legend-title" x="${lx}" y="12">${esc(t("sld.legend"))}</text>`);
  parts.push(`<defs><linearGradient id="sleep-eff-ramp" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" style="stop-color:var(--sleep-eff-lo)"/><stop offset="0.5" style="stop-color:color-mix(in lab, var(--sleep-eff-hi) 50%, var(--sleep-eff-lo))"/>
    <stop offset="1" style="stop-color:var(--sleep-eff-hi)"/></linearGradient></defs>`);
  parts.push(`<rect x="${lx}" y="19" width="${lw}" height="10" rx="2" fill="url(#sleep-eff-ramp)"/>`);
  parts.push(`<text class="sw-legend" x="${lx}" y="42">${esc(t("sld.legend_lo"))}</text><text class="sw-legend" x="${lx + lw / 2}" y="42" text-anchor="middle">${esc(t("sld.legend_mid"))}</text><text class="sw-legend" x="${lx + lw}" y="42" text-anchor="end">${esc(t("sld.legend_hi"))}</text>`);
  // the clock axis and its grid
  axis.breaks.forEach((b, i) => {
    parts.push(`<line class="sw-grid" x1="${left}" x2="${w - right}" y1="${y(b).toFixed(1)}" y2="${y(b).toFixed(1)}"/>`);
    parts.push(`<text class="sw-axis" x="${left - 6}" y="${(y(b) + 4).toFixed(1)}" text-anchor="end">${axis.labels[i]}</text>`);
  });
  // the participant's usual bedtime and wake time
  [usual.start, usual.end].filter(finite).forEach((u) => parts.push(`<line class="sw-usual" x1="${left}" x2="${w - right}" y1="${y(u).toFixed(1)}" y2="${y(u).toFixed(1)}"/>`));
  const mid = (usual.start + usual.end) / 2;
  rows.forEach((r, i) => {
    const x = cx(i);
    if (r.valid) {
      const y0 = y(r.startPlot), y1 = y(r.endPlot), h = Math.max(1, y1 - y0), rx = Math.min(7, bw / 2, h / 2), tip = nightTip(r);
      parts.push(`<rect class="sw-bar" x="${(x - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}"
        style="fill:${effFill(r.eff)}" data-day="${r.date}" tabindex="0" role="button" aria-label="${esc(tip.replace(/\n/g, ", "))}" data-tip="${esc(tip)}"/>`);
      if (finite(r.eff)) parts.push(`<text class="sw-pct" x="${x.toFixed(1)}" y="${(y1 + 13).toFixed(1)}" text-anchor="middle">${round0(r.eff)}%</text>`);
    } else if (finite(mid)) {
      const ym = y(mid), tip = t("sld.tip_gap", { day: dayLabel(r.date) });
      parts.push(`<g class="sw-gap" data-tip="${esc(tip)}" tabindex="0" role="img" aria-label="${esc(tip.replace(/\n/g, ", "))}">
        <path d="M${(x - 4).toFixed(1)} ${(ym - 4).toFixed(1)}l8 8m0 -8l-8 8"/><text x="${x.toFixed(1)}" y="${(ym + 18).toFixed(1)}" text-anchor="middle">${esc(t("sld.no_record"))}</text></g>`);
    }
    const here = r.date === focus ? " here" : "";
    // "20 Mar" under each night; only the day of the month when seven of them do not fit
    let day = shortDate(r.date);
    if (labelWidth(day) > slot - 4) day = getLang() === "zh" ? `${+r.date.slice(8, 10)}日` : String(+r.date.slice(8, 10));
    parts.push(`<text class="sw-day${here}" x="${x.toFixed(1)}" y="${H - bottom + 16}" text-anchor="middle">${esc(day)}</text>`);
    parts.push(`<text class="sw-wd${here}" x="${x.toFixed(1)}" y="${H - bottom + 30}" text-anchor="middle">${esc(weekdayShort(r.date))}</text>`);
  });
  return `<svg class="sw-svg${narrow ? " narrow" : ""}" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="group" aria-label="${esc(t("sld.label"))}">${parts.join("")}</svg>`;
}

// ---- last night against the usual (app.R output$compare_rows) -----------------------------------------------
const onset = (h) => (finite(h) && h < 12 ? h : NaN);
export function compareRows(rec, pv, day) {
  const series = (key, f = (x) => x) => rec.dates.map((d) => f(rec.get(key, d)));
  const sleepS = usualStatsR(series("sleep_hours")), onsetS = usualStatsR(series("start_hour", onset)), hrS = usualStatsR(series("resting_hr"));
  const sv = rec.get("sleep_hours", day), start = rec.get("start_hour", day), ov = onset(start), hv = rec.get("resting_hr", day);
  const gapText = (v, s, more, less, fn) => (!finite(v) || !s ? "" : Math.abs(v - s.median) < 1e-9 ? t("cmp.same") : t(v > s.median ? more : less, { gap: fn(Math.abs(v - s.median)) }));
  const bpm = (v) => t("cmp.bpm", { v: rfmt(v, 1) }), hr1 = (v) => rfmt(v, 1);
  const prev = addDays(day, -1);
  return {
    rows: [
      { key: "asleep", label: t("cmp.asleep"), source: t("cmp.fitbit"), valueText: finite(sv) ? rdur(sv) : t("cmp.no_record"), value: sv, stats: sleepS,
        diff: gapText(sv, sleepS, "cmp.more", "cmp.less", rgap), fmt: rdur },
      { key: "onset", label: t("cmp.onset"), source: t("cmp.fitbit"),
        valueText: finite(ov) ? rclock(ov) : finite(start) ? t("cmp.daytime", { clock: rclock(start) }) : t("cmp.no_record"), value: ov, stats: onsetS,
        diff: gapText(ov, onsetS, "cmp.later", "cmp.earlier", rgap), fmt: rclock },
      { key: "hr", label: t("cmp.hr"), source: t("cmp.fitbit_daily"), valueText: finite(hv) ? bpm(hv) : t("cmp.no_record"), value: hv, stats: hrS,
        diff: gapText(hv, hrS, "cmp.higher", "cmp.lower", bpm), fmt: hr1 },
    ],
    // yesterday's check-in from the visible record (yesterday is never hidden; the selected day's would be)
    likert: ["sleep_quality", "fatigue", "soreness", "stress", "mood"].map((k) => ({ key: k, label: t(`cmp.${k}`), value: at(pv, k, prev) })),
  };
}
// the track of compare_row_ui(): positions as CSS percentages, clamped to the record's range
export function trackOf(row) {
  const s = row.stats;
  if (!s || !finite(row.value)) return null;
  const span = Math.max(s.hi - s.lo, 1e-6), pos = (v) => `${fixed(100 * (Math.min(Math.max(v, s.lo), s.hi) - s.lo) / span, 2)}%`;
  return { band: { left: pos(s.q25), width: `${fixed(100 * (s.q75 - s.q25) / span, 2)}%` }, usual: pos(s.median), value: pos(row.value), lo: row.fmt(s.lo), hi: row.fmt(s.hi) };
}
export const scaleText = (row) => (row.stats ? t("cmp.scale", { usual: row.fmt(row.stats.median), q25: row.fmt(row.stats.q25), q75: row.fmt(row.stats.q75), n: row.stats.n }) : t("cmp.few"));
function compareRowHtml(row) {
  const tr = trackOf(row);
  const track = tr ? `<div class="cmp-track-wrap"><span class="cmp-end">${esc(tr.lo)}</span>
      <div class="cmp-track" aria-hidden="true"><span class="cmp-band" style="left:${tr.band.left};width:${tr.band.width}"></span><span class="cmp-usual" style="left:${tr.usual}"></span><span class="cmp-value" style="left:${tr.value}"></span></div>
      <span class="cmp-end">${esc(tr.hi)}</span></div>` : "";
  return `<div class="cmp-row"><div class="cmp-head"><span class="cmp-label">${esc(row.label)}</span><span class="cmp-source">${esc(row.source)}</span></div>
    <div class="cmp-main"><strong>${esc(row.valueText)}</strong><span class="cmp-diff">${esc(row.diff)}</span></div>
    ${track}<span class="cmp-scale">${esc(scaleText(row))}</span></div>`;
}

// ---- the page ----------------------------------------------------------------------------------------------
export default {
  load: (ctx) => loadAreaPerson("body", ctx.id),
  render(ctx, exact) {
    const rec = sleepRecord(ctx.person, exact);
    const rows = sleepWindowData(rec, ctx.focus), note = sleepWindowNote(rec, ctx.focus);
    const table = dataTable(t("sld.caption"), [t("sld.h.morning"), t("sld.h.asleep"), t("sld.h.awake"), t("sld.h.time"), t("sld.h.eff")],
      rows.map((r) => [dayButton(r.date), ...nightCells(r).map(esc)]));
    const cmp = compareRows(rec, ctx.pv, ctx.focus);
    const noteHtml = note.empty ? `<p class="empty-note">${esc(note.empty)}</p>`
      : `<p class="comparison-conclusion">${esc(note.line)}</p><p class="fine-print">${esc(note.usual)}</p>`;
    return `${detailHeader(t("sld.title"), esc(t("sld.lede")))}
      <section class="health-card sleep-window-card">
        ${cardTop(metricHeading("moon", esc(t("sld.week")), "purple"), evidenceTag("record", t("sld.week_tag")))}
        <p class="chart-lede">${esc(t("sld.week_lede"))}</p>
        ${chartBox("sleep-window", { label: t("sld.label"), hint: t("sld.hint"), height: 380, table })}
        ${noteHtml}
      </section>
      <section class="health-card compare-card">
        ${cardTop(metricHeading("moon", esc(t("sld.compare")), "purple"), evidenceTag("record", t("sld.compare_tag")))}
        ${cmp.rows.map(compareRowHtml).join("")}
        <div class="cmp-row likert-block"><div class="cmp-head"><span class="cmp-label">${esc(t("cmp.yesterday"))}</span><span class="cmp-source">${esc(t("cmp.likert_source"))}</span></div>
          ${cmp.likert.map((l) => likertCells(l.label, l.value)).join("")}</div>
      </section>`;
  },
  mount(el, ctx, exact) {
    const rec = sleepRecord(ctx.person, exact);
    const rows = sleepWindowData(rec, ctx.focus), usual = sleepUsual(rec);
    draw(el.querySelector("#sleep-window"), (w) => sleepWindowSvg(rows, usual, ctx.focus, w));
  },
};
