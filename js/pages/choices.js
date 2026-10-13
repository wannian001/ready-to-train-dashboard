// Everyday habits (app.R tabPanel "Everyday habits" and its server code): 18 everyday habits and conditions and
// the next morning, pooled over every participant (the shell shows the pooled-days banner above this page).
// levers_tag, the group filter (All 18 / Tonight's sleep / Food & drink / Activity / Reference states), the order
// (By group / By average difference), levers_plot (the shared interval chart from sections/readiness.js) with its
// table (accessibility.R levers_table), the picked row's definition (lever_detail) and the reading list (levers_note).
// The participant and day pickers do not change this page.
import { draw, esc } from "../../kit/js/charts.js";
import { t, fmt, dev, finite } from "../i18n.js";
import { metricHeading, cardTop, scopeChip, chartBox } from "../ui.js";
import { loadArea } from "../data.js";
import { intervalChart, intervalHeight, intervalLegend, wirePicks, keepOpen, verdict, bhNote, pLine, g2, preciseEffects, wide, afterDraw } from "../sections/readiness.js";
import "../i18n/terms.js";
import "../i18n/readiness.js";

export const SORTED = "__sorted";
// visuals.R lever_rows(): the estimable rows of one group (or all), by group in the specs' order, or sorted by the
// average difference (most negative first, ties in R's order) under one heading with a short group tag on each row
export function leverRows(effects, filter, order, axes, groups) {
  let z = effects.filter((e) => finite(e.effect));
  if (filter !== "all") z = z.filter((e) => e.group === filter);
  if (order === "effect") {
    return z.map((e, i) => ({ e, i })).sort((a, b) => a.e.effect - b.e.effect || a.i - b.i)
      .map(({ e }) => ({ ...e, heading: SORTED, tag: axes.lever_group_short[e.group] }));
  }
  return z.map((e) => ({ ...e, heading: e.group, tag: null }))
    .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || axes.lever_order.indexOf(a.key) - axes.lever_order.indexOf(b.key));
}
export const headingText = (h) => (h === SORTED ? t("chs.sorted") : t(`group.${h}`));
export function leverTip(r) {
  return t("chs.tip", { group: r.tag ? t(`chs.tag.${r.tag}`) : t(`group.${r.group}`), label: t(`lever.${r.key}`), detail: t(`lever.${r.key}.detail`), yes: r.yes, n: fmt(r.n),
    people: r.people, effect: dev(r.effect, 2), lo: dev(r.lo, 2), hi: dev(r.hi, 2), p: pLine(r), verdict: verdict(r, r.effective, "next") });
}
function chartRows(rows, narrow) {
  return rows.map((r) => ({ key: r.key, group: r.heading, headText: headingText(r.heading), effect: r.effect, lo: r.lo, hi: r.hi, clear: r.effective, ring: false,
    label: t(`lever.${r.key}`) + (r.tag ? t("chs.row_tag", { tag: t(`chs.tag.${r.tag}`) }) : "") + (narrow ? "" : t("chs.row_people", { people: r.people })),
    tip: leverTip(r) }));
}
// accessibility.R levers_table(): the rows of the chart, in its order
function leverTable(rows) {
  return wide("rdy-t10", t("chs.caption", { n: rows.length }),
    [t("chs.h.group"), t("chs.h.habit"), t("evd.h.definition"), t("chs.h.happened"), t("evd.h.people"), t("chs.h.diff"), t("evd.h.ci"), t("evd.h.bh"), t("evd.h.verdict")],
    rows.map((r) => [esc(t(`group.${r.group}`)), esc(t(`lever.${r.key}`)), esc(t(`lever.${r.key}.detail`)), esc(t("evd.of", { a: r.yes, b: fmt(r.n) })), String(r.people),
      finite(r.effect) ? esc(t("evd.pts", { v: dev(r.effect, 2) })) : "—", finite(r.lo) ? esc(t("evd.range", { lo: dev(r.lo, 2), hi: dev(r.hi, 2) })) : "—",
      esc(g2(r.p_bh)), esc(verdict(r, r.effective, "next"))]));
}

// local state: kept while the reader moves around the site, as the R inputs are
let filter = "all", order = "group", picked = "", refocus = "";
const opened = new Set();

export default {
  load: () => loadArea("readiness"),
  render(ctx, axes) {
    const { study } = ctx;
    const groups = study.lever_groups, effects = preciseEffects(study.lever_effects, axes.lever_effects);
    if (filter !== "all" && !groups.includes(filter)) filter = "all";
    const rows = leverRows(effects, filter, order, axes, groups);
    const seg = (attr, value, on, label) => `<button type="button" data-${attr}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    const filters = [seg("lever-filter", "all", filter === "all", t("chs.f.all")), ...groups.map((g, i) => seg("lever-filter", g, filter === g, t(`chs.f.${i}`)))].join("");
    const orders = [seg("lever-order", "group", order === "group", t("chs.o.group")), seg("lever-order", "effect", order === "effect", t("chs.o.effect"))].join("");
    const pick = picked && effects.find((e) => e.key === picked);
    const definition = pick ? `<div class="insight-note definition-note"><h4>${esc(t(`lever.${pick.key}`))}</h4><p>${esc(t("chs.defined", { detail: t(`lever.${pick.key}.detail`) }))}</p></div>` : "";
    const tests = effects.filter((e) => finite(e.p)).length;
    const bh = bhNote(effects, (e) => e.effective, "rows", (e) => t(`lever.${e.key}`));
    const item = (k, vars = {}) => `<li><strong>${esc(t(`chs.note.${k}h`))}</strong>${esc(t(`chs.note.${k}`, vars))}</li>`;
    return `<div class="view-intro"><div class="title-row"><h2>${esc(t("chs.title"))}</h2>${scopeChip(t("chs.scope"))}</div><p>${esc(t("chs.intro"))}</p></div>
      <section class="health-card chs-card">
        ${cardTop(metricHeading("compare", esc(t("chs.card")), "model"), `<span class="subtle-tag">${esc(t("chs.tag", { k: effects.filter((e) => e.effective).length, n: effects.filter((e) => finite(e.effect)).length }))}</span>`)}
        <div class="chs-filters">
          <div class="seg chs-seg" role="group" aria-label="${esc(t("chs.f.aria"))}">${filters}</div>
          <div class="seg chs-seg" role="group" aria-label="${esc(t("chs.o.aria"))}">${orders}</div>
        </div>
        ${intervalLegend(false)}
        ${chartBox("chs-levers", { label: t("chs.label"), hint: t("evd.hint"), height: intervalHeight(rows.map((r) => ({ group: r.heading }))), table: leverTable(rows) })}
        ${definition}
      </section>
      <section class="health-card chs-note-card">${cardTop(metricHeading("info", esc(t("chs.note.title")), "model"))}
        <ul class="reading-list">${item(1, { tests })}${item(2, { bh })}${item(3)}${item(4)}${item(5)}</ul></section>`;
  },
  mount(el, ctx, axes) {
    const { study } = ctx;
    const rows = leverRows(preciseEffects(study.lever_effects, axes.lever_effects), filter, order, axes, study.lever_groups);
    const box = el.querySelector("#chs-levers");
    draw(box, (w) => intervalChart(chartRows(rows, w < 480), { width: w, xlim: axes.lever_xlim, breaks: axes.lever_breaks, picked, narrow: w < 480,
      sides: w < 480 ? [t("evd.lower"), t("evd.higher")] : [t("chs.lower"), t("chs.higher")], xTitle: t(w < 480 ? "chs.x_narrow" : "chs.x"), emptyText: t("chs.empty") }));
    wirePicks(box, (key, byKeyboard) => { picked = key; refocus = byKeyboard ? `#chs-levers [data-pick="${key}"]` : ""; ctx.refresh(); });
    // a keyboard press on a switch keeps the focus on it after the page is drawn again (e.detail is 0 for a key press)
    el.querySelectorAll("[data-lever-filter]").forEach((b) => { b.onclick = (e) => { filter = b.dataset.leverFilter; refocus = e.detail === 0 ? `[data-lever-filter="${CSS.escape(filter)}"]` : ""; ctx.refresh(); }; });
    el.querySelectorAll("[data-lever-order]").forEach((b) => { b.onclick = (e) => { order = b.dataset.leverOrder; refocus = e.detail === 0 ? `[data-lever-order="${order}"]` : ""; ctx.refresh(); }; });
    keepOpen(el, opened);
    // a re-render rebuilds the page: the control that was used keeps the keyboard focus
    if (refocus) { const sel = refocus; refocus = ""; afterDraw(() => { const h = el.querySelector(sel); if (h) h.focus({ preventScroll: true }); }); }
  },
};
