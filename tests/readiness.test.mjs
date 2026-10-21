// node tests/readiness.test.mjs — Today › Readiness detail and Everyday habits give R's own numbers and sentences
// (tests/fixtures/readiness.json is written by tools/export_web.R readiness from the submitted app's functions):
// the waterfall (readiness_waterfall_parts) for every participant-day, the 28-day expected series (expected_series
// on visible_person) for sample days hidden and revealed with its note, lever_rows() for every filter and order,
// the verdicts, the BH notes, the conclusion, the tooltips and the tables' BH p.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { preparePerson, expectedOn, expectedSeries, visiblePerson, dayRange, addDays } from "../web/js/model.js";
import { t, dev } from "../web/js/i18n.js";
import { deltaLabel, g2, verdict, bhNote, recordRange, feltNote, factorState, factorRows, factorTip, factorsConclusion, intervalRowsHeight, pLine, preciseEffects } from "../web/js/sections/readiness.js";
import { leverRows, headingText, leverTip } from "../web/js/pages/choices.js";
import { modelMae } from "../web/js/about.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url)));
const study = read("../web/data/study.json");
const axes = read("../web/data/readiness.json");
const ref = read("./fixtures/readiness.json");
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const close = (a, b, tol, what) => {
  if (!fin(a) || !fin(b)) assert.equal(fin(a), fin(b), `${what}: ${a} vs ${b}`);
  else assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
};
const today = preciseEffects(study.today_effects, axes.today_effects), levers = preciseEffects(study.lever_effects, axes.lever_effects);
const people = Object.fromEntries(study.people.map(({ participant: id }) => [id, preparePerson(read(`../web/data/p/${id}.json`))]));

// ---- the waterfall on every participant-day ----
let days = 0, withParts = 0, headlines = 0;
for (const [id, p] of Object.entries(people)) {
  const w = ref.waterfall[id];
  p.dates.forEach((day, i) => {
    const r = expectedOn(p, study.model, study.signals, day);
    const what = `${id} ${day}`;
    assert.equal(r.level.n, w.n[i], `${what} level weeks`);
    assert.equal(r.level.n ? recordRange(r.level.start, r.level.end) : "", w.range[i], `${what} level range`);
    if (w.state[i] === null) { assert.equal(r.parts, null, `${what} no parts`); days++; return; }
    assert.ok(r.parts, `${what} parts`);
    assert.equal(r.parts.map((x) => (!x.known ? "?" : x.held ? "1" : "0")).join(""), w.state[i], `${what} signal states`);
    close(r.adjustment, w.adjustment[i], 2e-7, `${what} adjustment`);
    close(r.value, w.prediction[i], 2e-7, `${what} prediction`);
    assert.equal(r.parts.map((x) => deltaLabel(x.contribution)).join("|"), w.step[i], `${what} step labels`);
    assert.equal(deltaLabel(r.adjustment), w.adj_label[i], `${what} adjustment label`);
    // the running estimate ends at the raw prediction
    close(r.parts.at(-1).after, r.raw, 1e-9, `${what} running estimate`);
    if (w.headline[i] !== null) {
      assert.equal(t("rdy.wf.headline", { n: r.parts.filter((x) => x.held).length, adj: dev(r.adjustment, 2) }), w.headline[i], `${what} headline`);
      headlines++;
    }
    days++; withParts++;
  });
}

// ---- 28 days of felt vs expected, from the visible record ----
let series = 0;
for (const s of ref.series) {
  const p = people[s.id];
  const pv = visiblePerson(p, s.day, s.revealed);
  const got = expectedSeries(pv, study.model, study.signals, dayRange(addDays(s.day, -27), s.day));
  assert.equal(got.length, 28);
  got.forEach((g, i) => {
    const what = `${s.id} ${s.day} ${s.revealed ? "revealed" : "hidden"} ${g.date}`;
    close(g.level, s.level[i], 1e-5, `${what} level`);
    close(g.adjustment, s.adjustment[i], 1e-6, `${what} adjustment`);
    close(g.expected, s.expected[i], 1e-5, `${what} expected`);
    close(g.felt, s.felt[i], 0, `${what} felt`);
  });
  // the selected day's check-in stays hidden until Reveal
  if (!s.revealed) assert.equal(got.at(-1).felt, null, `${s.id} ${s.day} hidden felt`);
  const note = feltNote(got, s.id.toUpperCase());
  assert.equal(note.text, s.note, `${s.id} ${s.day} note`);
  assert.equal(note.cls, s.note_class, `${s.id} ${s.day} note class`);
  series++;
}

// ---- lever_rows(): every filter and order ----
for (const f of ref.lever_filters) for (const o of ["group", "effect"]) {
  const want = ref.levers[`${f}|${o}`];
  const rows = leverRows(levers, f, o, axes, study.lever_groups);
  assert.deepEqual(rows.map((r) => r.key), want.keys, `levers ${f} ${o} keys`);
  assert.deepEqual(rows.map((r) => headingText(r.heading)), want.group, `levers ${f} ${o} headings`);
  assert.deepEqual(rows.map((r) => r.tag || ""), want.tag, `levers ${f} ${o} tags`);
  assert.equal(intervalRowsHeight(rows, (r) => r.heading), want.height, `levers ${f} ${o} height`);
}

// ---- sentences built from the numbers ----
const sig = (r) => t(`sig.${r.key}`), lev = (r) => t(`lever.${r.key}`);
for (const r of today) assert.equal(verdict(r, r.clear, "day"), ref.today_verdict[r.key], `verdict ${r.key}`);
for (const r of levers) assert.equal(verdict(r, r.effective, "next"), ref.lever_verdict[r.key], `verdict ${r.key}`);
assert.equal(bhNote(today, (r) => r.clear, "signals", sig), ref.today_bh, "BH note, tracked signals");
assert.equal(bhNote(levers, (r) => r.effective, "rows", lev), ref.lever_bh, "BH note, everyday habits");
// the web tag splits R's count into 16 habits + 2 reference states; the counts are R's ("1 of 18 with a clear link")
{
  const k = levers.filter((e) => e.effective).length, n = levers.filter((e) => fin(e.effect)).length;
  const refs = levers.filter((e) => e.group === study.lever_groups.at(-1) && fin(e.effect)).length;
  assert.equal(`${k} of ${n} with a clear link`, ref.levers_tag, "levers tag counts");
  assert.equal(t("chs.tag", { k, habits: n - refs, refs }), `${k} of 16 habits + 2 reference states with a clear link`, "levers tag");
}
for (const r of [...today, ...levers]) assert.equal(g2(r.p_bh), ref.p_bh_g[r.key].trim(), `BH p ${r.key}`);
assert.equal(factorsConclusion(today), ref.factors_conclusion, "factors conclusion");
for (const [k, pat] of [["ridge", "ridge"], ["level", "^level$"], ["level_all", "level_all"], ["last5", "last5"]]) assert.equal(modelMae(study, "test", pat), ref.mae[k], `MAE ${k}`);

// tooltips (the web tooltip adds one line with p and the BH-adjusted p)
{
  const { id, day, keys, tips, height } = ref.factor_tips;
  const rows = factorRows(factorState(today, people[id], day));
  assert.deepEqual(rows.map((r) => r.key), keys, "factor rows order");
  assert.equal(intervalRowsHeight(rows, (r) => r.layer), height, "factor chart height");
  rows.forEach((r, i) => assert.equal(factorTip(r).replace(`\n${pLine(r)}`, ""), tips[i], `factor tip ${r.key}`));
  const rows2 = leverRows(levers, "all", "effect", axes, study.lever_groups);
  rows2.forEach((r, i) => assert.equal(leverTip(r).replace(`\n${pLine(r)}`, ""), ref.lever_tips.tips[i], `lever tip ${r.key}`));
}
// R's own deviation and delta labels on edge values
assert.equal(deltaLabel(NaN), "0.00");
assert.equal(deltaLabel(-0.00291438), "-0.003");
assert.equal(deltaLabel(0.0056986), "+0.01");
assert.equal(g2(0.997607), "1");
assert.equal(g2(0.000012345), "1.2e-05");

console.log(`readiness: ${days} participant-days (${withParts} with a waterfall, ${headlines} headlines), ${series} 28-day series, ${ref.lever_filters.length * 2} lever views, verdicts, notes and tooltips match R`);
