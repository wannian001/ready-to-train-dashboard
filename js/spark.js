// The overview cards' 14-day sparklines (home_cards.R), drawn at the card's real width. Same rules as the full
// charts: a missing day stays visible as a small cross, never as zero; the selected day is highlighted; a dashed
// line marks the participant's usual value where there is one.
import { esc } from "../kit/js/charts.js";
import { t, shortDate } from "./i18n.js";

const H = 60, PAD = 6;
const finite = (x) => typeof x === "number" && Number.isFinite(x);
const xAt = (i, n, w) => PAD + (i + 0.5) * (w - 2 * PAD) / n;
const cross = (x) => `<path class="spark-miss" d="M${(x - 3).toFixed(1)} ${H - 4} l6 -6 m-6 0 l6 6"/>`;
const frame = (w, parts, dates) => `<svg class="spark-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" aria-hidden="true">${parts.join("")}</svg>
  <div class="spark-axis"><span>${esc(shortDate(dates[0]))}</span><span class="spark-span">${esc(t("ov.days", { n: dates.length }))}</span><span>${esc(shortDate(dates[dates.length - 1]))}</span></div>`;

// bars for a quantity with a natural zero (sleep hours, training load, steps)
export function sparkBars(dates, values, focusDate, { color, usual = NaN, top = null, zeroIsValue = false }, w) {
  const n = dates.length;
  const tp = top ?? Math.max(1, ...values.filter(finite), finite(usual) ? usual : 1);
  const y = (v) => H - 4 - (Math.max(0, v) / tp) * (H - 10);
  const bw = ((w - 2 * PAD) / n) * 0.62;
  const parts = dates.map((d, i) => {
    const x = xAt(i, n, w), v = values[i];
    if (!finite(v)) return cross(x);
    if (v <= 0 && !zeroIsValue) return `<rect class="spark-zero" x="${(x - bw / 2).toFixed(1)}" y="${H - 5}" width="${bw.toFixed(1)}" height="1.5"/>`;
    const top = Math.min(y(v), H - 5.5);
    return `<rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - 4 - top).toFixed(1)}" rx="2" fill="${color}" fill-opacity="${d === focusDate ? 1 : 0.38}"/>`;
  });
  if (finite(usual)) parts.push(`<line class="spark-usual" x1="${PAD}" x2="${w - PAD}" y1="${y(usual).toFixed(1)}" y2="${y(usual).toFixed(1)}"/>`);
  return frame(w, parts, dates);
}

// dots on a fixed 0–10 axis for readiness; the hidden selected day is a hollow ring at the expected value
export function sparkReadiness(dates, values, focusDate, estimate, revealed, w) {
  const n = dates.length, y = (v) => H - 5 - (v / 10) * (H - 10);
  const pts = values.map((v, i) => (finite(v) ? `${xAt(i, n, w).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean);
  const parts = [`<line class="spark-grid" x1="${PAD}" x2="${w - PAD}" y1="${y(5)}" y2="${y(5)}"/>`];
  if (pts.length > 1) parts.push(`<polyline class="spark-line" points="${pts.join(" ")}"/>`);
  dates.forEach((d, i) => {
    const x = xAt(i, n, w), v = values[i];
    if (d === focusDate) {
      if (finite(revealed)) parts.push(`<circle class="spark-actual" cx="${x.toFixed(1)}" cy="${y(revealed).toFixed(1)}" r="4.2"/>`);
      else if (finite(estimate)) parts.push(`<circle class="spark-estimate" cx="${x.toFixed(1)}" cy="${y(estimate).toFixed(1)}" r="4.2"/>`);
      return;
    }
    parts.push(finite(v) ? `<circle class="spark-dot" cx="${x.toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6"/>` : cross(x));
  });
  return frame(w, parts, dates);
}

// one cell per check-in for the 1–5 soreness answer (an ordinal scale: cells, never a mean line)
export function sparkLikert(dates, values, focusDate, w) {
  const n = dates.length, cw = (w - 2 * PAD) / n;
  const parts = dates.map((d, i) => {
    const v = values[i];
    return `<rect class="spark-cell${d === focusDate ? " focus" : ""}" x="${(PAD + i * cw + 1.5).toFixed(1)}" y="16" width="${Math.max(1, cw - 3).toFixed(1)}" height="28" rx="3"
      fill="${finite(v) ? `var(--sore-${v})` : "var(--surface-2)"}"/>`;
  });
  return frame(w, parts, dates);
}
