// node tests/habits.test.mjs — the Compare habits page (web/js/pages/habits.js) gives R's own strings and numbers:
// the last five matching nights for every participant-day (cohort_context), the cohorts' median labels and tables,
// the habit and peer tables, the summary sentences and the peer value labels (tests/fixtures/habits.json, written by
// tools/export/habits.R from the submitted app's functions). It also draws every chart for every participant, in
// English and Chinese, at desktop and phone width.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
globalThis.document = globalThis.document || { documentElement: {} };   // i18n.setLang() sets <html lang>
const { setLang, dur, shortDate } = await import("../web/js/i18n.js");
const { preparePerson } = await import("../web/js/model.js");
const H = await import("../web/js/pages/habits.js");
const { WORDS } = await import("../web/js/i18n/habits.js");

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url)));
const study = read("../web/data/study.json");
const ref = read("./fixtures/habits.json");
const data = H.prepare(read("../web/data/habits.json"));
const people = study.people.map((p) => p.participant).sort();
const persons = Object.fromEntries(people.map((id) => [id, preparePerson(read(`../web/data/p/${id}.json`))]));
setLang("en");

// ---- the last five matching nights, every participant-day, both kinds of night ----
let checks = 0;
for (const id of people) {
  const p = persons[id];
  for (const period of ["workday", "nonworkday"]) {
    const r = ref.nights[id][period];
    p.dates.forEach((day, i) => {
      const w = H.recentNights(p, day, period);
      const what = `${id} ${day} ${period}`;
      assert.equal(w.n, r.n[i], `${what} n`);
      assert.equal(w.start, r.start[i], `${what} start`);
      assert.equal(w.end, r.end[i], `${what} end`);
      if (r.mean[i] === null) assert.ok(!Number.isFinite(w.mean), `${what} mean`);
      else assert.ok(Math.abs(w.mean - r.mean[i]) < 1e-3, `${what} mean ${w.mean} vs ${r.mean[i]}`);
      assert.equal(H.durR(w.mean), r.mean_label[i], `${what} mean label`);
      assert.equal(H.recordRange(w.start, w.end), r.range[i], `${what} range`);
      checks++;
    });
  }
  // the population table's nights on a few days
  for (const { day, rows } of ref.population_nights[id]) {
    const w = H.recentNights(p, day, "nonworkday");
    assert.deepEqual(w.rows.map((x) => [shortDate(x.date), H.durR(x.hours)]), rows, `${id} ${day} population nights`);
  }
}

// ---- the NHANES cohorts: median, caption, the bins table ----
for (const [key, r] of Object.entries(ref.cohorts)) {
  const c = data.cohorts[key];
  assert.equal(H.medianLabel(c.median), r.median_label, `${key} median`);
  assert.equal(H.cohortCaption(c), r.caption, `${key} caption`);
  assert.equal(c.n < 30, r.paused, `${key} paused`);
  if (!r.paused) assert.deepEqual(H.binRows(c), r.bins, `${key} bins`);
}

// ---- habits: tables, chips, sentences ----
assert.equal(H.habitTag(data), ref.habit_tag, "habit tag");
assert.equal(H.excludedText(data), ref.excluded, "not shown");
assert.deepEqual(H.peerExcludedItems(data), ref.peer_excluded, "who is missing");
assert.deepEqual(data.long.map((x) => H.peerValueLabel(x.value, x.unit)), ref.peer_labels, "peer labels");
for (const [key, [lo, hi]] of Object.entries(ref.peer_ends)) {
  const v = data.long.filter((x) => x.key === key);
  assert.equal(H.peerValueLabel(Math.min(...v.map((x) => x.value)), v[0].unit), lo, `${key} low end`);
  assert.equal(H.peerValueLabel(Math.max(...v.map((x) => x.value)), v[0].unit), hi, `${key} high end`);
}
const ids = data.specs.map((s) => s.id);
for (const id of people) {
  assert.deepEqual(H.habitTableRows(data, id), ref.habit_table[id], `${id} habit table`);
  assert.deepEqual(H.peersTableRows(data, id), ref.peers_table[id], `${id} peers table`);
  assert.deepEqual(H.compareChoices(data, people, id), ref.compare_choices[id], `${id} compare choices`);
  const chips = H.profileChips(data, id);
  const text = chips.length ? [`${id.toUpperCase()} at a glance`, "share of recorded days", ...chips.flatMap((c) => [c.label, c.pct, c.days, c.link])].join(" ")
    : "The participant you are viewing does not meet the record threshold for these habits.";
  assert.equal(text, ref.chips[id], `${id} chips`);
  for (const h of ids) {
    for (const [cmp, want] of Object.entries(ref.summary[id][h])) {
      assert.deepEqual(H.compareSummary(data, id, cmp === "none" ? "" : cmp, h), want, `${id} vs ${cmp} ${h} summary`);
      checks++;
    }
    const d = ref.detail_table[id][h];
    assert.deepEqual(H.detailTableRows(data, h, id, d.compare), d.rows, `${id} ${h} detail table`);
  }
}

// ---- C-style rounding (formatC) at exact halves ----
assert.equal(H.cfix(0.125, 2), "0.12"); assert.equal(H.cfix(0.375, 2), "0.38"); assert.equal(H.cfix(2.5, 0), "2"); assert.equal(H.cfix(3.5, 0), "4");
assert.equal(H.cfix(1234.56, 1, true), "1,234.6"); assert.equal(H.clockLabel(-0.5), "23:30"); assert.equal(H.clockLabel(0.275), "00:16");

// ---- every Chinese word exists ----
for (const k of Object.keys(WORDS.en)) assert.ok(k in WORDS.zh, `zh missing ${k}`);

// ---- every chart and the page itself, for every participant, both languages, both widths ----
const bad = /NaN|undefined|Infinity|\{\w+\}|\b(hb|pe|po)\.[a-z_]+/;
let drawn = 0;
for (const lang of ["en", "zh"]) {
  setLang(lang);
  for (const id of people) {
    for (const cmp of ["", id === "p03" ? "p07" : "p03", "p15"]) {
      if (cmp === id) continue;
      for (const w of [343, 620, 1100]) {
        for (const svg of [H.habitDotsSvg(data, id, cmp, w), H.peerSvg(data, id, cmp, w),
          ...ids.map((h) => H.habitDetailSvg(data, h, id, cmp, w))]) { assert.ok(!bad.test(svg), `${lang} ${id} ${cmp} ${w}: ${svg.match(bad)}`); drawn++; }
      }
      const p = persons[id];
      const ctx = { study, person: p, id, compare: cmp, focus: p.default_day, lang };
      for (const focus of [p.first, p.default_day, p.last]) {
        const html = H.default.render({ ...ctx, focus }, data);
        assert.ok(!bad.test(html.replace(/data-tip="[^"]*"/g, (m) => m)), `${lang} ${id} page: ${html.match(bad)}`);
        for (const period of ["workday", "nonworkday"]) for (const radius of [5, 10]) {
          const nights = H.recentNights(p, focus, period).rows;
          const svg = H.populationSvg(H.cohortOf(data, id, period, radius), nights, id.toUpperCase(), 600);
          assert.ok(!bad.test(svg), `${lang} ${id} population`);
          assert.equal((svg.match(/data-day=/g) || []).length, nights.length, `${id} ${focus} population dots`);
          drawn++;
        }
      }
    }
  }
}
setLang("en");
console.log(`habits: ${checks} participant-day and sentence checks match R; ${drawn} charts drawn`);
