// Words for Today › Soreness and Today › Sleep (English = the R app's wording: app.R, body_regions.R, story_visuals.R,
// day_view.R, visuals.R, accessibility.R), and the number formats these two pages need written exactly as R writes them.
import { addWords, getLang, finite } from "../i18n.js";

// ---- numbers the R way --------------------------------------------------------------------------------
// R's round(x): to the nearest whole number, an exact binary tie (x.5) to the even one. Math.round would take 84.5 to 85
// where R gives 84; the sleep times are kept to the half minute, so ties are common here.
export function round0(x) {
  const f = Math.floor(x), d = x - f;
  return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x);
}
// formatC(x, format = "f", digits) = C's sprintf("%.*f"): correctly rounded, an exact tie to the even digit. toFixed()
// agrees except on exact ties (x = odd / 2^(digits+1)), where it rounds up.
export function fixed(x, digits = 0) {
  const a = Math.abs(x), y = a * 2 ** (digits + 1);
  let s;
  if (Number.isInteger(y) && y % 2 === 1) {
    const m = 10 ** digits, lo = Math.floor(a * m), n = lo % 2 === 0 ? lo : lo + 1;
    s = digits ? `${Math.floor(n / m)}.${String(n % m).padStart(digits, "0")}` : String(n);
  } else s = a.toFixed(digits);
  return (x < 0 ? "-" : "") + s;
}
// helpers.R fmt(): formatC(x, "f", digits, big.mark = ","); anything missing "—"
export function rfmt(x, digits = 0) {
  if (!finite(x)) return "—";
  const s = fixed(x, digits), neg = s.startsWith("-"), [int, dec] = (neg ? s.slice(1) : s).split(".");
  return `${neg ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${dec !== undefined ? `.${dec}` : ""}`;
}
// visuals.R duration_label(): "7 h 05 min" · "7 小时 05 分"
export function rdur(h) {
  if (!finite(h)) return "—";
  const m = round0(h * 60), hh = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return getLang() === "zh" ? `${hh} 小时 ${mm} 分` : `${hh} h ${mm} min`;
}
// day_view.R gap_text(): "9 min", "1 h 19 min" · "9 分钟", "1 小时 19 分钟"
export function rgap(h) {
  if (!finite(h)) return "—";
  const m = round0(Math.abs(h) * 60);
  if (getLang() === "zh") return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分钟` : ""}`;
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
// day_view.R clock_text(): hours from midnight (−0.5 or 23.5) as "23:30"
export function rclock(h) {
  if (!finite(h)) return "—";
  const x = (h + 48) % 24, m = round0(x * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

addWords({
  en: {
    // ---- Soreness detail ----
    "sod.title": "Soreness",
    "sod.lede": "The check-in asks how sore the participant feels: 1 = very sore, 3 = same as usual, 5 = feeling great.",
    "sod.morning": "This morning",
    "sod.morning_tag": "check-in + last 2 days of training",
    "sod.felt": "Felt",
    "sod.hidden": "This morning's soreness answer is hidden until you reveal the check-in above.",
    "sod.no_checkin": "No check-in on this day.",
    "sod.no_answer": "This morning's check-in has no soreness answer.",
    "sod.band_line": "Yesterday's load puts this morning in the '{band}' display band: {pct}% of such recorded mornings (all participants) were sorer than usual.",
    "sod.band_status": "Load band: {status}.",
    "sod.status.no_prior": "no record for the day before",
    "sod.status.blank": "a session was reported the day before, but its load is blank",
    "sod.status.none": "no record",
    "sod.yesterday": "Yesterday",
    "sod.two_days": "2 days ago",
    "sod.no_session": "No session reported",
    "sod.not_rest": "Not a confirmed rest day — just nothing logged",
    "sod.blank": "Session logged, but load left blank",
    "sod.session": "{n} session", "sod.sessions": "{n} sessions",
    "sod.load": " · load {load}",
    "sod.minutes": " ({min} min{rpe})",
    "sod.rpe": " × RPE {rpe}",
    "sod.types_none": "no type given",

    "body.title": "After a day like yesterday, where were people most often sore?",
    "body.tag": "yesterday's training · all participants",
    "body.chip_group": "Comparison group: mornings after {group}",
    "body.chip_n": "{n} check-ins, all participants",
    "body.chip_areas": "7 questionnaire areas, not muscles",
    "body.lede": "The comparison group is chosen from yesterday's training log for {who}. Each percentage is the share of those check-ins that ticked the area. The check-in records where it was sore, not how sore; for how sore, see the card above.",
    "body.fig": "Front and back {sex} body figures with seven soreness-report areas shaded by historical mention rate",
    "body.region_aria": "{label}: mentioned in {pct}% of these check-ins",
    "body.region_tip": "{label} · {pct}%",
    "body.front": "FRONT", "body.back": "BACK", "body.r": "R", "body.l": "L",
    "body.scale": "Fixed scale for every day and participant",
    "body.scale_cap": "; {top}% or more shows as the darkest shade",
    "body.caveat_b": "7 questionnaire areas, not muscles. ",
    "body.caveat": "Percentages pool all participants' check-ins; the {sex} figure only matches the participant you are viewing. R/L follow the participant's body.",
    "body.sex.male": "male", "body.sex.female": "female",
    "body.how": "About these areas",
    "body.how1": "These are the soreness areas ticked in the PMSys check-in, not muscles or trained body parts; only the calves and upper arms are split left/right. An area left unticked does not prove there was no soreness.",
    "body.how2": "The two body figures are AI-generated illustrations made for this project; the coloured areas are drawn over them.",
    "body.none": "No soreness-area records available.",
    "body.list": "Share of check-ins that ticked each area, highest first",
    "body.g.none": "a day with no logged session",
    "body.g.untyped": "a day with an untyped session",
    "body.g.exact": "a {tags} day",
    "body.g.included": "any day that included {tags}",
    "body.g.any": "any day with a logged session",
    "region.head": "Head", "region.torso": "Torso", "region.pelvis": "Pelvis / hips",
    "region.left_upper_arm": "Left upper arm", "region.right_upper_arm": "Right upper arm",
    "region.left_calf": "Left calf", "region.right_calf": "Right calf",

    "ls.title": "After each load level, how did participants feel next morning?",
    "ls.scope": "Reference · all participants · whole study",
    "ls.lede": "A fixed reference: it does not change with the day, except that the band for yesterday's load is marked. Soreness answers the morning after each level of reported load; brown shades are sorer than usual. The load bands are display bands chosen for readability, not training-science thresholds.",
    "ls.label": "Share of each soreness answer after each level of training load the day before",
    "ls.level.1": "1 very sore", "ls.level.2": "2 sorer than usual", "ls.level.3": "3 same as usual", "ls.level.4": "4 less sore", "ls.level.5": "5 feeling great",
    "ls.panel": "{band} · {n} mornings · {pct}% sorer than usual",
    "ls.panel_mark": "   (this morning's band)",
    "ls.panel_narrow": "{n} mornings · {pct}% sorer",
    "ls.panel_narrow_mark": " · this morning",
    "ls.tip": "{band}\n{level}: {count} mornings\n{pct}% of this band ({n} mornings)",
    "ls.caption": "The same bands as the chart; shares of mornings with a soreness answer",
    "ls.h.band": "Load the day before", "ls.h.n": "Mornings", "ls.h.worse": "Sorer than usual (1–2)", "ls.h.ci": "95% interval",
    "ls.note": "Sorer mornings rise from {first}% after no session to {last}% after a heavy day. Within participants, more load yesterday went with a lower (sorer) soreness answer today (r = {r}).",
    "ls.empty": "No training and soreness records to compare",

    // ---- Sleep detail ----
    "sld.title": "Last night's sleep",
    "sld.lede": "Fitbit dates each night by the morning it ends, so 'last night' belongs to the selected day.",
    "sld.week": "Sleep this week",
    "sld.week_tag": "Fitbit · 7 nights",
    "sld.week_lede": "Each bar runs from falling asleep (top) to waking (bottom). Darker purple = more of the time in bed spent asleep.",
    "sld.label": "Main sleep window and sleep efficiency for the seven nights on the date strip",
    "sld.hint": "Click a night to open that day.",
    "sld.legend": "Sleep efficiency (time asleep ÷ time in bed)",
    "sld.legend_lo": "80% or less", "sld.legend_mid": "90%", "sld.legend_hi": "100%",
    "sld.tip": "Night ending {day}\nAsleep {start} · awake {end}\nTime asleep {dur}{eff}\nClick to open this day",
    "sld.tip_eff": "\nSleep efficiency {eff}%",
    "sld.tip_gap": "Night ending {day}\nNo main-sleep record",
    "sld.no_record": "no record",
    "sld.empty": "No main-sleep windows in this week",
    "sld.caption": "The same nights as the chart (dated by the morning they end)",
    "sld.h.morning": "Morning", "sld.h.asleep": "Asleep", "sld.h.awake": "Awake", "sld.h.time": "Time asleep", "sld.h.eff": "Efficiency",
    "sld.note": "{n} of {span} nights recorded: typically asleep at {start} and awake at {end}, averaging {dur} asleep.",
    "sld.note_usual": "Dashed lines: this participant's usual bedtime ({start}) and wake time ({end}) over the whole record.",
    "sld.note_empty": "No valid main-sleep records this week.",

    "sld.compare": "Last night compared with usual",
    "sld.compare_tag": "Fitbit + check-in · whole study",
    "cmp.asleep": "Time asleep", "cmp.onset": "Fell asleep at", "cmp.hr": "Resting heart rate",
    "cmp.fitbit": "Fitbit", "cmp.fitbit_daily": "Fitbit daily estimate",
    "cmp.no_record": "no record",
    "cmp.daytime": "{clock} (daytime)",
    "cmp.bpm": "{v} bpm",
    "cmp.same": "same as usual",
    "cmp.more": "{gap} more than usual", "cmp.less": "{gap} less than usual",
    "cmp.later": "{gap} later than usual", "cmp.earlier": "{gap} earlier than usual",
    "cmp.higher": "{gap} higher than usual", "cmp.lower": "{gap} lower than usual",
    "cmp.scale": "Usual {usual} · middle half {q25}–{q75} · {n} records",
    "cmp.few": "Fewer than 5 records, no usual value",
    "cmp.track": "{label}: {value} on a track from the lowest ({lo}) to the highest ({hi}) record; the usual value {usual} is the tick, the middle half the band",
    "cmp.yesterday": "Yesterday's check-in",
    "cmp.likert_source": "1–5 · 3 = same as usual",
    "cmp.sleep_quality": "Sleep quality", "cmp.fatigue": "Fatigue", "cmp.soreness": "Soreness", "cmp.stress": "Stress", "cmp.mood": "Mood",
  },
  zh: {
    "sod.title": "酸痛",
    "sod.lede": "晨间自评问参与者酸不酸痛：1 = 很酸痛，3 = 和平常一样，5 = 感觉很好。",
    "sod.morning": "今天早上",
    "sod.morning_tag": "晨间自评 + 最近 2 天的训练",
    "sod.felt": "自评",
    "sod.hidden": "今天早上的酸痛回答先藏着，在上面揭晓自评后才显示。",
    "sod.no_checkin": "这一天没有晨间自评。",
    "sod.no_answer": "今天早上的自评里没有填酸痛。",
    "sod.band_line": "按昨天的负荷，今天早上落在“{band}”这个展示分档：这一档有记录的早上（全体参与者）有 {pct}% 比平常更酸。",
    "sod.band_status": "负荷分档：{status}。",
    "sod.status.no_prior": "前一天没有记录",
    "sod.status.blank": "前一天记了训练，但负荷是空白",
    "sod.status.none": "没有记录",
    "sod.yesterday": "昨天",
    "sod.two_days": "前天",
    "sod.no_session": "没有记录训练",
    "sod.not_rest": "不等于确认休息，只是什么都没记",
    "sod.blank": "记了训练，但负荷没填",
    "sod.session": "{n} 次训练", "sod.sessions": "{n} 次训练",
    "sod.load": " · 负荷 {load}",
    "sod.minutes": "（{min} 分钟{rpe}）",
    "sod.rpe": " × RPE {rpe}",
    "sod.types_none": "没写类型",

    "body.title": "过完像昨天这样的一天，大家最常哪里酸？",
    "body.tag": "昨天的训练 · 全体参与者",
    "body.chip_group": "对照组：{group}之后的早上",
    "body.chip_n": "{n} 次自评，全体参与者",
    "body.chip_areas": "问卷里的 7 个部位，不是肌肉",
    "body.lede": "对照组按 {who} 昨天的训练记录来选。每个百分比是这些自评里勾了这个部位的比例。自评只记哪里酸，不记多酸；多酸看上面那张卡。",
    "body.fig": "{sex}的正面和背面人体图，7 个酸痛部位按历史上被勾选的比例上色",
    "body.region_aria": "{label}：{pct}% 的这些自评勾了它",
    "body.region_tip": "{label} · {pct}%",
    "body.front": "正面", "body.back": "背面", "body.r": "右", "body.l": "左",
    "body.scale": "每一天、每个参与者都用同一把色尺",
    "body.scale_cap": "；{top}% 及以上都是最深的颜色",
    "body.caveat_b": "问卷里的 7 个部位，不是肌肉。",
    "body.caveat": "百分比合并了全体参与者的自评；用{sex}人体图只是为了和正在看的这名参与者一致。左右按参与者自己的身体来分。",
    "body.sex.male": "男性", "body.sex.female": "女性",
    "body.how": "关于这些部位",
    "body.how1": "这些是 PMSys 自评里可以勾的酸痛部位，不是肌肉，也不是练到的部位；只有小腿和上臂分左右。没勾的部位不能证明那里不酸。",
    "body.how2": "两张人体图是为这个项目用 AI 生成的插图，彩色区域是叠在上面画的。",
    "body.none": "没有酸痛部位的记录。",
    "body.list": "勾了各个部位的自评比例，从高到低",
    "body.g.none": "没有记录训练的一天",
    "body.g.untyped": "记了训练但没写类型的一天",
    "body.g.exact": "{tags}的一天",
    "body.g.included": "任何包含{tags}的一天",
    "body.g.any": "任何记了训练的一天",
    "region.head": "头部", "region.torso": "躯干", "region.pelvis": "骨盆 / 髋部",
    "region.left_upper_arm": "左上臂", "region.right_upper_arm": "右上臂",
    "region.left_calf": "左小腿", "region.right_calf": "右小腿",

    "ls.title": "各个负荷档之后，大家第二天早上感觉怎样？",
    "ls.scope": "参照 · 全体参与者 · 整个研究期",
    "ls.lede": "一张固定的参照图：它不随选中的日子变，只是会标出昨天负荷所在的那一档。图里是各档负荷之后那个早上的酸痛回答；棕色是比平常更酸。负荷分档是为了好读而定的展示分档，不是运动科学的门槛。",
    "ls.label": "前一天各档训练负荷之后，每种酸痛回答的占比",
    "ls.level.1": "1 很酸痛", "ls.level.2": "2 比平常酸", "ls.level.3": "3 和平常一样", "ls.level.4": "4 比平常轻松", "ls.level.5": "5 感觉很好",
    "ls.panel": "{band} · {n} 个早上 · {pct}% 比平常更酸",
    "ls.panel_mark": "（今天早上所在的档）",
    "ls.panel_narrow": "{n} 个早上 · {pct}% 更酸",
    "ls.panel_narrow_mark": " · 今天早上",
    "ls.tip": "{band}\n{level}：{count} 个早上\n占这一档的 {pct}%（{n} 个早上）",
    "ls.caption": "和图里同样的分档；有酸痛回答的早上里各回答的占比",
    "ls.h.band": "前一天的负荷", "ls.h.n": "早上数", "ls.h.worse": "比平常更酸（1–2）", "ls.h.ci": "95% 区间",
    "ls.note": "更酸的早上从没有训练之后的 {first}% 升到重负荷日之后的 {last}%。在个人内部，昨天负荷越大，今天的酸痛回答越低，也就是越酸（r = {r}）。",
    "ls.empty": "没有可以比较的训练和酸痛记录",

    "sld.title": "昨晚睡眠",
    "sld.lede": "Fitbit 把每一晚记在它结束的那个早上，所以“昨晚”属于选中的这一天。",
    "sld.week": "这一周的睡眠",
    "sld.week_tag": "Fitbit · 7 晚",
    "sld.week_lede": "每根柱子从入睡（上）画到醒来（下）。紫色越深 = 躺在床上的时间里睡着的比例越高。",
    "sld.label": "日期条上这 7 晚的主睡眠时段和睡眠效率",
    "sld.hint": "点一晚打开那一天。",
    "sld.legend": "睡眠效率（睡着的时间 ÷ 在床上的时间）",
    "sld.legend_lo": "80% 及以下", "sld.legend_mid": "90%", "sld.legend_hi": "100%",
    "sld.tip": "到 {day} 早上结束的一晚\n入睡 {start} · 醒来 {end}\n睡着 {dur}{eff}\n点一下打开这一天",
    "sld.tip_eff": "\n睡眠效率 {eff}%",
    "sld.tip_gap": "到 {day} 早上结束的一晚\n没有主睡眠记录",
    "sld.no_record": "没有记录",
    "sld.empty": "这一周没有主睡眠时段",
    "sld.caption": "和图里同样的几晚（按结束的那个早上记日期）",
    "sld.h.morning": "早上", "sld.h.asleep": "入睡", "sld.h.awake": "醒来", "sld.h.time": "睡着时长", "sld.h.eff": "效率",
    "sld.note": "{span} 晚里有 {n} 晚有记录：一般 {start} 入睡、{end} 醒来，平均睡着 {dur}。",
    "sld.note_usual": "虚线：这名参与者整段记录里平常的入睡时间（{start}）和醒来时间（{end}）。",
    "sld.note_empty": "这一周没有有效的主睡眠记录。",

    "sld.compare": "昨晚和平常比",
    "sld.compare_tag": "Fitbit + 晨间自评 · 整个研究期",
    "cmp.asleep": "睡着时长", "cmp.onset": "入睡时间", "cmp.hr": "静息心率",
    "cmp.fitbit": "Fitbit", "cmp.fitbit_daily": "Fitbit 每日估计",
    "cmp.no_record": "没有记录",
    "cmp.daytime": "{clock}（白天）",
    "cmp.bpm": "{v} bpm",
    "cmp.same": "和平常一样",
    "cmp.more": "比平常多 {gap}", "cmp.less": "比平常少 {gap}",
    "cmp.later": "比平常晚 {gap}", "cmp.earlier": "比平常早 {gap}",
    "cmp.higher": "比平常高 {gap}", "cmp.lower": "比平常低 {gap}",
    "cmp.scale": "平常 {usual} · 中间一半 {q25}–{q75} · {n} 条记录",
    "cmp.few": "记录不到 5 条，算不出平常值",
    "cmp.track": "{label}：{value}，画在从最低（{lo}）到最高（{hi}）记录的轨道上；短竖线是平常值 {usual}，色带是中间一半",
    "cmp.yesterday": "昨天的晨间自评",
    "cmp.likert_source": "1–5 · 3 = 和平常一样",
    "cmp.sleep_quality": "睡眠质量", "cmp.fatigue": "疲劳", "cmp.soreness": "酸痛", "cmp.stress": "压力", "cmp.mood": "心情",
  },
});
