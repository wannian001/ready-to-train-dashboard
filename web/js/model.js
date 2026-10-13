// The shared rules of the dashboard, ported from the R app (file and function named on each). Nothing here
// touches the page, so the tests (tests/core.test.mjs) run it in node against R's own values.
// Days are ISO strings ("2020-03-26"); a missing value is null.

// ---- dates ---------------------------------------------------------------------------------------------
const MS = 86400000;
export const toTime = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, n) => isoOf(toTime(iso) + n * MS);
export const diffDays = (a, b) => Math.round((toTime(a) - toTime(b)) / MS);   // a − b
export const wday = (iso) => new Date(toTime(iso)).getUTCDay();               // 0 = Sunday
export function dayRange(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
export const finite = (x) => typeof x === "number" && Number.isFinite(x);
export const mean = (v) => { const x = v.filter(finite); return x.length ? x.reduce((s, y) => s + y, 0) / x.length : NaN; };

// ---- a participant's record (web/data/p/<id>.json) ----------------------------------------------------------
// d.<field>[i] and signals.<key>[i] belong to the day first + i; train is one row per day with a session.
export function preparePerson(raw) {
  const dates = Array.from({ length: raw.n }, (_, i) => addDays(raw.first, i));
  const train = new Map(raw.train.map(([date, sessions, load, minutes, rpe, running, endurance, strength, team]) =>
    [date, { date, sessions, load, minutes, rpe, running: !!running, endurance: !!endurance, strength: !!strength, team: !!team }]));
  return { ...raw, dates, last: dates[dates.length - 1], train };
}
export const indexOf = (p, iso) => { const i = diffDays(iso, p.first); return i >= 0 && i < p.n ? i : -1; };
export const inRecord = (p, iso) => indexOf(p, iso) >= 0;
export function at(p, key, iso) { const i = indexOf(p, iso); if (i < 0) return null; const v = p.d[key][i]; return v ?? null; }
export function signalOn(p, key, iso) { const i = indexOf(p, iso); return i < 0 ? undefined : (p.signals[key][i] ?? null); }
// values of one field on a list of days (null outside the record)
export const series = (p, key, days) => days.map((d) => at(p, key, d));

// ---- reveal.R visible_person(): what a page may show before the reader reveals the day -----------------
// The selected day's morning check-in stays hidden until Reveal, and later check-ins are never shown on page 1.
// Hidden here, on the arrays every chart and table is built from, so a hidden answer never reaches the page.
export const WELLNESS = ["readiness", "fatigue", "mood", "stress", "sleep_quality", "soreness"];
export function visiblePerson(p, day, revealed = false) {
  const cut = indexOf(p, day) >= 0 ? diffDays(day, p.first) : (day < p.first ? -1 : p.n - 1);
  const d = { ...p.d };
  for (const k of WELLNESS) d[k] = p.d[k].map((v, i) => (i > cut || (i === cut && !revealed) ? null : v));
  return { ...p, d };
}

// ---- readiness_waterfall.R personal_level(): one calibration check-in per week ---------------------------
// The latest check-in in each of the weeks dated 8–14, 15–21, 22–28 and 29–35 days before the day, averaged;
// at least three of the four weeks are needed.
export function personalLevel(p, day) {
  const picked = [];
  for (let w = 0; w < 4; w++) {
    for (let k = 8 + 7 * w; k <= 14 + 7 * w; k++) {                 // latest first
      const d = addDays(day, -k), v = at(p, "readiness", d);
      if (finite(v)) { picked.push({ date: d, value: v }); break; }
    }
  }
  const n = picked.length;
  return { n, value: n >= 3 ? mean(picked.map((x) => x.value)) : NaN,
    start: n ? picked.map((x) => x.date).sort()[0] : null, end: n ? picked.map((x) => x.date).sort()[n - 1] : null };
}

// ---- readiness_waterfall.R readiness_waterfall_parts(): the usual level plus the 13 tracked signals ------------
// true: the full weight; not true: nothing; unknown: the weight times how often it was true in the training data.
const STAGE = { "Past 7 days": 1, "2 days ago": 1, "Yesterday": 2, "Last night": 3 };
export function expectedOn(p, model, signals, day) {
  const level = personalLevel(p, day);
  if (indexOf(p, day) < 0 || model.status !== "ready") return { level, parts: null, adjustment: NaN, value: finite(level.value) ? level.value : NaN };
  const layer = Object.fromEntries(signals.map((s) => [s.key, s.layer]));
  const parts = [];
  let run = finite(level.value) ? level.value : 0;
  model.keys.forEach((key, i) => {
    const value = signalOn(p, key, day), known = value !== null, held = known && value === 1;
    const contribution = held ? model.beta[key] : known ? 0 : model.beta[key] * model.fill[key];
    parts.push({ key, number: i + 1, layer: layer[key], stage: STAGE[layer[key]], value, known, held, contribution, before: run, after: run + contribution });
    run += contribution;
  });
  const adjustment = parts.reduce((s, x) => s + x.contribution, 0);
  if (!finite(level.value)) return { level, parts: null, adjustment: NaN, rawAdjustment: adjustment, value: NaN };
  const raw = level.value + adjustment;
  return { level, parts, adjustment, raw, value: Math.min(10, Math.max(0, raw)) };
}
// readiness_waterfall.R expected_series(): expected and felt for a run of days (felt from the rows given, so a
// hidden check-in stays hidden)
export function expectedSeries(p, model, signals, days) {
  return days.map((date) => {
    const e = expectedOn(p, model, signals, date);
    const adjustment = e.parts ? e.adjustment : finite(e.rawAdjustment) ? e.rawAdjustment : NaN;
    return { date, level: e.level.value, adjustment, expected: e.parts ? e.value : NaN, felt: at(p, "readiness", date) };
  });
}

// ---- day_view.R usual_stats(): the participant's usual value (median over the whole record) and middle half --
export function quantile(sorted, q) {             // R's default (type 7)
  const h = (sorted.length - 1) * q, lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
}
export function usualStats(values) {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (v.length < 5) return null;
  return { n: v.length, q25: quantile(v, 0.25), median: quantile(v, 0.5), q75: quantile(v, 0.75), lo: v[0], hi: v[v.length - 1] };
}

// ---- story_visuals.R training_load_series(): 7-day total vs the 28-day weekly average ---------------------
// A day before the record starts is not a zero-load day: the 7-day total needs all 7 days on record, the weekly
// average needs 14 of the last 28. Inside the record a day with no session adds 0; a blank load adds 0 but is flagged.
export const LOAD_MIN_DAYS = 14;
export function trainingLoadSeries(p, day, span = 56, firstDay = p.first) {
  const all = dayRange(addDays(day, -(span + 27) + 1), day);
  const z = all.map((date) => {
    const tr = p.train.get(date), onRecord = date >= firstDay;
    return { date, onRecord, reported: !!tr, unknown: !!tr && !finite(tr.load), load: tr && finite(tr.load) ? tr.load : 0 };
  });
  const sum = (i, n, f) => { let s = 0; for (let j = Math.max(0, i - n + 1); j <= i; j++) s += f(z[j]); return s; };
  z.forEach((r, i) => {
    r.days7 = sum(i, 7, (x) => (x.onRecord ? 1 : 0));
    r.days28 = sum(i, 28, (x) => (x.onRecord ? 1 : 0));
    const known7 = sum(i, 7, (x) => (x.onRecord ? x.load : 0)), known28 = sum(i, 28, (x) => (x.onRecord ? x.load : 0));
    r.load7 = r.days7 === 7 ? known7 : null;
    r.load28 = r.days28 >= LOAD_MIN_DAYS ? (known28 / r.days28) * 7 : null;
    r.unknown7 = sum(i, 7, (x) => (x.unknown ? 1 : 0));
    r.unknown28 = sum(i, 28, (x) => (x.unknown ? 1 : 0));
  });
  return z.slice(-span);
}
// load_change_pct(): how far the 7-day total sits from the usual week
export const loadChangePct = (r) => (r && finite(r.load7) && finite(r.load28) && r.load28 > 0 ? 100 * (r.load7 / r.load28 - 1) : NaN);

// ---- evidence.R: yesterday's load and its display band -----------------------------------------------
// No session reported the day before → 0 (the "no session" band, not a confirmed rest day); a session with a
// blank load → unknown; the day before outside the record → unknown.
// Bands (cut at -1, 0, 199, 399, Inf): 0 no session, 1 light 1–199, 2 moderate 200–399, 3 heavy 400+.
export function loadPrev(p, day) {
  const prev = addDays(day, -1);
  if (!inRecord(p, prev)) return NaN;
  const tr = p.train.get(prev);
  return !tr ? 0 : finite(tr.load) ? tr.load : NaN;
}
export const bandOf = (load) => (!finite(load) ? null : load <= 0 ? 0 : load <= 199 ? 1 : load <= 399 ? 2 : 3);
// evidence.R focal_load_band(): where one participant-day sits
export function focalBand(p, day) {
  if (!inRecord(p, day)) return null;
  const load = loadPrev(p, day);
  if (!finite(load)) return { band: null, load: NaN, status: inRecord(p, addDays(day, -1)) ? "blank" : "no_prior" };
  return { band: bandOf(load), load, status: "ok" };
}

// ---- insights.R default_research_day(): the latest day with last night's sleep, yesterday's check-in and its own
export function defaultDay(p) {
  for (let i = p.n - 1; i >= 1; i--) {
    if (finite(p.d.sleep_hours[i]) && finite(p.d.readiness[i - 1]) && finite(p.d.readiness[i])) return p.dates[i];
  }
  return p.last;
}

// home_cards.R spark_window(): the 14 days up to the selected one
export const sparkWindow = (day, n = 14) => dayRange(addDays(day, -(n - 1)), day);
