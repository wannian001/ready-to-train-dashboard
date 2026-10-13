// The design summary submitted with the R Shiny app on 22 September 2026 (two A3 pages: the summary and the
// appendix of resources), in full. English is the submitted text word for word, from the source the PDF was printed
// from; only the student number next to the name is left out. Chinese is a translation that uses this site's terms.

export const REPORT = {
  en: {
    note: "The design summary submitted with the R Shiny app on 22 September 2026, in full: the summary page and the appendix. Only the student number is left out. It describes the R version, and the figures are screenshots of it.",
    pdf: "Download the PDF",
    title: "Ready to Train?",
    titleSuffix: "— design summary",
    sub: "An R Shiny look-back at how sleep, training and everyday habits line up with feeling ready to train · GEOM90007 Assignment 2",
    meta: ["<strong>Jiakuo Tang</strong>", "<strong>PMData</strong> · 16 participants · 1 Nov 2019 – 1 Apr 2020", "3 pages · 5 summary cards · 18 habits · 13 tracked signals"],
    s1: { h: "Purpose and audience", body: [
      "This dashboard comes from a system I have been building: a <span class=\"term\">personal digital twin</span> with two linked parts, which I call the <span class=\"term\">cognitive core</span> (my knowledge, goals, preferences and long-term judgements) and the <span class=\"term\">data core</span> (my measured body and daily life: sleep, training, steps, heart rate and how I feel). Together they would let an AI understand both what I value and how I am right now.",
      "My earlier prototype collected data well but gave little thought to visual hierarchy, data integrity or user tasks, so this assignment redesigns the data core around three questions: <b>How is the body today? Which records is that judgement based on? Which habits go with a better next day?</b> It is an exploratory look-back for people who log training, sleep and how they feel (recreational athletes, regular gym-goers) and their coaches — not medical or training advice."] },
    s2: { h: "Data and its limits", body: [
      "My own records are not yet long or complete enough, so the prototype uses <b>PMData</b>, which has the same structure: 16 active adults with Fitbit data, morning check-ins, training logs and food questionnaires. <b>NHANES</b> adds outside context on sleep length only. In my long-term system people would summarise their day in the evening; PMData check-ins were made in the morning, and the dashboard keeps that timing instead of claiming the future design."] },
    s3: { h: "Integrity and findings", body: [
      "Associations remove each participant's own average, use participant-clustered 95% intervals and a Benjamini–Hochberg correction per chart. Rows that miss the threshold stay visible and every chart has a “Show the data” table. An unknown tracked signal counts as its training average, not as “not true”."] },
    finding: "Of 16 everyday habits, only <b>going to bed 1 h+ later than usual</b> keeps a clear link with next-morning readiness (16 participants).",
    maeCaption: "Mean absolute error, March 2020 hold-out (readiness, 0–10 scale)",
    mae: [["Expected value (usual level + 13 tracked signals)", "1.01", true], ["Usual level alone (last check-in in each of four earlier weeks)", "1.01"],
      ["Every check-in in those four weeks", "0.97"], ["A check-in every day (median of the last five)", "0.91"]],
    s3after: "The page reports two findings instead of claiming a good model: tracked data barely improves the expectation, and one check-in from each earlier week cost little accuracy against all of them — not yet a test of an app that asks once a week.",
    s4: { h: "Limitations and next steps", body: [
      "Sixteen people, coarse self-report scales and associations that cannot show cause; the energy ledger is a concept demo with made-up parameters. A real version needs my own long-term data, retraining and validation, then a link to the cognitive core so an AI can join the review with clear sources, uncertainty and time ranges."] },
    fig1: "<b>Fig. 1 · Today</b> for P07 on Thu 26 Mar 2020: control card, the expectation to check, five summary cards (each naming its time range) with 14-day sparklines, and the key finding.",
    fig1alt: "Today page of the dashboard",
    howTitle: "How to use it",
    steps: [
      "Pick a participant, then a day on the 7-day strip; the calendar jumps to any date and <b>Latest</b> to the last recorded day.",
      "Read the expected readiness, then press <b>Reveal check-in</b> to compare it with how the person felt.",
      "Open any card for its detail view; the back button sits in the tab bar at the bottom. Hover a chart for exact values.",
      "The key finding leads to <b>Everyday habits</b>; <b>Compare habits</b> sets the participant among the others."],
    s5: { h: "Structure and interaction", body: [
      "The layout follows a phone app: the watch is the main data source, and only the phone can read Apple Health and reach my database. The floating frosted-glass tab bar follows Apple's current design language and holds the back button. <b>Today</b> follows “overview first, details on demand” (Shneiderman, 1996). Because one date mixes a morning check-in, last night, yesterday's training and a whole day of steps, every card names its time range. Readiness first shows an <em>expected</em> value — a usual level (the last check-in from each of the four weeks 8–35 days earlier) plus 13 tracked signals from the training log and Fitbit, built step by step in an animated waterfall — and <b>Reveal check-in</b> then shows what the person reported (Fig. 2). Five same-day questionnaire items were dropped because they are filled in with the readiness answer and would leak it.",
      "<b>Everyday habits</b> compares 18 habits and states on one shared axis, grouped by when they happen or sorted by average difference (Fig. 3); <b>Compare habits</b> shows each person's numerators, denominators and position without ranking anyone. Date strip, calendar, picker and chart dates share one state; the training-load chart inspects a day before opening it (Fig. 4)."] },
    fig2: "<b>Fig. 2 · Felt vs expected, after Reveal.</b> Blue: expected; green: the check-in; grey stick: the gap. The shaded band is the selected day.",
    fig2alt: "Felt versus expected readiness chart",
    fig3: "<b>Fig. 3 · Everyday habits</b> on one shared axis, by group or sorted by average difference (first rows shown). Thick black + “clear link” = BH-adjusted p &lt; .05; thin grey = no clear link. Lines are unadjusted 95% intervals.",
    fig3alt: "Everyday habits forest plot",
    fig4: "<b>Fig. 4 · Inspect, then open.</b> Clicking 10 Mar only inspects it (purple bar); the selected day stays locked until “Open this day”.",
    fig4alt: "Training load chart in inspect mode",
    s6: { h: "Visual choices", body: [
      "Visual hierarchy follows intellectual hierarchy: today's state before model detail, conclusions before full records. White cards and spacing group each question (Gestalt proximity), and scope chips name the unit of analysis. Blue marks the selected day or participant, green the real check-in and the better direction, amber the worse direction; colour is always paired with text or shape, so it is a pre-attentive cue, never the only encoding. Method notes are folded away to cut non-data ink (Tufte, 2001). In the forest plots the diamond answers “true on the selected day?” and the line weight answers “clear link?”. “No clear link” is labelled as not proof of no effect. The body figure shows a comparison group's history, not a forecast, for seven coarse questionnaire areas on a fixed 0–30%+ scale."] },
    refs: "Shneiderman, B. (1996). The eyes have it. <i>IEEE Symposium on Visual Languages</i>. · Tufte, E. R. (2001). <i>The Visual Display of Quantitative Information</i> (2nd ed.). · Benjamini, Y. &amp; Hochberg, Y. (1995). <i>JRSS B</i>, 57(1).",
    toAppendix: "All data, software, images and AI assistance, and how each is used: Appendix, page 2.",
    appendix: {
      title: "Appendix · Resources and how they are used in the interface",
      sub: "Ready to Train? · GEOM90007 Assignment 2 · every resource in the submission, where it comes from, and where it appears",
      head: ["Resource", "Source and licence", "How it is used in the interface"],
      groups: [
        ["Data", [
          ["PMData · Fitbit <code>sleep.json</code>", "Thambawita et al. (2020), <i>PMData: a sports logging dataset</i>, ACM MMSys, doi:10.1145/3339825.3394926; Simula Research Laboratory; CC BY 4.0", "Last night's sleep card and Sleep detail (sleep window, efficiency); sleep signals in the expected readiness; sleep rows of Everyday habits; sleep measures in Compare habits."],
          ["PMData · Fitbit <code>steps.json</code>, <code>resting_heart_rate.json</code>", "As above", "Steps card and hourly heatmap (with the time steps were recorded); step rows of Everyday habits; resting heart rate in the Sleep detail comparison and in Compare habits."],
          ["PMData · PMSys <code>wellness.csv</code>", "As above", "Morning check-ins: readiness (the revealed value and the usual level), soreness answers and soreness areas (body figure), and fatigue, mood, stress and sleep quality in the Sleep detail."],
          ["PMData · PMSys <code>srpe.csv</code>", "As above", "Training sessions (minutes × RPE load, activity tags): Training card and detail, rolling-load chart, monthly sessions, soreness after each load level, training signals and rows, energy-ledger demo."],
          ["PMData · <code>reporting.csv</code>, <code>participant-overview.xlsx</code>", "As above", "Daily food questionnaire (meals, alcohol, fluid) for the food rows of Everyday habits and Compare habits; age and sex for the participant picker, the body figure and NHANES matching."],
          ["NHANES 2017 – Mar 2020 · <code>P_DEMO</code>, <code>P_SLQ</code>", "US CDC, National Center for Health Statistics; public domain", "Compare habits → “Outside context”: usual sleep reported by US adults of the same sex and similar age, set beside the participant's Fitbit nights as background only."]]],
        ["Derived files and model (in the submission)", [
          ["<code>daily.csv</code>, <code>sleep_episodes.csv</code>, <code>hourly_steps.csv</code>, <code>training_sessions.csv</code>, <code>questionnaires.csv</code>, <code>body_regions.csv</code>, <code>participants.csv</code>, <code>nhanes_sleep.csv</code>", "Prepared from the raw PMData and NHANES archives by preparation scripts kept outside the submission (they need the raw archives to run); source hashes and rules are recorded in the included <code>*_provenance.json</code> files. No values are imputed.", "Read once at start-up by <code>app.R</code>; every chart, card and table is computed from them. The raw archives are not needed to run the app."],
          ["<code>readiness_waterfall_model.rds</code>, <code>…_metrics.csv</code>, <code>…_metadata.json</code>", "Trained by <code>train_readiness_waterfall.R</code> (ridge regression, λ = 3000; Nov–Feb fit, March hold-out). The app checks MD5 hashes of the inputs and flags a stale model.", "The expected readiness, its waterfall, the felt-vs-expected chart and the accuracy line with its footnote."]]],
        ["Software", [
          ["R 4.6 · shiny · bslib", "CRAN packages (open source)", "Application framework, reactive state, Bootstrap 5 theme; bootstrap-datepicker (bundled with <code>shiny::dateInput</code>) for the calendar button."],
          ["ggplot2 · ggiraph · scales · systemfonts", "CRAN packages (open source)", "Every chart except the waterfall, drawn as interactive SVG: tooltips, click to open or inspect a day, click a diamond for its definition, click a participant to compare."],
          ["echarts4r", "CRAN package; Apache ECharts (Apache 2.0)", "The animated waterfall that builds the expected readiness step by step, with a replay button."],
          ["htmltools · htmlwidgets · jsonlite", "CRAN packages (open source)", "Custom HTML for cards, sparklines and tables; JSON for chart metadata and the model metadata."],
          ["<code>style.css</code>, <code>ui.js</code>", "Written for this project", "Layout, cards and frosted-glass tab bar; URL routing so the browser Back button works; focus management and chart names for screen readers."]]],
        ["Images, icons and fonts", [
          ["Female body figure <code>body-female-reference.png</code>", "AI-generated for this project with ChatGPT (OpenAI image generation); approved by the author before use", "Soreness → “After a day like yesterday, where were people most often sore?” for female participants."],
          ["Male body figure <code>body-male-reference.png</code>", "AI-generated by the author with ChatGPT (OpenAI image generation), using a 3D body model as the reference; background converted to white", "The same module for male participants."],
          ["Area masks <code>body-mask-*.png</code> (14)", "Extracted from the two figures with an OpenCV thresholding script (kept outside the submission); recorded in <code>body_mask_provenance.json</code>", "Shade the seven questionnaire areas on the body figures by the share of check-ins that ticked them."],
          ["Icons", "Simple line icons drawn as inline SVG for this project", "Card titles, tab bar and info links."],
          ["Fonts", "The system font stack (San Francisco, Segoe UI, Helvetica Neue, Arial); no web fonts", "All text and chart labels."]]],
        ["Design and method references", [
          ["Apple Health and Apple Fitness", "Public interface patterns only; no Apple assets, icons or proprietary scores", "Card summaries, the 7-day date strip, inspect-then-open on the training chart, the floating tab bar."],
          ["Shneiderman (1996); Tufte (2001); Gestalt and pre-attentive principles", "Course readings", "Overview first with details on demand; folded method notes; grouping by proximity; colour always paired with text or shape."],
          ["Benjamini &amp; Hochberg (1995); cluster-robust (CR1) intervals; ridge regression", "Standard statistical methods, implemented in base R", "Everyday habits and “How did days like this usually go?” (clustered intervals, BH correction); the expected readiness (ridge)."]]],
        ["AI assistance", [
          ["OpenAI Codex · Anthropic Claude", "Coding assistants used under the author's direction; the header of <code>app.R</code> states which versions each assisted", "Code, data preparation and analysis; they also updated this summary's wording and screenshots to match the final app. The author set the design goals, reviewed every result, and decided each iteration and all final design choices."]]],
      ],
    },
  },

  zh: {
    note: "2026 年 9 月 22 日随 R Shiny 应用一起提交的设计说明，全文照录：说明页和附录页都在，只去掉了学号。它写的是 R 原版，配图是原版的截图。下面的中文是翻译，原文是英文。",
    pdf: "下载英文原文 PDF",
    title: "Ready to Train?",
    titleSuffix: "— 设计说明",
    sub: "用 R Shiny 回看睡眠、训练和日常习惯怎样对应“准备好训练”的感受 · GEOM90007 作业 2",
    meta: ["<strong>Jiakuo Tang（唐嘉阔）</strong>", "<strong>PMData</strong> · 16 名参与者 · 2019 年 11 月 1 日至 2020 年 4 月 1 日", "3 个页面 · 5 张摘要卡片 · 18 项习惯 · 13 个追踪信号"],
    s1: { h: "目的和受众", body: [
      "这个看板来自我一直在搭的一个系统：一个由两部分相连的<span class=\"term\">个人数字孪生</span>。我把这两部分叫作<span class=\"term\">认知核心</span>（我的知识、目标、偏好和长期判断）和<span class=\"term\">数据核心</span>（对我身体和日常生活的测量：睡眠、训练、步数、心率和自我感受）。两者合在一起，能让 AI 既知道我看重什么，也知道我现在的状态。",
      "我早期的原型很会收集数据，却很少考虑视觉层级、数据诚实和用户任务。所以这次作业围绕三个问题重新设计数据核心：<b>今天身体怎么样？这个判断依据哪些记录？哪些习惯和更好的第二天相伴？</b>它是给记录训练、睡眠和自我感受的人（业余运动员、常去健身房的人）和他们的教练做的探索性回看，不是医疗或训练建议。"] },
    s2: { h: "数据和它的局限", body: [
      "我自己的记录还不够长、也不够完整，所以原型用了结构相同的 <b>PMData</b>：16 名经常运动的成年人，有 Fitbit 数据、晨间自评、训练日志和饮食问卷。<b>NHANES</b> 只为睡眠时长提供外部参照。在我的长期系统里，人们会在晚上总结当天；PMData 的自评是早上填的，看板保留了这个时间安排，不把未来的设计说成已经做到。"] },
    s3: { h: "数据诚实和发现", body: [
      "关联分析先去掉每名参与者自己的平均值，用按参与者聚类的 95% 区间，每张图各做一次 Benjamini–Hochberg 校正。没过门槛的行照样显示，每张图都有“Show the data”（查看数据）表格。不知道的追踪信号按它在训练数据里的平均值算，不当成“不成立”。"] },
    finding: "16 个日常习惯里，只有<b>比平常晚睡 1 小时以上</b>和第二天早上的准备度保持明确关联（16 名参与者）。",
    maeCaption: "平均绝对误差，2020 年 3 月留出集（准备度，0–10 分）",
    mae: [["预期值（平常水平 + 13 个追踪信号）", "1.01", true], ["只用平常水平（之前四周里每周最后一次自评）", "1.01"],
      ["那四周里的全部自评", "0.97"], ["每天都填自评（前五次的中位数）", "0.91"]],
    s3after: "页面报告的是两个发现，而不是宣称模型很好：追踪数据几乎没有改善预期值；和用上全部自评相比，之前每周只取一次自评，准确度损失很小。但这还不算检验了一个每周只问一次的 App。",
    s4: { h: "局限和下一步", body: [
      "只有 16 个人，自评量表很粗，关联也证明不了因果；能量账本是参数自己定的概念演示。真正的版本需要我自己的长期数据、重新训练和验证，再接上认知核心，让 AI 在来源、不确定性和时间范围都清楚的前提下一起参与回顾。"] },
    fig1: "<b>图 1 · Today（今天）</b>，P07，2020 年 3 月 26 日（周四）：控制卡片、待核对的预期值、五张写明各自时间范围并带 14 天迷你图的摘要卡片，以及关键发现。",
    fig1alt: "看板的 Today 页",
    howTitle: "怎么用",
    steps: [
      "选一名参与者，再在 7 天日期条上选一天；日历可以跳到任意一天，<b>Latest</b>（最近）跳到最后一天的记录。",
      "先看预期准备度，再按 <b>Reveal check-in</b>（揭晓自评），和这个人的真实感受比较。",
      "点开任意卡片看详情；返回按钮在底部的标签栏里。把鼠标放到图上可以看到精确数值。",
      "关键发现通向 <b>Everyday habits</b>（日常习惯）；<b>Compare habits</b>（习惯对比）把这名参与者放到其他人中间。"],
    s5: { h: "结构和交互", body: [
      "版面照着手机 App 来：手表是主要的数据来源，只有手机能读取 Apple Health、连到我的数据库。悬浮的磨砂玻璃标签栏沿用 Apple 现在的设计语言，返回按钮也放在里面。<b>Today</b> 遵循“先概览，再按需看细节”（Shneiderman, 1996）。同一个日期混着晨间自评、昨晚的睡眠、昨天的训练和一整天的步数，所以每张卡片都写明自己的时间范围。准备度先显示一个<em>预期</em>值：平常水平（8–35 天前那四周里每周最后一次自评）加上训练日志和 Fitbit 的 13 个追踪信号，用动画瀑布图一步步搭出来；然后用 <b>Reveal check-in</b>（揭晓自评）显示这个人自己报告的值（图 2）。五个同日问卷题目和准备度一起填写，会泄露答案，所以去掉了。",
      "<b>Everyday habits</b> 在同一条坐标轴上比较 18 项习惯和状态，可以按发生的时间分组，也可以按平均差异排序（图 3）；<b>Compare habits</b> 显示每个人的分子、分母和位置，不给任何人排名。日期条、日历、选择器和图上的日期共用同一个状态；训练负荷图先查看某一天，再打开它（图 4）。"] },
    fig2: "<b>图 2 · 揭晓之后的自评对预期。</b>蓝色：预期；绿色：自评；灰色竖线：差距。有底色的一列是选中的那天。",
    fig2alt: "自评对预期的准备度图",
    fig3: "<b>图 3 · Everyday habits</b>，同一条坐标轴，按组显示或按平均差异排序（只截了前几行）。粗黑线 + “clear link” = BH 校正后 p &lt; .05；细灰线 = 没有明确关联。线段是未校正的 95% 区间。",
    fig3alt: "日常习惯的森林图",
    fig4: "<b>图 4 · 先查看，再打开。</b>点 3 月 10 日只是查看它（紫色条）；选中的日子保持锁定，直到按 “Open this day”（打开这一天）。",
    fig4alt: "查看模式下的训练负荷图",
    s6: { h: "视觉选择", body: [
      "视觉层级跟着思考层级走：先今天的状态，后模型细节；先结论，后完整记录。白色卡片和留白把每个问题分开（格式塔邻近原则），范围标签写明分析单位。蓝色标选中的日子或参与者，绿色标真实自评和更好的方向，琥珀色标更差的方向；颜色总和文字或形状一起出现，所以它只是前注意线索，从来不是唯一的编码。方法说明默认折叠，减少非数据墨水（Tufte, 2001）。森林图里，菱形回答“选中那天成立吗？”，线的粗细回答“有明确关联吗？”。“没有明确关联”写明了不能证明没有影响。身体图展示的是一个对照组的历史，不是预测，用固定的 0–30%+ 刻度画七个粗略的问卷部位。"] },
    refs: "Shneiderman, B. (1996). The eyes have it. <i>IEEE Symposium on Visual Languages</i>. · Tufte, E. R. (2001). <i>The Visual Display of Quantitative Information</i> (2nd ed.). · Benjamini, Y. &amp; Hochberg, Y. (1995). <i>JRSS B</i>, 57(1).",
    toAppendix: "所有数据、软件、图像和 AI 协助，以及各自怎么用：见第 2 页附录。",
    appendix: {
      title: "附录 · 资源及其在界面中的用途",
      sub: "Ready to Train? · GEOM90007 作业 2 · 提交物里的每项资源、它的来源和它出现的位置",
      head: ["资源", "来源和许可", "在界面中的用途"],
      groups: [
        ["数据", [
          ["PMData · Fitbit <code>sleep.json</code>", "Thambawita 等（2020），<i>PMData: a sports logging dataset</i>，ACM MMSys，doi:10.1145/3339825.3394926；Simula Research Laboratory；CC BY 4.0", "昨晚睡眠卡片和睡眠详情（睡眠窗口、效率）；预期准备度里的睡眠信号；日常习惯里的睡眠行；习惯对比里的睡眠指标。"],
          ["PMData · Fitbit <code>steps.json</code>、<code>resting_heart_rate.json</code>", "同上", "步数卡片和每小时热力图（带步数的记录时长）；日常习惯里的步数行；睡眠详情对比和习惯对比里的静息心率。"],
          ["PMData · PMSys <code>wellness.csv</code>", "同上", "晨间自评：准备度（揭晓的值和平常水平）、酸痛回答和酸痛部位（身体图），以及睡眠详情里的疲劳、心情、压力和睡眠质量。"],
          ["PMData · PMSys <code>srpe.csv</code>", "同上", "训练记录（分钟 × RPE 的负荷、活动标签）：训练卡片和详情、滚动负荷图、每月训练、各负荷水平之后的酸痛、训练信号和训练行、能量账本演示。"],
          ["PMData · <code>reporting.csv</code>、<code>participant-overview.xlsx</code>", "同上", "每日饮食问卷（正餐、酒精、饮水）用于日常习惯和习惯对比里的饮食行；年龄和性别用于参与者选择、身体图和 NHANES 匹配。"],
          ["NHANES 2017 – 2020 年 3 月 · <code>P_DEMO</code>、<code>P_SLQ</code>", "美国疾控中心国家卫生统计中心；公有领域", "习惯对比 → “Outside context”（外部参照）：同性别、年龄相近的美国成年人自报的平常睡眠，放在参与者的 Fitbit 睡眠旁边，只作背景。"]]],
        ["派生文件和模型（在提交物中）", [
          ["<code>daily.csv</code>、<code>sleep_episodes.csv</code>、<code>hourly_steps.csv</code>、<code>training_sessions.csv</code>、<code>questionnaires.csv</code>、<code>body_regions.csv</code>、<code>participants.csv</code>、<code>nhanes_sleep.csv</code>", "由提交物之外的数据准备脚本从 PMData 和 NHANES 原始压缩包生成（脚本运行需要原始压缩包）；来源哈希和处理规则记在随附的 <code>*_provenance.json</code> 文件里。没有插补任何数值。", "<code>app.R</code> 启动时读一次；所有图表、卡片和表格都由它们算出。运行应用不需要原始压缩包。"],
          ["<code>readiness_waterfall_model.rds</code>、<code>…_metrics.csv</code>、<code>…_metadata.json</code>", "由 <code>train_readiness_waterfall.R</code> 训练（岭回归，λ = 3000；11 月至 2 月拟合，3 月留出）。应用会核对输入文件的 MD5 哈希，模型过期时会标出来。", "预期准备度、它的瀑布图、自评对预期图，以及带脚注的准确度说明。"]]],
        ["软件", [
          ["R 4.6 · shiny · bslib", "CRAN 软件包（开源）", "应用框架、响应式状态、Bootstrap 5 主题；日历按钮用的是 <code>shiny::dateInput</code> 自带的 bootstrap-datepicker。"],
          ["ggplot2 · ggiraph · scales · systemfonts", "CRAN 软件包（开源）", "除瀑布图外的所有图表，画成可交互的 SVG：提示框、点击打开或查看某一天、点击菱形看定义、点击参与者做比较。"],
          ["echarts4r", "CRAN 软件包；Apache ECharts（Apache 2.0）", "一步步搭出预期准备度的动画瀑布图，带重播按钮。"],
          ["htmltools · htmlwidgets · jsonlite", "CRAN 软件包（开源）", "卡片、迷你图和表格的自定义 HTML；图表元数据和模型元数据用的 JSON。"],
          ["<code>style.css</code>、<code>ui.js</code>", "为本项目编写", "版面、卡片和磨砂玻璃标签栏；URL 路由，让浏览器的返回键能用；焦点管理和给读屏软件的图表名称。"]]],
        ["图像、图标和字体", [
          ["女性身体图 <code>body-female-reference.png</code>", "用 ChatGPT（OpenAI 图像生成）为本项目生成；使用前经作者确认", "酸痛 → “After a day like yesterday, where were people most often sore?”（经历像昨天这样的一天后，人们最常在哪里酸痛？），女性参与者。"],
          ["男性身体图 <code>body-male-reference.png</code>", "作者用 ChatGPT（OpenAI 图像生成）以 3D 人体模型为参考生成；背景改成白色", "同一模块，男性参与者。"],
          ["区域遮罩 <code>body-mask-*.png</code>（14 张）", "用 OpenCV 阈值脚本从两张身体图里提取（脚本不在提交物中）；记在 <code>body_mask_provenance.json</code> 里", "按自评里勾选各部位的比例，给身体图上的七个问卷部位上色。"],
          ["图标", "为本项目画的简单线条图标，内联 SVG", "卡片标题、标签栏和信息链接。"],
          ["字体", "系统字体（San Francisco、Segoe UI、Helvetica Neue、Arial）；不用网络字体", "所有文字和图表标签。"]]],
        ["设计和方法参考", [
          ["Apple Health 和 Apple Fitness", "只参考公开的界面模式；没有用 Apple 的素材、图标或专有评分", "摘要卡片、7 天日期条、训练图的“先查看再打开”、悬浮标签栏。"],
          ["Shneiderman (1996)；Tufte (2001)；格式塔和前注意原则", "课程阅读材料", "先概览、按需看细节；折叠方法说明；按邻近分组；颜色总和文字或形状一起出现。"],
          ["Benjamini &amp; Hochberg (1995)；聚类稳健（CR1）区间；岭回归", "标准统计方法，用 base R 实现", "日常习惯和 “How did days like this usually go?”（这样的日子通常怎样？）（聚类区间、BH 校正）；预期准备度（岭回归）。"]]],
        ["AI 协助", [
          ["OpenAI Codex · Anthropic Claude", "在作者指导下使用的编程助手；<code>app.R</code> 文件头写明各自协助了哪些版本", "代码、数据准备和分析；它们也按最终应用更新了这份说明的措辞和截图。作者定下设计目标、检查每个结果，并决定每一轮迭代和所有最终设计。"]]],
      ],
    },
  },
};

// Written for the web page, not part of the submitted summary: what the assignment asked for (from the Canvas
// assignment page, copied on 19 September 2026), the problem chosen within it, and what came out. Shown above the
// summary so a reader who does not know the course can place it.
export const BRIEF = {
  en: {
    title: "What this project solves",
    lede: "A course assignment on one side, a real question on the other. Read this first, then the design summary below as it was submitted.",
    cards: [
      { h: "The assignment", items: [
        "<b>GEOM90007 Information Visualisation</b>, University of Melbourne, Semester 2 2026 · Assignment 2 · individual · 20% of the subject · due 22 September 2026.",
        "Build one interactive data visualisation interface in <b>R Shiny</b> on a <b>real dataset</b> of your own choice. It must serve a defined purpose and audience, contain two or more data graphics (at least one interactive), offer at least one interaction beyond Shiny's built-in defaults, and follow the course's principles of interaction design, cartography and data graphics. Unlike Assignment 1, Tableau no longer does part of the design thinking.",
        "Hand in the app as a ZIP that runs as is, plus a <b>one-page design summary</b> that justifies the design choices (the document below) and an appendix of every source and how it is used.",
        "Marked on data correspondence (25), data integrity (15), data density and aesthetics (25), technical challenge and interaction design (25) and the design summary (10)."] },
      { h: "The problem I chose", items: [
        "<b>For whom:</b> people who log their training, sleep and how they feel each day (recreational athletes, regular gym-goers) and their coaches.",
        "<b>Their questions:</b> How is the body today? Which records is that judgement based on? Which habits go with a better next day?",
        "<b>The idea tested:</b> an app that asks for a check-in only now and then could still say what to expect each morning. So the dashboard shows the <i>expected</i> readiness first, then reveals how the person actually felt.",
        "<b>Data:</b> PMData, 16 people, November 2019 to April 2020 (Fitbit, morning check-ins, training logs, a food questionnaire); NHANES as outside context for sleep."] },
      { h: "What came out", items: [
        "Three pages: <b>Today</b> (five snapshot cards, each with a detail view), <b>Everyday habits</b> (18 habits and next-morning readiness) and <b>Compare habits</b> (one participant among the others). Every number is tagged as a record, an association or a concept demo.",
        "<b>Findings:</b> of 16 everyday habits, only going to bed 1 h+ later than usual has a clear link with next-morning readiness (0.46 points lower, BH-adjusted p &lt; .05). Tracked data barely changes the expectation: hold-out error 1.01 points, the same as the usual level alone.",
        "<b>Mark:</b> not yet released."] },
    ],
    tryIt: "Try it:",
    source: "The assignment card is a summary of the Canvas assignment page (read on 19 September 2026).",
    summaryHead: "The design summary, as submitted",
  },
  zh: {
    title: "这个项目解决什么问题",
    lede: "一边是课程作业的要求，一边是一个真实的问题。先看这三张卡片，再看下面原样提交的设计说明。",
    cards: [
      { h: "老师布置的作业", items: [
        "墨尔本大学 <b>GEOM90007 信息可视化</b>，2026 年第 2 学期 · 作业 2 · 个人完成 · 占总成绩 20% · 2026 年 9 月 22 日截止。",
        "用 <b>R Shiny</b> 做一个交互式数据可视化界面，数据必须<b>真实</b>，由自己选。界面要服务一个明确的目的和受众；至少两个数据图形，其中至少一个可以交互；至少一种超出 Shiny 内建默认的交互；设计要依据课上讲的交互设计、制图和数据图形原则。和作业 1 不同，这次没有 Tableau 替你做一部分设计判断。",
        "提交一个能直接运行的 ZIP，加一份<b>一页的设计说明</b>，论证每个设计选择（就是下面这份），第二页附录写清每个来源和它在界面里的用途。",
        "评分维度：数据对应（25）、数据诚实（15）、数据密度与美观（25）、技术难度与交互设计（25）、设计说明（10）。"] },
      { h: "我选的问题", items: [
        "<b>给谁用：</b>每天记录训练、睡眠和自我感受的人（业余运动员、常去健身房的人）和他们的教练。",
        "<b>他们想知道：</b>今天身体怎么样？这个判断依据哪些记录？哪些习惯和更好的第二天相伴？",
        "<b>要验证的想法：</b>一个只偶尔请人填自评的 App，每天早上也能说出预期会怎样。所以看板先给出<i>预期</i>的准备度，再揭晓这个人当天的真实感受。",
        "<b>数据：</b>PMData，16 人，2019 年 11 月到 2020 年 4 月（Fitbit、晨间自评、训练日志、饮食问卷）；NHANES 作睡眠的外部参照。"] },
      { h: "做出了什么", items: [
        "三页：<b>今天</b>（五张快照卡片，每张都能点开看详情）、<b>日常习惯</b>（18 个习惯和第二天早上的准备度）、<b>习惯对比</b>（一名参与者放在其他人中间）。每个数字都标明是记录、关联还是概念演示。",
        "<b>发现：</b>16 个日常习惯里，只有比平常晚睡 1 小时以上和第二天早上的准备度有明确关联（低 0.46 分，BH 校正后 p &lt; .05）。追踪数据几乎不改变预期：留出集误差 1.01 分，和只用平常水平一样。",
        "<b>分数：</b>待发布。"] },
    ],
    tryIt: "去看看：",
    source: "“老师布置的作业”一栏概括自 Canvas 作业页（2026 年 9 月 19 日读取）。",
    summaryHead: "原样提交的设计说明",
  },
};
