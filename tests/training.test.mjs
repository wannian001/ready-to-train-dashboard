// node tests/training.test.mjs — Today › Training and Today › Steps give R's own numbers and sentences
// (tests/fixtures/training.json is written by tools/export/training.R from the submitted app's functions):
// the energy ledger (battery_series, battery_agreement, battery_conclusion) for every participant and five settings,
// at several days, hidden and revealed; the training-load callout; the steps summary, heatmap lede and table rows;
// the sessions-per-month sentence.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { preparePerson, visiblePerson, at } from "../web/js/model.js";
import { batterySeries, batteryAgreement, batteryConclusion, batteryRows, loadCallout, monthlyNote, inRange } from "../web/js/sections/training.js";
import { activityWindows, recordedHours, activityRow } from "../web/js/sections/activity.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url)));
const study = read("../web/data/study.json");
const ref = read("./fixtures/training.json");
const close = (a, b, tol, what) => {
  const fa = a !== null && Number.isFinite(a), fb = b !== null && Number.isFinite(b);
  if (!fa || !fb) assert.equal(fa, fb, `${what}: ${a} vs ${b}`);
  else assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
};
const people = Object.fromEntries(study.people.map(({ participant: id }) => [id, preparePerson(read(`../web/data/p/${id}.json`))]));
const hourly = Object.fromEntries(study.people.map(({ participant: id }) => [id, read(`../web/data/training/${id}.json`)]));
const count = { ledger: 0, agreement: 0, callout: 0, activity: 0, rows: 0 };

// the ledger itself: every day of every participant, five settings
for (const [id, b] of Object.entries(ref.battery)) {
  const p = people[id];
  for (const run of b.runs) {
    const g = batterySeries(p, run.cost, run.recovery);
    assert.equal(g.length, run.level.length, `${id} ledger length`);
    g.forEach((r, i) => {
      close(r.level, run.level[i], 2e-4, `${id} ${r.date} level (${run.cost}, ${run.recovery})`);
      close(r.drain, run.drain[i], 2e-4, `${id} ${r.date} drain`);
      close(r.gain, run.gain[i], 2e-4, `${id} ${r.date} gain`);
      close(r.load_prev, b.load_prev[i], 1e-3, `${id} ${r.date} load_prev`);
      assert.equal(+r.reported_prev, b.reported_prev[i], `${id} ${r.date} reported_prev`);
      assert.equal(+r.unknown_prev, b.unknown_prev[i], `${id} ${r.date} unknown_prev`);
      count.ledger++;
    });
    assert.deepEqual(batteryRows(g), b.table, `${id} battery table rows`);
  }
}
// what it is compared with: only the visible check-ins (before the selected day; the day itself after Reveal)
for (const a of ref.agreement) {
  const p = people[a.id], pv = visiblePerson(p, a.day, a.revealed);
  const g = batterySeries(pv, a.cost, a.recovery), ag = batteryAgreement(g);
  for (const k of ["readiness", "soreness"]) {
    assert.equal(ag[k].n, a[k].n, `${a.id} ${a.day} ${k} n`);
    close(ag[k].r, a[k].r, 2e-6, `${a.id} ${a.day} ${k} r`);
    close(ag[k].lo, a[k].lo, 2e-6, `${a.id} ${a.day} ${k} lo`);
    close(ag[k].hi, a[k].hi, 2e-6, `${a.id} ${a.day} ${k} hi`);
  }
  assert.equal(batteryConclusion(g, ag, a.id.toUpperCase()), a.conclusion, `${a.id} ${a.day} ${a.revealed} conclusion`);
  // a hidden check-in never reaches the ledger's rows
  const row = g.find((r) => r.date === a.day);
  if (!a.revealed) assert.equal(row.readiness, null, `${a.id} ${a.day} hidden readiness`);
  else assert.equal(row.readiness, at(p, "readiness", a.day), `${a.id} ${a.day} revealed readiness`);
  assert.ok(g.filter((r) => r.date > a.day).every((r) => r.readiness === null && r.soreness === null), `${a.id} ${a.day} later check-ins hidden`);
  count.agreement++;
}
// the rarer wordings of the conclusion, on series where one answer never changes
for (const x of ref.synthetic) {
  const g = batterySeries(people[x.id]);
  for (const k of x.constant === "both" ? ["readiness", "soreness"] : [x.constant]) g.forEach((r) => { if (r[k] !== null) r[k] = 3; });
  assert.equal(batteryConclusion(g, batteryAgreement(g), x.id.toUpperCase()), x.conclusion, `${x.id} constant ${x.constant}`);
}
// the clamping of the two numbers (app.R in_range)
assert.equal(inRange("12", 1, 10, 3), 10); assert.equal(inRange("0.2", 1, 10, 3), 1); assert.equal(inRange("", 1, 10, 3), 3);
assert.equal(inRange("4.5", 1, 10, 3), 4.5); assert.equal(inRange("70", 5, 60, 25), 60);

// the training-load callout: the selected day locked, an earlier day inspected
for (const c of ref.callout) {
  const x = loadCallout(people[c.id], c.day, c.pick, c.span);
  const what = `${c.id} ${c.day} pick ${c.pick} span ${c.span}`;
  assert.equal(x.date, c.date, `${what} date`);
  assert.equal(x.words, c.words, `${what} words`);
  assert.equal(x.pct, c.pct, `${what} pct`);
  assert.deepEqual(x.facts, c.facts, `${what} facts`);
  assert.equal(!x.locked, c.open, `${what} open button`);
  count.callout++;
}

// Steps: the three numbers, the heatmap lede's count, and the table rows
for (const a of ref.activity) {
  const w = activityWindows(people[a.id], a.day);
  for (const k of ["s7", "s28"]) {
    assert.equal(w[k].days, a[k].days, `${a.id} ${a.day} ${k} days`);
    close(w[k].steps, a[k].steps, 1e-4, `${a.id} ${a.day} ${k} steps`);
    close(w[k].minutes, a[k].minutes, 1e-4, `${a.id} ${a.day} ${k} minutes`);
  }
  assert.equal(recordedHours(hourly[a.id], a.day, 7), a.records[0], `${a.id} ${a.day} hours with records (7 days)`);
  assert.equal(recordedHours(hourly[a.id], a.day, 28), a.records[1], `${a.id} ${a.day} hours with records (4 weeks)`);
  count.activity++;
}
for (const [id, rows] of Object.entries(ref.activity_rows)) {
  for (const r of rows) { assert.deepEqual(activityRow(hourly[id], r[0]), r, `${id} ${r[0]} table row`); count.rows++; }
}

// sessions per month: the sentence under the charts
for (const [id, text] of Object.entries(ref.monthly_note)) {
  const m = hourly[id].monthly;
  assert.equal(monthlyNote(m, id.toUpperCase()) ?? "This participant reported no sessions.", text, `${id} monthly note`);
}
console.log(`training: ${count.ledger} ledger days, ${count.agreement} ledger checks, ${count.callout} callouts, ${count.activity} step windows, ${count.rows} table rows match R`);
