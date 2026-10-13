// Page 3 · "Compare habits": the participant being viewed among the others (app.R tabPanel "Compare habits").
// Ported from habits.R (rates, evidence, the dot chart, the one-habit chart, the tables), peers.R + visuals.R
// health_peer_parallel (ten measures as parallel coordinates), insights.R nhanes_cohort + visuals.R cohort_context and
// health_population_plot (NHANES outside context) and accessibility.R (the "Show the data" tables).
// Statistics come from R (tools/export/habits.R → data/habits.json); only the participant's last five matching nights
// depend on the selected day, so they are worked out here (visuals.R sleep_window).
// The comparison participant is the shell's: ctx.compare, set with data-compare="p03" (data-compare="" clears).
import { draw, esc } from "../../kit/js/charts.js";
import { t, getLang, dev, dur, rround, finite, pid, dayLabel, shortDate } from "../i18n.js";
import { loadArea } from "../data.js";
import { indexOf, wday } from "../model.js";
import { cardTop, metricHeading, scopeChip, evidenceTag, chartBox, dataTable, dayButton, smallStat } from "../ui.js";
import "../i18n/habits.js";

// ---- local view state (kept across renders) --------------------------------------------------------
const view = { habit: null, period: "workday", radius: 5 };
const folds = { detail: false, peers: true, population: false };   // the R app opens "Ten more ways" by default
const tables = {};                                                  // "Show the data" folds left open, by chart id

// ---- numbers written the R app's way ------------------------------------------------------------------
// formatC(x, format = "f", digits = d): C's printf, which rounds an exact half to even (JS toFixed rounds it up)
export function cfix(v, d = 0, bigMark = false) {
  if (!finite(v)) return "—";
  const a = Math.abs(v), long = a.toFixed(Math.min(100, d + 25));
  const [ip, fp = ""] = long.split(".");
  let s = a.toFixed(d);
  if (/^50*$/.test(fp.slice(d)) && +(d ? fp[d - 1] : ip[ip.length - 1]) % 2 === 0) s = d ? `${ip}.${fp.slice(0, d)}` : ip;
  if (bigMark) { const [i, f] = s.split("."); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f !== undefined ? `.${f}` : ""); }
  return (v < 0 && +s !== 0 ? "-" : "") + s;
}
// R's round(x): nearest whole number, an exact half to even (on the very same double R has)
export const rint = (x) => { const f = Math.floor(x); return x - f === 0.5 ? (f % 2 ? f + 1 : f) : Math.round(x); };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// peers.R clock_label()
export function clockLabel(h) {
  if (!finite(h)) return "—";
  const x = (((h + 24) % 24) + 24) % 24, m = ((rint(x * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
// peers.R peer_value_label()
export function peerValueLabel(v, unit) {
  if (!finite(v)) return "—";
  switch (unit) {
    case "clock": return clockLabel(v);
    case "hour": return t("pe.unit.hour", { v: cfix(v, 1) });
    case "pct": return t("pe.unit.pct", { v: cfix(100 * v, 1) });
    case "pct100": return t("pe.unit.pct100", { v: cfix(v, 0) });
    case "bpm": return t("pe.unit.bpm", { v: cfix(v, 1) });
    case "load": return t("pe.unit.load", { v: commas(rint(v)) });
    case "rpe": return cfix(v, 1);
    case "score": return t("pe.unit.score", { v: cfix(v, 1) });
    default: return cfix(v, 1);
  }
}
// visuals.R duration_label(): round(v * 60) in R sends an exact half to even (370.5 min → "6 h 10 min"); the shell's
// dur() rounds it up
export function durR(h) {
  if (!finite(h)) return "—";
  return dur(rint(h * 60) / 60);
}
// visuals.R record_range(): "19 Mar – 25 Mar 2020"
export const recordRange = (a, b) => (!a || !b ? t("po.no_dates") : `${shortDate(a)} – ${dayLabel(b, { weekday: false })}`);

// ---- the data (data/habits.json) -------------------------------------------------------------------------
export function prepare(raw) {
  const rates = raw.rates.map(([participant, habit, num, den, eligible, gateN]) => {
    const spec = raw.specs.find((s) => s.id === habit);
    return { participant, habit, num, den, share: den > 0 ? (100 * num) / den : NaN, eligible: !!eligible, gateN, gate: spec.gate };
  });
  const dims = raw.peer_dims;
  const unitOf = Object.fromEntries(dims.map((d) => [d.key, d.unit]));
  const long = raw.peer_long.map(([key, participant, value]) => ({ key, participant, value: parseFloat(value), unit: unitOf[key] }));
  return { specs: raw.specs, min: raw.min, rates, evidence: Object.fromEntries(raw.evidence.map((e) => [e.habit, e])),
    dims, peerPeople: raw.peer_people, long, excluded: raw.peer_excluded || [], cohorts: raw.cohorts };
}
let cache = null;
async function load() {
  if (!cache) cache = loadArea("habits").then(prepare).catch((e) => { cache = null; throw e; });
  return cache;
}

// ---- words built from the data ------------------------------------------------------------------------------
const label = (h) => t(`hb.habit.${h}`);
export const reasonText = (data, r) => t(`hb.reason.${r.gate}`, { n: r.gateN, need: data.min[r.gate] });
export const evidenceText = (e) => t("hb.evidence", { effect: dev(e.effect, 2), lo: dev(e.lo, 2), hi: dev(e.hi, 2) });
export const directionText = (e) => (e.direction ? t(`hb.dir.${e.direction}`, { outcome: t(`hb.outcome.${e.habit}`) }) : "");
const rateOf = (data, p, h) => data.rates.find((r) => r.participant === p && r.habit === h);
// app.R habit_tag
export const habitTag = (data) => t("hb.tag", { n: new Set(data.rates.filter((r) => r.eligible).map((r) => r.participant)).size });
// app.R the "Compare with" list: everyone else with at least one habit over the record threshold
export const compareChoices = (data, people, id) => {
  const ok = new Set(data.rates.filter((r) => r.eligible).map((r) => r.participant));
  return people.filter((p) => p !== id && ok.has(p));
};
// app.R habit_excluded
export function excludedText(data) {
  const items = [];
  data.rates.filter((r) => !r.eligible).forEach((r) => { const s = t("hb.excluded_item", { id: pid(r.participant), reason: reasonText(data, r) }); if (!items.includes(s)) items.push(s); });
  return items.length ? t("hb.excluded", { list: items.join(t("hb.excluded_sep")) }) : "";
}
// habits.R habit_profile_summary_ui(): the five chips (text parts, for the page and the tests)
export function profileChips(data, id) {
  return data.specs.map((s) => rateOf(data, id, s.id)).filter((r) => r && r.eligible).map((r) => {
    const e = data.evidence[r.habit];
    return { habit: r.habit, label: label(r.habit), pct: `${cfix(r.share, 0)}%`, days: t("hb.chip_days", { num: r.num, den: r.den }),
      clear: !!e.clear, link: e.clear ? t("hb.linked", { evidence: evidenceText(e) }) : t("hb.no_link") };
  });
}
// habits.R habit_table(): one row per participant, cells as text
export function habitTableRows(data, id) {
  const people = [...new Set(data.rates.map((r) => r.participant))].sort();
  return people.map((p) => [pid(p) + (p === id ? t("hb.table.viewing") : ""), ...data.specs.map((s) => {
    const r = rateOf(data, p, s.id);
    return !r || !r.eligible ? `— ${r ? reasonText(data, r) : ""}` : t("hb.table.cell", { num: r.num, den: r.den, pct: rint(r.share) });
  })]);
}
// app.R compare_summary: the sentence and the fine print under it
export function compareSummary(data, id, cmp, h) {
  const e = data.evidence[h], me = rateOf(data, id, h), cp = cmp ? rateOf(data, cmp, h) : null;
  const show = (r) => (!r || !r.eligible ? t("hb.below", { id: pid(r ? r.participant : "") }) : t("hb.show", { id: pid(r.participant), pct: rint(r.share), num: r.num, den: r.den }));
  let rest;
  if (cp) {
    rest = t("hb.vs", { cp: show(cp) });
    if (me.eligible && cp.eligible) { const g = Math.abs(rint(cp.share - me.share)); rest += t(g === 1 ? "hb.apart1" : "hb.apart", { gap: g }); }
  } else rest = t("hb.click_to_compare");
  return [t("hb.summary", { label: label(h), me: show(me), rest }),
    t("hb.link_line", { text: e.clear ? `${directionText(e)}${getLang() === "zh" ? "，" : ", "}${evidenceText(e)}` : t("hb.link_none") })];
}
// app.R habit_detail_data: every participant for one habit, most frequent first
export function detailTableRows(data, h, id, cmp) {
  const z = data.rates.filter((r) => r.habit === h).sort((a, b) => (b.eligible - a.eligible) || ((finite(b.share) ? b.share : -Infinity) - (finite(a.share) ? a.share : -Infinity)));
  return z.map((r) => [pid(r.participant) + (r.participant === id ? t("hb.table.viewing") : r.participant === cmp ? t("hb.table.comparison") : ""),
    String(r.num), String(r.den), finite(r.share) ? `${rint(r.share)}%` : "—", r.eligible ? t("hb.detail.yes") : reasonText(data, r)]);
}
// accessibility.R peers_table()
export function peersTableRows(data, id) {
  const keys = [...new Set(data.long.map((x) => x.key))];
  return data.peerPeople.map((p) => [pid(p) + (p === id ? t("hb.table.viewing") : ""), ...keys.map((k) => {
    const z = data.long.find((x) => x.key === k && x.participant === p);
    return z ? peerValueLabel(z.value, z.unit) : "—";
  })]);
}
// app.R peer_note: who is missing from which measure
export const peerExcludedItems = (data) => data.excluded.map((x) => t("pe.missing_item", { who: x.who.map(pid).join(", "),
  why: t(`pe.why.${x.kind}`, { n: x.kind === "nights" ? data.min.nights : x.kind === "load" ? data.min.sessions : data.min.forms }) }));

// ---- NHANES context ---------------------------------------------------------------------------------------
export const cohortOf = (data, id, period, radius) => data.cohorts[`${id}|${period}|${radius}`];
// visuals.R sleep_window() via recent_valid_rows(): the last five nights before the day with a main sleep, Mon–Fri or
// weekend by the date the night ends
export function recentNights(p, day, period) {
  const rows = [];
  let i = indexOf(p, day);
  if (i < 0) i = day > p.last ? p.n : 0;
  for (let k = i - 1; k >= 0 && rows.length < 5; k--) {
    // sleep_hours is minutes asleep / 60, which the app reads from daily.csv written to 15 significant digits;
    // rebuilt from the minutes the same way, a mean of 385.5 minutes falls just below the half exactly as in R
    const date = p.dates[k], w = wday(date), m = p.d.sleep_minutes[k], h = finite(m) ? Number((m / 60).toPrecision(15)) : p.d.sleep_hours[k];
    const match = period === "workday" ? w >= 1 && w <= 5 : w === 0 || w === 6;
    if (match && finite(p.d.sleep_hours[k])) rows.push({ date, hours: h });
  }
  rows.reverse();
  return { rows, n: rows.length, start: rows.length ? rows[0].date : null, end: rows.length ? rows[rows.length - 1].date : null,
    mean: rows.length ? rmean(rows.map((r) => r.hours)) : NaN };
}
// R's mean(): the sum divided by n, then corrected by the mean of the residuals (summary.c)
export function rmean(x) {
  let s = 0;
  for (const v of x) s += v;
  s /= x.length;
  let r = 0;
  for (const v of x) r += v - s;
  return s + r / x.length;
}
// visuals.R cohort_context() median_label
export const medianLabel = (m) => (!finite(m) ? "—" : m === 2 ? t("po.bin.under") : m === 14 ? t("po.bin.over") : durR(m));
export const binLabel = (b) => (b === 2 ? t("po.bin.under") : b === 14 ? t("po.bin.over") : t("po.bin", { a: b, b: b + 1 }));
export const cohortCaption = (c) => t("po.caption", { gender: t(`po.${c.gender}`), lo: c.lo, hi: c.hi, n: commas(c.n) });
export const binRows = (c) => c.bins.map(([bin, pct]) => [binLabel(bin), `${cfix(pct, 1)}%`]);

// ---- chart helpers ------------------------------------------------------------------------------------------
const textW = (s, size) => [...String(s)].reduce((w, ch) => w + (/[⺀-鿿＀-￯]/.test(ch) ? size : size * 0.56), 0);
const tip = (lines) => esc(lines.filter((x) => x !== "" && x !== null && x !== undefined).join("\n")).replace(/\n/g, "&#10;");
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const empty = (width, height, lines) => `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(lines.join(". "))}">
  ${lines.map((s, i) => `<text x="${width / 2}" y="${height / 2 + (i - (lines.length - 1) / 2) * 18}" text-anchor="middle" font-size="13" fill="var(--ink-3)">${esc(s)}</text>`).join("")}</svg>`;
// a few words per line, at most `max` pixels wide (CJK breaks anywhere)
function wrap(s, size, max) {
  const cjk = /[⺀-鿿]/.test(s);
  const parts = cjk ? [...s] : s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of parts) {
    const next = cur ? (cjk ? cur + w : `${cur} ${w}`) : w;
    if (cur && textW(next, size) > max) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
const roleOf = (p, id, cmp) => (p === id ? "me" : p === cmp && cmp ? "compare" : "other");
const roleTip = (role) => t(role === "me" ? "hb.tip.me" : role === "compare" ? "hb.tip.compare" : "hb.tip.other");
const pick = (p, role, aria) => (role === "me" ? "" : `data-compare="${p}" tabindex="0" role="button" aria-label="${esc(aria)}"`);

// habits.R health_habit_dots(): five strips on one 0–100% axis; values within 4 points stack upward, the viewed
// participant ringed (circle), the comparison squared, their names in two lanes under the dots
export function habitDotsSvg(data, id, cmp, width, height = 680) {
  const z = data.rates.filter((r) => r.eligible && finite(r.share));
  if (!z.length) return empty(width, height, [t("hb.empty")]);
  const narrow = width < 480;
  const pts = [];
  data.specs.forEach((s, panel) => {
    const rows = z.filter((r) => r.habit === s.id).map((r) => ({ ...r, bin: Math.floor(r.share / 4), panel }))
      .sort((a, b) => a.bin - b.bin || (a.participant !== id) - (b.participant !== id) || (a.participant < b.participant ? -1 : 1));
    const seen = {};
    rows.forEach((r) => { seen[r.bin] = (seen[r.bin] || 0) + 1; r.y = (seen[r.bin] - 1) * 0.34; r.role = roleOf(r.participant, id, cmp); pts.push(r); });
  });
  const hasCmp = pts.some((r) => r.role === "compare");
  const top = Math.max(...pts.map((r) => r.y)) + 0.6, bottom = hasCmp ? -2.05 : -1.35;
  const padL = 10, padR = narrow ? 12 : 16, stripH = 22, gapH = 10, top0 = 4, axisH = 46;
  const panelH = (height - top0 - axisH - 5 * stripH - 4 * gapH) / 5;
  const x = (v) => padL + ((v + 3) / 106) * (width - padL - padR);
  const panelTop = (i) => top0 + i * (stripH + panelH + gapH) + stripH;
  const y = (i, v) => panelTop(i) + ((top - v) / (top - bottom)) * panelH;
  const edge = narrow ? 14 : 8;
  const anchor = (s) => (s < edge ? "start" : s > 100 - edge ? "end" : "middle");
  const out = [];
  data.specs.forEach((s, i) => {
    const title = narrow ? label(s.id) : t("hb.dots.panel", { label: label(s.id) });
    out.push(`<text x="${padL}" y="${(panelTop(i) - 7).toFixed(1)}" font-size="12.5" fill="var(--ink)">${esc(title)}</text>`);
    [0, 25, 50, 75, 100].forEach((g) => out.push(`<line x1="${x(g).toFixed(1)}" x2="${x(g).toFixed(1)}" y1="${panelTop(i).toFixed(1)}" y2="${(panelTop(i) + panelH).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`));
  });
  const R = { other: 4.2, compare: 5.2, me: 5.6 };
  const fill = { other: "var(--c-gap)", compare: "var(--ink)", me: "var(--c-expected)" };
  ["other", "compare", "me"].forEach((role) => pts.filter((r) => r.role === role).forEach((r) => {
    const cx = x(r.share), cy = y(r.panel, r.y);
    const lines = [pid(r.participant), t("hb.tip.share", { label: label(r.habit), num: r.num, den: r.den, pct: cfix(r.share, 0) }), roleTip(role)];
    out.push(`<circle class="hb-dot ${role}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R[role]}" fill="${fill[role]}" data-tip="${tip(lines)}" ${pick(r.participant, role, lines.slice(0, 2).join(", "))}/>`);
  }));
  pts.filter((r) => r.role !== "other").forEach((r) => {
    const cx = x(r.share), cy = y(r.panel, r.y);
    out.push(r.role === "me" ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="none" stroke="var(--ink)" stroke-width="1.6" pointer-events="none"/>`
      : `<rect x="${(cx - 8.5).toFixed(1)}" y="${(cy - 8.5).toFixed(1)}" width="17" height="17" fill="none" stroke="var(--ink)" stroke-width="1.5" pointer-events="none"/>`);
    const ly = y(r.panel, r.role === "me" ? -0.95 : -1.65) + 4;
    out.push(`<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor(r.share)}" font-size="${r.role === "me" ? 11.5 : 11}" ${r.role === "me" ? 'font-weight="700" fill="var(--c-expected)"' : 'fill="var(--ink)"'} pointer-events="none">${esc(`${pid(r.participant)} ${rint(r.share)}%`)}</text>`);
  });
  const axisY = panelTop(4) + panelH;
  [0, 25, 50, 75, 100].forEach((g) => out.push(`<text x="${x(g).toFixed(1)}" y="${(axisY + 17).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--ink-3)">${g}%</text>`));
  out.push(`<text x="${((x(-3) + x(103)) / 2).toFixed(1)}" y="${(axisY + 37).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--ink-3)">${esc(t(narrow ? "hb.dots.x_narrow" : "hb.dots.x"))}</text>`);
  return `<svg class="hb-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${esc(t("hb.dots.label"))}">${out.join("")}</svg>`;
}

// habits.R health_habit_detail(): one habit, every participant over the threshold, most frequent at the top, with
// numerator/denominator on the label and a dashed line joining the viewed and the comparison participant
export function habitDetailSvg(data, h, id, cmp, width, height = 430) {
  const z = data.rates.filter((r) => r.habit === h && r.eligible).sort((a, b) => a.share - b.share || (a.participant < b.participant ? -1 : 1));
  if (!z.length) return empty(width, height, [t("hb.empty_habit")]);
  const narrow = width < 480;
  const rowLab = (r) => t("hb.detail.row", { id: pid(r.participant), num: r.num, den: r.den,
    role: r.participant === id ? t("hb.detail.viewing") : r.participant === cmp ? t("hb.detail.comparison") : "" });
  const fs = narrow ? 11 : 12;
  const leftW = Math.min(width * 0.5, Math.max(...z.map((r) => textW(rowLab(r), fs))) + 14);
  const padR = 10, top0 = 6, axisH = 30;
  const x = (v) => leftW + (v / 110) * (width - leftW - padR);
  const rowH = (height - top0 - axisH) / z.length;
  // as R draws it: with a comparison, the dashed pairing line is added first and so trains the row axis first, which
  // puts the two named rows at the bottom (lower share lowest), the others above them in order
  const pair = z.filter((r) => r.participant === id || (cmp && r.participant === cmp));
  const order = pair.length === 2 ? [...pair, ...z.filter((r) => !pair.includes(r))] : z;
  const rows = [...order].reverse();
  const y = (k) => top0 + (k + 0.5) * rowH;
  const out = [];
  const breaks = narrow ? [0, 50, 100] : [0, 25, 50, 75, 100];
  breaks.forEach((g) => out.push(`<line x1="${x(g).toFixed(1)}" x2="${x(g).toFixed(1)}" y1="${top0}" y2="${(height - axisH).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`));
  const me = rows.findIndex((r) => r.participant === id), cp = cmp ? rows.findIndex((r) => r.participant === cmp) : -1;
  rows.forEach((r, k) => out.push(`<line x1="${x(0).toFixed(1)}" x2="${x(r.share).toFixed(1)}" y1="${y(k).toFixed(1)}" y2="${y(k).toFixed(1)}" stroke="var(--line-2)" stroke-width="1.5"/>`));
  if (me >= 0 && cp >= 0) out.push(`<line x1="${x(rows[me].share).toFixed(1)}" x2="${x(rows[cp].share).toFixed(1)}" y1="${y(me).toFixed(1)}" y2="${y(cp).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.3" stroke-dasharray="3 3"/>`);
  const gap = narrow ? 5 : 3;
  rows.forEach((r, k) => {
    const role = roleOf(r.participant, id, cmp), cx = x(r.share), cy = y(k);
    const lines = [pid(r.participant), t("hb.tip.share", { label: label(h), num: r.num, den: r.den, pct: cfix(r.share, 0) }), role === "other" ? t("hb.tip.other") : ""];
    const mark = role === "compare" ? `<rect x="${(cx - 4.6).toFixed(1)}" y="${(cy - 4.6).toFixed(1)}" width="9.2" height="9.2" fill="var(--ink)"/>`
      : `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.8" fill="${role === "me" ? "var(--c-expected)" : "var(--c-gap)"}"/>`;
    const right = r.share > 90, lx = x(right ? r.share - gap : r.share + gap), txt = `${rint(r.share)}%`, tw = textW(txt, 11) + 4;
    out.push(`<g class="hb-row ${role}" data-tip="${tip(lines)}" ${pick(r.participant, role, lines.slice(0, 2).join(", "))}>
      <rect x="0" y="${(cy - rowH / 2).toFixed(1)}" width="${width}" height="${rowH.toFixed(1)}" fill="transparent"/>
      <text x="${(leftW - 8).toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="end" font-size="${fs}" fill="var(--ink)"${role === "me" ? ' font-weight="650"' : ""}>${esc(rowLab(r))}</text>
      ${mark}
      <rect x="${(right ? lx - tw + 2 : lx - 2).toFixed(1)}" y="${(cy - 7.5).toFixed(1)}" width="${tw.toFixed(1)}" height="15" rx="2" fill="var(--surface)"/>
      <text x="${lx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="${right ? "end" : "start"}" font-size="11" fill="var(--ink)">${txt}</text></g>`);
  });
  breaks.forEach((g) => out.push(`<text x="${x(g).toFixed(1)}" y="${(height - axisH + 19).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--ink-3)">${g}%</text>`));
  return `<svg class="hb-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${esc(t("hb.detail.label"))}">${out.join("")}</svg>`;
}

// visuals.R health_peer_parallel(): one line per participant across the ten measures, each measure scaled on its own
// between the lowest and the highest participant; a line breaks where a participant has no value. Phone width
// (< 480 px): the measures become rows.
export const peerHeight = (width) => (width < 480 ? 760 : 460);
export function peerSvg(data, id, cmp, width) {
  const height = peerHeight(width);
  if (!data.long.length) return empty(width, height, [t("pe.empty")]);
  const narrow = width < 480;
  const keys = [...new Set(data.long.map((x) => x.key))];
  const ax = Object.fromEntries(keys.map((k, i) => [k, i + 1]));
  const range = Object.fromEntries(keys.map((k) => { const v = data.long.filter((x) => x.key === k).map((x) => x.value); return [k, [Math.min(...v), Math.max(...v)]]; }));
  const unit = Object.fromEntries(data.long.map((x) => [x.key, x.unit]));
  const pos = (x) => { const [lo, hi] = range[x.key]; return hi - lo < 1e-12 ? 0.5 : (x.value - lo) / (hi - lo); };
  const dimLabel = (k) => t(`pe.dim.${k}`);
  const n = keys.length;
  let X, Y, labels = "";
  if (!narrow) {
    const padL = 6, padR = 6, top0 = 8, axisH = 74;
    const x0 = (a) => padL + ((a - 0.55) / (n + 0.45 - 0.55)) * (width - padL - padR);
    const y0 = (p) => top0 + ((1.17 - p) / 1.34) * (height - top0 - axisH);
    X = (a) => x0(a); Y = (a, p) => y0(p);
    const XX = (a) => x0(a);
    labels = keys.map((k) => {
      const a = ax[k], [lo, hi] = range[k];
      const words = getLang() === "zh" ? t(`pe.axis.${k}`).split("\n") : dimLabel(k).split(" ");
      return `<line x1="${XX(a).toFixed(1)}" x2="${XX(a).toFixed(1)}" y1="${y0(0).toFixed(1)}" y2="${y0(1).toFixed(1)}" stroke="var(--line-2)" stroke-width="1.2"/>
        <text x="${XX(a).toFixed(1)}" y="${(y0(-0.085) + 4).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--ink-3)">${esc(peerValueLabel(lo, unit[k]))}</text>
        <text x="${XX(a).toFixed(1)}" y="${(y0(1.085) + 4).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--ink-3)">${esc(peerValueLabel(hi, unit[k]))}</text>
        <text x="${XX(a).toFixed(1)}" y="${(height - axisH + 18).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink)">${words.map((w, i) => `<tspan x="${XX(a).toFixed(1)}" dy="${i ? 12.5 : 0}">${esc(w)}</tspan>`).join("")}</text>`;
    }).join("");
  } else {
    const fs = 11, labW = Math.min(width * 0.44, 170);
    const top0 = 4, bottom0 = 4, rowH = (height - top0 - bottom0) / n;
    const px0 = labW + 10, px1 = width - 8;
    const xp = (p) => px0 + ((p + 0.03) / 1.06) * (px1 - px0);
    const yr = (a) => top0 + (a - 0.5) * rowH;
    X = (a, p) => xp(p); Y = (a) => yr(a);
    labels = keys.map((k) => {
      const a = ax[k], [lo, hi] = range[k];
      const lines = wrap(dimLabel(k), fs, labW);
      const rng = t("pe.row_range", { lo: peerValueLabel(lo, unit[k]), hi: peerValueLabel(hi, unit[k]) });
      const all = [...lines.map((s) => [s, "var(--ink)", fs]), ...wrap(rng, 10.5, labW).map((s) => [s, "var(--ink-3)", 10.5])];
      const y1 = yr(a) - ((all.length - 1) * 13) / 2 + 4;
      return `<line x1="${xp(0).toFixed(1)}" x2="${xp(1).toFixed(1)}" y1="${yr(a).toFixed(1)}" y2="${yr(a).toFixed(1)}" stroke="var(--line-2)" stroke-width="1.2"/>
        ${all.map(([s, c, size], i) => `<text x="0" y="${(y1 + i * 13).toFixed(1)}" font-size="${size}" fill="${c}">${esc(s)}</text>`).join("")}`;
    }).join("");
  }
  const pt = (x) => (narrow ? [X(ax[x.key], pos(x)), Y(ax[x.key])] : [X(ax[x.key]), Y(ax[x.key], pos(x))]);
  const people = [...new Set(data.long.map((x) => x.participant))].sort();
  const order = { other: 0, compare: 1, me: 2 };
  const lines = people.map((p) => ({ p, role: roleOf(p, id, cmp), vals: data.long.filter((x) => x.participant === p).sort((a, b) => ax[a.key] - ax[b.key]) }))
    .sort((a, b) => order[a.role] - order[b.role] || (a.p < b.p ? -1 : 1));
  const W = { other: 1.1, compare: 2.2, me: 2.8 }, R = { other: 2.4, compare: 3.3, me: 3.7 };
  const col = { other: "var(--c-gap)", compare: "var(--ink)", me: "var(--c-expected)" };
  const body = lines.map(({ p, role, vals }) => {
    const shown = (x) => peerValueLabel(x.value, x.unit);
    const segs = [];
    for (let i = 1; i < vals.length; i++) {
      const a = vals[i - 1], b = vals[i];
      if (ax[b.key] - ax[a.key] !== 1) continue;
      const [x1, y1] = pt(a), [x2, y2] = pt(b);
      segs.push(`<line class="pc-seg" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col[role]}" stroke-width="${W[role]}" stroke-linecap="round"
        data-tip="${tip(t("pe.tip.seg", { id: pid(p), from: dimLabel(a.key), to: dimLabel(b.key), a: shown(a), b: shown(b) }).split("\n"))}"/>`);
    }
    const dots = vals.map((x) => {
      const [cx, cy] = pt(x);
      return `<circle class="pc-dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R[role]}" fill="${col[role]}"
        data-tip="${tip(t("pe.tip.point", { id: pid(p), label: dimLabel(x.key), value: shown(x), role: roleTip(role) }).split("\n"))}"/>`;
    }).join("");
    const rings = role === "other" ? "" : vals.map((x) => {
      const [cx, cy] = pt(x);
      return role === "me" ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="none" stroke="var(--ink)" stroke-width="1.5" pointer-events="none"/>`
        : `<rect x="${(cx - 6.2).toFixed(1)}" y="${(cy - 6.2).toFixed(1)}" width="12.4" height="12.4" fill="none" stroke="var(--ink)" stroke-width="1.4" pointer-events="none"/>`;
    }).join("");
    const summary = [pid(p), ...vals.map((x) => `${dimLabel(x.key)}${getLang() === "zh" ? "：" : ": "}${shown(x)}`), roleTip(role)];
    return `<g class="pc-p ${role}" data-tip="${tip(summary)}" ${pick(p, role, summary.slice(0, -1).join(", "))}>${segs.join("")}${dots}${rings}</g>`;
  }).join("");
  return `<svg class="hb-svg pc-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${esc(t("pe.label"))}">${labels}${body}</svg>`;
}

// visuals.R health_population_plot(): NHANES usual sleep in grey whole-hour bars; the participant's last five
// matching Fitbit nights as violet dots in their own labelled row underneath (click one to open that day)
export function populationSvg(c, nights, who, width, height = 260) {
  if (!c || c.n < 30) return empty(width, height, [t("po.few"), t("po.few2")]);
  const top = Math.max(...c.bins.map((b) => b[1])) * 1.12, n = nights.length;
  const yMin = -top * (0.2 + Math.max(0, n - 1) * 0.035);
  const padL = 40, padR = 10, top0 = 8, bottom0 = 44;
  const x = (v) => padL + ((v - 2) / 13) * (width - padL - padR);
  const y = (v) => top0 + ((top - v) / (top - yMin)) * (height - top0 - bottom0);
  const out = [];
  c.ticks.filter((v) => v <= top + 1e-9).forEach((v) => {
    out.push(`<line x1="${padL}" x2="${width - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`);
    out.push(`<text x="${padL - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--ink-3)">${v}%</text>`);
  });
  c.bins.forEach(([bin, pct]) => {
    const x0 = x(bin + 0.5 - 0.43), x1 = x(bin + 0.5 + 0.43);
    out.push(`<rect class="po-bar" x="${x0.toFixed(1)}" y="${y(pct).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${Math.max(0, y(0) - y(pct)).toFixed(1)}" fill="var(--c-gap)"
      data-tip="${tip(t("po.tip.bin", { bin: binLabel(bin), pct: f1(rround(pct, 1)) }).split("\n"))}"/>`);
  });
  out.push(`<line x1="${padL}" x2="${width - padR}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1"/>`);
  out.push(`<text x="${x(2.05).toFixed(1)}" y="${(y(-top * 0.06) + 10).toFixed(1)}" font-size="${width < 480 ? 10 : 11}" fill="var(--c-sleep)">${esc(t("po.row", { id: who }))}</text>`);
  nights.forEach((r, i) => {
    const cx = x(Math.min(14.9, Math.max(2.1, r.hours))), cy = y(-top * (0.13 + i * 0.035));
    out.push(`<circle class="po-night" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.8" fill="var(--c-sleep)" stroke="var(--surface)" stroke-width="1"
      data-day="${r.date}" tabindex="0" role="button" aria-label="${esc(t("po.night_aria", { day: dayLabel(r.date), dur: durR(r.hours) }))}"
      data-tip="${tip(t("po.tip.night", { day: dayLabel(r.date), dur: durR(r.hours) }).split("\n"))}"/>`);
  });
  const ax = height - bottom0 + 18;
  [[2.5, "<3"], [4, "4"], [6, "6"], [8, "8"], [10, "10"], [12, "12"], [14.5, "14+"]].forEach(([v, s]) =>
    out.push(`<text x="${x(v).toFixed(1)}" y="${ax}" text-anchor="middle" font-size="12" fill="var(--ink-3)">${esc(s)}</text>`));
  out.push(`<text x="${((x(2) + x(15)) / 2).toFixed(1)}" y="${height - 5}" text-anchor="middle" font-size="12" fill="var(--ink-3)">${esc(t("po.x"))}</text>`);
  return `<svg class="hb-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${esc(t("po.label"))}">${out.join("")}</svg>`;
}

// ---- the page ---------------------------------------------------------------------------------------------------
const fold = (key) => (folds[key] ? " open" : "");
function profileSummaryHtml(data, id) {
  const chips = profileChips(data, id);
  if (!chips.length) return `<p class="empty-note">${esc(t("hb.not_eligible"))}</p>`;
  return `<div class="habit-profile-summary">
    <div class="card-top"><h3>${esc(t("hb.glance", { id: pid(id) }))}</h3><span class="subtle-tag">${esc(t("hb.glance_tag"))}</span></div>
    <div class="habit-count-grid">${chips.map((c) => `<div class="habit-count-chip"><span>${esc(c.label)}</span><strong>${esc(c.pct)}</strong>
      <small>${esc(c.days)}</small><small class="habit-link ${c.clear ? "clear" : "none"}">${esc(c.link)}</small></div>`).join("")}</div></div>`;
}
const textTable = (caption, headers, rows) => dataTable(caption, headers, rows.map((r) => r.map((c) => esc(c))));

function render(ctx, data) {
  const id = ctx.id, cmp = ctx.compare && ctx.compare !== id ? ctx.compare : "";
  if (!view.habit) view.habit = data.specs[0].id;
  const people = ctx.study.people.map((p) => p.participant).sort();
  const choices = compareChoices(data, people, id);
  const h = view.habit;

  // ---- the habits card
  const options = [`<option value="" ${cmp ? "" : "selected"}>${esc(t("hb.nobody"))}</option>`,
    ...choices.map((p) => `<option value="${p}" ${p === cmp ? "selected" : ""}>${pid(p)}</option>`)].join("");
  const dotsTable = textTable(t("hb.table.caption"), [t("hb.table.participant"), ...data.specs.map((s) => label(s.id))], habitTableRows(data, id));
  const ex = excludedText(data);
  const [sum1, sum2] = compareSummary(data, id, cmp, h);
  const detailTable = textTable(t("hb.detail.caption", { label: label(h), unit: t(`hb.unit.${h}`) }),
    [t("hb.table.participant"), t("hb.detail.h_num"), t("hb.detail.h_den"), t("hb.detail.h_share"), t("hb.detail.h_in")], detailTableRows(data, h, id, cmp));
  const habitCard = `<div class="health-card habits-card">
    ${cardTop(metricHeading("compare", esc(t("hb.card")), "model"), `<span class="subtle-tag">${esc(habitTag(data))}</span>`)}
    ${profileSummaryHtml(data, id)}
    <div class="compare-row">
      <label class="picker compare-picker"><span>${esc(t("hb.compare_with"))}</span><select id="hb-compare" class="control-select">${options}</select></label>
      <div class="compare-actions">
        <button type="button" class="btn soft" id="hb-adopt" ${cmp ? "" : "disabled"}>${esc(cmp ? t("hb.adopt", { id: pid(cmp) }) : t("hb.adopt_none"))}</button>
        <button type="button" class="btn text" data-compare="" ${cmp ? "" : "disabled"}>${esc(t("hb.clear"))}</button>
      </div>
    </div>
    ${chartBox("hb-dots", { label: t("hb.dots.label"), hint: t("hb.dots.hint"), height: 680, table: dotsTable })}
    ${ex ? `<p class="fine-print">${esc(ex)}</p>` : ""}
    <details class="sub-module" data-fold="detail"${fold("detail")}>
      <summary><span class="summary-title">${esc(t("hb.one"))}</span><span class="subtle-tag">${esc(t("hb.one_tag"))}</span></summary>
      <div class="hb-control"><span class="hb-control-label" id="hb-habit-label">${esc(t("hb.habit_pick"))}</span>
        <div class="seg hb-seg" role="group" aria-labelledby="hb-habit-label">${data.specs.map((s) => `<button type="button" data-habit="${s.id}" aria-pressed="${s.id === h}">${esc(label(s.id))}</button>`).join("")}</div></div>
      <p class="comparison-conclusion">${esc(sum1)}</p>
      <p class="fine-print">${esc(sum2)}</p>
      ${chartBox("hb-detail", { label: t("hb.detail.label"), hint: t("hb.detail.hint"), height: 430, table: detailTable })}
    </details>
  </div>`;

  // ---- ten more ways participants differ
  const peerTable = textTable(t("pe.table.caption"), [t("hb.table.participant"), ...[...new Set(data.long.map((x) => x.key))].map((k) => t(`pe.dim.${k}`))], peersTableRows(data, id));
  const missing = peerExcludedItems(data);
  const peerCard = `<details class="health-card lower-module peer-card" data-fold="peers"${fold("peers")}>
    <summary><span class="summary-title">${esc(t("pe.title"))}</span>${evidenceTag("record", t("pe.tag"))}</summary>
    <p class="chart-lede">${esc(t("pe.lede"))}</p>
    ${chartBox("hb-peers", { label: t("pe.label"), hint: t("pe.hint"), height: 460, table: peerTable })}
    ${missing.length ? `<h3 class="peer-subhead">${esc(t("pe.missing"))}</h3><ul class="fine-print peer-missing">${missing.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    <p class="fine-print"><strong>${esc(t("pe.steps_b"))}</strong>${esc(t("pe.steps"))}</p>
  </details>`;

  // ---- outside context (NHANES)
  const c = cohortOf(data, id, view.period, view.radius);
  const nights = recentNights(ctx.person, ctx.focus, view.period);
  const popTable = !c || c.n < 30 ? `<p class="empty-note">${esc(t("po.paused"))}</p>`
    : textTable(t("po.t1.caption"), [t("po.t1.hours"), t("po.t1.share")], binRows(c))
      + dataTable(t("po.t2.caption"), [t("po.t2.date"), t("po.t2.sleep")], nights.rows.map((r) => [dayButton(r.date), esc(durR(r.hours))]));
  const seg = (key, value, items) => `<div class="seg" role="group" aria-labelledby="hb-${key}-label">${items.map(([v, s]) => `<button type="button" data-${key}="${v}" aria-pressed="${v === value}">${esc(s)}</button>`).join("")}</div>`;
  const popCard = `<details class="health-card lower-module population-card" data-fold="population"${fold("population")}>
    <summary><span class="summary-title">${esc(t("po.title"))}</span>${evidenceTag("record", t("po.tag"))}</summary>
    <p class="chart-lede">${esc(t("po.lede"))}</p>
    <div class="population-controls">
      <div class="hb-control"><span class="hb-control-label" id="hb-period-label">${esc(t("po.nights"))}</span>${seg("period", view.period, [["workday", t("po.workday")], ["nonworkday", t("po.nonworkday")]])}</div>
      <label class="picker hb-radius"><span>${esc(t("po.age"))}</span><select id="hb-radius" class="control-select">${[5, 10].map((r) => `<option value="${r}" ${r === view.radius ? "selected" : ""}>${esc(t("po.radius", { n: r }))}</option>`).join("")}</select></label>
    </div>
    <div class="population-layout">
      <div class="population-info">
        <p class="cohort-caption">${c ? esc(cohortCaption(c)) : ""}</p>
        <div class="population-values">
          ${smallStat(t(`po.last5.${view.period}`, { id: pid(id) }), durR(nights.mean), t("po.fitbit", { range: recordRange(nights.start, nights.end) }))}
          ${smallStat(t("po.median"), c ? medianLabel(c.median) : "—", t("po.median_note"))}
        </div>
      </div>
      <div class="population-plot">${chartBox("hb-population", { label: t("po.label"), hint: t("po.hint"), height: 260, table: popTable })}</div>
    </div>
  </details>`;

  return `<div class="view-intro"><div class="title-row"><h2>${esc(t("hb.title", { id: pid(id) }))}</h2>${scopeChip(t("hb.scope"))}</div>
      <p>${esc(t("hb.lede"))}</p></div>
    ${habitCard}${peerCard}${popCard}`;
}

function mount(el, ctx, data) {
  const id = ctx.id, cmp = ctx.compare && ctx.compare !== id ? ctx.compare : "";
  const c = cohortOf(data, id, view.period, view.radius);
  const nights = recentNights(ctx.person, ctx.focus, view.period);
  draw(el.querySelector("#hb-dots"), (w) => habitDotsSvg(data, id, cmp, w));
  draw(el.querySelector("#hb-detail"), (w) => habitDetailSvg(data, view.habit, id, cmp, w));
  draw(el.querySelector("#hb-peers"), (w) => peerSvg(data, id, cmp, w));
  draw(el.querySelector("#hb-population"), (w) => populationSvg(c, nights.rows, pid(id), w));

  el.querySelector("#hb-compare").addEventListener("change", (e) => ctx.setCompare(e.target.value));
  el.querySelector("#hb-adopt").addEventListener("click", () => { if (cmp) ctx.setPerson(cmp); });
  el.querySelectorAll("[data-habit]").forEach((b) => b.addEventListener("click", () => { view.habit = b.dataset.habit; ctx.refresh(); }));
  el.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { view.period = b.dataset.period; ctx.refresh(); }));
  el.querySelector("#hb-radius").addEventListener("change", (e) => { view.radius = +e.target.value; ctx.refresh(); });
  // folds stay as the reader left them when the page is drawn again
  el.querySelectorAll("details[data-fold]").forEach((d) => d.addEventListener("toggle", () => { folds[d.dataset.fold] = d.open; }));
  el.querySelectorAll("figure.chart-shell").forEach((f) => {
    const box = f.querySelector(".chart"), d = f.querySelector("details.chart-data");
    if (!box || !d) return;
    if (tables[box.id]) d.open = true;
    d.addEventListener("toggle", () => { tables[box.id] = d.open; });
  });
}

export default { load, render, mount };
