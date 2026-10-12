# Ready to Train? · an interactive PMData dashboard (GEOM90007 Assignment 2), v42.
# Design: student discussion and implementation plan. R implementation assistance: OpenAI Codex (v1-v9, v19-v26, v28-v30)
# and Anthropic Claude (v10-v18, v27, v31-v42). Every section below is labelled with what it does.

# ---- Packages (install once from CRAN; nothing is installed by this script) ----
library(shiny)
library(ggplot2)
library(ggiraph)
library(echarts4r)
library(bslib)
library(htmltools)
library(htmlwidgets)
library(jsonlite)
library(scales)
library(systemfonts)

# ---- Modules: data loading, statistics and chart builders ----
source("helpers.R", local = TRUE)
source("insights.R", local = TRUE)
source("visuals.R", local = TRUE)
source("accessibility.R", local = TRUE)
source("evidence.R", local = TRUE)
source("training.R", local = TRUE)
source("body_regions.R", local = TRUE)
source("levers.R", local = TRUE)
source("peers.R", local = TRUE)
source("reveal.R", local = TRUE)
source("day_view.R", local = TRUE)
source("readiness_waterfall.R", local = TRUE)
source("story_visuals.R", local = TRUE)
source("habits.R", local = TRUE)
source("home_cards.R", local = TRUE)

# ---- Images: the submission is one flat folder, so the body figures sit next to app.R. Shiny
# serves them from a temporary copy under the "assets/" prefix (no www/ subfolder needed). ----
ASSET_DIR <- file.path(tempdir(), "pmdata-assets")
dir.create(ASSET_DIR, showWarnings = FALSE)
invisible(file.copy(list.files(".", pattern = "^body-(male|female|mask)-.*\\.png$"), ASSET_DIR, overwrite = TRUE))
addResourcePath("assets", ASSET_DIR)

# ---- Start-up: read the delivered CSVs once and compute every descriptive estimate ----
APP_DATA <- load_research_inputs()
SLEEP_EPISODES <- read.csv("sleep_episodes.csv", stringsAsFactors = FALSE)
SLEEP_EPISODES$date <- as.Date(SLEEP_EPISODES$date)
SESSIONS <- load_training_sessions()
TRAIN_DAYS <- daily_training(SESSIONS)
BODY_REGIONS <- load_body_regions()
BODY_SCALE_TOP <- body_rate_scale_top(BODY_REGIONS, TRAIN_DAYS)
EVIDENCE <- build_evidence_frame(APP_DATA$daily, SLEEP_EPISODES, TRAIN_DAYS)
CANDIDATES <- build_candidates(EVIDENCE)
LOAD_SORENESS <- load_soreness_summary(EVIDENCE)
LOAD_SORENESS_SHARES <- load_soreness_shares(LOAD_SORENESS)
TODAY_FRAME <- build_today_frame(APP_DATA$daily, SLEEP_EPISODES, TRAIN_DAYS)
TODAY_EFFECTS <- estimate_today_factors(TODAY_FRAME)
TODAY_EFFECTS$verdict <- explain_verdict(TODAY_EFFECTS, TODAY_EFFECTS$clear)
READINESS_WATERFALL <- load_readiness_waterfall()
FORMS <- load_questionnaire_days()
LEVER_FRAME <- build_lever_frame(APP_DATA$daily, SLEEP_EPISODES, FORMS, TRAIN_DAYS)
LEVER_EFFECTS <- estimate_levers(LEVER_FRAME)
LEVER_EFFECTS$verdict <- explain_verdict(LEVER_EFFECTS, LEVER_EFFECTS$effective)
LEVER_XLIM <- lever_axis_limits(LEVER_EFFECTS[is.finite(LEVER_EFFECTS$effect), , drop = FALSE])
PEER_PROFILES <- build_peer_profiles(APP_DATA$daily, SLEEP_EPISODES, SESSIONS, FORMS, APP_DATA$people)
PEER_LONG <- build_peer_long(PEER_PROFILES)
PEER_EXCLUDED <- peer_exclusions(PEER_PROFILES)
HABIT_RATES <- build_habit_rates(APP_DATA$people$participant, FORMS, TODAY_FRAME)
HABIT_EVIDENCE <- habit_evidence(LEVER_EFFECTS, TODAY_EFFECTS)
PEOPLE <- APP_DATA$people[order(APP_DATA$people$participant), ]
INITIAL_PERSON <- "p07"
INITIAL_DATA <- APP_DATA$daily[APP_DATA$daily$participant == INITIAL_PERSON, ]
INITIAL_DAY <- default_research_day(INITIAL_DATA)
DATA_FIRST <- min(APP_DATA$daily$date); DATA_LAST <- max(APP_DATA$daily$date)
N_PEOPLE <- nrow(PEOPLE)
PERSON_CHOICES <- setNames(PEOPLE$participant, paste0(toupper(PEOPLE$participant), " · ", PEOPLE$age, " y · ", PEOPLE$gender))
band_phrase <- function(band) if (band == SORENESS_LABELS[1]) "a day with no session logged" else paste0("a ", sub(" load", "-load", tolower(sub(" [0-9].*$", "", band))), " day (", sub("^.* ", "", band), ")")
SORENESS_WORDS <- c("very sore", "sorer than usual", "same as usual", "less sore than usual", "feeling great")
LEVER_ORDERS <- c("By group" = "group", "By average difference" = "effect")
LEVER_FILTERS <- c("All 18" = "all", setNames(LEVER_GROUP_LEVELS, c("Tonight's sleep", "Food & drink", "Activity", "Reference states")))
HABIT_CHOICES <- setNames(HABIT_EVIDENCE$habit, HABIT_EVIDENCE$label)
HOME_SECTIONS <- c("overview", "readiness", "soreness", "sleep", "training", "activity")
N_TRACKED <- length(TODAY_FACTOR_SPECS)
MODEL_META <- READINESS_WATERFALL$metadata

# ---- Model accuracy on the March 2020 development hold-out, for on-screen honesty ----
model_mae <- function(stage, pattern) {
  m <- READINESS_WATERFALL$metrics
  if (is.null(m)) return("—")
  z <- m[m$stage == stage & grepl(pattern, m$method), , drop = FALSE]
  if (nrow(z)) fmt(z$mae[1], 2) else "—"
}

# ---- The site's theme sentence, chosen by a stated rule rather than by hand ----
# Rule: among the everyday habits (reference states excluded), report the ones whose link with
# next-morning readiness survives the participant-clustered test with BH correction.
key_finding <- function() {
  e <- LEVER_EFFECTS[is.finite(LEVER_EFFECTS$effect) & LEVER_EFFECTS$group != LEVER_GROUP_LEVELS[4], , drop = FALSE]
  clear <- e[e$effective, , drop = FALSE]; clear <- clear[order(clear$p_bh), , drop = FALSE]
  count <- c("none", "only one", "only two", "only three")[min(nrow(clear), 3) + 1]
  if (!nrow(clear)) return(list(value = "—", text = paste0("None of the ", nrow(e), " everyday habits shows a clear link with next-morning readiness."),
    compare = "How ready people feel mostly follows their own recent level."))
  top <- clear[1, ]
  list(value = deviation_label(top$effect, 2L),
    text = paste0("How ready people feel mostly follows their own recent level. Of ", nrow(e), " everyday habits, ", count,
      if (nrow(clear) == 1) " has" else " have", " a clear link with next-morning readiness: “", tolower(top$label), "” (", deviation_label(top$effect, 2L), " points, ",
      top$people, " participants)."),
    compare = paste0("Food, fluid, steps and training show no clear link once each person's repeated days are counted properly and the ",
      sum(is.finite(LEVER_EFFECTS$p)), " tests are corrected for being run together."))
}
KEY_FINDING <- key_finding()

# ---- Small interface builders ----
small_stat <- function(label, value, suffix = "") div(class = "small-stat", span(label), strong(value), tags$small(suffix))
metric_heading <- function(icon, title, kind = "") div(class = paste("metric-heading", kind), icon_svg(icon), h2(title))
# `when` names the time each card covers, since one date mixes a morning check-in, last night,
# yesterday's training and the whole day's steps.
home_metric_card <- function(id, icon, title, output_id, kind = "", when = NULL)
  actionLink(id, tagList(
    div(class = "home-card-title", icon_svg(icon), span(class = "home-card-name", span(title), if (!is.null(when)) span(class = "card-when", when)),
     span(class = "home-card-arrow", `aria-hidden` = "true", "›")),
    uiOutput(output_id)), class = paste("home-metric-card", kind))
# Detail pages have no back button of their own: the bottom navigation bar shows one.
detail_header <- function(title, lede) div(class = "detail-header", div(h2(title), p(lede)))
# Evidence layer next to each module title: words plus a glyph, never colour alone.
evidence_tag <- function(kind, text) span(class = paste("evidence-tag", kind),
  span(class = "tag-glyph", `aria-hidden` = "true", switch(kind, record = "●", association = "◆", hypothesis = "◌", "·")), text)
# The unit of analysis and time span of a page, always shown next to its title.
scope_chip <- function(text) span(class = "scope-chip", text)
method_note <- function(title, ...) tags$details(class = "method-note", tags$summary(title), div(class = "method-body", ...))

# ---- About the data & methods (one modal instead of repeated caveats on every card) ----
about_modal <- function() {
  pm <- MODEL_META$participant_test_mae
  modalDialog(title = "About this dashboard", easyClose = TRUE, size = "l", footer = modalButton("Close"),
    h4("Who it is for"),
    p("People who log their training, sleep and how they feel each day — for example recreational athletes and regular gym-goers — and their coaches. It is an exploratory look-back at past records: it describes patterns and does not give medical or training advice."),
    h4("How to use it"),
    tags$ol(
      tags$li("Pick a participant at the top, then a day on the date strip. The arrows move one day at a time, the calendar button at the strip's right end jumps to any date, and ", strong("Latest"), " jumps to the participant's last recorded day."),
      tags$li(strong("Today"), " shows five snapshots of that morning. Open a card for the records behind it."),
      tags$li("The idea: an app that asks for a check-in only now and then (say, weekly) could still say what to expect each morning. So the dashboard first shows what their usual level and tracked data would lead us to ", strong("expect"), ", then ", strong("Reveal check-in"), " shows how they actually felt and the gap between the two."),
      tags$li(strong("Everyday habits"), " pools participant-days from all participants: which habits went with a better or worse next morning."),
      tags$li(strong("Compare habits"), " shows how the participant you are viewing compares with the others.")),
    h4("Data"),
    tags$ul(
      tags$li(strong("PMData"), paste0(" (Thambawita et al., 2020, ACM MMSys; CC BY 4.0): ", N_PEOPLE, " people who exercise regularly (recreational sport), ", day_label(DATA_FIRST, weekday = FALSE), " – ", day_label(DATA_LAST, weekday = FALSE),
        ". Fitbit sleep, steps and resting heart rate; PMSys morning check-ins (readiness 0–10; fatigue, mood, stress, sleep quality and soreness 1–5, where 3 = same as usual); PMSys training logs (load = minutes × RPE, where RPE is perceived effort from 1 to 10); a daily food questionnaire.")),
      tags$li(strong("NHANES 2017 – March 2020"), " (US CDC, public domain): self-reported usual sleep, used only as outside context on the Compare habits page.")),
    p(class = "fine-print", "Participants are anonymised as P01–P16. The data are 2019–2020 records; nothing here is live."),
    h4("How to read the evidence"),
    tags$ul(
      tags$li(evidence_tag("record", "Record"), " a measured or self-reported value, shown as it is. Missing days are not filled in (the energy-ledger demo is the one exception: a day with no session, or with a blank load, costs zero there, and it says so)."),
      tags$li(evidence_tag("association", "Association"), " a within-person comparison over the whole study: each participant's own average is removed first, so the numbers compare a participant's days with their other days. Days from all participants are pooled, so people with more records count more. The 95% intervals are clustered by participant, because one person's days are not independent. A thick black interval marked 'clear link' means the BH-adjusted p-value is below .05 (Benjamini–Hochberg correction for the tests in that chart); a thin grey one means it is not. The correction changes the p-values only: the intervals drawn are ordinary 95% intervals, not widened for it, so a thin grey interval can still stay clear of zero when its corrected p-value is .05 or above. A blue ◆ marks a signal that was true on the selected day. Associations are not causes, and they use records from after the selected day too."),
      tags$li(evidence_tag("hypothesis", "Concept demo"), " the energy ledger: a preview of a feature a real app could offer. Doing it properly would need a validated model, which is beyond this project, so it runs on a simple made-up rule instead. It is not a measurement.")),
    h4("The expected readiness"),
    p(paste0("Usual level = the average of up to four earlier check-ins: the latest one in each of the four weeks dated 8–14, 15–21, 22–28 and 29–35 days before the day (at least three of the four); the most recent week is held back. These weeks are counted back from each day, so neighbouring days pick different check-ins, and over a month the expected values draw on most of a participant's check-ins. This limits how many check-ins each day's value uses; it does not simulate an app that collects only one check-in a week. The ", N_TRACKED,
      " tracked signals from the training log and Fitbit are then fitted together in one ridge regression (λ = ", MODEL_META$lambda %||% "—",
      ", Nov–Feb). A signal that is unknown on a day (for example, no sleep record) counts as its average — the share of days it was true in the training data — not as 'not true'.")),
    p(paste0("On the March 2020 development hold-out — not used for fitting or tuning, but viewed during development — the expected value was off by ", model_mae("test", "ridge"),
      " points on average and the usual level alone by ", model_mae("test", "^level$"), ". Using every check-in in those four weeks instead of the latest one from each gave ", model_mae("test", "level_all"),
      ", and a version that needs a check-in every day (median of the last five) ", model_mae("test", "last5"),
      ". Across participants the error had a median of ", fmt(pm$median, 2), " (range ", fmt(pm$min, 2), " to ", fmt(pm$max, 2), " points). In short: on these past records, basing each day on one check-in from each of four earlier weeks cost little accuracy compared with using all of them, but whether an app that only collects a check-in once a week would do as well was not tested; tracked data barely changes the expectation; and the gap between expected and felt is what the dashboard shows.")),
    h4("Acknowledgements"),
    p(class = "fine-print", "Built in R with shiny, ggplot2, ggiraph, echarts4r and bslib. The R code, data preparation and analysis were written with AI coding assistants (OpenAI Codex and Anthropic Claude); the author set the design goals, reviewed every result and decided each iteration and all final design choices. The header of app.R lists which versions each assistant worked on; the design summary's appendix lists every resource used. The male and female body figures are AI-generated illustrations (ChatGPT image generation) made for this project. Layout ideas were informed by public health-app interfaces; no product assets or proprietary scores are used."))
}

# ---- Interface: header with purpose, data line and selectors, then three pages ----
ui <- fluidPage(
 theme = bs_theme(version = 5, bg = VIZ$bg, fg = VIZ$ink, primary = VIZ$blue, base_font = c("-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif")),
 tags$head(tags$title("Ready to Train? · PMData"),
  tags$meta(name = "description", content = "Interactive R Shiny dashboard of the PMData sports-logging dataset"),
  tags$style(HTML(paste(readLines("style.css", warn = FALSE), collapse = "\n"))),
  tags$script(HTML(paste(readLines("ui.js", warn = FALSE), collapse = "\n")))),
 tags$a(href = "#main_content", class = "skip-link", "Skip to main content"),

 div(class = "app-shell",
  tags$header(class = "simple-header",
   div(class = "title-block",
    h1("Ready to Train?"),
    p(class = "purpose-line", "For people who log their training, sleep and how they feel each day (e.g. recreational athletes, regular gym-goers) and their coaches: an exploratory look-back at how sleep, training and everyday habits line up with feeling ready to train — not training advice."),
    p(class = "data-line", span(paste0("PMData · ", N_PEOPLE, " participants · ", day_label(DATA_FIRST, weekday = FALSE), " – ", day_label(DATA_LAST, weekday = FALSE), " · Fitbit + daily check-ins")),
     actionLink("about", tagList(icon_svg("info"), "About the data & methods"), class = "about-link")))),
  # One control card: who | the 7-day strip | the full calendar | Latest. The selected day is shown
  # once, in the strip. The calendar button's face shows the strip's month; the real date field lies
  # over it (read-only, transparent), so a click anywhere on the button opens the date picker.
  div(class = "control-bar",
   div(class = "control-card",
    div(class = "header-controls", selectInput("participant", "Participant", PERSON_CHOICES, INITIAL_PERSON, selectize = FALSE)),
    div(class = "calendar-nav", actionButton("previous_day", HTML("&lsaquo;"), title = "Previous day", `aria-label` = "Previous day"), uiOutput("day_strip"),
     actionButton("next_day", HTML("&rsaquo;"), title = "Next day", `aria-label` = "Next day")),
    div(class = "date-jump", title = "Open the calendar to pick any date",
     div(class = "date-jump-face", `aria-hidden` = "true", textOutput("strip_month", inline = TRUE), icon_svg("calendar")),
     tagAppendAttributes(dateInput("focus_day", "Pick any date from the calendar", INITIAL_DAY, min = min(INITIAL_DATA$date), max = max(INITIAL_DATA$date),
      format = "d M yyyy", language = "en", weekstart = 1), readonly = NA, .cssSelector = "input")),
    actionButton("latest", "Latest", class = "latest-button", title = "Jump to this participant's last recorded day")),
   p(class = "strip-legend", span(class = "legend-dot", `aria-hidden` = "true"), "morning check-in recorded")),
  div(class = "pooled-banner", icon_svg("info"),
   span(strong(paste0("Pooled participant-days from up to ", N_PEOPLE, " participants, ", month_label(DATA_FIRST), " – ", month_label(DATA_LAST), ".")),
    " People with more records count more. The participant and day pickers do not change this page.")),
  actionButton("floating_back_overview", HTML("&lsaquo;"), class = "floating-overview-back", title = "Back to Today", `aria-label` = "Back to the Today overview"),
  tags$main(id = "main_content", tabindex = "-1",
  div(class = "sr-only", role = "status", `aria-live` = "polite", textOutput("ui_status")),
  tabsetPanel(id = "page", type = "pills", selected = "today",
   # ---- Page 1 · five summary cards and five drill-down views ----
   tabPanel("Today", value = "today",
    tabsetPanel(id = "today_section", type = "hidden", selected = "overview",
     tabPanel("Overview", value = "overview",
      div(class = "view-intro overview-intro", div(class = "title-row", h2(textOutput("today_title", inline = TRUE)), scope_chip("One participant · selected day · last 14 days"))),
      uiOutput("reveal_bar"),
      div(class = "home-card-grid",
       home_metric_card("open_readiness", "pulse", "Readiness", "home_readiness", "readiness-home-card", "morning check-in"),
       home_metric_card("open_sleep", "moon", "Last night's sleep", "home_sleep", "sleep-home-card", "the night ending this morning"),
       home_metric_card("open_training", "compare", "Training yesterday", "home_training", "training-home-card", "logged the day before"),
       home_metric_card("open_activity", "calendar", "Steps", "home_activity", "activity-home-card", "the whole selected day"),
       home_metric_card("open_soreness", "body", "Soreness", "home_soreness", "soreness-home-card", "morning check-in"),
       div(class = "home-metric-card insight-card",
        div(class = "home-card-title", icon_svg("bulb"), span(class = "home-card-name", span("Key finding · all participants"), span(class = "card-when", "whole study, pooled days"))),
        div(class = "home-card-body",
         div(class = "home-card-value", strong(KEY_FINDING$value), span("readiness points")),
         p(KEY_FINDING$text), tags$small(KEY_FINDING$compare),
         actionLink("open_choices", HTML("See all 18 habits and conditions &rsaquo;"), class = "insight-link"))))),
     tabPanel("Readiness detail", value = "readiness",
      detail_header("Readiness", "What this participant's usual level and tracked data led us to expect — and, once revealed, how they actually felt."),
      div(class = "health-card readiness-card", div(class = "card-top", metric_heading("pulse", "Expected and felt", "blue"), evidence_tag("association", "usual level + tracked data")),
       uiOutput("reference_summary")),
      div(class = "health-card felt-card",
       div(class = "card-top", metric_heading("compare", "Felt vs expected, last 4 weeks", "model"), scope_chip("This participant · 28 days")),
       p(class = "chart-lede", "Blue: expected from the usual level and tracked data. Green: how the participant said they felt. The grey stick is the gap. The shaded day is the selected one."),
       chart_ui("felt_expected", "300px", "Felt readiness against expected readiness for the last 28 days", "Click a day to open it."),
       uiOutput("felt_expected_note"),
       uiOutput("readiness_accuracy"),
       tags$details(class = "lower-module build-module",
        tags$summary(span(class = "summary-title", paste0("How the expected value is built (usual level + ", N_TRACKED, " tracked signals)"))),
        uiOutput("readiness_factor_headline"),
        p(class = "chart-lede", paste0("Starting from the usual level (dashed line), the ", N_TRACKED, " tracked signals are added one at a time. Coloured steps were true on this day; dark grey ones were not true and add nothing; light grey ones were unknown and add their average (weight × how often they were true).")),
        div(class = "compact-actions", actionButton("replay_factor_sequence", "Replay animation", class = "text-button")),
        div(class = "readiness-factor-echart", role = "img", `aria-label` = "Waterfall: the usual level plus each tracked signal in turn gives the expected readiness",
         echarts4rOutput("readiness_factor_sequence", height = "360px")),
        uiOutput("readiness_factor_key"),
        tags$details(class = "chart-data", tags$summary("Show the data"), uiOutput("readiness_factor_sequence_data")))),
      div(class = "health-card explanation-card",
       div(class = "card-top", metric_heading("compare", "How did days like this usually go?", "model"), scope_chip("All participants · whole study")),
       p(class = "chart-lede", paste0("The same ", N_TRACKED, " tracked signals, each on its own: how much lower or higher same-day readiness was on days when it was true, across the whole study (not only what was known on the selected day).")),
       div(class = "plot-legend", span(class = "legend-diamond today", "true on the selected day"), span(class = "legend-diamond", "not true or unknown"),
        span(class = "legend-line clear", "clear link (BH-adjusted p < .05)"), span(class = "legend-line", "no clear link (not proof of no effect)"), span(class = "legend-note", "lines = 95% intervals, clustered by participant, not adjusted for multiple tests")),
       uiOutput("factors_shell"), uiOutput("factor_detail"), uiOutput("factors_note"))),
     tabPanel("Soreness detail", value = "soreness",
      detail_header("Soreness", "The check-in asks how sore the participant feels: 1 = very sore, 3 = same as usual, 5 = feeling great."),
      uiOutput("reveal_bar_soreness"),
      div(class = "health-card soreness-today-card", div(class = "card-top", metric_heading("body", "This morning", "blue"), evidence_tag("record", "check-in + last 2 days of training")),
       uiOutput("soreness_today")),
      # Order: what changes with the day first (this morning, then the likely sore areas after
      # yesterday's training), the fixed whole-study reference last.
      div(class = "health-card body-region-card", uiOutput("body_region_model")),
      div(class = "health-card", div(class = "card-top", metric_heading("compare", "After each load level, how did participants feel next morning?", "model"), scope_chip("Reference · all participants · whole study")),
       p(class = "chart-lede", "A fixed reference: it does not change with the day, except that the band for yesterday's load is marked. Soreness answers the morning after each level of reported load; brown shades are sorer than usual. The load bands are display bands chosen for readability, not training-science thresholds."),
       chart_ui("load_soreness", "330px", "Share of each soreness answer after each level of training load the day before"),
       uiOutput("load_soreness_note"))),
     tabPanel("Sleep detail", value = "sleep",
      detail_header("Last night's sleep", "Fitbit dates each night by the morning it ends, so 'last night' belongs to the selected day."),
      div(class = "health-card sleep-window-card",
       div(class = "card-top", metric_heading("moon", "Sleep this week", "purple"), evidence_tag("record", "Fitbit · 7 nights")),
       p(class = "chart-lede", "Each bar runs from falling asleep (top) to waking (bottom). Darker purple = more of the time in bed spent asleep."),
       chart_ui("sleep_window", "380px", "Main sleep window and sleep efficiency for the seven nights on the date strip", "Click a night to open that day."),
       uiOutput("sleep_window_note")),
      div(class = "health-card compare-card", div(class = "card-top", metric_heading("moon", "Last night compared with usual", "purple"), evidence_tag("record", "Fitbit + check-in · whole study")),
       uiOutput("compare_rows"))),
     tabPanel("Training detail", value = "training",
      detail_header("Training load", "Load is what the participant reported: session minutes × effort (RPE, perceived effort from 1 to 10)."),
      div(class = "health-card rolling-load-card",
       div(class = "card-top", metric_heading("compare", "Is training load going up or down?", "model"), scope_chip("This participant · 8 or 12 weeks"),
        div(class = "segmented mini-segment", radioButtons("training_span", "Chart range", c("8 weeks" = 56, "12 weeks" = 84), 56, inline = TRUE))),
       p(class = "chart-lede", "Purple: total load logged in the 7 days up to and including each date. Black: this participant's typical week, averaged over the 28 days up to that date. Purple above black = training more than their recent norm; below = less."),
       uiOutput("training_load_callout"),
       chart_ui("training_load", "320px", "7-day reported training load and the 28-day weekly average over time", "Click a point to inspect that day — the selected day stays locked.")),
      div(class = "health-card review-card", div(class = "card-top", metric_heading("calendar", textOutput("monthly_title", inline = TRUE), "blue"), evidence_tag("record", "own training log · whole study")),
       p(class = "chart-lede", "Only this participant's own sessions, not the whole group. Top: sessions per month (* = month only partly on record). Bottom: the same sessions by type; one session can carry several types."),
       chart_ui("monthly_totals", "230px", "Reported sessions per month"), chart_ui("monthly_types", "230px", "Reported sessions per month and training type"), uiOutput("monthly_note")),
      tags$details(class = "health-card lower-module battery-card",
       tags$summary(span(class = "summary-title", "Energy ledger — a preview of a possible future feature"), evidence_tag("hypothesis", "concept demo · not a measurement")),
       uiOutput("battery_lede"),
       div(class = "battery-controls", numericInput("battery_cost", "Energy used per 100 load (1–10 points)", value = BATTERY_DEFAULTS$cost_per_100_load, min = 1, max = 10, step = .5),
        numericInput("battery_recovery", "Energy regained each day (5–60% of what is missing)", value = BATTERY_DEFAULTS$recovery_pct, min = 5, max = 60, step = 5), actionButton("battery_reset", "Reset", class = "text-button")),
       chart_ui("battery_plot", "260px", "Daily energy from the energy ledger rule", "Click a day to open it."), uiOutput("battery_note"))),
     tabPanel("Activity detail", value = "activity",
      detail_header("Steps", "Steps recorded by the Fitbit over the whole selected day. For most participants steps were recorded for 8–14 hours a day, so totals also depend on how long the band recorded."),
      div(class = "health-card activity-summary-card", uiOutput("activity_summary")),
      div(class = "health-card activity-card",
       div(class = "card-top", metric_heading("calendar", "When in the day was the participant moving?", "blue"), evidence_tag("record", "Fitbit · 7 days or 4 weeks")),
       div(class = "segmented mini-segment", radioButtons("heat_span", "Heatmap range", c("7 days" = 7, "4 weeks" = 28), 7, inline = TRUE)),
       p(class = "chart-lede", textOutput("activity_lede", inline = TRUE)),
       chart_ui("activity_heatmap", "320px", "Hourly steps heatmap, one cell per hour of each day", "Click any cell to open that day."))))),
   # ---- Page 2 · everyday habits and conditions, pooled across all participants ----
   tabPanel("Everyday habits", value = "choices",
    div(class = "view-intro", div(class = "title-row", h2("Which everyday habits go with a better next morning?"), scope_chip("All participants · pooled days · whole study")),
     p("Each row compares a participant's days with and without a habit, after removing that participant's own average. These are associations in past records, not proof of cause.")),
    div(class = "health-card levers-card",
     div(class = "card-top", metric_heading("compare", "18 everyday habits and conditions, and the next morning", "model"), span(class = "subtle-tag", textOutput("levers_tag", inline = TRUE))),
     div(class = "filter-row",
      div(class = "segmented lever-groups", `aria-label` = "Show a group of rows", radioButtons("lever_filter", NULL, LEVER_FILTERS, "all", inline = TRUE)),
      div(class = "segmented lever-order", `aria-label` = "Order the rows", radioButtons("lever_order", NULL, LEVER_ORDERS, "group", inline = TRUE)),
      div(class = "plot-legend", span(class = "legend-diamond", "average difference"), span(class = "legend-line clear", "clear link (BH-adjusted p < .05)"),
       span(class = "legend-line", "no clear link (not proof of no effect)"), span(class = "legend-note", "lines = 95% intervals, clustered by participant, not adjusted for multiple tests"))),
     uiOutput("levers_shell"), uiOutput("lever_detail")),
    div(class = "health-card lever-note-card", div(class = "card-top", metric_heading("info", "Reading these rows", "model")), uiOutput("levers_note"))),
   # ---- Page 3 · the participant being viewed among the others ----
   tabPanel("Compare habits", value = "habits",
    div(class = "view-intro", div(class = "title-row", h2(textOutput("habits_title", inline = TRUE)), scope_chip("One participant vs the others · whole study")),
     p("How often each habit appears in each participant's record. Whether a habit is linked with readiness at all is shown separately in the cards below; a different frequency is not a different readiness level.")),
    div(class = "health-card habits-card",
     div(class = "card-top", metric_heading("compare", "Five everyday habits: how often each participant does them", "model"), span(class = "subtle-tag", textOutput("habit_tag", inline = TRUE))),
     uiOutput("habit_profile_summary"),
     div(class = "compare-row", div(class = "compare-picker", selectInput("compare_pick", "Compare with", c("Nobody" = ""), "", selectize = FALSE)), uiOutput("compare_actions")),
     chart_ui("habit_dots", "680px", "How often each participant recorded five habits; the participant you are viewing is ringed", "Click any other participant's dot — or pick one from the list above — to compare."),
     uiOutput("habit_excluded"),
     tags$details(class = "sub-module",
      tags$summary(span(class = "summary-title", "One habit, participant by participant"), span(class = "subtle-tag", "numerator / denominator")),
      div(class = "segmented habit-picker", radioButtons("habit_pick", "Habit", HABIT_CHOICES, HABIT_EVIDENCE$habit[1], inline = TRUE)),
      uiOutput("compare_summary"),
      chart_ui("habit_detail", "430px", "Each participant's share of recorded days for the chosen habit", "Click any other participant — or use 'Compare with' above."))),
    tags$details(class = "health-card lower-module peer-card", open = NA,
     tags$summary(span(class = "summary-title", "Ten more ways participants differ"), evidence_tag("record", "whole study")),
     p(class = "chart-lede", "One line per participant across ten measures. A line only joins one person's values: the measures sit side by side, each scaled on its own between the lowest and the highest participant, so the slope between two measures means nothing. Compare where people sit on one measure at a time, and whether two lines run together or apart. No measure is ranked better or worse. A line breaks where that participant is below the record threshold for a measure (listed below)."),
     uiOutput("peer_shell"),
     uiOutput("peer_note")),
    tags$details(class = "health-card lower-module population-card",
     tags$summary(span(class = "summary-title", "Outside context · sleep of US adults the same age"), evidence_tag("record", "NHANES survey · 2017–2020")),
     p(class = "chart-lede", "Grey: how long US adults of the same sex and similar age say they usually sleep (NHANES 2017 – Mar 2020). Purple: this participant's last five matching nights measured by Fitbit. Self-report and a wristband measure sleep differently, so treat this as background only."),
     div(class = "population-controls",
      div(class = "segmented mini-segment", radioButtons("population_period", "Nights", c("Mon–Fri nights" = "workday", "Weekend nights" = "nonworkday"), inline = TRUE)),
      selectInput("age_radius", "Age range", c("± 5 years" = 5, "± 10 years" = 10), 5, selectize = FALSE)),
     div(class = "population-layout",
      div(class = "population-info", uiOutput("cohort_description"), uiOutput("population_values")),
      div(class = "population-plot", chart_ui("population", "260px", "Survey sleep distribution with this participant's recent nights", "Click a purple dot to open that day.")))))),
  div(class = "app-footer", span("Data: PMData (Thambawita et al., 2020, CC BY 4.0) · NHANES 2017 – Mar 2020 (US CDC)"),
   span("● record · ◆ association · ◌ concept demo")))))

# ---- Server ----
server <- function(input, output, session) {
 # ---- Global state: one participant and one selected day; everything else is local ----
 person <- reactive({ req(input$participant); APP_DATA$daily[APP_DATA$daily$participant == input$participant, ] })
 profile <- reactive(PEOPLE[PEOPLE$participant == input$participant, , drop = FALSE])
 focus <- reactiveVal(INITIAL_DAY); strip_end <- reactiveVal(INITIAL_DAY)
 truth <- reactiveVal(FALSE); compare <- reactiveVal("")
 nav_section <- reactiveVal("overview")
 heatmap_span <- reactive(if (is.null(input$heat_span)) 7L else as.integer(input$heat_span))
 training_span <- reactive(if (is.null(input$training_span)) 56L else as.integer(input$training_span))
 habit_pick <- reactive(if (is.null(input$habit_pick)) HABIT_EVIDENCE$habit[1] else input$habit_pick)
 lever_filter <- reactive(if (is.null(input$lever_filter)) "all" else input$lever_filter)
 tstate <- reactive(today_factor_state(TODAY_FRAME, TODAY_EFFECTS, input$participant, focus(), truth()))
 date_max <- reactive(max(person()$date))
 # Page 1 uses only records available before the selected day; the day's own check-in is hidden
 # until the reader presses "Reveal check-in" (see reveal.R).
 pv <- reactive(visible_person(person(), focus(), truth()))
 has_checkin <- reactive({ r <- day_row(person(), focus()); nrow(r) == 1 && is.finite(r$readiness[1]) })
 revealed_value <- function(key) if (truth()) metric_value(day_row(person(), focus()), key) else NA_real_
 # Charts draw shorter labels when their output is phone-width (the SVG is ~300px wide there).
 narrow <- function(id) { w <- session$clientData[[paste0("output_", id, "_width")]]; !is.null(w) && is.finite(w) && w < 480 }
 record_start <- reactive(min(person()$date))
 draw_widget <- function(plot, id, height, selected = character(), sel_css = "stroke:#1c1c1e;") {
  width <- session$clientData[[paste0("output_", id, "_width")]]
  if (is.null(width) || !is.finite(width) || width < 100) width <- 620
  health_widget(plot, width = max(2.6, width / 96), height = height / 96, selected = selected, sel_css = sel_css)
 }
 set_focus <- function(day) {
  v <- max(min(person()$date), min(as.Date(day), date_max())); focus(v); truth(FALSE)
  if (v > strip_end() || v < strip_end() - 6) strip_end(v)
  updateDateInput(session, "focus_day", value = v)
 }

 # ---- Selectors: participant, day, date strip ----
 # Switching participant keeps the day when the new participant has a record for it, so two people
 # can be compared on the same date; otherwise it falls back to their latest complete day.
 observeEvent(input$participant, {
  d <- person(); compare("")
  keep <- focus() >= min(d$date) && focus() <= max(d$date)
  target <- if (keep) focus() else default_research_day(d)
  strip_end(target)
  updateDateInput(session, "focus_day", min = min(d$date), max = date_max()); set_focus(target)
 }, priority = 100, ignoreInit = TRUE)
 observeEvent(input$focus_day, { v <- safe_date_input(input$focus_day, focus()); if (!identical(as.Date(v), focus())) set_focus(v) })
 observeEvent(input$calendar_day, { v <- safe_date_input(input$calendar_day, focus()); set_focus(v) })
 observeEvent(input$previous_day, set_focus(focus() - 1))
 observeEvent(input$next_day, set_focus(focus() + 1))
 observeEvent(input$latest, { strip_end(date_max()); set_focus(date_max()) })
 observeEvent(input$about, showModal(about_modal()))
 output$ui_status <- renderText(paste0("Showing ", toupper(input$participant), " on ", day_label(focus())))
 # The month(s) the strip is showing, on the face of the calendar button.
 output$strip_month <- renderText({
  a <- strip_end() - 6; b <- strip_end(); m <- function(x) MONTHS[as.POSIXlt(x)$mon + 1L]; y <- function(x) format(x, "%Y")
  if (m(a) == m(b)) paste(m(b), y(b)) else if (y(a) == y(b)) paste0(m(a), "–", m(b), " ", y(b)) else paste0(m(a), "–", m(b))
 })
 output$day_strip <- renderUI({
  d <- person(); days <- seq(strip_end() - 6, strip_end(), by = "day")
  div(class = "day-strip", lapply(as.character(days), function(s) {
   date <- as.Date(s); valid <- date >= min(d$date) && date <= date_max()
   recorded <- any(d$date == date & d$wellness_reports > 0)
   tags$button(type = "button", class = paste("day-button", if (date == focus()) "selected" else ""),
    disabled = if (!valid) "disabled" else NULL, onclick = sprintf("Shiny.setInputValue('calendar_day','%s',{priority:'event'})", s),
    title = paste0(day_label(date), if (recorded) " · check-in recorded" else " · no check-in"),
    `aria-label` = paste0(day_label(date), if (recorded) ", check-in recorded" else ", no check-in"), `aria-pressed` = if (date == focus()) "true" else "false",
    span(WEEKDAY[as.POSIXlt(date)$wday + 1]), strong(format(date, "%d")), tags$i(class = if (recorded) "has-data" else ""))
  }))
 })

 # ---- Navigation: pages, drill-down sections and the URL hash (back button works) ----
 go <- function(page, section = "overview") {
  if (page != "today") section <- "overview"
  nav_section(section)
  if (!identical(input$page, page)) updateTabsetPanel(session, "page", selected = page)
  updateTabsetPanel(session, "today_section", selected = section)
  session$sendCustomMessage("route", list(page = page, section = section))
 }
 observeEvent(input$page, {
  if (!identical(input$page, "today")) nav_section("overview")
  sec <- if (identical(input$page, "today")) nav_section() else "overview"
  updateTabsetPanel(session, "today_section", selected = sec)
  session$sendCustomMessage("route", list(page = input$page, section = sec))
 }, ignoreInit = TRUE)
 observeEvent(input$route, {
  bits <- strsplit(sub("^#", "", input$route), "/", fixed = TRUE)[[1]]
  page <- if (length(bits) && bits[1] %in% c("today", "choices", "habits")) bits[1] else "today"
  section <- if (length(bits) > 1 && bits[2] %in% HOME_SECTIONS) bits[2] else "overview"
  go(page, section)
 })
 for (section in setdiff(HOME_SECTIONS, "overview")) local({
  s <- section
  observeEvent(input[[paste0("open_", s)]], go("today", s), ignoreInit = TRUE)
 })
 observeEvent(input$floating_back_overview, go("today", "overview"), ignoreInit = TRUE)
 observeEvent(input$open_choices, go("choices"), ignoreInit = TRUE)
 # Date marks switch the global day; other marks only change local selections.
 connect_day_plot <- function(id) observeEvent(input[[paste0(id, "_selected")]], {
  v <- input[[paste0(id, "_selected")]]
  if (length(v) && grepl("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", tail(v, 1))) set_focus(as.Date(tail(v, 1)))
 }, ignoreInit = TRUE)
 lapply(c("population", "activity_heatmap", "battery_plot", "sleep_window", "felt_expected"), connect_day_plot)

 # ---- Expected readiness: usual level (check-ins 8-35 days old) + tracked signals ----
 level <- reactive(personal_level(pv(), focus()))
 readiness_parts <- reactive(readiness_waterfall_parts(READINESS_WATERFALL, tstate(), level()$value))
 readiness_hint <- reactive({
  lv <- level(); parts <- readiness_parts()
  adjustment <- if (!is.null(parts)) attr(parts, "adjustment") else NA_real_
  value <- if (!is.null(parts)) attr(parts, "prediction") else if (is.finite(lv$value)) lv$value else NA_real_
  list(level = lv, parts = parts, adjustment = adjustment, value = value)
 })
 gap_words <- function(felt, expected) { g <- felt - expected
  if (abs(g) < .05) "as expected" else paste0(fmt(abs(g), 1), if (g > 0) " better" else " worse", " than expected") }

 # ---- Reveal: the participant's own check-in for the selected day (the calibration check) ----
 observeEvent(input$reveal_request, truth(identical(input$reveal_request, "show")))
 reveal_bar_ui <- function() {
  who <- toupper(input$participant); when <- day_label(focus(), weekday = FALSE, year = FALSE); r <- readiness_hint()
  if (!has_checkin()) return(div(class = "reveal-bar none", icon_svg("info"), span(paste0(who, " did not fill in a morning check-in on ", when, ", so there is nothing to check the expectation against."))))
  if (truth()) { felt <- revealed_value("readiness")
   return(div(class = "reveal-bar shown", icon_svg("check"),
    span(strong(paste0(who, " felt ", fmt(felt, 0), "/10 on ", when, if (is.finite(r$value)) paste0(" — ", gap_words(felt, r$value), " (", fmt(r$value, 1), ").") else ".")), " Green marks the check-in values."),
    tags$button(type = "button", class = "btn text-button", onclick = "Shiny.setInputValue('reveal_request','hide',{priority:'event'})", "Hide again"))) }
  div(class = "reveal-bar", icon_svg("info"),
   span(strong(paste0("Expected from ", who, "'s usual level and tracked data: ", if (is.finite(r$value)) paste0(fmt(r$value, 1), "/10") else "not enough earlier check-ins", ".")),
    " Reveal how they actually felt — the check that a real app would ask for."),
   tags$button(type = "button", class = "btn soft-button", onclick = "Shiny.setInputValue('reveal_request','show',{priority:'event'})", "Reveal check-in"))
 }
 output$reveal_bar <- renderUI(reveal_bar_ui())
 output$reveal_bar_soreness <- renderUI(reveal_bar_ui())

 # ---- Page 1 · the five overview cards ----
 output$today_title <- renderText(paste0(toupper(input$participant), " · ", day_label(focus())))
 output$home_readiness <- renderUI({
  r <- readiness_hint(); dates <- spark_window(focus()); felt <- revealed_value("readiness")
  spark <- spark_readiness(dates, spark_series(pv(), dates, "readiness"), focus(), r$value,
   paste0("Readiness check-ins over the last 14 days; the selected day shows ", if (is.finite(felt)) "the felt value" else "the expected value"), felt)
  if (is.finite(felt)) return(home_card_body(fmt(felt, 0), "/10 felt",
   if (is.finite(r$value)) paste0("Expected ", fmt(r$value, 1), " · ", gap_words(felt, r$value)) else "No expected value for this day",
   "Green ring: the check-in", spark, list(kind = "shown", text = "revealed")))
  if (!is.finite(r$value)) return(home_card_body("—", NULL, "Not enough earlier check-ins", "Needs a check-in in at least 3 of the 4 weeks dated 8–35 days before", spark))
  home_card_body(fmt(r$value, 1), "/10 expected", paste0("Mostly the usual level (", fmt(r$level$value, 1), ")"),
   paste0("Tracked data changes it by ", deviation_label(r$adjustment, 2L), if (has_checkin()) " · reveal to check" else " · no check-in this day"), spark, list(kind = "estimate", text = "expected"))
 })
 output$home_sleep <- renderUI({
  d <- person(); v <- metric_value(day_row(d, focus()), "sleep_hours"); s <- usual_stats(d$sleep_hours)
  delta <- if (is.finite(v) && !is.null(s)) v - s$median else NA_real_
  dates <- spark_window(focus())
  spark <- spark_bars(dates, spark_series(d, dates, "sleep_hours"), focus(), "Hours asleep over the last 14 nights; dashed line = usual",
   VIZ$purple, if (!is.null(s)) s$median else NA_real_, top = 10)
  home_card_body(if (is.finite(v)) duration_label(v) else "—", NULL,
   if (is.finite(delta)) paste0(gap_text(delta), if (delta >= 0) " more" else " less", " than usual") else "No main sleep recorded last night",
   if (!is.null(s)) paste0("Usual ", duration_label(s$median), " · dashed line") else "Not enough nights for a usual value", spark)
 })
 output$home_training <- renderUI({
  tr <- if (is.null(TRAIN_DAYS)) NULL else TRAIN_DAYS[TRAIN_DAYS$participant == input$participant & TRAIN_DAYS$date == focus() - 1, , drop = FALSE]
  reported <- !is.null(tr) && nrow(tr)
  value <- if (reported && is.finite(tr$load[1])) fmt(tr$load[1]) else if (reported) "blank" else "None"
  z <- training_load_series(TRAIN_DAYS, input$participant, focus(), 56L, record_start()); last <- utils::tail(z, 1)
  pct <- load_change_pct(last)
  dates <- spark_window(focus())
  own <- if (is.null(TRAIN_DAYS)) NULL else TRAIN_DAYS[TRAIN_DAYS$participant == input$participant, , drop = FALSE]
  loads <- vapply(dates, function(dt) { r <- own[own$date == dt, , drop = FALSE]; if (!nrow(r)) 0 else r$load[1] }, numeric(1))
  spark <- spark_bars(dates, loads, focus() - 1, "Reported training load per day over the last 14 days; yesterday highlighted", VIZ$amber, zero_is_value = FALSE)
  home_card_body(value, if (reported) "load" else NULL,
   if (reported) paste0(tools::toTitleCase(train_types_text(tr[1, ])), if (is.finite(tr$minutes[1])) paste0(" · ", fmt(tr$minutes[1]), " min") else "", if (is.finite(tr$rpe[1])) paste0(" × RPE ", fmt(tr$rpe[1])) else "") else "Nothing logged (not a confirmed rest day)",
   if (is.finite(pct)) paste0("Last 7 days: ", fmt(last$load7), " · ", fmt(abs(pct)), "% ", if (pct >= 0) "above" else "below", " the 4-week weekly average")
    else if (is.finite(last$load7)) paste0("Last 7 days: ", fmt(last$load7), " · no 4-week average yet (", last$days28, " days on record)")
    else paste0("Only ", last$days7, " of the last 7 days are on record: no weekly comparison yet"), spark)
 })
 activity_windows <- reactive({
  d <- person(); day <- focus()
  one <- function(n) {
   z <- d[d$date > day - n & d$date <= day, , drop = FALSE]; ok <- is.finite(z$steps)
   list(days = sum(ok), steps = if (any(ok)) mean(z$steps[ok]) else NA_real_,
    minutes = if (any(ok & is.finite(z$step_minutes))) mean(z$step_minutes[ok & is.finite(z$step_minutes)]) else NA_real_)
  }
  list(today = day_row(d, day), s7 = one(7), s28 = one(28))
 })
 # Steps depend on how long the band recorded, so the card always shows the recorded time next to steps
# (minutes with a step record: this does not prove the band was worn).
 output$home_activity <- renderUI({
  a <- activity_windows(); v <- metric_value(a$today, "steps"); avg <- a$s28$steps
  worn <- metric_value(a$today, "step_minutes"); worn_avg <- a$s28$minutes
  delta <- if (is.finite(v) && is.finite(avg) && avg > 0) (v / avg - 1) * 100 else NA_real_
  wear <- if (is.finite(worn) && is.finite(worn_avg) && worn_avg > 0) (worn / worn_avg - 1) * 100 else NA_real_
  # the same comparison per recorded hour, so a longer recording day is not read as more walking
  per_hour <- if (is.finite(v) && is.finite(worn) && worn > 0 && is.finite(avg) && is.finite(worn_avg) && worn_avg > 0) ((v / worn) / (avg / worn_avg) - 1) * 100 else NA_real_
  dates <- spark_window(focus())
  spark <- spark_bars(dates, spark_series(person(), dates, "steps"), focus(), "Recorded steps over the last 14 days; dashed line = 4-week average", VIZ$green, avg)
  home_card_body(if (is.finite(v)) format(round(v), big.mark = ",") else "—", if (is.finite(v)) "steps" else NULL,
   if (is.finite(delta)) paste0(fmt(abs(delta)), "% ", if (delta >= 0) "above" else "below", " the 4-week average (", format(round(avg), big.mark = ","), ")") else "No steps recorded on this day",
   if (is.finite(wear)) paste0("Steps recorded over ", duration_label(worn / 60), " (", fmt(abs(wear)), "% ", if (wear >= 0) "longer" else "shorter", " than usual)",
    if (is.finite(per_hour)) paste0(" · per recorded hour ", fmt(abs(per_hour)), "% ", if (per_hour >= 0) "above" else "below") else "") else "Recorded time unknown", spark)
 })
 soreness_band <- reactive({
  f <- focal_load_band(EVIDENCE, input$participant, focus())
  row <- if (!is.null(f) && identical(f$status, "ok")) LOAD_SORENESS[LOAD_SORENESS$band == f$band, , drop = FALSE] else NULL
  list(focal = f, row = row)
 })
 output$home_soreness <- renderUI({
  sb <- soreness_band(); actual <- revealed_value("soreness"); dates <- spark_window(focus())
  spark <- spark_likert(dates, spark_series(pv(), dates, "soreness"), focus(), "Soreness answers over the last 14 check-ins, from brown (sore) to green (feeling great)")
  typical <- if (!is.null(sb$row) && nrow(sb$row)) paste0(round(sb$row$worse * 100), "% of recorded mornings after ", band_phrase(sb$row$band), " were sorer than usual") else "No load band for yesterday"
  if (is.finite(actual)) return(home_card_body(fmt(actual, 0), paste0("/5 · ", SORENESS_WORDS[actual]), "Felt this morning (1 = very sore, 5 = feeling great)",
   paste0("For comparison: ", typical), spark, list(kind = "shown", text = "revealed")))
  if (is.null(sb$row) || !nrow(sb$row)) return(home_card_body("—", NULL, typical, sb$focal$status %||% "No record", spark))
  home_card_body(paste0(round(sb$row$worse * 100), "%"), "of comparable mornings were sorer",
   paste0("Historical share after ", band_phrase(sb$row$band), ", all participants"),
   paste0(format(sb$row$n, big.mark = ","), " recorded mornings · cells = last 14 answers (1 sore – 5 great)"), spark, list(kind = "estimate", text = "history"))
 })

 # ---- Page 1 · readiness detail ----
 # One line of steps: expected → felt (after Reveal) → the gap. How the expectation is built sits
 # right under it; its accuracy sits under the chart.
 output$reference_summary <- renderUI({
  r <- readiness_hint(); lv <- r$level; felt <- revealed_value("readiness")
  active <- if (!is.null(r$parts)) sum(r$parts$held) else 0
  step <- function(label, value, unit, cls = "") div(class = paste("rv-step", cls), span(class = "rv-label", label), div(class = "rv-value", strong(value), span(unit)))
  arrow <- span(class = "rv-arrow", `aria-hidden` = "true", "→")
  felt_step <- if (!has_checkin()) step("Felt", "—", "no check-in on this day", "muted")
   else if (!truth()) div(class = "rv-step rv-action", span(class = "rv-label", "Felt"),
    tags$button(type = "button", class = "btn soft-button", onclick = "Shiny.setInputValue('reveal_request','show',{priority:'event'})", "Reveal check-in"))
   else step("Felt", fmt(felt, 0), "/10 check-in", "felt")
  gap_step <- if (truth() && is.finite(felt) && is.finite(r$value)) step("Felt − expected", deviation_label(felt - r$value, 1L), gap_words(felt, r$value), "gap")
   else step("Felt − expected", "?", if (has_checkin()) "shown after Reveal" else "nothing to compare", "muted")
  tagList(
   if (!identical(READINESS_WATERFALL$status, "ready")) p(class = "forecast-stale-note", READINESS_WATERFALL$message),
   div(class = "reveal-row", step("Expected", if (is.finite(r$value)) fmt(r$value, 1) else "—", "/10"), arrow, felt_step, arrow, gap_step),
   p(class = "rv-equation", "Expected = usual level ", strong(if (is.finite(lv$value)) fmt(lv$value, 1) else "—"),
    if (lv$n) paste0(" (the latest check-in in each of ", lv$n, " weeks, ", record_range(lv$start, lv$end), ")") else " (no check-ins 8–35 days before)",
    " + tracked data ", strong(if (is.finite(r$adjustment)) deviation_label(r$adjustment, 2L) else "—"), paste0(" (", active, " of ", N_TRACKED, " signals true), kept within 0–10."),
    if (truth()) tags$button(type = "button", class = "btn text-button rv-hide", onclick = "Shiny.setInputValue('reveal_request','hide',{priority:'event'})", "Hide the check-in again")))
 })
 output$readiness_accuracy <- renderUI(tagList(
  p(class = "accuracy-line", strong("How good is this expectation?", tags$sup(class = "fn-mark", "1"), " "),
   paste0("On a March 2020 hold-out it was off by ", model_mae("test", "ridge"), " points on average — the usual level alone did as well (", model_mae("test", "^level$"),
    "). Tracked data barely changes the expectation. Using every check-in in those weeks instead of the latest one from each gave ", model_mae("test", "level_all"),
    ", and the median of the last five check-ins before the day ", model_mae("test", "last5"),
    ". This compares how many check-ins each day's value uses; it does not test an app that only asks for a check-in once a week.")),
  p(class = "footnote", tags$sup("1"), " Author's note: given the size of the dataset (16 participants over about five months) and what this course asks us to show, the prediction algorithm was not the priority here — it was kept deliberately simple, so it may perform less well than you might expect. The point of this card is the gap between expected and felt, not the forecast itself.")))
 felt_series <- reactive(expected_series(READINESS_WATERFALL, pv(), TODAY_FRAME, input$participant, seq(focus() - 27, focus(), by = "day")))
 output$felt_expected <- renderGirafe(draw_widget(health_felt_expected_plot(felt_series(), focus()), "felt_expected", 300))
 output$felt_expected_data <- renderUI(felt_expected_table(felt_series()))
 output$felt_expected_note <- renderUI(felt_expected_note(felt_series(), toupper(input$participant)))
 factor_sequence_epoch <- reactiveVal(0L)
 observeEvent(input$replay_factor_sequence, factor_sequence_epoch(factor_sequence_epoch() + 1L), ignoreInit = TRUE)
 output$readiness_factor_sequence <- renderEcharts4r({ factor_sequence_epoch(); health_readiness_factor_sequence(readiness_parts(), revealed_value("readiness")) })
 output$readiness_factor_headline <- renderUI({
  z <- readiness_parts()
  if (!identical(READINESS_WATERFALL$status, "ready")) return(p(class = "forecast-stale-note", READINESS_WATERFALL$message))
  if (is.null(z)) return(p(class = "empty-note", "No expected value for this day: needs a check-in in at least 3 of the 4 weeks dated 8–35 days before it."))
  adj <- attr(z, "adjustment")
  p(class = "comparison-conclusion", paste0("Together, the ", sum(z$held), " tracked signals that were true changed the expectation by ", deviation_label(adj, 2L),
   " points: essentially unchanged. The usual level does almost all the work."))
 })
 output$readiness_factor_key <- renderUI(readiness_factor_key_ui(readiness_parts()))
 output$readiness_factor_sequence_data <- renderUI(readiness_waterfall_table(readiness_parts()))
 factor_rows <- reactive(today_factor_rows(tstate()))
 output$factors_shell <- renderUI(chart_ui("factors_plot", paste0(today_factors_height(factor_rows()), "px"), "Each tracked signal's average difference in same-day readiness with a 95% interval", "Hover a diamond for its numbers; click it to show its definition."))
 output$factors_plot <- renderGirafe(draw_widget(health_today_factors(factor_rows(), narrow("factors_plot")), "factors_plot", today_factors_height(factor_rows())))
 output$factors_plot_data <- renderUI(today_factors_table(tstate()))
 picked_factor <- reactiveVal("")
 observeEvent(input$factors_plot_selected, { v <- tail(input$factors_plot_selected, 1); if (length(v) && v %in% TODAY_EFFECTS$key) picked_factor(v) }, ignoreInit = TRUE)
 observeEvent(list(input$participant, focus()), picked_factor(""))
 output$factor_detail <- renderUI({
  k <- picked_factor(); st <- tstate(); if (!nzchar(k) || is.null(st)) return(NULL)
  e <- st[st$key == k, , drop = FALSE]
  # A definition only: the estimate is already in the chart, its tooltip and its data table.
  div(class = "insight-note definition-note", h4(e$label), p(paste0("Defined as: ", e$detail, ". On the selected day: ", e$state, ".")))
 })
 output$factors_note <- renderUI({
  e <- TODAY_EFFECTS[is.finite(TODAY_EFFECTS$effect), , drop = FALSE]
  clear <- e[e$clear, , drop = FALSE]; clear <- clear[order(clear$effect), , drop = FALSE]
  tagList(
   p(class = "comparison-conclusion", if (nrow(clear)) paste0(nrow(clear), " of ", nrow(e), " tracked signals have a clear link: ",
    paste0(tolower(clear$label), " (", deviation_label(clear$effect, 2L), ")", collapse = " and "), ". Both are about disrupted sleep.") else
    paste0("None of the ", nrow(e), " tracked signals has a clear link.")),
   method_note("Why these numbers differ from the expected value",
    p("Here each signal is estimated on its own, so overlapping signals (for example 'slept 1 h+ less' and 'slept under 7 hours') each take the full credit. The expected value fits all of them together and shrinks them strongly, so they share the credit and come out much smaller."),
    p("Intervals are clustered by participant because one person's days are not independent; with ordinary intervals many more signals would look clear."),
    p(bh_interval_note(TODAY_EFFECTS, TODAY_EFFECTS$clear, "signals"))))
 })

 # ---- Page 1 · soreness detail ----
 output$soreness_today <- renderUI({
  actual <- revealed_value("soreness"); sb <- soreness_band()
  tagList(
   div(class = "soreness-answer",
    if (is.finite(actual)) likert_cells_ui("Felt", actual) else
     p(class = "locked-line", if (has_checkin()) "This morning's soreness answer is hidden until you reveal the check-in above." else "No check-in on this day."),
    if (!is.null(sb$row) && nrow(sb$row)) p(class = "comparison-conclusion", paste0("Yesterday's load puts this morning in the '", sb$row$band, "' display band: ",
     round(sb$row$worse * 100), "% of such recorded mornings (all participants) were sorer than usual.")) else
     p(class = "fine-print", paste0("Load band: ", sb$focal$status %||% "no record", "."))),
   today_soreness_context_ui(today_soreness_context(TRAIN_DAYS, input$participant, focus())))
 })
 output$load_soreness <- renderGirafe(draw_widget(health_load_soreness_plot(LOAD_SORENESS_SHARES, soreness_band()$focal, narrow("load_soreness")), "load_soreness", 330))
 output$load_soreness_data <- renderUI(load_soreness_table(LOAD_SORENESS))
 output$load_soreness_note <- renderUI({
  first <- LOAD_SORENESS[1, ]; last <- LOAD_SORENESS[nrow(LOAD_SORENESS), ]; r <- CANDIDATES[CANDIDATES$key == "load_prev" & CANDIDATES$outcome == "soreness", ]
  p(class = "comparison-conclusion", paste0("Sorer mornings rise from ", round(first$worse * 100), "% after no session to ", round(last$worse * 100),
   "% after a heavy day. Within participants, more load yesterday went with a lower (sorer) soreness answer today (r = ", signed_num(r$r, 2), ")."))
 })
 output$body_region_model <- renderUI({
  gender <- PEOPLE$gender[match(input$participant, PEOPLE$participant)]
  body_region_model_ui(body_region_profile(BODY_REGIONS, TRAIN_DAYS, input$participant, focus()),
   toupper(input$participant), gender, BODY_SCALE_TOP)
 })

 # ---- Page 1 · sleep detail ----
 output$sleep_window <- renderGirafe(draw_widget(health_sleep_window_plot(person(), focus(), 7L,
  px_w = session$clientData$output_sleep_window_width %||% 800, px_h = 380), "sleep_window", 380))
 output$sleep_window_data <- renderUI(sleep_window_table(person(), focus(), 7L))
 output$sleep_window_note <- renderUI(sleep_window_note(person(), focus(), 7L))
 output$compare_rows <- renderUI({
  d <- pv(); day <- focus(); today <- day_row(d, day); prev <- day_row(d, day - 1)
  onset <- function(h) ifelse(is.finite(h) & h < 12, h, NA_real_)
  sleep_s <- usual_stats(d$sleep_hours); onset_s <- usual_stats(onset(d$start_hour)); hr_s <- usual_stats(d$resting_hr)
  sv <- metric_value(today, "sleep_hours"); ov <- onset(metric_value(today, "start_hour")); hv <- metric_value(today, "resting_hr")
  gap <- function(v, s, more, less, fn) if (!is.finite(v) || is.null(s)) "" else if (abs(v - s$median) < 1e-9) "same as usual" else paste0(fn(abs(v - s$median)), " ", if (v > s$median) more else less, " than usual")
  tagList(
   compare_row_ui("Time asleep", "Fitbit", if (is.finite(sv)) duration_label(sv) else "no record", sv, sleep_s, gap(sv, sleep_s, "more", "less", gap_text), duration_label),
   compare_row_ui("Fell asleep at", "Fitbit", if (is.finite(ov)) clock_text(ov) else if (is.finite(metric_value(today, "start_hour"))) paste0(clock_text(metric_value(today, "start_hour")), " (daytime)") else "no record",
    ov, onset_s, gap(ov, onset_s, "later", "earlier", gap_text), clock_text),
   compare_row_ui("Resting heart rate", "Fitbit daily estimate", if (is.finite(hv)) paste0(fmt(hv, 1), " bpm") else "no record", hv, hr_s, gap(hv, hr_s, "higher", "lower", function(v) paste0(fmt(v, 1), " bpm")), function(v) fmt(v, 1)),
   div(class = "cmp-row likert-block", div(class = "cmp-head", span(class = "cmp-label", "Yesterday's check-in"), span(class = "cmp-source", "1–5 · 3 = same as usual")),
    likert_cells_ui("Sleep quality", metric_value(prev, "sleep_quality")), likert_cells_ui("Fatigue", metric_value(prev, "fatigue")),
    likert_cells_ui("Soreness", metric_value(prev, "soreness")), likert_cells_ui("Stress", metric_value(prev, "stress")), likert_cells_ui("Mood", metric_value(prev, "mood"))))
 })

 # ---- Page 1 · training detail ----
 # Inspecting a point does not change the selected day (the dashboard's lock); "Open this day" does.
 load_pick <- reactiveVal(NULL)
 observeEvent(list(focus(), input$participant, training_span()), load_pick(NULL))
 observeEvent(input$training_load_selected, {
  v <- tail(input$training_load_selected, 1)
  if (length(v) && grepl("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", v)) load_pick(as.Date(v))
 }, ignoreInit = TRUE)
 output$training_load <- renderGirafe(draw_widget(health_training_load_plot(TRAIN_DAYS, input$participant, focus(), training_span(), record_start(), narrow("training_load")), "training_load", 320,
  selected = as.character(focus()), sel_css = "stroke:#1c1c1e;stroke-width:3px;fill:#ffffff;r:6px;"))
 output$training_load_callout <- renderUI(training_load_callout(TRAIN_DAYS, input$participant, focus(), load_pick(), training_span(), record_start()))
 output$training_load_data <- renderUI(training_load_table(TRAIN_DAYS, input$participant, focus(), training_span(), record_start()))
 in_range <- function(v, lo, hi, fallback) if (!length(v) || !is.finite(v)) fallback else max(lo, min(hi, v))
 battery_cost <- reactive(in_range(input$battery_cost, 1, 10, BATTERY_DEFAULTS$cost_per_100_load))
 battery_recovery <- reactive(in_range(input$battery_recovery, 5, 60, BATTERY_DEFAULTS$recovery_pct))
 # The rule in words, with the reader's own settings plugged in.
 output$battery_lede <- renderUI({
  cost <- battery_cost(); rec <- battery_recovery()
  tagList(
  p(class = "chart-lede", strong("What this is. "), "A preview of a feature a real app could offer: a daily energy level that training uses up and rest refills. Doing it properly would need a validated model of fatigue and recovery, which is beyond this project, so the demo runs on a simple made-up rule. It shows what the feature could look like, not how much energy the participant really had."),
  p(class = "chart-lede", strong("The rule. "), paste0("Everyone starts at 100 energy points. Each 100 units of logged training load uses ",
   fmt(cost, 1), " points, so a 350-load session uses ", fmt(3.5 * cost, 1), ". Each day the participant regains ", fmt(rec, 0),
   "% of whatever is missing from 100 (at 60 points: +", fmt(40 * rec / 100, 0), " the next day). A day with no session logged, or with a session whose load was left blank, costs zero in this demo; blank-load days stay marked as unknown (hollow triangles). This is the one place where missing is not left missing. Change the two numbers to see how much the picture depends on them.")))
 })
 observeEvent(input$battery_reset, {
  updateNumericInput(session, "battery_cost", value = BATTERY_DEFAULTS$cost_per_100_load)
  updateNumericInput(session, "battery_recovery", value = BATTERY_DEFAULTS$recovery_pct)
 })
 battery <- reactive(battery_series(pv(), TRAIN_DAYS, input$participant, battery_cost(), battery_recovery()))
 output$battery_plot <- renderGirafe(draw_widget(health_battery_plot(battery(), focus()), "battery_plot", 260))
 output$battery_plot_data <- renderUI(battery_table(battery()))
 # Both series run day to day and drift slowly, so a confidence interval would be overconfident:
 # only the correlation is shown, as a rough shape comparison.
 output$battery_note <- renderUI({
  b <- battery(); if (is.null(b)) return(p(class = "empty-note", "Not enough records to run the energy ledger."))
  ag <- battery_agreement(b)
  clamped <- !identical(as.numeric(input$battery_cost), battery_cost()) || !identical(as.numeric(input$battery_recovery), battery_recovery())
  tagList(
   if (isTRUE(clamped)) p(class = "forecast-stale-note", paste0("Out of range; using ", fmt(battery_cost(), 1), " and ", fmt(battery_recovery(), 0), "%.")),
   p(class = "comparison-conclusion", battery_conclusion(b, ag, toupper(input$participant))),
   p(class = "fine-print", "How to read r: +1 = the ledger is low exactly on the mornings with lower readiness or more soreness (soreness 1 = very sore); 0 = no pattern; below 0 = the opposite. These are rough shape comparisons: both series run day to day, so no confidence interval is given and the gap between the two r values is not a test. Only check-ins before the selected day are used."))
 })
 monthly <- reactive(monthly_training(SESSIONS, input$participant, min(person()$date), max(person()$date)))
 output$monthly_title <- renderText(paste0(toupper(input$participant), "'s sessions per month"))
 output$monthly_totals <- renderGirafe(draw_widget(health_monthly_totals(monthly()), "monthly_totals", 230))
 output$monthly_types <- renderGirafe(draw_widget(health_monthly_types(monthly()), "monthly_types", 230))
 output$monthly_totals_data <- renderUI(monthly_table(monthly()))
 output$monthly_types_data <- renderUI(monthly_table(monthly()))
 output$monthly_note <- renderUI({
  m <- monthly(); if (is.null(m)) return(p(class = "empty-note", "This participant reported no sessions."))
  busiest <- m[which.max(m$sessions), ]
  p(class = "comparison-conclusion", paste0(toupper(input$participant), " logged ", sum(m$sessions), " sessions; the busiest month was ", month_label(busiest$month), " with ", busiest$sessions, "."))
 })

 # ---- Page 1 · activity detail ----
 output$activity_heatmap <- renderGirafe(draw_widget(health_activity_heatmap(APP_DATA$hourly, input$participant, focus(), heatmap_span()), "activity_heatmap", 320))
 output$activity_heatmap_data <- renderUI(activity_table(APP_DATA$hourly, input$participant, focus(), heatmap_span()))
 output$activity_lede <- renderText({
  h <- APP_DATA$hourly[APP_DATA$hourly$participant == input$participant & APP_DATA$hourly$date > focus() - heatmap_span() & APP_DATA$hourly$date <= focus(), , drop = FALSE]
  paste0("Rows are days, columns are hours; darker = more steps. ", nrow(h), " of ", heatmap_span() * 24, " hours have records (× = none).")
 })
 output$activity_summary <- renderUI({
  a <- activity_windows(); day <- focus()
  block <- function(title, steps, minutes, note) div(class = "activity-stat", span(title),
   strong(if (is.finite(steps)) paste0(format(round(steps), big.mark = ","), " steps") else "no record"),
   tags$small(if (is.finite(minutes)) paste0("steps recorded over ", duration_label(minutes / 60), " · ", note) else note))
  tagList(div(class = "card-top", metric_heading("calendar", "Steps and recorded time", "blue"), evidence_tag("record", "Fitbit · day, 7 days, 4 weeks")),
   div(class = "activity-stat-grid",
    block(day_label(day, year = FALSE), metric_value(a$today, "steps"), metric_value(a$today, "step_minutes"), "selected day"),
    block("7-day average", a$s7$steps, a$s7$minutes, paste0(a$s7$days, " days with records")),
    block("4-week average", a$s28$steps, a$s28$minutes, paste0(a$s28$days, " days with records"))),
   p(class = "fine-print", "The overview card compares the selected day with the 4-week average shown here, and shows the recorded time alongside because more hours with step records means more steps counted. Recorded time is not proof the band was worn."))
 })

 # ---- Page 2 · everyday habits and conditions (pooled, one shared axis) ----
 output$levers_tag <- renderText(paste0(sum(LEVER_EFFECTS$effective), " of ", sum(is.finite(LEVER_EFFECTS$effect)), " with a clear link"))
 lever_order <- reactive(if (identical(input$lever_order, "effect")) "effect" else "group")
 lever_view <- reactive(lever_rows(LEVER_EFFECTS, lever_filter(), lever_order()))
 output$levers_shell <- renderUI(chart_ui("levers_plot", paste0(interval_rows_height(lever_view(), "group"), "px"),
  "Each everyday habit's average difference in next-morning readiness with a 95% interval", "Hover a diamond for its numbers; click it to show its definition."))
 output$levers_plot <- renderGirafe(draw_widget(health_levers_plot(lever_view(), LEVER_XLIM, narrow("levers_plot")), "levers_plot", interval_rows_height(lever_view(), "group")))
 output$levers_plot_data <- renderUI(levers_table(LEVER_EFFECTS, lever_view()))
 picked_lever <- reactiveVal("")
 observeEvent(input$levers_plot_selected, { v <- tail(input$levers_plot_selected, 1); if (length(v) && v %in% LEVER_EFFECTS$key) picked_lever(v) }, ignoreInit = TRUE)
 output$lever_detail <- renderUI({
  k <- picked_lever(); if (!nzchar(k)) return(NULL)
  e <- LEVER_EFFECTS[LEVER_EFFECTS$key == k, , drop = FALSE]
  # A definition only: the estimate is already in the chart, its tooltip and its data table.
  div(class = "insight-note definition-note", h4(e$label), p(paste0("Defined as: ", e$detail, ".")))
 })
 output$levers_note <- renderUI(tags$ul(class = "reading-list",
  tags$li(strong("One habit stands out. "), "Only going to bed 1 h+ later than usual keeps a clear link once each person's repeated days are counted properly and the ", sum(is.finite(LEVER_EFFECTS$p)), " tests are corrected for being run together. Meals, fluid, steps and training may matter for some people, but these records cannot show it."),
  tags$li(strong("“No clear link” is not “no effect”. "), "It means the difference did not pass the corrected test; it does not show that the habit makes no difference. ", bh_interval_note(LEVER_EFFECTS, LEVER_EFFECTS$effective, "rows")),
  tags$li(strong("Don't add rows up. "), "They overlap — 'late snack' and 'dinner, no late snack' are the same questionnaires read two ways, and 7, 8 and 9 hours are nested."),
  tags$li(strong("Timing. "), "Sleep rows use the night after the day; food and activity rows use the day itself; the reference rows are states, not choices. The food form records which meals were eaten, not when."),
  tags$li(strong("Direction can run backwards. "), "Where steps or fluid lean negative, a likely reason is that people move and drink more on days they already feel good, then settle back.")))

 # ---- Page 3 · habits compared across participants ----
 output$habits_title <- renderText(paste0("How does ", toupper(input$participant), "'s routine compare with the other participants?"))
 output$habit_tag <- renderText(paste0(length(unique(HABIT_RATES$participant[HABIT_RATES$eligible])), " participants"))
 output$habit_profile_summary <- renderUI(habit_profile_summary_ui(HABIT_RATES, input$participant, HABIT_EVIDENCE))
 output$habit_dots <- renderGirafe(draw_widget(health_habit_dots(HABIT_RATES, HABIT_EVIDENCE, input$participant, compare(), narrow("habit_dots")), "habit_dots", 680, selected = compare()))
 output$habit_dots_data <- renderUI(habit_table(HABIT_RATES, HABIT_EVIDENCE, input$participant))
 output$habit_excluded <- renderUI({
  ex <- HABIT_RATES[!HABIT_RATES$eligible, , drop = FALSE]
  if (nrow(ex)) p(class = "fine-print", paste0("Not shown: ", paste(unique(paste0(toupper(ex$participant), " (", ex$reason, ")")), collapse = "; "), "."))
 })
 output$habit_detail <- renderGirafe(draw_widget(health_habit_detail(HABIT_RATES, habit_pick(), input$participant, compare(), narrow("habit_detail")), "habit_detail", 430, selected = compare()))
 output$habit_detail_data <- renderUI({
  z <- HABIT_RATES[HABIT_RATES$habit == habit_pick(), , drop = FALSE]; z <- z[order(-z$eligible, -z$share), , drop = FALSE]
  view_table(paste0("'", HABIT_EVIDENCE$label[HABIT_EVIDENCE$habit == habit_pick()], "' by participant; denominator = ", HABIT_EVIDENCE$unit[HABIT_EVIDENCE$habit == habit_pick()]),
   c("Participant", "Days with habit", "Days on record", "Share", "Included"), lapply(seq_len(nrow(z)), function(i) { r <- z[i, ]
    list(paste0(toupper(r$participant), if (r$participant == input$participant) " · viewing" else if (r$participant == compare()) " · comparison" else ""),
     as.character(r$num), as.character(r$den), if (is.finite(r$share)) paste0(round(r$share), "%") else "—", if (r$eligible) "yes" else r$reason) }))
 })
 pick_person <- function(v) if (length(v) && nzchar(tail(v, 1)) && tail(v, 1) %in% PEOPLE$participant && tail(v, 1) != input$participant) compare(tail(v, 1))
 observeEvent(input$habit_dots_selected, pick_person(input$habit_dots_selected), ignoreInit = TRUE)
 observeEvent(input$habit_detail_selected, pick_person(input$habit_detail_selected), ignoreInit = TRUE)
 observeEvent(input$clear_compare, compare(""))
 # The "Compare with" list and clicks on the charts drive the same comparison state.
 observeEvent(list(input$participant, compare()), {
  others <- PEOPLE$participant[PEOPLE$participant != input$participant & PEOPLE$participant %in% HABIT_RATES$participant[HABIT_RATES$eligible]]
  updateSelectInput(session, "compare_pick", choices = c("Nobody" = "", setNames(others, toupper(others))), selected = compare())
 })
 observeEvent(input$compare_pick, if (!identical(input$compare_pick, compare())) compare(input$compare_pick), ignoreInit = TRUE)
 observeEvent(input$adopt_compare, { v <- compare(); if (nzchar(v)) updateSelectInput(session, "participant", selected = v) })
 output$compare_actions <- renderUI({
  on <- nzchar(compare())
  div(class = "compare-actions",
   actionButton("adopt_compare", if (on) paste0("View ", toupper(compare()), " instead") else "View the comparison participant instead", class = "soft-button", disabled = !on),
   actionButton("clear_compare", "Clear comparison", class = "text-button", disabled = !on))
 })
 output$compare_summary <- renderUI({
  h <- habit_pick(); ev <- HABIT_EVIDENCE[HABIT_EVIDENCE$habit == h, , drop = FALSE]
  me <- HABIT_RATES[HABIT_RATES$habit == h & HABIT_RATES$participant == input$participant, , drop = FALSE]
  cp <- HABIT_RATES[HABIT_RATES$habit == h & HABIT_RATES$participant == compare(), , drop = FALSE]
  show <- function(r) if (!nrow(r) || !r$eligible[1]) paste0(toupper(r$participant[1]), " is below the record threshold") else paste0(toupper(r$participant[1]), " ", round(r$share[1]), "% (", r$num[1], "/", r$den[1], " days)")
  tagList(
   p(class = "comparison-conclusion", paste0(ev$label, ": ", show(me), if (nrow(cp)) paste0(" vs ", show(cp),
    if (me$eligible[1] && cp$eligible[1]) { gap <- abs(round(cp$share[1] - me$share[1])); paste0(" — ", gap, if (gap == 1) " percentage point apart" else " percentage points apart") } else "") else " · click another participant or use 'Compare with' to compare", ".")),
   p(class = "fine-print", paste0("Link with readiness (within participants, all participants): ", if (isTRUE(ev$clear)) paste0(ev$direction_text, ", ", ev$evidence_text) else "no clear link", ". A different frequency is not a different readiness level.")))
 })
 peer_height <- function() if (narrow("peer_strip")) 760 else 460
 output$peer_shell <- renderUI(chart_ui("peer_strip", paste0(peer_height(), "px"),
  "Ten profile measures across participants, one line per participant, each measure scaled on its own",
  "Hover a line for that participant's numbers; click it to compare with them."))
 output$peer_strip <- renderGirafe(draw_widget(health_peer_parallel(PEER_LONG, input$participant, compare(), peer_value_label, narrow("peer_strip")),
  "peer_strip", peer_height(), selected = compare()))
 observeEvent(input$peer_strip_selected, pick_person(input$peer_strip_selected), ignoreInit = TRUE)
 output$peer_strip_data <- renderUI(peers_table(PEER_LONG, PEER_PROFILES, input$participant))
 output$peer_note <- renderUI(tagList(
  if (!is.null(PEER_EXCLUDED)) tagList(h3(class = "peer-subhead", "Who is missing from which measure"),
   tags$ul(class = "fine-print", lapply(seq_len(nrow(PEER_EXCLUDED)), function(i) tags$li(paste0(PEER_EXCLUDED$who[i], " — ", PEER_EXCLUDED$why[i]))))),
  p(class = "fine-print", strong("Steps are not compared: "), "only P01 has steps recorded nearly all day, so walking and recording time cannot be separated. Readiness is each participant's own scale, and a lower resting heart rate is not automatically better.")))

 # ---- Page 3 · outside context from NHANES ----
 cohort <- reactive(nhanes_cohort(APP_DATA$nhanes, profile(), if (is.null(input$population_period)) "workday" else input$population_period, if (is.null(input$age_radius)) 5L else as.integer(input$age_radius)))
 output$cohort_description <- renderUI({ c <- cohort(); p(class = "cohort-caption", paste0("US ", c$gender, " aged ", c$lo, "–", c$hi, " · ", format(c$n, big.mark = ","), " survey answers")) })
 output$population_values <- renderUI({
  cx <- cohort_context(cohort(), person(), focus()); work <- cohort()$period == "workday"
  div(class = "population-values",
   small_stat(paste0(toupper(input$participant), ", last 5 ", if (work) "work nights" else "weekend nights"), duration_label(cx$mean), paste0(record_range(cx$start, cx$end), " · Fitbit")),
   small_stat("Survey median", cx$median_label, "NHANES, weighted, self-reported"))
 })
 output$population <- renderGirafe(draw_widget(health_population_plot(cohort(), person(), focus(), toupper(input$participant)), "population", 260))
 output$population_data <- renderUI(population_table(cohort(), person(), focus()))
}
# ---- Run ----
# The marker's copy opens in a real browser rather than a preview pane: several charts switch to a
# phone layout below 480px, which a narrow pane would trigger. try() keeps the app running even on a
# machine with no browser configured; runApp(launch.browser = FALSE) still overrides this.
shinyApp(ui, server, options = list(launch.browser = function(url) try(utils::browseURL(url), silent = TRUE)))
