// node tests/body.test.mjs — Today › Soreness and Today › Sleep give the R app's own output for every participant-day.
// tests/fixtures/body.json is written by tools/export_web.R (tools/export/body.R), which runs the app's server code
// itself (the renderUI bodies of output$compare_rows, output$soreness_today, output$load_soreness_note) and the
// builders in body_regions.R, story_visuals.R and accessibility.R, and keeps the words they print.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { preparePerson, visiblePerson, at } from "../web/js/model.js";
import { t, shortDate } from "../web/js/i18n.js";
import { round0 } from "../web/js/i18n/body.js";
import { bodyProfile, bodyView, sexOf, rampStop, sorenessContext, contextCard, loadSoreness, panelTitle, shareTip, shareLabel,
  loadSorenessCells, loadSorenessNote, bandLine } from "../web/js/sections/soreness.js";
import { sleepRecord, sleepWindowData, sleepUsual, sleepWindowNote, nightTip, nightCells, sleepAxis, compareRows, trackOf, scaleText }
  from "../web/js/sections/sleep.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url)));
const study = read("../web/data/study.json");
const body = read("../web/data/body.json");
const ref = read("./fixtures/body.json");
const pool = ref.pool;
const words = (x) => [].concat(x ?? []).map((i) => pool[i]);
const arr = (x) => [].concat(x ?? []);
const squash = (s) => String(s).replace(/\s+/g, " ").trim();
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

// ---- the fixed load-vs-soreness reference ----
{
  const rows = loadSoreness(study), r = ref.load_soreness;
  rows.forEach((row, b) => {
    near(row.worse, r.worse[b], 1e-15, `band ${b} worse`); near(row.lo, r.lo[b], 1e-15, `band ${b} lo`); near(row.hi, r.hi[b], 1e-15, `band ${b} hi`);
    eq(loadSorenessCells(row), r.table[b], `band ${b} table row`);
    eq(panelTitle(row, false, false)[0], r.titles[b], `band ${b} panel title`);
    row.shares.forEach((_, i) => {
      eq(shareTip(row, i), r.shares_tip[b * 5 + i].replace(/<br>/g, "\n"), `band ${b} level ${i + 1} tooltip`);
      eq(shareLabel(row, i), r.shares_label[b * 5 + i], `band ${b} level ${i + 1} label`);
    });
  });
  eq(loadSorenessNote(study), r.note, "load-soreness note");
}

// ---- the body figure's colour ramp: colorRampPalette(BODY_PALETTE)(101) ----
const PALETTE = ["#f5d3dd", "#e27596", "#c0275a", "#86113a"].map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
const rampHex = (rate, top) => {
  const s = rampStop(rate, top), a = PALETTE[s.seg], b = PALETTE[s.seg + 1];
  return a.map((v, k) => v + (b[k] - v) * s.f);
};

// ---- every participant-day ----
let days = 0;
const seenProfiles = new Set();
for (const { participant: id, gender } of study.people) {
  const p = preparePerson(read(`../web/data/p/${id}.json`));
  const exact = read(`../web/data/body/${id}.json`);
  const rec = sleepRecord(p, exact), usual = sleepUsual(rec);
  const r = ref.people[id];
  assert.deepEqual(r.days, p.dates, `${id} days`);

  // the participant's usual sleep, onset and resting heart rate (R's usual_stats over the whole record)
  const cmp0 = compareRows(rec, p, p.dates[0]);
  ["sleep", "onset", "hr"].forEach((k, j) => {
    const js = cmp0.rows[j].stats, rs = r.usual[k];
    if (!rs || !Object.keys(rs).length) { assert.equal(js, null, `${id} ${k} usual`); return; }
    // R writes 15 significant digits, so the stored value can differ from R's double in the last place
    for (const f of ["n", "q25", "median", "q75", "lo", "hi"]) near(js[f], rs[f], 1e-12 * Math.max(1, Math.abs(rs[f])), `${id} ${k} usual ${f}`);
    checks++;
  });
  if (r.static.sc) eq(cmp0.rows.map(scaleText), r.static.sc, `${id} usual lines`);

  // every night of the record, as the table and the tooltip write it
  const nights = sleepWindowData(rec, p.last, p.n);
  nights.forEach((n, i) => {
    eq(nightCells(n), r.nights[i].slice(1), `${id} ${n.date} table row`);
    eq(shortDate(n.date), squash(r.nights[i][0]), `${id} ${n.date} date cell`);
    eq(nightTip(n), r.night_tip[i].replace(/<br>/g, "\n"), `${id} ${n.date} tooltip`);
    eq(n.valid, r.night_valid[i], `${id} ${n.date} valid`);
    eq(Number.isFinite(n.eff) ? `${round0(n.eff)}%` : "", r.night_eff_label[i], `${id} ${n.date} bar label`);
  });
  // the first week reaches back before the record: those nights are "no record"
  sleepWindowData(rec, p.dates[0]).forEach((n, i) => eq(nightCells(n), r.first_week[i].slice(1), `${id} first week ${n.date}`));
  // the chart's clock axis
  for (const a of r.axis) {
    const ax = sleepAxis(sleepWindowData(rec, a.day), usual);
    if (a.empty) { eq(ax, null, `${id} ${a.day} empty chart`); continue; }
    eq(ax.breaks, arr(a.breaks), `${id} ${a.day} axis breaks`);
    eq(ax.labels, arr(a.labels), `${id} ${a.day} axis labels`);
    near(ax.range[0], a.range[0], 1e-9, `${id} ${a.day} axis from`); near(ax.range[1], a.range[1], 1e-9, `${id} ${a.day} axis to`);
  }

  p.dates.forEach((day, i) => {
    const d = r.per_day[i];
    // Sleep: the week's note
    const note = sleepWindowNote(rec, day, 7, usual), want = words(d.note);
    eq(note.empty ? [note.empty] : [note.line, note.usual], want, `${id} ${day} sleep note`);
    // Sleep: last night against usual, and yesterday's check-in (from the visible record)
    const pv = visiblePerson(p, day, false);
    const cmp = compareRows(rec, pv, day);
    eq(cmp.rows.map((x) => x.valueText), words(d.v), `${id} ${day} compare values`);
    eq(cmp.rows.map((x) => x.diff), words(d.d), `${id} ${day} compare gaps`);
    if (!r.static.sc) eq(cmp.rows.map(scaleText), arr(d.sc), `${id} ${day} usual lines`);
    const tracks = cmp.rows.map(trackOf).filter(Boolean);
    eq(tracks.flatMap((x) => [x.lo, x.hi]), arr(d.end), `${id} ${day} track ends`);
    eq(tracks.flatMap((x) => [`${x.band.left};width:${x.band.width}`, x.usual, x.value]), arr(d.pos), `${id} ${day} track positions`);
    eq(cmp.likert.map((l) => (Number.isFinite(l.value) ? String(l.value) : "not recorded")), arr(d.lk), `${id} ${day} yesterday's check-in`);
    assert.equal(at(pv, "readiness", day), null, "the selected day's check-in stays hidden");

    // Soreness: this morning (hidden), the band sentence, yesterday and the day before
    const has = Number.isFinite(at(p, "readiness", day));
    const so = words(d.so);
    eq(so[0], t(has ? "sod.hidden" : "sod.no_checkin"), `${id} ${day} locked line`);
    eq(bandLine(study, p, day).text, so[1], `${id} ${day} band line`);
    const cards = sorenessContext(p, day).map(contextCard), ctx = words(d.ctx);
    eq([...cards.map((c) => c.date), ...cards.map((c) => c.line), ...cards.map((c) => c.small)], ctx, `${id} ${day} training cards`);
    // revealed: the answer as five cells (R shows its "hidden" line when the check-in has no soreness answer; the web says so)
    const felt = words(d.felt)[0], v = at(p, "soreness", day);
    if (Number.isFinite(v)) eq(t("likert.aria", { label: t("sod.felt"), v, word: t(`likert.${v}`) }), felt, `${id} ${day} revealed answer`);
    else eq(felt, t(has ? "sod.hidden" : "sod.no_checkin"), `${id} ${day} revealed, no answer`);

    // Soreness: where people were sore after a day like yesterday
    const prof = bodyProfile(body, p, day), want2 = ref.profiles[d.profile - 1];
    eq(prof.group, want2.group, `${id} ${day} comparison group`);
    eq(prof.n, want2.n, `${id} ${day} group size`);
    prof.rows.forEach((x, k) => near(x.rate, want2.rate[k], 1e-14, `${id} ${day} ${x.key} share`));
    const sex = sexOf({ gender });
    const tag = `${d.profile} ${sex}`;
    if (!seenProfiles.has(tag)) {
      seenProfiles.add(tag);
      const ui = want2.ui[sex], view = bodyView(body, prof, sex, "PXX");
      eq(view.chips, ui.chips, `profile ${tag} chips`);
      eq(view.lede, ui.lede, `profile ${tag} lede`);
      eq(view.sorted.map((x) => x.label), ui.list_labels, `profile ${tag} list order`);
      eq(view.sorted.map((x) => x.pct), ui.list_values, `profile ${tag} list values`);
      eq(view.regions.map((x) => x.aria), ui.aria, `profile ${tag} region labels`);
      eq(view.regions.map((x) => x.tip), ui.titles, `profile ${tag} region tooltips`);
      eq(view.top, ui.legend_top, `profile ${tag} legend top`);
      eq(view.small, ui.legend_small, `profile ${tag} legend note`);
      eq(view.caveat, squash(ui.caveat), `profile ${tag} caveat`);
      // colours: the same 101-step ramp (each channel within 1 of R's rounded hex)
      view.regions.forEach((x, k) => {
        const want = [1, 3, 5].map((j) => parseInt(ui.fills[k].slice(j, j + 2), 16)), got = rampHex(x.rate, view.scale.top);
        got.forEach((c, j) => near(c, want[j], 1, `profile ${tag} ${x.key} colour channel ${j}`));
      });
    }
    days++;
  });
}
assert.equal(seenProfiles.size > 0, true);
console.log(`body: ${days} participant-days and ${seenProfiles.size} body figures match R (${checks} checks)`);
