// The shell: the menu (a left sidebar, a bottom tab bar on phones), language and light/dark, the participant and
// day pickers, the Reveal step, hash routing, the Today overview, and the About dialog. Built on the Proactive Health AIO design kit
// (formerly dayring; web/kit/ holds the 1.3.0 export).
// Routes: #today, #today/<section> (readiness, sleep, training, activity, soreness), #choices, #habits;
// ?p=p07&d=2020-03-26 after the route keeps the participant and day in a shared link.
import { draw, installTooltip, esc } from "../kit/js/charts.js";
import { icon as kitIcon } from "../kit/js/icons.js";
import { getLang, setLang, t, fmt, dev, dur, gap, clock, pid, dayLabel, monthLabel, monthShort, weekdayShort, finite } from "./i18n.js";
import "./i18n/terms.js";
import "./i18n/about.js";
import { loadStudy, loadPerson } from "./data.js";
import { addDays, inRecord, at, series, visiblePerson, expectedOn, usualStats, trainingLoadSeries, loadChangePct,
  focalBand, sparkWindow, signalOn } from "./model.js";
import { icon, evidenceTag, scopeChip, revealButton, hideButton } from "./ui.js";
import { sparkBars, sparkReadiness, sparkLikert } from "./spark.js";
import { aboutHtml } from "./about.js";

const REPO = "https://github.com/wannian001/ready-to-train-dashboard";
const KIT = "https://github.com/wannian001/proactive-health-aio/blob/main/docs/DESIGN_KIT.md";
const SECTIONS = ["readiness", "sleep", "training", "activity", "soreness"];
// each Today detail and each page is its own module; one that fails to load shows a note instead of breaking the shell
const MODULES = {
  readiness: () => import("./sections/readiness.js"), sleep: () => import("./sections/sleep.js"),
  training: () => import("./sections/training.js"), activity: () => import("./sections/activity.js"),
  soreness: () => import("./sections/soreness.js"), choices: () => import("./pages/choices.js"), habits: () => import("./pages/habits.js"),
  report: () => import("./pages/report.js"),
};
const store = {
  get(key) { try { return localStorage.getItem(`readytrain.${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`readytrain.${key}`, value); } catch { /* private mode */ } },
};
const query = new URLSearchParams(location.search);   // ?lang=zh&mode=dark for shared links

let study = null;
const state = { page: "today", section: "overview", person: null, focus: null, stripEnd: null, revealed: false, compare: "" };
let person = null;

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--c-band)" stroke-width="5"/>
  <path d="M16 3.5a12.5 12.5 0 0 1 12.2 9.8" fill="none" stroke="var(--c-expected)" stroke-width="5" stroke-linecap="round"/>
  <path d="M27.9 20a12.5 12.5 0 0 1-8.1 8" fill="none" stroke="var(--c-felt)" stroke-width="5" stroke-linecap="round"/>
  <path d="M7 16.5h4.2l2.2-4.5 3.4 8.5 2.4-4h5.6" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MOON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z"/></svg>`;

// ---- light / dark ------------------------------------------------------------------------------------
let picked = null;
function applyLook() {
  const mode = picked || query.get("mode") || store.get("mode");
  if (mode === "light" || mode === "dark") document.documentElement.dataset.mode = mode; else delete document.documentElement.dataset.mode;
}
const isDark = () => {
  const m = document.documentElement.dataset.mode;
  return m ? m === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

// ---- routing -----------------------------------------------------------------------------------------------
function parseHash() {
  const [path, qs = ""] = location.hash.replace(/^#/, "").split("?");
  const [page, section] = path.split("/");
  const params = new URLSearchParams(qs);
  return {
    page: ["today", "choices", "habits", "report"].includes(page) ? page : "today",
    section: page === "today" && SECTIONS.includes(section) ? section : "overview",
    person: params.get("p"), day: params.get("d"),
  };
}
const hashFor = (page, section) => `#${page}${page === "today" && section !== "overview" ? `/${section}` : ""}?p=${state.person}&d=${state.focus}`;
function syncHash() {
  const want = hashFor(state.page, state.section);
  if (location.hash !== want) history.replaceState(null, "", `${location.pathname}${location.search}${want}`);
}
// open a page (pushes history, so the back button returns)
function go(target) {
  const [page, section = "overview"] = String(target).split("/");
  location.hash = hashFor(page, section);
}

// ---- state changes --------------------------------------------------------------------------------------
// app.R set_focus(): clamp to the record, hide the check-in again, move the strip only when the day leaves it
function setDay(day) {
  if (!day || !person) return;
  const v = day < person.first ? person.first : day > person.last ? person.last : day;
  state.focus = v; state.revealed = false;
  if (v > state.stripEnd || v < addDays(state.stripEnd, -6)) state.stripEnd = v;
  syncHash(); render();
}
// switching participant keeps the day when the new one has a record for it, so two people can be compared on the
// same date; otherwise it falls back to their default day
async function setPerson(id, { day = null } = {}) {
  if (!study.people.some((p) => p.participant === id)) id = study.initial.person;
  state.person = id; state.compare = "";
  person = await loadPerson(id);
  const want = day || state.focus;
  const target = want && inRecord(person, want) ? want : person.default_day;
  state.focus = target; state.stripEnd = target; state.revealed = false;
  syncHash(); await render();
}
const setRevealed = (on) => { state.revealed = !!on; render(); };
const setCompare = (id) => { state.compare = id && id !== state.person ? id : ""; render(); };

// ---- the context every section receives -----------------------------------------------------------------
function context() {
  const pv = visiblePerson(person, state.focus, state.revealed);
  const expected = expectedOn(pv, study.model, study.signals, state.focus);
  const hasCheckin = finite(at(person, "readiness", state.focus));
  return {
    study, person, pv, id: state.person, pid: pid(state.person), focus: state.focus, revealed: state.revealed, compare: state.compare,
    lang: getLang(), dark: isDark(), expected, hasCheckin,
    profile: study.people.find((p) => p.participant === state.person),
    // the day's own check-in value, only after Reveal (app.R revealed_value)
    revealedValue: (key) => (state.revealed ? at(person, key, state.focus) : NaN),
    setDay, setPerson: (id) => setPerson(id), setCompare, setRevealed, go, refresh: render,
    revealBar: () => revealBar(expected, hasCheckin),
  };
}
// app.R gap_words()
export function gapWords(felt, expected) {
  const g = felt - expected;
  if (Math.abs(g) < 0.05) return t("gap.as_expected");
  return t(g > 0 ? "gap.better" : "gap.worse", { v: fmt(Math.abs(g), 1) });
}

// ---- the reveal bar (app.R reveal_bar_ui), reworded for a first-time reader --------------------------------------
// a space between two sentences in English, none after a Chinese full stop
const sp = () => (getLang() === "zh" ? "" : " ");
// he / she for the participant being viewed (the data give each participant's sex)
function pron(id) {
  const f = (study.people.find((p) => p.participant === id) || {}).gender === "female";
  return getLang() === "zh" ? { he: f ? "她" : "他" } : { he: f ? "she" : "he", his: f ? "her" : "his", him: f ? "her" : "him", himself: f ? "herself" : "himself" };
}
function revealBar(r, hasCheckin) {
  const who = pid(state.person), when = dayLabel(state.focus, { weekday: false, year: false }), pr = pron(state.person);
  if (!hasCheckin) return `<div class="reveal-bar none">${icon("info")}<span>${esc(t("rv.none", { id: who, day: when }))}</span></div>`;
  if (state.revealed) {
    const felt = at(person, "readiness", state.focus);
    let line = t("rv.shown_noexp", { id: who, felt: fmt(felt, 0) });
    if (finite(r.value)) {
      const g = felt - r.value;
      const words = Math.abs(g) < 0.05 ? t("rv.gap_same") : t(g > 0 ? "rv.gap_up" : "rv.gap_down", { v: fmt(Math.abs(g), 1) });
      line = t("rv.shown", { id: who, felt: fmt(felt, 0), expected: fmt(r.value, 1), gap: words });
    }
    // the study's one clear everyday habit, when it happened the night before this morning
    const late = signalOn(person, "late0", state.focus) === 1;
    const story = late ? `${sp()}${t("rv.story", { ...pr, time: clock(at(person, "start_hour", state.focus)) })}` : "";
    return `<div class="reveal-bar shown">${icon("check")}<span><strong>${esc(line)}</strong>${esc(story)}${sp()}${esc(t("rv.green"))}</span>${hideButton()}</div>`;
  }
  const lead = finite(r.value) ? t("rv.guess", { id: who, value: fmt(r.value, 1), ...pr }) : t("rv.no_guess", { id: who, ...pr });
  return `<div class="reveal-bar">${icon("info")}<span>${esc(lead)}</span>${revealButton()}</div>`;
}

// ---- the sidebar ----------------------------------------------------------------------------------------
// an item with pages under it (Today) folds them away: on the wide sidebar the item is a button that opens and
// closes its list, which starts closed and stays as the reader left it; on the icon rail and the phone tab bar,
// where sub-pages are not listed, the same item is a link to its first page
const NAV = [["today", "sun", ["overview", ...SECTIONS]], ["choices", "list"], ["habits", "compare"], ["report", "doc"]];
const CHEVRON = `<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>`;
const openGroups = new Set((store.get("menu") || "").split(",").filter(Boolean));
const folded = () => document.documentElement.classList.contains("side-folded");
const wide = () => matchMedia("(min-width: 900px)").matches;
function sidebar() {
  const side = document.querySelector(".side");
  const items = NAV.map(([p, ic, subs]) => {
    const here = p === state.page;
    const glyph = ic === "compare" || ic === "doc" ? icon(ic, 18) : kitIcon(ic, 18);
    const label = `${glyph}<span>${esc(t(`nav.${p}`))}</span>`;
    const link = `<a href="${hashFor(p, "overview")}" title="${esc(t(`nav.${p}`))}" ${here ? 'aria-current="page"' : ""}>${label}</a>`;
    if (!subs) return link;
    const open = openGroups.has(p);
    const list = subs.map((s) => `<a class="side-sub" href="${hashFor(p, s)}" ${here && state.section === s ? 'aria-current="page"' : ""}><span>${esc(t(`nav.${s}`))}</span></a>`).join("");
    // closed while one of its pages is open: the item itself is highlighted, so the reader still sees where they are
    return `<div class="side-group${open ? " open" : ""}${here ? " holds-current" : ""}" data-group="${p}">${link}
      <button type="button" class="side-group-toggle" aria-expanded="${open}" aria-controls="side-${p}">${label}${CHEVRON}</button>
      <div class="side-subs" id="side-${p}"><div>${list}</div></div></div>`;
  }).join("");
  side.innerHTML = `
    <div class="side-head">
      <a class="brand" href="${hashFor("today", "overview")}">${LOGO}<span>${esc(t("app.name"))}</span></a>
      <button class="side-fold" id="fold" type="button" aria-label="${esc(t("ui.fold"))}" title="${esc(t("ui.fold"))}">${kitIcon("sidebar", 18)}</button>
    </div>
    <nav class="side-nav" aria-label="Pages">${items}</nav>
    <div class="side-tools">
      <span class="demo-badge" title="${esc(t("ui.web_note"))}">GEOM90007</span>
      <button class="tool" id="lang" type="button" aria-label="Language">${t("ui.lang")}</button>
      <button class="tool" id="mode" type="button" aria-label="${esc(t("ui.mode"))}" title="${esc(t("ui.mode"))}">${MOON}</button>
    </div>`;
  const brand = side.querySelector(".brand");
  const label = () => {
    if (folded() && wide()) { brand.title = t("ui.unfold"); brand.setAttribute("aria-label", t("ui.unfold")); }
    else { brand.removeAttribute("title"); brand.removeAttribute("aria-label"); }
  };
  const setFold = (on) => { document.documentElement.classList.toggle("side-folded", on); store.set("side", on ? "folded" : "open"); label(); };
  label();
  side.querySelectorAll(".side-group-toggle").forEach((button) => {
    button.onclick = () => {
      const group = button.closest(".side-group"), on = !group.classList.contains("open");
      group.classList.toggle("open", on);
      button.setAttribute("aria-expanded", String(on));
      if (on) openGroups.add(group.dataset.group); else openGroups.delete(group.dataset.group);
      store.set("menu", [...openGroups].join(","));
    };
  });
  side.querySelector("#fold").onclick = () => { setFold(true); brand.focus(); };
  brand.onclick = (e) => { if (folded() && wide()) { e.preventDefault(); setFold(false); side.querySelector("#fold").focus(); } };
  side.querySelector("#lang").onclick = () => { const next = getLang() === "zh" ? "en" : "zh"; store.set("lang", next); setLang(next); render(); };
  side.querySelector("#mode").onclick = () => {
    picked = isDark() ? "light" : "dark";
    store.set("mode", picked);
    if (query.has("mode")) { query.delete("mode"); const rest = query.toString(); history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`); }
    applyLook(); render();
  };
}

// ---- the head and the pickers ---------------------------------------------------------------------------------
function head() {
  const zh = getLang() === "zh";
  const title = zh ? t("app.alt") : t("app.name"), alt = zh ? t("app.name") : t("app.alt");
  // laptop first: the two names share one line; under them, three short lines a first-time reader needs (the
  // question, what came out, who did what), then the data line with the way to the brief and to the methods
  const rows = [["brief.q.h", "brief.q"], ["brief.f.h", "brief.f"], ["brief.r.h", "brief.r"]]
    .map(([h, b]) => `<div class="brief-row"><dt>${esc(t(h))}</dt><dd>${esc(t(b))}</dd></div>`).join("");
  return `<div class="head"><div>
    <h1>${esc(title)} <span class="h1-alt" lang="${zh ? "en" : "zh-CN"}">${esc(alt)}</span></h1>
    <dl class="brief">${rows}</dl>
    <p class="data-line"><span>${esc(t("app.data", { n: study.people.length, first: dayLabel(study.first, { weekday: false }), last: dayLabel(study.last, { weekday: false }) }))}</span>
      ${state.page === "report" ? "" : `<a class="solves-link" href="${hashFor("report", "overview")}">${icon("doc", 16)}${esc(t("app.solves"))} ›</a>`}
      <button type="button" class="link-button" id="about-open">${icon("info", 16)}${esc(t("app.about"))}</button></p>
  </div></div>`;
}
function pickers() {
  const people = study.people.map((p) => `<option value="${p.participant}" ${p.participant === state.person ? "selected" : ""}>${esc(t("ctl.person", { id: pid(p.participant), age: p.age, gender: t(`gender.${p.gender}`) }))}</option>`).join("");
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(state.stripEnd, -i));
  const strip = days.map((d) => {
    const valid = inRecord(person, d), on = d === state.focus;
    const rec = valid && (at(person, "wellness_reports", d) || 0) > 0;
    const lab = t(rec ? "ctl.day_rec" : "ctl.day_none", { day: dayLabel(d) });
    return `<button type="button" class="day-button${on ? " selected" : ""}" ${valid ? `data-day="${d}"` : "disabled"} title="${esc(lab)}" aria-label="${esc(lab)}" aria-pressed="${on}">
      <span>${esc(weekdayShort(d))}</span><strong>${+d.slice(8, 10)}</strong><i class="${rec ? "has-data" : ""}"></i></button>`;
  }).join("");
  const a = days[0], b = days[6];
  const month = monthShort(a) === monthShort(b) ? `${monthShort(b)} ${b.slice(0, 4)}` : `${monthShort(a)}–${monthShort(b)}${a.slice(0, 4) === b.slice(0, 4) ? ` ${b.slice(0, 4)}` : ""}`;
  return `<div class="control-bar"><div class="control-card">
    <label class="picker"><span>${esc(t("ctl.participant"))}</span><select id="participant">${people}</select></label>
    <div class="calendar-nav">
      <button type="button" class="step" data-day="${addDays(state.focus, -1)}" ${state.focus <= person.first ? "disabled" : ""} title="${esc(t("ctl.prev"))}" aria-label="${esc(t("ctl.prev"))}">‹</button>
      <div class="day-strip">${strip}</div>
      <button type="button" class="step" data-day="${addDays(state.focus, 1)}" ${state.focus >= person.last ? "disabled" : ""} title="${esc(t("ctl.next"))}" aria-label="${esc(t("ctl.next"))}">›</button>
    </div>
    <label class="date-jump" title="${esc(t("ctl.calendar"))}"><span class="date-jump-face" aria-hidden="true">${esc(month)}${icon("calendar", 16)}</span>
      <input type="date" id="focus-day" value="${state.focus}" min="${person.first}" max="${person.last}" aria-label="${esc(t("ctl.calendar"))}"></label>
    <button type="button" class="latest" data-day="${person.last}" data-latest="1" title="${esc(t("ctl.latest_title"))}">${esc(t("ctl.latest"))}</button>
  </div>
  <p class="strip-legend"><span class="legend-dot" aria-hidden="true"></span>${esc(t("ctl.legend"))}</p></div>`;
}

// ---- the Today overview: five snapshot cards and the key finding (app.R home_*) ---------------------------------
const card = (section, iconName, title, when, body, kind) => `<a class="home-card ${kind}" href="${hashFor("today", section)}">
  <div class="home-card-title">${icon(iconName)}<span class="home-card-name"><span>${esc(title)}</span><span class="card-when">${esc(when)}</span></span><span class="home-card-arrow" aria-hidden="true">›</span></div>
  ${body}</a>`;
const cardBody = ({ value, unit = "", headline, detail, spark = "", badge = null }) => `<div class="home-card-body">
  ${badge ? `<span class="home-badge ${badge.kind}">${esc(badge.text)}</span>` : ""}
  <div class="home-card-value"><strong>${esc(value)}</strong>${unit ? `<span>${esc(unit)}</span>` : ""}</div>
  <p>${esc(headline)}</p><small>${esc(detail)}</small>${spark}</div>`;
const sparkSlot = (key, label) => `<div class="spark" data-spark="${key}" role="img" aria-label="${esc(label)}"></div>`;

function overview(ctx) {
  const { focus, pv, expected: r } = ctx;
  const dates = sparkWindow(focus);
  const sparks = {};
  const cards = [];

  // readiness
  {
    const felt = ctx.revealedValue("readiness");
    sparks.readiness = { fn: (w) => sparkReadiness(dates, series(pv, "readiness", dates), focus, r.value, felt, w), dates };
    const label = t("rd.spark", { what: t(finite(felt) ? "rd.spark_felt" : "rd.spark_expected") });
    let body;
    if (finite(felt)) body = cardBody({ value: fmt(felt, 0), unit: t("rd.felt_unit"), headline: finite(r.value) ? t("rd.felt_line", { expected: fmt(r.value, 1), words: gapWords(felt, r.value) }) : t("rd.no_expected"),
      detail: t("rd.green_ring"), spark: sparkSlot("readiness", label), badge: { kind: "shown", text: t("badge.revealed") } });
    else if (!finite(r.value)) body = cardBody({ value: "—", headline: t("rd.not_enough"), detail: t("rd.needs"), spark: sparkSlot("readiness", label) });
    else body = cardBody({ value: fmt(r.value, 1), unit: t("rd.expected_unit"), headline: t("rd.mostly", { level: fmt(r.level.value, 1) }),
      detail: (Math.abs(r.adjustment) < 0.005 ? t("rd.changes0") : t("rd.changes", { adj: dev(r.adjustment, 2) })) + t(ctx.hasCheckin ? "rd.reveal_to_check" : "rd.no_checkin"), spark: sparkSlot("readiness", label), badge: { kind: "estimate", text: t("badge.expected") } });
    cards.push(card("readiness", "pulse", t("card.readiness"), t("card.readiness_when"), body, "readiness-card"));
  }
  // last night's sleep (the full record: sleep is not part of the hidden check-in)
  {
    const p = ctx.person, v = at(p, "sleep_hours", focus), s = usualStats(p.d.sleep_hours);
    const delta = finite(v) && s ? v - s.median : NaN;
    sparks.sleep = { fn: (w) => sparkBars(dates, series(p, "sleep_hours", dates), focus, { color: "var(--c-sleep)", usual: s ? s.median : NaN, top: 10 }, w) };
    cards.push(card("sleep", "moon", t("card.sleep"), t("card.sleep_when"), cardBody({ value: finite(v) ? dur(v) : "—",
      headline: finite(delta) ? t(delta >= 0 ? "sl.more" : "sl.less", { gap: gap(delta) }) : t("sl.none"),
      detail: s ? t("sl.usual", { usual: dur(s.median) }) : t("sl.no_usual"), spark: sparkSlot("sleep", t("sl.spark")) }), "sleep-card"));
  }
  // training yesterday
  {
    const p = ctx.person, tr = p.train.get(addDays(focus, -1)), reported = !!tr;
    const value = reported && finite(tr.load) ? fmt(tr.load) : reported ? t("tr.blank") : t("tr.none");
    const last = trainingLoadSeries(p, focus, 56, p.first).at(-1), pct = loadChangePct(last);
    const loads = dates.map((d) => { if (!inRecord(p, d)) return null; const x = p.train.get(d); return !x ? 0 : finite(x.load) ? x.load : null; });
    sparks.training = { fn: (w) => sparkBars(dates, loads, addDays(focus, -1), { color: "var(--c-load)", zeroIsValue: false }, w) };
    let headline = t("tr.nothing");
    if (reported) {
      const types = ["running", "endurance", "strength", "team"].filter((k) => tr[k]).map((k) => t(`type.${k}`));
      let text = types.length ? types.join(" + ") : t("type.none");
      if (getLang() === "en") text = text.replace(/\b\w/g, (c) => c.toUpperCase());
      headline = text + (finite(tr.minutes) ? ` · ${t("tr.min", { v: fmt(tr.minutes) })}` : "") + (finite(tr.rpe) ? ` × ${t("tr.rpe", { v: fmt(tr.rpe) })}` : "");
    }
    const detail = finite(pct) ? t("tr.last7_pct", { load7: fmt(last.load7), pct: fmt(Math.abs(pct)), dir: t(pct >= 0 ? "tr.above" : "tr.below") })
      : finite(last.load7) ? t("tr.last7_no28", { load7: fmt(last.load7), days: last.days28 }) : t("tr.only", { days: last.days7 });
    cards.push(card("training", "compare", t("card.training"), t("card.training_when"), cardBody({ value, unit: reported ? t("tr.load") : "", headline, detail,
      spark: sparkSlot("training", t("tr.spark")) }), "training-card"));
  }
  // steps (app.R activity_windows + home_activity)
  {
    const p = ctx.person;
    const win = (n) => {
      const ds = []; for (let i = n - 1; i >= 0; i--) ds.push(addDays(focus, -i));
      const ok = ds.filter((d) => finite(at(p, "steps", d)));
      const both = ok.filter((d) => finite(at(p, "step_minutes", d)));
      return { days: ok.length, steps: ok.length ? ok.reduce((s, d) => s + at(p, "steps", d), 0) / ok.length : NaN,
        minutes: both.length ? both.reduce((s, d) => s + at(p, "step_minutes", d), 0) / both.length : NaN };
    };
    const s28 = win(28), v = at(p, "steps", focus), avg = s28.steps, worn = at(p, "step_minutes", focus), wornAvg = s28.minutes;
    const delta = finite(v) && finite(avg) && avg > 0 ? (v / avg - 1) * 100 : NaN;
    const wear = finite(worn) && finite(wornAvg) && wornAvg > 0 ? (worn / wornAvg - 1) * 100 : NaN;
    const perHour = finite(v) && finite(worn) && worn > 0 && finite(avg) && finite(wornAvg) && wornAvg > 0 ? ((v / worn) / (avg / wornAvg) - 1) * 100 : NaN;
    sparks.activity = { fn: (w) => sparkBars(dates, series(p, "steps", dates), focus, { color: "var(--c-steps)", usual: avg }, w) };
    const detail = finite(wear) ? t("ac.worn", { dur: dur(worn / 60), pct: fmt(Math.abs(wear)), dir: t(wear >= 0 ? "ac.longer" : "ac.shorter") })
      + (finite(perHour) ? t("ac.per_hour", { pct: fmt(Math.abs(perHour)), dir: t(perHour >= 0 ? "tr.above" : "tr.below") }) : "") : t("ac.worn_unknown");
    cards.push(card("activity", "calendar", t("card.activity"), t("card.activity_when"), cardBody({ value: finite(v) ? fmt(v) : "—", unit: finite(v) ? t("ac.steps") : "",
      headline: finite(delta) ? t("ac.delta", { pct: fmt(Math.abs(delta)), dir: t(delta >= 0 ? "tr.above" : "tr.below"), avg: fmt(avg) }) : t("ac.none"),
      detail, spark: sparkSlot("activity", t("ac.spark")) }), "activity-card"));
  }
  // soreness
  {
    const f = focalBand(ctx.person, focus);
    const row = f && f.status === "ok" ? study.load_soreness.find((x) => x.band === f.band) : null;
    const actual = ctx.revealedValue("soreness");
    sparks.soreness = { fn: (w) => sparkLikert(dates, series(pv, "soreness", dates), focus, w) };
    const typical = row ? t("so.typical", { pct: Math.round(row.worse * 100), after: t(`so.after.${row.band}`) }) : t("so.no_band");
    let body;
    if (finite(actual)) body = cardBody({ value: fmt(actual, 0), unit: t("so.unit", { word: t(`so.word.${actual}`) }), headline: t("so.felt"), detail: t("so.compare", { typical }),
      spark: sparkSlot("soreness", t("so.spark")), badge: { kind: "shown", text: t("badge.revealed") } });
    else if (!row) body = cardBody({ value: "—", headline: typical, detail: t(`so.status.${f ? f.status : "none"}`), spark: sparkSlot("soreness", t("so.spark")) });
    else body = cardBody({ value: `${Math.round(row.worse * 100)}%`, unit: t("so.share_unit"), headline: t("so.hist", { after: t(`so.after.${row.band}`) }),
      detail: t("so.cells", { n: fmt(row.n) }), spark: sparkSlot("soreness", t("so.spark")), badge: { kind: "estimate", text: t("badge.history") } });
    cards.push(card("soreness", "body", t("card.soreness"), t("card.soreness_when"), body, "soreness-card"));
  }
  // the key finding (app.R key_finding(): the rule, not a hand-picked sentence)
  {
    const k = study.key_finding;
    const text = k.clear ? t("kf.text", { habits: k.habits, count: t(`kf.count.${Math.min(k.clear, 3)}`), have: t(k.clear === 1 ? "kf.has" : "kf.have"),
      label: getLang() === "en" ? t(`lever.${k.key}`).toLowerCase() : t(`lever.${k.key}`), effect: dev(k.effect, 2), people: k.people }).replace(/\s+,/, ",").replace(/ {2,}/g, " ")
      : t("kf.none", { habits: k.habits });
    cards.unshift(`<div class="home-card insight-card"><div class="home-card-title">${icon("bulb")}<span class="home-card-name"><span>${esc(t("card.key"))}</span><span class="card-when">${esc(t("card.key_when"))}</span></span></div>
      <div class="home-card-body"><div class="home-card-value"><strong>${esc(k.clear ? dev(k.effect, 2) : "—")}</strong><span>${esc(t("kf.unit"))}</span></div>
      <p>${esc(text)}</p><small>${esc(k.clear ? t("kf.compare", { tests: k.tests }) : t("kf.none_compare"))}</small>
      <a class="insight-link" href="${hashFor("choices", "overview")}">${esc(t("kf.link"))}</a></div></div>`);
  }
  const html = `<div class="view-intro"><div class="title-row"><h2>${esc(t("ov.title", { id: ctx.pid, day: dayLabel(focus) }))}</h2>${scopeChip(t("ov.scope"))}</div></div>
    ${ctx.revealBar()}<div class="home-grid">${cards.join("")}</div>`;
  return { html, mount: (el) => el.querySelectorAll("[data-spark]").forEach((s) => { const sp = sparks[s.dataset.spark]; if (sp) draw(s, sp.fn); }) };
}

// ---- render ---------------------------------------------------------------------------------------------
let renderSeq = 0;
async function render() {
  if (!study || !person) return;
  const seq = ++renderSeq;
  sidebar();
  const ctx = context();
  const main = document.querySelector("main");
  const name = state.page === "today" ? state.section : state.page;
  const title = state.page === "today" && state.section === "overview" ? t("nav.today") : t(`nav.${name}`);
  document.title = `${title} · ${t(getLang() === "zh" ? "app.alt" : "app.name")}`;
  let content = "", mount = null;
  if (name === "overview") ({ html: content, mount } = overview(ctx));
  else {
    try {
      const mod = (await MODULES[name]()).default;
      const data = mod.load ? await mod.load(ctx) : null;
      if (seq !== renderSeq) return;
      content = mod.render(ctx, data);
      mount = mod.mount ? (el) => mod.mount(el, ctx, data) : null;
    } catch (error) {
      console.error(error);
      content = `<div class="card"><p class="lede">${esc(t("ui.part_failed"))}</p><p class="xs muted">${esc(error.message)}</p></div>`;
    }
  }
  if (seq !== renderSeq) return;
  const back = state.page === "today" && state.section !== "overview"
    ? `<a class="back-pill" href="${hashFor("today", "overview")}">‹ ${esc(t("nav.back"))}</a>` : "";
  const banner = state.page === "choices" ? `<div class="pooled-banner">${icon("info")}<span>${t("pooled.banner", { n: study.people.length,
    first: monthLabel(study.first), last: monthLabel(study.last) })}</span></div>` : "";
  const scrollY = window.scrollY;
  const picks = state.page === "report" ? "" : pickers();
  main.innerHTML = `${head()}${picks}${banner}<p class="sr" role="status" aria-live="polite">${esc(t("ctl.status", { id: ctx.pid, day: dayLabel(state.focus) }))}</p>
    <div class="page page-${name}">${back}${content}</div>${footer()}`;
  if (mount) mount(main.querySelector(".page"));
  window.scrollTo(0, scrollY);
  wire(main);
}
function footer() {
  return `<footer class="foot"><span>${esc(t("foot.data"))}</span><span>${esc(t("foot.legend"))}</span>
    <span><a href="${REPO}">${esc(t("foot.repo"))}</a> · <a href="${KIT}">${esc(t("foot.kit"))}</a></span></footer>`;
}
function wire(main) {
  main.querySelector("#about-open").onclick = openAbout;
  if (state.page === "report") return;   // no pickers on the design summary
  main.querySelector("#participant").onchange = (e) => setPerson(e.target.value);
  const input = main.querySelector("#focus-day");
  input.onchange = () => { if (input.value) setDay(input.value); };
  main.querySelector(".date-jump").addEventListener("click", () => { try { input.showPicker(); } catch { input.focus(); } });
}

// clicks anywhere: open a day, reveal or hide, compare
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-day], [data-reveal], [data-compare], [data-go]");
  if (!el || el.disabled) return;
  if (el.dataset.go !== undefined) { e.preventDefault(); go(el.dataset.go); }
  else if (el.dataset.reveal !== undefined) setRevealed(el.dataset.reveal === "show");
  else if (el.dataset.compare !== undefined) setCompare(el.dataset.compare);
  else if (el.dataset.day) {
    if (el.dataset.latest) state.stripEnd = el.dataset.day;
    setDay(el.dataset.day);
  }
});
document.addEventListener("keydown", (e) => {
  // SVG marks with data-day are focusable; Enter or Space opens the day like a click
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("svg [data-day], svg [data-compare]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
});

// ---- About (app.R about_modal) ----------------------------------------------------------------------------
function openAbout() {
  let dlg = document.querySelector("dialog.about");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "about"; document.body.appendChild(dlg); dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); }
  dlg.innerHTML = `<div class="about-in"><div class="about-head"><h2>${esc(t("about.title"))}</h2><button type="button" class="tool" id="about-close">${esc(t("ui.close"))}</button></div>${aboutHtml(study)}</div>`;
  dlg.querySelector("#about-close").onclick = () => dlg.close();
  dlg.showModal();
}

// ---- start ----------------------------------------------------------------------------------------------
async function start() {
  window.readyStarted = true;   // index.html shows a reload message if this never runs
  setLang(query.get("lang") || store.get("lang") || ((navigator.language || "").slice(0, 2) === "zh" ? "zh" : "en"));
  applyLook();
  installTooltip();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  try {
    study = await loadStudy();
    const h = parseHash();
    state.page = h.page; state.section = h.section;
    await setPerson(h.person || study.initial.person, { day: h.day || (h.person ? null : study.initial.day) });
  } catch (error) {
    console.error(error);
    document.querySelector("main").innerHTML = `<div class="card"><p class="lede">${esc(t("ui.failed"))}</p><p><button class="tool" type="button" onclick="location.reload()">${esc(t("ui.reload"))}</button></p></div>`;
    return;
  }
  window.addEventListener("hashchange", async () => {
    const h = parseHash();
    const moved = h.page !== state.page || h.section !== state.section;
    state.page = h.page; state.section = h.section;
    if (h.person && h.person !== state.person) await setPerson(h.person, { day: h.day });
    else if (h.day && h.day !== state.focus && person && inRecord(person, h.day)) { state.focus = h.day; state.stripEnd = h.day; state.revealed = false; await render(); }
    else await render();
    if (moved) window.scrollTo(0, 0);
  });
}
start();
