// node tests/core.test.mjs — the shared rules in web/js/model.js give R's own numbers for every participant-day
// (tests/fixtures/core.json is written by tools/export_web.R from the submitted app's functions).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { preparePerson, personalLevel, expectedSeries, trainingLoadSeries, focalBand, defaultDay, visiblePerson, at } from "../web/js/model.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url)));
const study = read("../web/data/study.json");
const ref = read("./fixtures/core.json");
const close = (a, b, tol, what) => {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) assert.equal(Number.isFinite(a) && a !== null, Number.isFinite(b) && b !== null, what);
  else assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
};

let days = 0;
for (const { participant: id } of study.people) {
  const p = preparePerson(read(`../web/data/p/${id}.json`));
  const r = ref[id];
  assert.equal(defaultDay(p), p.default_day, `${id} default day`);
  const ex = expectedSeries(p, study.model, study.signals, p.dates);
  p.dates.forEach((day, i) => {
    const lv = personalLevel(p, day);
    close(lv.value, r.level[i], 1e-3, `${id} ${day} level`);
    assert.equal(lv.n, r.level_n[i], `${id} ${day} level n`);
    close(ex[i].expected, r.expected[i], 1e-3, `${id} ${day} expected`);
    const last = trainingLoadSeries(p, day, 1, p.first).at(-1);
    close(last.load7, r.load7[i], 1e-3, `${id} ${day} load7`);
    close(last.load28, r.load28[i], 1e-3, `${id} ${day} load28`);
    const fb = focalBand(p, day);
    assert.equal(fb && fb.status === "ok" ? fb.band : null, r.band[i], `${id} ${day} band`);
    days++;
  });
  // the hidden check-in never survives visiblePerson()
  const day = p.dates[Math.floor(p.n / 2)];
  const pv = visiblePerson(p, day, false);
  assert.equal(at(pv, "readiness", day), null);
  assert.equal(at(visiblePerson(p, day, true), "readiness", day), at(p, "readiness", day));
}
console.log(`core: ${days} participant-days match R`);
