# Where does this participant sit among the other 15?
#
# Only dimensions the data can actually carry a comparison on are built here. Two are
# deliberately absent:
#   * daily steps — step_minutes shows how much of the day the device recorded, and only p01
#     has near-full coverage (median 1440 min); the other 15 sit at 465-820 min, i.e. 8-14
#     hours a day. Walking and recording time cannot be separated, so "who walks more" is not offered.
#   * anything for a participant whose own record is too thin on that dimension — those are
#     reported as excluded, with the reason, rather than plotted as if comparable.
PEER_MIN_SLEEP_NIGHTS <- 30   # main-sleep episodes needed before a sleep habit is comparable
PEER_MIN_SESSIONS <- 5        # logged sessions needed before a training habit is comparable
PEER_MIN_FORMS <- 30          # questionnaire days needed before a meal/alcohol habit is comparable

clock_label <- function(h) {
  if (!is.finite(h)) return("—")
  x <- (h + 24) %% 24
  m <- as.integer(round(x * 60)) %% 1440
  sprintf("%02d:%02d", m %/% 60, m %% 60)
}

build_peer_profiles <- function(daily, episodes, sessions, questionnaires, people) {
  m <- episodes[(episodes$main_sleep %in% c(TRUE, "TRUE")), , drop = FALSE]
  m$date <- as.Date(m$date)
  m$onset <- ifelse(is.finite(m$start_hour) & m$start_hour > 12, m$start_hour - 24, m$start_hour)
  m$eff <- m$sleep_minutes / (m$sleep_minutes + m$awake_minutes)
  z <- do.call(rbind, lapply(sort(unique(daily$participant)), function(p) {
    d <- daily[daily$participant == p, , drop = FALSE]
    mm <- m[m$participant == p & is.finite(m$onset), , drop = FALSE]
    ss <- if (is.null(sessions)) NULL else sessions[sessions$participant == p, , drop = FALSE]
    qq <- if (is.null(questionnaires)) NULL else questionnaires[questionnaires$participant == p, , drop = FALSE]
    load_ok <- if (is.null(ss)) 0 else sum(is.finite(ss$reported_load))
    data.frame(
      participant = p,
      age = people$age[people$participant == p][1],
      gender = people$gender[people$participant == p][1],
      nights = nrow(mm), forms = if (is.null(qq)) 0 else nrow(qq),
      sessions = if (is.null(ss)) 0 else nrow(ss), load_rows = load_ok,
      onset = stats::median(mm$onset, na.rm = TRUE),
      onset_sd = if (nrow(mm) > 2) stats::sd(mm$onset, na.rm = TRUE) else NA_real_,
      sleep = stats::median(d$sleep_hours, na.rm = TRUE),
      efficiency = stats::median(mm$eff, na.rm = TRUE),
      rhr = stats::median(d$resting_hr, na.rm = TRUE),
      readiness = stats::median(d$readiness, na.rm = TRUE),
      week_load = if (is.null(ss) || !load_ok) NA_real_ else sum(ss$reported_load, na.rm = TRUE) / (nrow(d) / 7),
      rpe = if (is.null(ss) || !any(is.finite(ss$reported_exertion))) NA_real_ else stats::median(ss$reported_exertion, na.rm = TRUE),
      snack_pct = if (is.null(qq) || !nrow(qq)) NA_real_ else 100 * mean(qq$m_evening == 1, na.rm = TRUE),
      alcohol_pct = if (is.null(qq) || !nrow(qq)) NA_real_ else 100 * mean(qq$alcohol == 1, na.rm = TRUE),
      stringsAsFactors = FALSE)
  }))
  rownames(z) <- NULL
  z
}

# Each dimension declares what a participant needs before they belong on that chart.
PEER_DIMENSIONS <- list(
  list(key = "onset",       label = "Usual bedtime",            unit = "clock",  gate = "nights",    hint = "Median start of the main sleep"),
  list(key = "onset_sd",    label = "Bedtime regularity (SD)",  unit = "hour",   gate = "nights",    hint = "Standard deviation of bedtime; smaller = more regular"),
  list(key = "sleep",       label = "Usual sleep length",       unit = "hour",   gate = "nights",    hint = "Median main-sleep length"),
  list(key = "efficiency",  label = "Sleep efficiency",         unit = "pct",    gate = "nights",    hint = "Minutes asleep ÷ (asleep + awake), median"),
  list(key = "rhr",         label = "Resting heart rate",       unit = "bpm",    gate = "rhr",       hint = "Median Fitbit daily estimate"),
  list(key = "week_load",   label = "Weekly training load",     unit = "load",   gate = "load_rows", hint = "Reported load ÷ weeks on record"),
  list(key = "rpe",         label = "How hard sessions felt (RPE)", unit = "rpe", gate = "load_rows", hint = "Median session RPE (1–10)"),
  list(key = "snack_pct",   label = "Late snack",               unit = "pct100", gate = "forms",     hint = "Share of days with the Evening meal ticked"),
  list(key = "alcohol_pct", label = "Alcohol",                  unit = "pct100", gate = "forms",     hint = "Share of days with alcohol reported"),
  list(key = "readiness",   label = "Usual readiness",          unit = "score",  gate = "none",      hint = "Median self-rated readiness (0–10)")
)

peer_eligible <- function(prof, gate) {
  switch(gate,
    nights = prof$nights >= PEER_MIN_SLEEP_NIGHTS,
    load_rows = prof$load_rows >= PEER_MIN_SESSIONS,
    forms = prof$forms >= PEER_MIN_FORMS,
    rhr = is.finite(prof$rhr),
    rep(TRUE, nrow(prof)))
}

peer_value_label <- function(v, unit) {
  if (!is.finite(v)) return("—")
  switch(unit,
    clock = clock_label(v),
    hour = paste0(formatC(v, format = "f", digits = 1), " h"),
    pct = paste0(formatC(100 * v, format = "f", digits = 1), "%"),
    pct100 = paste0(formatC(v, format = "f", digits = 0), "% of days"),
    bpm = paste0(formatC(v, format = "f", digits = 1), " bpm"),
    load = paste0(format(round(v), big.mark = ","), " /week"),
    rpe = formatC(v, format = "f", digits = 1),
    score = paste0(formatC(v, format = "f", digits = 1), "/10"),
    formatC(v, format = "f", digits = 1))
}

# Long table for the strip chart: one row per comparable participant per dimension.
build_peer_long <- function(prof) {
  do.call(rbind, lapply(PEER_DIMENSIONS, function(dm) {
    ok <- peer_eligible(prof, dm$gate) & is.finite(prof[[dm$key]])
    if (sum(ok) < 3) return(NULL)
    p <- prof[ok, , drop = FALSE]
    data.frame(key = dm$key, label = dm$label, unit = dm$unit, hint = dm$hint,
               participant = p$participant, value = p[[dm$key]],
               n = sum(ok), stringsAsFactors = FALSE)
  }))
}

# Who is left out of which comparison, and why — shown on screen, never silently dropped.
peer_exclusions <- function(prof) {
  reasons <- list()
  add <- function(who, why) if (length(who)) reasons[[length(reasons) + 1]] <<-
    data.frame(who = paste(toupper(who), collapse = ", "), why = why, stringsAsFactors = FALSE)
  add(prof$participant[prof$nights < PEER_MIN_SLEEP_NIGHTS],
      paste0("the four sleep rows: fewer than ", PEER_MIN_SLEEP_NIGHTS, " main-sleep nights"))
  add(prof$participant[prof$load_rows < PEER_MIN_SESSIONS],
      paste0("training load and RPE: fewer than ", PEER_MIN_SESSIONS, " sessions with a load"))
  add(prof$participant[prof$forms < PEER_MIN_FORMS],
      paste0("late snack and alcohol: fewer than ", PEER_MIN_FORMS, " questionnaire days"))
  add(prof$participant[!is.finite(prof$rhr)], "resting heart rate: no daily estimates")
  if (!length(reasons)) return(NULL)
  do.call(rbind, reasons)
}
