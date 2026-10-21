// Words and number formats, English and Chinese. The shell's words are here; each section adds its own with
// addWords() from its file in js/i18n/. A key missing in Chinese falls back to English, then to the key itself.
// Numbers follow the R app's helpers: fmt(), deviation_label(), signed_num(), duration_label(), gap_text(), clock_text().

let lang = "en";
const W = { en: {}, zh: {} };
export const getLang = () => lang;
export function setLang(next) {
  lang = next === "zh" ? "zh" : "en";
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}
export function addWords(dict) { for (const l of ["en", "zh"]) Object.assign(W[l], dict[l] || {}); }
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : vars[k]));
export function t(key, vars = {}) { return tIn(lang, key, vars); }
export function tIn(which, key, vars = {}) {
  const s = W[which][key] ?? W.en[key];
  return s === undefined ? key : fill(s, vars);
}
export const has = (key) => key in W[lang] || key in W.en;

// ---- numbers -------------------------------------------------------------------------------------------
const finite = (x) => typeof x === "number" && Number.isFinite(x);
export { finite };
// Rounding like R's formatC()/round(): the exact binary value is rounded, and an exact tie (3.25 to one digit)
// goes to the even digit (3.2), where JavaScript would go up (3.3).
export function rround(x, digits = 0) {
  if (!finite(x)) return x;
  const exact = Math.abs(x).toFixed(Math.min(100, digits + 60));     // the double's exact decimal digits
  const tail = exact.slice(exact.indexOf(".") + 1 + digits);
  if (/^50*$/.test(tail)) {
    const kept = Number(exact.slice(0, exact.indexOf(".") + 1 + digits).replace(/\.$/, ""));
    const last = Math.round(kept * 10 ** digits) % 10;
    const r = last % 2 === 0 ? kept : kept + 10 ** -digits;
    return Math.sign(x) * Number(r.toFixed(digits));
  }
  return Number(x.toFixed(digits));
}
// fmt(1234.5) "1,234"; fmt(3.14159, 2) "3.14"; anything missing "—"
export function fmt(x, digits = 0) {
  if (!finite(x)) return "—";
  return rround(x, digits).toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
// a difference with a real minus sign; the sign follows the ROUNDED value, so a tiny one reads "0.00"
export function dev(x, digits = 1) {
  if (!finite(x)) return "—";
  const r = rround(x, digits);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt(Math.abs(r), digits)}`;
}
// signed_num(): "+0.45", "-0.22" (hyphen, as the R app prints correlations)
export function signed(x, digits = 2) {
  if (!finite(x)) return "—";
  const r = rround(x, digits) || 0;
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}`;
}
// p-values written the R app's way: ".003"
export const pShort = (p) => (finite(p) ? p.toFixed(3).replace(/^0\./, ".") : "—");
export const pid = (id) => String(id || "").toUpperCase();

// ---- durations and clock times (hours as decimals) -------------------------------------------------------
// duration_label(): "7 h 05 min" · "7 小时 05 分"
export function dur(h) {
  if (!finite(h)) return "—";
  const m = rround(h * 60), hh = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return lang === "zh" ? `${hh} 小时 ${mm} 分` : `${hh} h ${mm} min`;
}
// gap_text(): "9 min", "1 h 19 min", "2 h" · "9 分钟", "1 小时 19 分钟"
export function gap(h) {
  if (!finite(h)) return "—";
  const m = rround(Math.abs(h) * 60);
  if (lang === "zh") return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分钟` : ""}`;
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
// clock_text(): 23.5 → "23:30", -0.5 → "23:30"
export function clock(h) {
  if (!finite(h)) return "—";
  const x = ((h + 48) % 24), m = rround(x * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ---- dates (ISO strings "2020-03-26") -------------------------------------------------------------------
const WD = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return { y, m, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
// day_label(): "Thu 26 Mar 2020" · "2020年3月26日 周四"
export function dayLabel(iso, { weekday = true, year = true } = {}) {
  if (!iso) return "—";
  const p = parts(iso);
  if (lang === "zh") return `${year ? `${p.y}年` : ""}${p.m}月${p.d}日${weekday ? ` ${WD.zh[p.w]}` : ""}`;
  return `${weekday ? `${WD.en[p.w]} ` : ""}${p.d} ${MON[p.m - 1]}${year ? ` ${p.y}` : ""}`;
}
// "26 Mar" · "3月26日"
export const shortDate = (iso) => dayLabel(iso, { weekday: false, year: false });
// month_label(): "Mar 2020" · "2020年3月"
export function monthLabel(iso) { const p = parts(iso); return lang === "zh" ? `${p.y}年${p.m}月` : `${MON[p.m - 1]} ${p.y}`; }
export const monthShort = (iso) => { const p = parts(iso); return lang === "zh" ? `${p.m}月` : MON[p.m - 1]; };
export const weekdayShort = (iso) => WD[lang][parts(iso).w];
// record_range(): "2 Mar – 23 Mar"
export function dateRange(a, b) {
  if (!a || !b) return "—";
  return a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`;
}

// ---- the shell's words --------------------------------------------------------------------------------
addWords({
  en: {
    "app.name": "Ready to Train?",
    "app.alt": "训练状态看板",
    "app.purpose": "For people who log their training, sleep and how they feel each day (e.g. recreational athletes, regular gym-goers) and their coaches: an exploratory look-back at how sleep, training and everyday habits line up with feeling ready to train — not training advice.",
    "app.data": "PMData · {n} participants · {first} – {last} · Fitbit + daily check-ins",
    "app.about": "About the data & methods",
    "app.project": "GEOM90007 Information Visualisation · Assignment 2 · an individual R Shiny dashboard, shown here as a web page",
    "app.solves": "What this project solves",
    "ui.lang": "中文",
    "ui.mode": "Light / dark",
    "ui.fold": "Fold the menu",
    "ui.unfold": "Unfold the menu",
    "ui.loading": "Loading…",
    "ui.failed": "The data did not load",
    "ui.reload": "Reload",
    "ui.close": "Close",
    "ui.show_data": "Show the data",
    "ui.web_note": "Web version of the R Shiny app",

    "nav.today": "Today",
    "nav.overview": "Overview",
    "nav.readiness": "Readiness",
    "nav.sleep": "Sleep",
    "nav.training": "Training",
    "nav.activity": "Steps",
    "nav.soreness": "Soreness",
    "nav.choices": "Everyday habits",
    "nav.habits": "Compare habits",
    "nav.report": "Design summary",
    "nav.back": "Back to Today",

    "ctl.participant": "Participant",
    "ctl.person": "{id} · {age} y · {gender}",
    "gender.male": "male", "gender.female": "female",
    "ctl.prev": "Previous day",
    "ctl.next": "Next day",
    "ctl.calendar": "Pick any date from the calendar",
    "ctl.latest": "Latest",
    "ctl.latest_title": "Jump to this participant's last recorded day",
    "ctl.legend": "morning check-in recorded",
    "ctl.day_rec": "{day} · check-in recorded",
    "ctl.day_none": "{day} · no check-in",
    "ctl.status": "Showing {id} on {day}",
    "pooled.banner": "<b>Pooled participant-days from up to {n} participants, {first} – {last}.</b> People with more records count more. The participant and day pickers do not change this page.",

    "tag.record": "Record",
    "tag.association": "Association",
    "tag.hypothesis": "Concept demo",

    "reveal.none": "{id} did not fill in a morning check-in on {day}, so there is nothing to check the expectation against.",
    "reveal.shown": "{id} felt {felt}/10 on {day}{gap}",
    "reveal.shown_gap": " — {words} ({expected}).",
    "reveal.green": "Green marks the check-in values.",
    "reveal.hide": "Hide again",
    "reveal.expected": "Expected from {id}'s usual level and tracked data: {value}.",
    "reveal.not_enough": "not enough earlier check-ins",
    "reveal.prompt": "Reveal how they actually felt — the check that a real app would ask for.",
    "reveal.button": "Reveal check-in",
    "gap.as_expected": "as expected",
    "gap.better": "{v} better than expected",
    "gap.worse": "{v} worse than expected",

    "ov.title": "{id} · {day}",
    "ov.scope": "One participant · selected day · last 14 days",
    "ov.days": "{n} days",
    "badge.expected": "expected",
    "badge.revealed": "revealed",
    "badge.history": "history",
    "card.readiness": "Readiness",
    "card.readiness_when": "morning check-in",
    "card.sleep": "Last night's sleep",
    "card.sleep_when": "the night ending this morning",
    "card.training": "Training yesterday",
    "card.training_when": "logged the day before",
    "card.activity": "Steps",
    "card.activity_when": "the whole selected day",
    "card.soreness": "Soreness",
    "card.soreness_when": "morning check-in",
    "card.key": "Key finding · all participants",
    "card.key_when": "whole study, pooled days",

    "rd.felt_unit": "/10 felt",
    "rd.expected_unit": "/10 expected",
    "rd.felt_line": "Expected {expected} · {words}",
    "rd.no_expected": "No expected value for this day",
    "rd.green_ring": "Green ring: the check-in",
    "rd.not_enough": "Not enough earlier check-ins",
    "rd.needs": "Needs a check-in in at least 3 of the 4 weeks dated 8–35 days before",
    "rd.mostly": "Mostly the usual level ({level})",
    "rd.changes": "Tracked data changes it by {adj}",
    "rd.reveal_to_check": " · reveal to check",
    "rd.no_checkin": " · no check-in this day",
    "rd.spark": "Readiness check-ins over the last 14 days; the selected day shows {what}",
    "rd.spark_felt": "the felt value",
    "rd.spark_expected": "the expected value",

    "sl.more": "{gap} more than usual",
    "sl.less": "{gap} less than usual",
    "sl.none": "No main sleep recorded last night",
    "sl.usual": "Usual {usual} · dashed line",
    "sl.no_usual": "Not enough nights for a usual value",
    "sl.spark": "Hours asleep over the last 14 nights; dashed line = usual",

    "tr.load": "load",
    "tr.blank": "blank",
    "tr.none": "None",
    "tr.nothing": "Nothing logged (not a confirmed rest day)",
    "tr.last7_pct": "Last 7 days: {load7} · {pct}% {dir} the 4-week weekly average",
    "tr.above": "above", "tr.below": "below",
    "tr.last7_no28": "Last 7 days: {load7} · no 4-week average yet ({days} days on record)",
    "tr.only": "Only {days} of the last 7 days are on record: no weekly comparison yet",
    "tr.spark": "Reported training load per day over the last 14 days; yesterday highlighted",
    "tr.min": "{v} min",
    "tr.rpe": "RPE {v}",
    "type.running": "running", "type.endurance": "endurance", "type.strength": "strength", "type.team": "team sport",
    "type.none": "no type given",

    "ac.steps": "steps",
    "ac.delta": "{pct}% {dir} the 4-week average ({avg})",
    "ac.none": "No steps recorded on this day",
    "ac.worn": "Steps recorded over {dur} ({pct}% {dir} than usual)",
    "ac.longer": "longer", "ac.shorter": "shorter",
    "ac.per_hour": " · per recorded hour {pct}% {dir}",
    "ac.worn_unknown": "Recorded time unknown",
    "ac.spark": "Recorded steps over the last 14 days; dashed line = 4-week average",

    "so.unit": "/5 · {word}",
    "so.word.1": "very sore", "so.word.2": "sorer than usual", "so.word.3": "same as usual", "so.word.4": "less sore than usual", "so.word.5": "feeling great",
    "so.felt": "Felt this morning (higher = less sore: 1 = very sore, 5 = feeling great)",
    "so.compare": "For comparison: {typical}",
    "so.typical": "{pct}% of recorded mornings after {band} were sorer than usual",
    "so.no_band": "No load band for yesterday",
    "so.share_unit": "of comparable mornings were sorer",
    "so.hist": "Historical share after {band}, all participants",
    "so.cells": "{n} recorded mornings · cells = last 14 answers (1 sore – 5 great)",
    "so.spark": "Soreness answers over the last 14 check-ins, from brown (sore) to green (feeling great)",
    "so.status.no_prior": "No record for the day before",
    "so.status.blank": "A session was reported the day before, but its load is blank",
    "so.status.none": "No record",
    "band.0": "No session reported", "band.1": "Light load 1–199", "band.2": "Moderate load 200–399", "band.3": "Heavy load 400+",
    "band.phrase.0": "a day with no session logged", "band.phrase.1": "a light-load day (1–199)", "band.phrase.2": "a moderate-load day (200–399)", "band.phrase.3": "a heavy-load day (400+)",

    "kf.unit": "readiness points",
    "kf.text": "How ready people feel mostly follows their own recent level. Of {habits} everyday habits, {count} {have} a clear link with next-morning readiness: “{label}” ({effect} points, {people} participants).",
    "kf.none": "None of the {habits} everyday habits shows a clear link with next-morning readiness.",
    "kf.none_compare": "How ready people feel mostly follows their own recent level.",
    "kf.compare": "Food, fluid, steps and training show no clear link.",
    "kf.count.1": "only one", "kf.count.2": "only two", "kf.count.3": "only three",
    "kf.has": "has", "kf.have": "have",
    "kf.link": "See all 16 everyday habits ›",

    "foot.data": "Data: PMData (Thambawita et al., 2020, CC BY 4.0) · NHANES 2017 – Mar 2020 (US CDC)",
    "foot.legend": "● record · ◆ association · ◌ concept demo",
    "foot.repo": "Source and the original R Shiny app",
    "foot.kit": "Built on the Proactive Health AIO design kit",
    // first-time-reader wording (10-13)
    "brief.q.h": "Question",
    "brief.q": "Can an app that doesn't ask you every day still guess how ready to train you'll say you feel, from your usual level, your fitness tracker and your training log? Built for people who log their training, sleep and how they feel, and for their coaches. It looks back at past records and gives no training advice.",
    "brief.f.h": "Finding",
    "brief.f": "The guess rests almost entirely on your usual level. Adding the tracker and the training log doesn't make it more accurate: both guesses are off by about 1 point out of 10. Of 16 everyday habits, only going to bed 1 h+ later than usual goes with a clearly worse next morning, 0.46 points lower on average.",
    "brief.r.h": "My part",
    "brief.r": "I set the question, designed the interaction and the charts, and checked every number; AI coding assistants wrote the R code. A solo assignment for GEOM90007 Information Visualisation at the University of Melbourne (92/100, the top mark in the class), built in R Shiny and shown here as a web page.",
    "rv.guess": "Suppose the app didn't ask {id} today. From {his} usual level, tracker and training log alone, we expect {him} to rate {himself} {value} out of 10. Press Reveal check-in to see the score {he} actually gave.",
    "rv.no_guess": "{id} has too few earlier check-ins for a guess on this day. Press Reveal check-in to see the score {he} gave.",
    "rv.none": "{id} did not fill in a morning check-in on {day}, so there is no score to check the guess against.",
    "rv.shown": "{id} gave {felt} out of 10. We expected {expected}, so that is {gap}.",
    "rv.shown_noexp": "{id} gave {felt} out of 10.",
    "rv.gap_up": "{v} higher",
    "rv.gap_down": "{v} lower",
    "rv.gap_same": "exactly as expected",
    "rv.story": "The night before, {he} went to bed more than an hour later than usual (asleep at {time}). Of the 16 everyday habits, this is the only one clearly linked with a worse next morning.",
    "rv.green": "Green marks the check-in.",
    "rd.changes": "The tracker and training log changed it by {adj}",
    "rd.changes0": "The tracker and training log barely changed it",
    "rd.reveal_to_check": " · reveal to check",
    "tr.last7_pct": "Last 7 days: load {load7} (minutes × effort) · {pct}% {dir} a usual week",
    "tr.last7_no28": "Last 7 days: load {load7} (minutes × effort) · only {days} days on record, too few for a usual week",
    "so.share_unit": "of mornings were sorer than usual",
    "so.hist": "{after}, across all participants",
    "so.typical": "{after}, {pct}% of mornings were sorer than usual (all participants)",
    "so.cells": "{n} recorded mornings · cells are the last 14 answers (1 very sore, 5 feeling great)",
    "so.after.0": "After a day with no session logged",
    "so.after.1": "After a light-load day (load 1–199)",
    "so.after.2": "After a moderate-load day (200–399)",
    "so.after.3": "After a heavy-load day (400+)",
  },
  zh: {
    "app.name": "Ready to Train?",
    "app.alt": "训练状态看板",
    "app.purpose": "写给每天记录训练、睡眠和自我感受的人（比如业余运动员、常去健身房的人）和他们的教练：回看睡眠、训练和日常习惯跟“准备好训练了吗”的感受怎样对得上。只做回看和探索，不是训练建议。",
    "app.data": "PMData · {n} 名参与者 · {first} – {last} · Fitbit 手环 + 每日晨间自评",
    "app.about": "关于数据和方法",
    "app.project": "GEOM90007 信息可视化 · 作业 2 · 个人完成的 R Shiny 看板，这里是网页版",
    "app.solves": "这个项目解决什么问题",
    "ui.lang": "EN",
    "ui.mode": "浅色 / 深色",
    "ui.fold": "收起菜单",
    "ui.unfold": "展开菜单",
    "ui.loading": "加载中…",
    "ui.failed": "数据没有加载出来",
    "ui.reload": "重新加载",
    "ui.close": "关闭",
    "ui.show_data": "查看数据",
    "ui.web_note": "R Shiny 看板的网页版",

    "nav.today": "今天",
    "nav.overview": "总览",
    "nav.readiness": "准备度",
    "nav.sleep": "睡眠",
    "nav.training": "训练",
    "nav.activity": "步数",
    "nav.soreness": "酸痛",
    "nav.choices": "日常习惯",
    "nav.habits": "习惯对比",
    "nav.report": "设计说明",
    "nav.back": "回到今天",

    "ctl.participant": "参与者",
    "ctl.person": "{id} · {age} 岁 · {gender}",
    "gender.male": "男", "gender.female": "女",
    "ctl.prev": "前一天",
    "ctl.next": "后一天",
    "ctl.calendar": "从日历里选任意一天",
    "ctl.latest": "最近",
    "ctl.latest_title": "跳到这名参与者最后一天的记录",
    "ctl.legend": "有晨间自评",
    "ctl.day_rec": "{day} · 有晨间自评",
    "ctl.day_none": "{day} · 没有晨间自评",
    "ctl.status": "正在看 {id} 的 {day}",
    "pooled.banner": "<b>合并了最多 {n} 名参与者的参与者日，{first} – {last}。</b>记录多的人占的分量更大。参与者和日期选择不影响这一页。",

    "tag.record": "记录",
    "tag.association": "关联",
    "tag.hypothesis": "概念演示",

    "reveal.none": "{id} 在 {day} 没有填晨间自评，没有东西可以拿来核对预期。",
    "reveal.shown": "{id} 在 {day} 自评 {felt}/10{gap}",
    "reveal.shown_gap": "，{words}（预期 {expected}）。",
    "reveal.green": "绿色标的是自评的值。",
    "reveal.hide": "再藏起来",
    "reveal.expected": "按 {id} 的平常水平和追踪数据，预期是：{value}。",
    "reveal.not_enough": "之前的自评不够",
    "reveal.prompt": "揭晓当天的真实感受：真实的 App 就是拿这一步来核对的。",
    "reveal.button": "揭晓自评",
    "gap.as_expected": "和预期一样",
    "gap.better": "比预期好 {v}",
    "gap.worse": "比预期差 {v}",

    "ov.title": "{id} · {day}",
    "ov.scope": "一名参与者 · 选中的一天 · 最近 14 天",
    "ov.days": "{n} 天",
    "badge.expected": "预期",
    "badge.revealed": "已揭晓",
    "badge.history": "历史",
    "card.readiness": "准备度",
    "card.readiness_when": "晨间自评",
    "card.sleep": "昨晚睡眠",
    "card.sleep_when": "到今天早上结束的这一晚",
    "card.training": "昨天的训练",
    "card.training_when": "前一天记录的",
    "card.activity": "步数",
    "card.activity_when": "选中的这一整天",
    "card.soreness": "酸痛",
    "card.soreness_when": "晨间自评",
    "card.key": "关键发现 · 全体参与者",
    "card.key_when": "整个研究期，合并所有天",

    "rd.felt_unit": "/10 自评",
    "rd.expected_unit": "/10 预期",
    "rd.felt_line": "预期 {expected} · {words}",
    "rd.no_expected": "这一天没有预期值",
    "rd.green_ring": "绿圈：自评",
    "rd.not_enough": "之前的自评不够",
    "rd.needs": "需要 8–35 天前的 4 周里至少有 3 周填过自评",
    "rd.mostly": "主要就是平常水平（{level}）",
    "rd.changes": "追踪数据让它变了 {adj}",
    "rd.reveal_to_check": " · 揭晓后可核对",
    "rd.no_checkin": " · 这一天没有自评",
    "rd.spark": "最近 14 天的准备度自评；选中的这一天显示{what}",
    "rd.spark_felt": "自评值",
    "rd.spark_expected": "预期值",

    "sl.more": "比平常多 {gap}",
    "sl.less": "比平常少 {gap}",
    "sl.none": "昨晚没有主睡眠记录",
    "sl.usual": "平常 {usual} · 虚线",
    "sl.no_usual": "睡眠记录的晚上太少，算不出平常值",
    "sl.spark": "最近 14 晚的睡眠时长；虚线 = 平常",

    "tr.load": "负荷",
    "tr.blank": "空白",
    "tr.none": "无",
    "tr.nothing": "没有记录（不等于确认休息）",
    "tr.last7_pct": "最近 7 天：{load7} · 比 4 周的周平均{dir} {pct}%",
    "tr.above": "高", "tr.below": "低",
    "tr.last7_no28": "最近 7 天：{load7} · 还没有 4 周平均（只有 {days} 天在记录里）",
    "tr.only": "最近 7 天只有 {days} 天在记录里，还不能和周平均比",
    "tr.spark": "最近 14 天每天记录的训练负荷；昨天高亮",
    "tr.min": "{v} 分钟",
    "tr.rpe": "RPE {v}",
    "type.running": "跑步", "type.endurance": "耐力", "type.strength": "力量", "type.team": "团队运动",
    "type.none": "没写类型",

    "ac.steps": "步",
    "ac.delta": "比 4 周平均（{avg}）{dir} {pct}%",
    "ac.none": "这一天没有步数记录",
    "ac.worn": "步数记录覆盖 {dur}（比平常{dir} {pct}%）",
    "ac.longer": "长", "ac.shorter": "短",
    "ac.per_hour": " · 按每个有记录的小时算{dir} {pct}%",
    "ac.worn_unknown": "不知道记录了多久",
    "ac.spark": "最近 14 天记录的步数；虚线 = 4 周平均",

    "so.unit": "/5 · {word}",
    "so.word.1": "很酸痛", "so.word.2": "比平常酸", "so.word.3": "和平常一样", "so.word.4": "比平常轻松", "so.word.5": "感觉很好",
    "so.felt": "今天早上的感受（分越高越不酸：1 = 很酸痛，5 = 感觉很好）",
    "so.compare": "对照：{typical}",
    "so.typical": "{band}之后的早上，有 {pct}% 比平常更酸",
    "so.no_band": "昨天没有负荷分档",
    "so.share_unit": "的同类早上更酸",
    "so.hist": "全体参与者在{band}之后的历史比例",
    "so.cells": "{n} 个有记录的早上 · 小格 = 最近 14 次回答（1 酸 – 5 好）",
    "so.spark": "最近 14 次自评里的酸痛回答，从棕（酸）到绿（感觉很好）",
    "so.status.no_prior": "前一天没有记录",
    "so.status.blank": "前一天记了训练，但负荷是空白",
    "so.status.none": "没有记录",
    "band.0": "没有记录训练", "band.1": "轻负荷 1–199", "band.2": "中负荷 200–399", "band.3": "重负荷 400+",
    "band.phrase.0": "没有记录训练的一天", "band.phrase.1": "轻负荷日（1–199）", "band.phrase.2": "中负荷日（200–399）", "band.phrase.3": "重负荷日（400+）",

    "kf.unit": "准备度分",
    "kf.text": "人们觉得自己准备得怎样，主要跟着自己最近的水平走。{habits} 个日常习惯里，{count}和第二天早上的准备度有明确关联：“{label}”（{effect} 分，{people} 名参与者）。",
    "kf.none": "{habits} 个日常习惯里，没有一个和第二天早上的准备度有明确关联。",
    "kf.none_compare": "人们觉得自己准备得怎样，主要跟着自己最近的水平走。",
    "kf.compare": "饮食、喝水、步数和训练都没看出明确关联。",
    "kf.count.1": "只有一个", "kf.count.2": "只有两个", "kf.count.3": "只有三个",
    "kf.has": "", "kf.have": "",
    "kf.link": "看全部 16 个日常习惯 ›",

    "foot.data": "数据：PMData（Thambawita 等，2020，CC BY 4.0）· NHANES 2017 – 2020 年 3 月（美国疾控中心）",
    "foot.legend": "● 记录 · ◆ 关联 · ◌ 概念演示",
    "foot.repo": "源码和原版 R Shiny 应用",
    "foot.kit": "用主动健康管理 AIO 设计套件搭建",
    // first-time-reader wording (10-13)
    "brief.q.h": "想回答",
    "brief.q": "一个不每天问你状态的 App，只看你平常的水平、手环和训练记录，能不能猜出你今天会给“准备好训练了吗”打几分？看板写给每天记录训练、睡眠和感受的运动者和他们的教练，用来回看过去的记录，不给训练建议。",
    "brief.f.h": "发现",
    "brief.f": "猜的时候起作用的几乎只有你平常的水平，加上手环和训练记录也没有更准，两种猜法满分 10 分都平均差 1 分左右。16 个日常习惯里，只有“比平常晚睡 1 小时以上”和第二天早上状态变差明确相关，平均低 0.46 分。",
    "brief.r.h": "我做的",
    "brief.r": "定问题、设计交互和图表、逐个核对数字；R 代码由 AI 编程助手编写。这是墨尔本大学 GEOM90007 信息可视化课的个人作业（92/100，全班最高分），原版用 R Shiny 做，这里是网页版。",
    "rv.guess": "假设 App 今天没问 {id}，只凭{he}平常的水平、手环和训练记录，预期{he}今天会给自己打 {value} 分（满分 10）。点“揭晓自评”，看{he}自己打了几分。",
    "rv.no_guess": "{id} 之前的自评太少，这一天猜不出来。点“揭晓自评”可以看{he}当天打的分。",
    "rv.none": "{id} 在 {day} 没有填晨间自评，没有分数可以拿来核对。",
    "rv.shown": "{id} 自己打了 {felt} 分，预期是 {expected}，{gap}。",
    "rv.shown_noexp": "{id} 自己打了 {felt} 分。",
    "rv.gap_up": "高了 {v}",
    "rv.gap_down": "低了 {v}",
    "rv.gap_same": "正好一样",
    "rv.story": "前一晚{he}比平常晚睡了 1 小时以上（{time} 入睡）。16 个日常习惯里，和第二天状态变差明确相关的只有这一个。",
    "rv.green": "绿色标的是自评。",
    "rd.changes": "手环和训练记录把它改了 {adj} 分",
    "rd.changes0": "手环和训练记录几乎没改变它",
    "rd.reveal_to_check": " · 点揭晓核对",
    "tr.last7_pct": "最近 7 天负荷 {load7}（分钟 × 吃力程度）· 比平常一周{dir} {pct}%",
    "tr.last7_no28": "最近 7 天负荷 {load7}（分钟 × 吃力程度）· 记录只有 {days} 天，还没法和平常一周比",
    "so.share_unit": "的早上比平常更酸",
    "so.hist": "{after}，所有参与者第二天早上的情况",
    "so.typical": "{after}，所有参与者有 {pct}% 的早上比平常更酸",
    "so.cells": "{n} 个早上 · 小格是最近 14 次回答（1 很酸，5 感觉很好）",
    "so.after.0": "前一天没记录训练",
    "so.after.1": "前一天轻负荷训练（1–199）",
    "so.after.2": "前一天中等负荷训练（200–399）",
    "so.after.3": "前一天重负荷训练（400+）",
  },
});
