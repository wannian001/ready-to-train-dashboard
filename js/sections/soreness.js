// Today › Soreness (app.R "Soreness detail"): the shared reveal bar; "This morning" (output$soreness_today: the
// revealed answer, the load-band sentence, story_visuals.R today_soreness_context for yesterday and the day before);
// where people were sore after a day like yesterday (output$body_region_model: body_regions.R); and the fixed
// load-vs-soreness reference (output$load_soreness: visuals.R health_load_soreness_plot, accessibility.R
// load_soreness_table, output$load_soreness_note).
// The body figure's comparison groups come from R (web/data/body.json, tools/export/body.R); everything that depends
// on the selected day is worked out here and checked against R for every participant-day (tests/body.test.mjs).
import { draw, esc } from "../../kit/js/charts.js";
import { t, getLang, dayLabel, signed, finite } from "../i18n.js";
import { round0, fixed, rfmt } from "../i18n/body.js";
import { addDays, focalBand } from "../model.js";
import { evidenceTag, scopeChip, metricHeading, cardTop, detailHeader, chartBox, dataTable, likertCells, info } from "../ui.js";
import { loadArea } from "../data.js";

const TYPES = ["running", "endurance", "strength", "team"];   // training.R / body_regions.R order
const NARROW = 480;                                            // app.R narrow(): output narrower than 480 px

// ---- yesterday and the day before, from the training log only (story_visuals.R today_soreness_context) ------------
const typesOf = (tr) => TYPES.filter((k) => tr[k]);
// day_view.R train_types_text() then tools::toTitleCase(): "Running + Team Sport"
export function typesText(tr) {
  const types = typesOf(tr);
  const text = types.length ? types.map((k) => t(`type.${k}`)).join(" + ") : t("sod.types_none");
  return getLang() === "en" ? text.replace(/\b\w/g, (c) => c.toUpperCase()) : text;
}
export function sorenessContext(p, day) {
  return [[1, "sod.yesterday"], [2, "sod.two_days"]].map(([offset, when]) => {
    const date = addDays(day, -offset), tr = p.train.get(date);
    return tr ? { when, date, reported: true, ...tr } : { when, date, reported: false, sessions: 0, load: NaN, minutes: NaN, rpe: NaN };
  });
}
export function contextCard(r) {
  let small;
  if (!r.reported) small = t("sod.not_rest");
  else if (!finite(r.load)) small = t("sod.blank");
  else {
    small = t(r.sessions > 1 ? "sod.sessions" : "sod.session", { n: r.sessions }) + t("sod.load", { load: rfmt(r.load) });
    if (finite(r.minutes)) small += t("sod.minutes", { min: rfmt(r.minutes), rpe: finite(r.rpe) ? t("sod.rpe", { rpe: rfmt(r.rpe) }) : "" });
  }
  return { when: t(r.when), date: dayLabel(r.date, { year: false }), line: r.reported ? typesText(r) : t("sod.no_session"), small };
}

// ---- the load bands, pooled over all participants (evidence.R load_soreness_summary, visuals.R load_band_titles) ----
// Shares are recomputed from the counts in study.json so they are R's own doubles, not the rounded copies.
export function loadSoreness(study) {
  return study.load_soreness.map((r) => {
    const counts = [r.s1, r.s2, r.s3, r.s4, r.s5], n = r.n;
    const worse = (r.s1 + r.s2) / n, se = Math.sqrt(worse * (1 - worse) / n);
    const shares = counts.map((c) => c / n);
    return { band: r.band, n, counts, shares, worse, lo: Math.max(0, worse - 1.96 * se), hi: Math.min(1, worse + 1.96 * se),
      titleWorse: shares[0] + shares[1] };
  });
}
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// the strip above each band's bar; the band for yesterday's load says so
export function panelTitle(row, marked, narrow) {
  const band = t(`band.${row.band}`), pct = round0(row.titleWorse * 100), n = thousands(row.n);
  if (narrow) return [band + (marked ? t("ls.panel_narrow_mark") : ""), t("ls.panel_narrow", { n, pct })];
  return [t("ls.panel", { band, n, pct }) + (marked ? t("ls.panel_mark") : "")];
}
export const shareTip = (row, i) => t("ls.tip", { band: t(`band.${row.band}`), level: t(`ls.level.${i + 1}`), count: row.counts[i],
  pct: fixed(row.shares[i] * 100, 1), n: row.n });
export const shareLabel = (row, i) => (row.shares[i] >= 0.07 ? `${round0(row.shares[i] * 100)}%` : "");
// accessibility.R load_soreness_table()
export function loadSorenessCells(row) {
  const pc = (v) => `${fixed(100 * v / row.n, 1)}%`;
  return [t(`band.${row.band}`), thousands(row.n), ...row.counts.map(pc), `${fixed(100 * row.worse, 1)}%`,
    `${fixed(100 * row.lo, 1)}–${fixed(100 * row.hi, 1)}%`];
}
// app.R output$load_soreness_note
export function loadSorenessNote(study) {
  const rows = loadSoreness(study), first = rows[0], last = rows[rows.length - 1];
  return t("ls.note", { first: round0(first.worse * 100), last: round0(last.worse * 100), r: signed(study.soreness_r, 2) });
}
// app.R output$soreness_today: the band sentence (or why there is none)
export function bandLine(study, p, day) {
  const f = focalBand(p, day);
  const row = f && f.status === "ok" ? loadSoreness(study).find((x) => x.band === f.band) : null;
  if (row) return { kind: "band", text: t("sod.band_line", { band: t(`band.${row.band}`), pct: round0(row.worse * 100) }) };
  return { kind: "status", text: t("sod.band_status", { status: t(`sod.status.${f ? f.status : "none"}`) }) };
}

// ---- where people were sore after a day like yesterday (body_regions.R body_region_profile) ---------------------
// The comparison group depends only on yesterday's training log: no session, or exactly yesterday's activity tags,
// widened to "included all of yesterday's tags" and then to "any logged session" when fewer than 30 check-ins.
export function bodyKey(p, day) {
  const tr = p.train.get(addDays(day, -1));
  return tr ? `s:${typesOf(tr).join("+")}` : "none";
}
export function groupLabel(level, tags) {
  const words = tags.map((k) => t(`type.${k}`)).join(" + ");
  if (level === "none") return t("body.g.none");
  if (level === "any") return t("body.g.any");
  if (level === "included") return t("body.g.included", { tags: words });
  return tags.length ? t("body.g.exact", { tags: words }) : t("body.g.untyped");
}
export function bodyProfile(body, p, day) {
  const key = bodyKey(p, day), g = body.profiles[key];
  if (!g) return null;
  const tags = key === "none" ? [] : key.slice(2).split("+").filter(Boolean);
  const rows = body.regions.map((region, i) => ({ key: region, rate: g.answered[i] ? g.ticked[i] / g.answered[i] : NaN }));
  return { key, level: g.level, tags, n: g.n, group: groupLabel(g.level, tags), rows };
}
// one colour scale for every selection: 0 to min(30%, the largest group share), the darkest shade beyond
export function bodyScale(body, profile) {
  const rates = profile.rows.map((r) => r.rate).filter(finite);
  const top = Math.min(body.cap, finite(body.scale_top) ? body.scale_top : Math.max(...rates));
  return { top, capped: Math.max(...rates, body.scale_top) > top };
}
// body_rate_colour(): colorRampPalette(BODY_PALETTE)(101) — a straight RGB mix between the four palette stops
export function rampStop(rate, top) {
  if (!finite(rate) || !finite(top) || top <= 0) return null;
  const idx = Math.max(1, Math.min(101, round0(rate / top * 100) + 1)), x = (idx - 1) * 0.01;
  const seg = Math.min(2, Math.floor(x * 3)), f = (x - seg / 3) * 3;
  return { idx, seg, f: Math.max(0, Math.min(1, f)) };
}
export function bodyColour(rate, top) {
  const s = rampStop(rate, top);
  if (!s) return "var(--body-none)";
  const a = `var(--body-${s.seg + 1})`, b = `var(--body-${s.seg + 2})`;
  if (s.f < 1e-9) return a;
  if (s.f > 1 - 1e-9) return b;
  return `color-mix(in srgb, ${b} ${(s.f * 100).toFixed(2)}%, ${a})`;
}
const FIGURE = {
  male: { width: 581, height: 794, viewBox: "0 185 581 575", front: 166, back: 411, orientY: 206, sideY: 742, sideX: [138, 194, 383, 439] },
  // the labels sit a little lower than in R (orientY 88, sideY 1385) because they are drawn larger here
  female: { width: 1024, height: 1536, viewBox: "-163 60 1350 1350", front: 273, back: 750, orientY: 104, sideY: 1400, sideX: [210, 334, 690, 810] },
};
// everything the figure, its legend and its list say (body_region_model_ui), as words and colours
export function bodyView(body, profile, sex, who) {
  const scale = bodyScale(body, profile), pct = (r) => rfmt(r * 100, 1);
  const regions = profile.rows.map((r, i) => {
    const label = t(`region.${r.key}`);
    return { i, key: r.key, label, rate: r.rate, pct: `${pct(r.rate)}%`, colour: bodyColour(r.rate, scale.top),
      aria: t("body.region_aria", { label, pct: pct(r.rate) }), tip: t("body.region_tip", { label, pct: pct(r.rate) }) };
  });
  const sexWord = t(`body.sex.${sex}`);
  return {
    scale, regions, sorted: [...regions].sort((a, b) => (b.rate - a.rate) || (a.i - b.i)),
    chips: [t("body.chip_group", { group: profile.group }), t("body.chip_n", { n: rfmt(profile.n) }), t("body.chip_areas")],
    lede: t("body.lede", { who }), top: `${rfmt(scale.top * 100, 0)}%${scale.capped ? "+" : ""}`,
    small: t("body.scale") + (scale.capped ? t("body.scale_cap", { top: rfmt(scale.top * 100, 0) }) : ""),
    caveat: t("body.caveat", { sex: sexWord }), figure: t("body.fig", { sex: sexWord }),
  };
}
function bodyFigure(view, sex) {
  const c = FIGURE[sex];
  const masks = view.regions.map((r) => `<mask id="body-mask-${r.key}" x="0" y="0" width="${c.width}" height="${c.height}" maskUnits="userSpaceOnUse" style="mask-type:alpha">
    <image href="img/body-mask-${sex}-${r.key}.png" x="0" y="0" width="${c.width}" height="${c.height}" preserveAspectRatio="none"/></mask>`).join("");
  const regions = view.regions.map((r) => `<g class="body-region-shape region-${r.key}" style="fill:${r.colour}" role="img" tabindex="0"
      aria-label="${esc(r.aria)}" data-tip="${esc(r.tip)}"><rect x="0" y="0" width="${c.width}" height="${c.height}" mask="url(#body-mask-${r.key})"/></g>`).join("");
  const text = (x, y, s, cls) => `<text x="${x}" y="${y}" text-anchor="middle" class="${cls}">${esc(s)}</text>`;
  return `<svg class="body-silhouette anatomical-body body-${sex}" viewBox="${c.viewBox}" role="img" aria-label="${esc(view.figure)}">
    <defs>${masks}</defs>
    <image class="body-reference" href="img/body-${sex}-reference.png" x="0" y="0" width="${c.width}" height="${c.height}" preserveAspectRatio="none" aria-hidden="true"/>
    ${regions}
    ${text(c.front, c.orientY, t("body.front"), "body-orientation")}${text(c.back, c.orientY, t("body.back"), "body-orientation")}
    ${text(c.sideX[0], c.sideY, t("body.r"), "body-side")}${text(c.sideX[1], c.sideY, t("body.l"), "body-side")}
    ${text(c.sideX[2], c.sideY, t("body.l"), "body-side")}${text(c.sideX[3], c.sideY, t("body.r"), "body-side")}</svg>`;
}
export const sexOf = (profile) => (String(profile && profile.gender).toLowerCase() === "female" ? "female" : "male");
// body_regions.R body_region_model_ui()
export function bodyRegionModel(body, ctx) {
  const profile = bodyProfile(body, ctx.person, ctx.focus);
  // what the areas are and where the figures come from: an i on the card, not a fold under it
  const head = cardTop(metricHeading("body", esc(t("body.title")), "blue"), evidenceTag("record", t("body.tag")),
    info(t("body.how"), `<p>${esc(t("body.how1"))}</p><p>${esc(t("body.how2"))}</p>`));
  if (!profile) return `${head}<p class="empty-note">${esc(t("body.none"))}</p>`;
  const sex = sexOf(ctx.profile), view = bodyView(body, profile, sex, ctx.pid);
  const list = view.sorted.map((r) => `<li><span class="region-swatch" style="background:${r.colour}" aria-hidden="true"></span>
    <strong>${esc(r.label)}</strong><span>${esc(r.pct)}</span></li>`).join("");
  // the figure first; what it compares and the list of areas beside it (under it on a phone)
  return `${head}
    <div class="body-region-layout">
      <div class="body-figure">${bodyFigure(view, sex)}
        <div class="body-legend"><span>0%</span><span class="body-legend-bar" aria-hidden="true"></span><span>${esc(view.top)}</span>
          <small>${esc(view.small)}</small>
          <p class="body-caveat"><strong>${esc(t("body.caveat_b"))}</strong>${esc(view.caveat)}</p></div></div>
      <div class="body-side"><div class="body-chips">${view.chips.map(scopeChip).join("")}</div>
        <p class="chart-lede">${esc(view.lede)}</p>
        <ul class="body-region-list" aria-label="${esc(t("body.list"))}">${list}</ul></div>
    </div>`;
}

// ---- the load-vs-soreness chart (100% stacked bars, one panel per load band) ----------------------------------
function legendHtml() {
  return `<div class="legend ls-legend">${[1, 2, 3, 4, 5].map((k) => `<span class="key"><i style="background:var(--sore-${k})"></i>${esc(t(`ls.level.${k}`))}</span>`).join("")}</div>`;
}
export function loadSorenessSvg(rows, markBand, w) {
  if (!rows.length) return `<p class="empty-note">${esc(t("ls.empty"))}</p>`;
  const narrow = w < NARROW, L = 4, R = 20, barH = 24, lineH = 16, gap = 12;
  const titleH = narrow ? 2 * lineH : lineH;
  const panelH = titleH + 4 + barH;
  const top = 6, axisH = 22, H = top + rows.length * panelH + (rows.length - 1) * gap + axisH;
  const x = (v) => L + v * ((w - L - R) / 1.025);
  const parts = [];
  rows.forEach((row, b) => {
    const y0 = top + b * (panelH + gap), yb = y0 + titleH + 4, marked = row.band === markBand;
    panelTitle(row, marked, narrow).forEach((line, k) => parts.push(`<text class="ls-title${marked ? " marked" : ""}" x="${L}" y="${y0 + 12 + k * lineH}">${esc(line)}</text>`));
    [0, 0.25, 0.5, 0.75, 1].forEach((g) => parts.push(`<line class="ls-grid" x1="${x(g).toFixed(1)}" x2="${x(g).toFixed(1)}" y1="${yb - 3}" y2="${yb + barH + 3}"/>`));
    let acc = 0;
    row.shares.forEach((s, i) => {
      const x0 = x(acc), x1 = x(acc + s), tip = shareTip(row, i);
      if (s > 0) parts.push(`<rect class="ls-seg" x="${x0.toFixed(2)}" y="${yb}" width="${Math.max(0, x1 - x0).toFixed(2)}" height="${barH}" style="fill:var(--sore-${i + 1})"
        tabindex="0" role="img" aria-label="${esc(tip.replace(/\n/g, ", "))}" data-tip="${esc(tip)}"/>`);
      const label = shareLabel(row, i);
      if (label) parts.push(`<text class="ls-label" x="${((x0 + x1) / 2).toFixed(1)}" y="${yb + barH / 2 + 4}" text-anchor="middle" style="fill:var(${i === 2 || i === 3 ? "--on-sore-light" : "--on-sore-dark"})">${label}</text>`);
      acc += s;
    });
  });
  const yAxis = H - 6;
  [[0, "0"], [0.25, "25%"], [0.5, "50%"], [0.75, "75%"], [1, "100%"]].forEach(([g, lab]) =>
    parts.push(`<text class="ls-axis" x="${x(g).toFixed(1)}" y="${yAxis}" text-anchor="${g === 0 ? "start" : g === 1 ? "end" : "middle"}">${lab}</text>`));
  return `${legendHtml()}<svg class="ls-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="group" aria-label="${esc(t("ls.label"))}">${parts.join("")}</svg>`;
}

// ---- the page ----------------------------------------------------------------------------------------------
export default {
  load: () => loadArea("body"),
  render(ctx, body) {
    const { study } = ctx;
    // This morning: the answer only after Reveal (app.R revealed_value("soreness"))
    const actual = ctx.revealedValue("soreness");
    let answer;
    if (finite(actual)) answer = likertCells(t("sod.felt"), actual);
    else if (ctx.revealed && ctx.hasCheckin) answer = `<p class="locked-line">${esc(t("sod.no_answer"))}</p>`;
    else answer = `<p class="locked-line">${esc(t(ctx.hasCheckin ? "sod.hidden" : "sod.no_checkin"))}</p>`;
    const band = bandLine(study, ctx.person, ctx.focus);
    const cards = sorenessContext(ctx.person, ctx.focus).map((r) => {
      const c = contextCard(r);
      return `<div class="soreness-load-day"><div><strong>${esc(c.when)}</strong><span>${esc(c.date)}</span></div><p>${esc(c.line)}</p><small>${esc(c.small)}</small></div>`;
    }).join("");
    const rows = loadSoreness(study);
    const table = dataTable(t("ls.caption"), [t("ls.h.band"), t("ls.h.n"), ...[1, 2, 3, 4, 5].map((k) => t(`ls.level.${k}`)), t("ls.h.worse"), t("ls.h.ci")],
      rows.map((r) => loadSorenessCells(r).map(esc)));
    return `${detailHeader(t("sod.title"), esc(t("sod.lede")))}
      ${ctx.revealBar()}
      <section class="health-card soreness-today-card">
        ${cardTop(metricHeading("body", esc(t("sod.morning")), "blue"), evidenceTag("record", t("sod.morning_tag")))}
        <div class="soreness-answer">${answer}
          <p class="${band.kind === "band" ? "comparison-conclusion" : "fine-print"}">${esc(band.text)}</p></div>
        <div class="soreness-load-grid">${cards}</div>
      </section>
      <section class="health-card body-region-card">${bodyRegionModel(body, ctx)}</section>
      <section class="health-card">
        ${cardTop(metricHeading("compare", esc(t("ls.title")), "model"), scopeChip(t("ls.scope")))}
        <p class="chart-lede">${esc(t("ls.lede"))}</p>
        ${chartBox("load-soreness", { label: t("ls.label"), height: 264, table })}
        <p class="comparison-conclusion">${esc(loadSorenessNote(study))}</p>
      </section>`;
  },
  mount(el, ctx) {
    const f = focalBand(ctx.person, ctx.focus);
    const mark = f && f.status === "ok" ? f.band : null;
    const rows = loadSoreness(ctx.study);
    draw(el.querySelector("#load-soreness"), (w) => loadSorenessSvg(rows, mark, w));
  },
};
