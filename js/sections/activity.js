// Today › Steps (app.R tabPanel "Activity detail" and its server outputs): activity_summary (activity_windows: the
// selected day, the 7-day and the 4-week averages with their recorded time, and the fine print), the 7 days / 4 weeks
// switch, activity_lede, and activity_heatmap (visuals.R health_activity_heatmap) with its table (accessibility.R
// activity_table). Hourly steps come from web/data/training/<id>.json (tools/export/training.R).
// Steps are not part of the hidden check-in, so this page reads the full record (R uses person() here).
import { draw, esc } from "../../kit/js/charts.js";
import { t, fmt, rround, dur, dayLabel, shortDate, finite } from "../i18n.js";
import "../i18n/training.js";
import { addDays, indexOf, at, dayRange, wday } from "../model.js";
import { metricHeading, cardTop, detailHeader, chartBox, dataTable, dayButton, evidenceTag } from "../ui.js";
import { loadAreaPerson } from "../data.js";
import { textW, emptyChart, svgOpen, tipAttr, keepFolds } from "./training.js";

// ---- app.R activity_windows(): the selected day and the 7-day and 4-week averages ----------------------------------
export function activityWindows(p, day) {
  const one = (n) => {
    const ds = dayRange(addDays(day, -(n - 1)), day).filter((d) => indexOf(p, d) >= 0);
    const ok = ds.filter((d) => finite(at(p, "steps", d))), both = ok.filter((d) => finite(at(p, "step_minutes", d)));
    const avg = (list, key) => list.reduce((s, d) => s + at(p, key, d), 0) / list.length;
    return { days: ok.length, steps: ok.length ? avg(ok, "steps") : NaN, minutes: both.length ? avg(both, "step_minutes") : NaN };
  };
  return { steps: at(p, "steps", day), minutes: at(p, "step_minutes", day), s7: one(7), s28: one(28) };
}

// ---- the hourly record: steps[i][hour] and minutes[i][hour] for the day first + i, null = no record ----------------
export function hourly(h, iso) {
  const i = h ? Math.round((Date.parse(iso) - Date.parse(h.first)) / 86400000) : -1;
  const s = i >= 0 && i < h.n ? h.steps[i] : null, m = i >= 0 && i < h.n ? h.minutes[i] : null;
  return Array.from({ length: 24 }, (_, k) => (s && finite(s[k]) ? { steps: s[k], minutes: m ? m[k] : null } : null));
}
const windowDays = (day, span) => dayRange(addDays(day, -(span - 1)), day);
// how many hours of the window have a record (app.R activity_lede)
export const recordedHours = (h, day, span) => windowDays(day, span).reduce((n, d) => n + hourly(h, d).filter(Boolean).length, 0);
// accessibility.R activity_table(): one row per day, steps summed in 6-hour blocks
export function activityRow(h, d) {
  const hrs = hourly(h, d);
  const block = (lo, hi) => { const v = hrs.slice(lo, hi + 1).filter(Boolean); return v.length ? fmt(v.reduce((s, x) => s + x.steps, 0)) : t("acd.no_record"); };
  return [d, block(0, 5), block(6, 11), block(12, 17), block(18, 23), String(hrs.filter((x) => !x).length)];
}

// ---- visuals.R health_activity_heatmap(): rows = days (latest at the top), columns = hours ------------------------------
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 23];
const SCALE_TICKS = [0, 500, 2000, 5000];
function heatmap(h, day, span, w) {
  const H = 320, dates = windowDays(day, span), grid = dates.map((d) => hourly(h, d));
  const values = grid.flat().filter(Boolean).map((c) => c.steps);
  if (!values.length) return emptyChart(w, H, t("acd.empty"));
  const lo = Math.min(...values), hi = Math.max(...values), sl = Math.sqrt(lo), sh = Math.sqrt(hi);
  const frac = (v) => (sh > sl ? (Math.sqrt(v) - sl) / (sh - sl) : 0.5);       // square-root colour scale over the window
  const short = span <= 14;
  const rowLabel = (d) => (short ? dayLabel(d, { year: false }) : shortDate(d));
  const labelled = (d) => short || wday(d) === 1;                              // 4 weeks: one label a week (Mondays)
  const lw = Math.max(...dates.filter(labelled).map((d) => textW(rowLabel(d), 11)), 30) + 10;
  const m = { l: lw, r: 4, t: 62, b: 40 };
  const cw = (w - m.l - m.r) / 24, rh = (H - m.t - m.b) / span;
  const out = [svgOpen(w, H, t("acd.chart"))];
  // the colour key: square-root scale, labelled where the window reaches
  const kw = Math.min(260, w - m.l - m.r), kx = m.l;
  out.push(`<defs><linearGradient id="acd-key" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--c-steps)" stop-opacity=".07"/>
    <stop offset="1" style="stop-color:var(--c-steps)" stop-opacity="1"/></linearGradient></defs>
    <text x="${kx}" y="12" font-size="11" fill="var(--ink-3)">${esc(t("acd.scale"))}</text>
    <rect x="${kx}" y="19" width="${kw.toFixed(1)}" height="10" rx="2" fill="url(#acd-key)"/>`);
  SCALE_TICKS.filter((v) => v >= lo && v <= hi).forEach((v) => {
    const tx = kx + frac(v) * kw;
    out.push(`<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="29" y2="33" stroke="var(--ink-3)"/>
      <text x="${tx.toFixed(1)}" y="45" text-anchor="${tx - kx < 8 ? "start" : "middle"}" font-size="11" fill="var(--ink-3)" class="num">${fmt(v)}</text>`);
  });
  dates.forEach((d, k) => {
    const y0 = m.t + (span - 1 - k) * rh, label = dayLabel(d);
    // the row's label opens the day by keyboard too (the cells are mouse-only; the table below has every day)
    out.push(`<rect x="0" y="${y0.toFixed(1)}" width="${(lw - 4).toFixed(1)}" height="${rh.toFixed(1)}" fill="transparent" data-day="${d}" tabindex="0" role="button"
      aria-label="${esc(t("ui.open_day", { day: label }))}"/>`);
    if (labelled(d)) out.push(`<text x="${lw - 8}" y="${(y0 + rh / 2 + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink-2)" pointer-events="none">${esc(rowLabel(d))}</text>`);
    grid[k].forEach((c, hour) => {
      const x = m.l + hour * cw, tip = t("acd.tip", { day: label, hour: String(hour).padStart(2, "0"),
        what: c ? t("acd.tip_steps", { v: fmt(c.steps), m: c.minutes }) : t("acd.tip_none") });
      const cell = `x="${(x + cw * 0.015).toFixed(1)}" y="${(y0 + rh * 0.05).toFixed(1)}" width="${(cw * 0.97).toFixed(1)}" height="${(rh * 0.9).toFixed(1)}"`;
      if (c) out.push(`<rect ${cell} rx="1.5" fill="var(--c-steps)" fill-opacity="${(0.07 + 0.93 * frac(c.steps)).toFixed(3)}" data-day="${d}" data-tip="${tipAttr(tip)}"/>`);
      else {
        const cx = x + cw / 2, cy = y0 + rh / 2, s = Math.min(2.6, rh * 0.22, cw * 0.22);
        out.push(`<rect ${cell} rx="1.5" fill="var(--c-band)" data-day="${d}" data-tip="${tipAttr(tip)}"/>`,
          `<path d="M${(cx - s).toFixed(1)} ${(cy - s).toFixed(1)}l${(2 * s).toFixed(1)} ${(2 * s).toFixed(1)}m0 ${(-2 * s).toFixed(1)}l${(-2 * s).toFixed(1)} ${(2 * s).toFixed(1)}"
          stroke="var(--ink-3)" stroke-width="1" pointer-events="none"/>`);
      }
    });
  });
  HOUR_TICKS.forEach((hr) => out.push(`<text x="${(m.l + (hr + 0.5) * cw).toFixed(1)}" y="${H - m.b + 15}" text-anchor="middle" font-size="11" fill="var(--ink-3)" class="num">${String(hr).padStart(2, "0")}</text>`));
  out.push(`<text x="${(m.l + 12 * cw).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${esc(t("acd.x"))}</text>`, "</svg>");
  return out.join("");
}
function heatTable(h, day, span) {
  return dataTable(t("acd.table", { span }), [t("acd.h.date"), "00–05", "06–11", "12–17", "18–23", t("acd.h.none")],
    windowDays(day, span).map((d) => { const r = activityRow(h, d); return [dayButton(d), ...r.slice(1).map(esc)]; }));
}

// ---- module state --------------------------------------------------------------------------------------------
let heatSpan = 7;                                // the 7 days / 4 weeks switch

export default {
  load: (ctx) => loadAreaPerson("training", ctx.id).catch(() => null),

  render(ctx, h) {
    const { person: p, focus } = ctx;
    const a = activityWindows(p, focus);
    const block = (title, steps, minutes, note) => `<div class="activity-stat"><span>${esc(title)}</span>
      <strong>${esc(finite(steps) ? t("acd.steps", { v: fmt(rround(steps)) }) : t("acd.no_record"))}</strong>
      <small>${esc(finite(minutes) ? t("acd.over", { dur: dur(minutes / 60), note }) : note)}</small></div>`;
    const summary = `<section class="health-card activity-summary-card">
      ${cardTop(metricHeading("calendar", esc(t("acd.summary")), "teal"), evidenceTag("record", t("acd.summary_tag")))}
      <div class="activity-stat-grid">
        ${block(dayLabel(focus, { year: false }), a.steps, a.minutes, t("acd.selected"))}
        ${block(t("acd.avg7"), a.s7.steps, a.s7.minutes, t("acd.days", { n: a.s7.days }))}
        ${block(t("acd.avg28"), a.s28.steps, a.s28.minutes, t("acd.days", { n: a.s28.days }))}</div>
      <p class="fine-print">${esc(t("acd.fine"))}</p></section>`;
    const seg = `<div class="trd-range acd-range" role="group" aria-label="${esc(t("acd.range"))}"><span>${esc(t("acd.range"))}</span><div class="seg">
      ${[[7, "acd.d7"], [28, "acd.d28"]].map(([v, k]) => `<button type="button" data-heat="${v}" aria-pressed="${heatSpan === v}">${esc(t(k))}</button>`).join("")}</div></div>`;
    const lede = t("acd.heat_lede", { shade: t(ctx.dark ? "acd.brighter" : "acd.darker"), n: recordedHours(h, focus, heatSpan), total: heatSpan * 24 });
    const heat = `<section class="health-card activity-card">
      ${cardTop(metricHeading("calendar", esc(t("acd.heat")), "teal"), evidenceTag("record", t("acd.heat_tag")))}
      ${seg}
      <p class="chart-lede">${esc(lede)}</p>
      ${chartBox("acd-heat", { label: t("acd.chart"), hint: t("acd.hint"), height: 320, table: heatTable(h, focus, heatSpan) })}</section>`;
    return `${detailHeader(t("acd.title"), esc(t("acd.lede")))}${summary}${heat}`;
  },

  mount(el, ctx, h) {
    draw(el.querySelector("#acd-heat"), (w) => heatmap(h, ctx.focus, heatSpan, w));
    keepFolds(el, "activity");
    el.querySelectorAll("[data-heat]").forEach((b) => b.addEventListener("click", () => { heatSpan = +b.dataset.heat; ctx.refresh(); }));
  },
};
