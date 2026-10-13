// Small HTML builders every page uses, ported from app.R and accessibility.R. They return strings.
// Interactions are delegated by the shell (app.js): data-day="2020-03-26" on any element opens that day,
// data-go="today/sleep" opens a page, data-reveal="show|hide" reveals or hides the day's check-in,
// data-compare="p03" (or "") sets the comparison participant. Charts put their numbers in data-tip.
import { esc } from "../kit/js/charts.js";
import { t, shortDate, dayLabel, finite } from "./i18n.js";

export { esc };

// the R app's stroke icons (visuals.R icon_svg)
const ICON = {
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  compare: '<path d="M5 20V10m7 10V4m7 16V7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  body: '<circle cx="12" cy="4.5" r="2.2"/><path d="M12 7.5v7m0 0-3 6.5m3-6.5 3 6.5M6.5 10.5 12 9l5.5 1.5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
};
export const icon = (name, size = 20) =>
  `<svg class="metric-icon" width="${size}" height="${size}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ICON.check}</svg>`;

// evidence layer next to a module title: words plus a glyph, never colour alone (app.R evidence_tag)
const GLYPH = { record: "●", association: "◆", hypothesis: "◌" };
export const evidenceTag = (kind, text) =>
  `<span class="evidence-tag ${kind}"><span class="tag-glyph" aria-hidden="true">${GLYPH[kind] || "·"}</span>${esc(text)}</span>`;
// the unit of analysis and time span of a module (app.R scope_chip)
export const scopeChip = (text) => `<span class="scope-chip">${esc(text)}</span>`;
// a card's heading row: icon + title on the left, tags on the right. kind colours the icon: blue, purple, model, ...
export const metricHeading = (iconName, title, kind = "") => `<div class="metric-heading ${kind}">${icon(iconName)}<h2>${title}</h2></div>`;
export const cardTop = (heading, ...right) => `<div class="card-top">${heading}${right.filter(Boolean).join("")}</div>`;
// the title block of a Today detail page
export const detailHeader = (title, lede) => `<div class="detail-header"><h2>${esc(title)}</h2><p>${lede}</p></div>`;
// a fold with method notes (the kit's .how)
export const methodNote = (title, body) => `<details class="how"><summary>${esc(title)}</summary>${body}</details>`;
// a small labelled number (app.R small_stat)
export const smallStat = (label, value, suffix = "") =>
  `<div class="small-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(suffix)}</small></div>`;

// A chart's box (accessibility.R chart_ui): a label for screen readers, an optional hint, the box the chart is
// drawn into (draw(el, fn) from the kit, at its real width) and the "Show the data" table with the same records.
export function chartBox(id, { label, hint = "", height = 240, table = "" } = {}) {
  return `<figure class="chart-shell" data-chart-label="${esc(label)}">
    <p class="sr">${esc(label)}</p>
    ${hint ? `<p class="chart-hint"><span aria-hidden="true">☝</span>${esc(hint)}</p>` : ""}
    <div class="chart" id="${id}" style="min-height:${height}px"></div>
    ${table ? `<details class="chart-data"><summary>${esc(t("ui.show_data"))}</summary>${table}</details>` : ""}
  </figure>`;
}
// a table of the same records as a chart (accessibility.R view_table); rows are arrays of cell HTML
export function dataTable(caption, headers, rows) {
  if (!rows.length) return `<p class="empty-note">${esc(t("ui.no_records"))}</p>`;
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(caption)}"><table><caption>${esc(caption)}</caption>
    <thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
// a button that opens a day (accessibility.R view_date_button)
export const dayButton = (iso) =>
  `<button type="button" class="date-visit" data-day="${iso}" aria-label="${esc(t("ui.open_day", { day: dayLabel(iso) }))}">${esc(shortDate(iso))}</button>`;
export const revealButton = (cls = "soft") => `<button type="button" class="btn ${cls}" data-reveal="show">${esc(t("reveal.button"))}</button>`;
export const hideButton = (label = t("reveal.hide")) => `<button type="button" class="btn text" data-reveal="hide">${esc(label)}</button>`;

// five cells for a 1–5 check-in answer, the given one filled (day_view.R likert_cells_ui)
export function likertCells(label, v) {
  const ok = finite(v);
  const word = ok ? t(`likert.${v}`) : t("likert.none");
  return `<div class="likert-row"><span class="likert-label">${esc(label)}</span>
    <span class="likert-cells" role="img" aria-label="${esc(ok ? t("likert.aria", { label, v, word }) : `${label} · ${word}`)}">${[1, 2, 3, 4, 5]
      .map((k) => `<span class="likert-cell${ok && v === k ? " on" : ""}">${k}</span>`).join("")}</span>
    <span class="likert-word">${esc(word)}</span></div>`;
}

import { addWords } from "./i18n.js";
addWords({
  en: {
    "ui.no_records": "No records to show.",
    "ui.open_day": "Open {day}",
    "likert.1": "much worse", "likert.2": "worse than usual", "likert.3": "same as usual", "likert.4": "better than usual", "likert.5": "much better",
    "likert.none": "not recorded",
    "likert.aria": "{label} {v} of 5, {word}",
  },
  zh: {
    "ui.no_records": "没有可以显示的记录。",
    "ui.open_day": "打开 {day}",
    "likert.1": "差很多", "likert.2": "比平常差", "likert.3": "和平常一样", "likert.4": "比平常好", "likert.5": "好很多",
    "likert.none": "没有记录",
    "likert.aria": "{label} {v}/5，{word}",
  },
});
