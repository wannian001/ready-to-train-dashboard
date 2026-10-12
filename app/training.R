# Training sessions, activity types and the cumulative load ledger.
# activity_names is a MULTI-label list per session (a session can be both "individual"
# and "running"), so types are flags, never exclusive categories. "individual" / "team"
# describe the setting rather than the modality and are kept apart from the four modalities.
TRAIN_TYPES <- c(running = "Running", endurance = "Endurance", strength = "Strength", team = "Team sport")

load_training_sessions <- function(directory = ".") {
  path <- file.path(directory, "training_sessions.csv")
  if (!file.exists(path)) return(NULL)
  t <- read.csv(path, stringsAsFactors = FALSE, na.strings = "")
  t$date <- as.Date(t$date)
  t$tags <- gsub("[][']", "", ifelse(is.na(t$activity_names), "", t$activity_names))
  t$running   <- grepl("running", t$tags, fixed = TRUE)
  t$endurance <- grepl("endurance", t$tags, fixed = TRUE)
  t$strength  <- grepl("strength", t$tags, fixed = TRUE)
  t$team      <- grepl("team", t$tags, fixed = TRUE) | grepl("soccer", t$tags, fixed = TRUE)
  t[order(t$participant, t$date), , drop = FALSE]
}

# One row per participant-day that has at least one session.
# A day with no row here is "no session reported", which is NOT a confirmed rest day.
# A reported session whose load was left blank keeps load = NA: blank is unknown, not zero.
daily_training <- function(sessions) {
  if (is.null(sessions) || !nrow(sessions)) return(NULL)
  # a day whose sessions are only partly filled in would be under-counted, so it stays unknown too
  total <- function(v) if (length(v) && all(is.finite(v))) sum(v) else NA_real_
  z <- do.call(rbind, lapply(split(sessions, list(sessions$participant, sessions$date), drop = TRUE),
    function(s) data.frame(
      participant = s$participant[1], date = s$date[1], sessions = nrow(s),
      load = total(s$reported_load),
      minutes = total(s$training_minutes),
      rpe = if (any(is.finite(s$reported_exertion))) max(s$reported_exertion, na.rm = TRUE) else NA_real_,
      running = any(s$running), endurance = any(s$endurance),
      strength = any(s$strength), team = any(s$team), stringsAsFactors = FALSE)))
  rownames(z) <- NULL
  z[order(z$participant, z$date), , drop = FALSE]
}

# ---- The cumulative ledger the student specified ----
# Start every participant at 100 on their first recorded day, then walk forward one day at a
# time: subtract what yesterday's session cost, add the day's recovery, clamp to 0-100.
# This is BOOKKEEPING WITH CHOSEN CONSTANTS, not a measurement: nothing in PMData records a
# body-energy level, so there is no ground truth to fit the two constants against. They are
# exposed as controls so the reader can see how much the shape depends on them.
# Recovery is a share of the gap back to full rather than a flat amount: a flat amount cannot
# suit both a participant with 113 sessions and one with 2.
# Defaults: 100 load uses 3 energy points; each day a quarter of the missing energy comes back.
BATTERY_DEFAULTS <- list(cost_per_100_load = 3, recovery_pct = 25)

battery_series <- function(daily, training, participant,
                           cost_per_100_load = BATTERY_DEFAULTS$cost_per_100_load,
                           recovery_pct = BATTERY_DEFAULTS$recovery_pct) {
  d <- daily[daily$participant == participant, , drop = FALSE]
  if (!nrow(d)) return(NULL)
  d <- d[order(d$date), , drop = FALSE]
  days <- seq(min(d$date), max(d$date), by = "day")
  tr <- if (is.null(training)) NULL else training[training$participant == participant, , drop = FALSE]
  # Rule of the ledger, stated on screen: a day without a reported session costs nothing, and a
  # reported session whose load is blank also costs nothing. Both are flagged, never shown as rest.
  load <- rep(0, length(days)); reported <- rep(FALSE, length(days)); unknown <- rep(FALSE, length(days))
  if (!is.null(tr) && nrow(tr)) {
    at <- match(tr$date, days)
    reported[at] <- TRUE
    unknown[at] <- !is.finite(tr$load)
    load[at] <- ifelse(is.finite(tr$load), tr$load, 0)
  }
  level <- numeric(length(days)); level[1] <- 100
  drain <- rep(0, length(days)); gain <- rep(0, length(days))
  for (i in seq_along(days)[-1]) {
    drain[i] <- load[i - 1] / 100 * cost_per_100_load   # yesterday's session is what costs you
    gain[i] <- (100 - level[i - 1]) * recovery_pct / 100
    level[i] <- max(0, min(100, level[i - 1] - drain[i] + gain[i]))
  }
  data.frame(date = days, level = level, drain = drain, gain = gain,
             load_prev = c(0, utils::head(load, -1)),
             reported_prev = c(FALSE, utils::head(reported, -1)),
             unknown_prev = c(FALSE, utils::head(unknown, -1)),
             readiness = d$readiness[match(days, d$date)],
             soreness = d$soreness[match(days, d$date)], stringsAsFactors = FALSE)
}

# How well the ledger tracks what the participant actually reported. Reported on screen so the
# model is never presented as validated: a low number is a real answer, not a bug.
battery_agreement <- function(series) {
  if (is.null(series) || !nrow(series)) return(NULL)
  fit <- function(v) {
    ok <- is.finite(series$level) & is.finite(v)
    # a flat series (e.g. a participant who never trained, or always answered 3) has no correlation
    if (sum(ok) < 30 || stats::sd(series$level[ok]) < 1e-9 || stats::sd(v[ok]) < 1e-9)
      return(list(n = sum(ok), r = NA_real_, lo = NA_real_, hi = NA_real_))
    ct <- stats::cor.test(series$level[ok], v[ok])
    list(n = sum(ok), r = unname(ct$estimate), lo = ct$conf.int[1], hi = ct$conf.int[2])
  }
  list(readiness = fit(series$readiness), soreness = fit(series$soreness))
}
# The ledger's conclusion, written from the two correlations of the current view. Both are stated side
# by side; one is called higher only when they differ by 0.1 or more, and a missing r is never compared.
battery_conclusion <- function(series, ag, who) {
  why <- function(v, e) {
    ok <- is.finite(series$level) & is.finite(v)
    if (e$n < 30) paste0("only ", e$n, " days have both") else if (stats::sd(series$level[ok]) < 1e-9) "the ledger stays flat" else "that answer never changes"
  }
  rr <- ag$readiness$r; rs <- ag$soreness$r
  wr <- why(series$readiness, ag$readiness); ws <- why(series$soreness, ag$soreness)
  if (!is.finite(rr) && !is.finite(rs)) return(paste0("For ", who, ", no correlation can be computed: ",
    if (identical(wr, ws)) wr else paste0(wr, " (readiness) and ", ws, " (soreness)"), "."))
  if (!is.finite(rr) || !is.finite(rs)) {
    have <- if (is.finite(rr)) "readiness" else "soreness"; miss <- setdiff(c("readiness", "soreness"), have)
    return(paste0("For ", who, ", the ledger correlates r = ", signed_num(if (is.finite(rr)) rr else rs, 2), " with ", have,
      "; with ", miss, " no r can be computed (", if (is.finite(rr)) ws else wr, ")."))
  }
  paste0("For ", who, ", the ledger correlates r = ", signed_num(rr, 2), " with readiness and r = ", signed_num(rs, 2), " with soreness: ",
    if (abs(rs - rr) < .1) "the two are within 0.1 of each other." else paste0("the ", if (rs > rr) "soreness" else "readiness", " r is ", fmt(abs(rs - rr), 2), " higher."))
}

# ---- Monthly review ----
# Types are multi-label, so the monthly total is counted once per session and each type is
# counted on its own; the type counts are never stacked into the total.
monthly_training <- function(sessions, participant, first = NULL, last = NULL) {
  if (is.null(sessions)) return(NULL)
  s <- sessions[sessions$participant == participant, , drop = FALSE]
  if (!nrow(s)) return(NULL)
  s$month <- as.Date(format(s$date, "%Y-%m-01"))
  covered <- function(m) {
    if (is.null(first) || is.null(last)) return(NA_integer_)
    span <- seq(m, seq(m, by = "month", length.out = 2)[2] - 1, by = "day")
    sum(span >= first & span <= last)
  }
  z <- do.call(rbind, lapply(split(s, s$month), function(m) data.frame(
    month = m$month[1], sessions = nrow(m),
    days_in_month = as.integer(format(seq(m$month[1], by = "month", length.out = 2)[2] - 1, "%d")),
    days_covered = covered(m$month[1]),
    minutes = sum(m$training_minutes, na.rm = TRUE),
    load = sum(m$reported_load, na.rm = TRUE),
    load_unknown = sum(!is.finite(m$reported_load)),
    rpe = if (any(is.finite(m$reported_exertion))) mean(m$reported_exertion, na.rm = TRUE) else NA_real_,
    untyped = sum(!(m$running | m$endurance | m$strength | m$team)),
    running = sum(m$running), endurance = sum(m$endurance),
    strength = sum(m$strength), team = sum(m$team), stringsAsFactors = FALSE)))
  rownames(z) <- NULL
  z[order(z$month), , drop = FALSE]
}
