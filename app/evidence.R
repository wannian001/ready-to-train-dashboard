# What went with "how ready you feel today"? Everything here is descriptive and computed from the
# delivered CSVs at start-up. Correlations and contrasts are within-person (each participant's own
# mean removed) so that differences BETWEEN people cannot create or hide a day-to-day association.

# PMSys wellness answers run 1-5 with 3 = "same as usual"; a LOWER score is the worse state
# (for soreness: 1 = very sore, 5 = feeling great). The first band is "no session reported the
# day before" -- not a confirmed rest day. A reported session with a blank load belongs to no band.
SORENESS_BANDS <- c(-1, 0, 199, 399, Inf)
SORENESS_LABELS <- c("No session reported", "Light load 1–199", "Moderate load 200–399", "Heavy load 400+")

# ---- Per participant-day: yesterday's load, last night's sleep, and two 7-day summaries ----
build_evidence_frame <- function(daily, episodes, training = NULL) {
  main <- episodes[(episodes$main_sleep %in% c(TRUE, "TRUE")) & is.finite(episodes$start_hour), , drop = FALSE]
  main$date <- as.Date(main$date)
  # fold clock hours onto a midnight-centred axis so 23:30 and 00:30 sit next to each other
  main$onset <- ifelse(main$start_hour > 12, main$start_hour - 24, main$start_hour)
  out <- lapply(split(daily, daily$participant), function(z) {
    z <- z[order(z$date), , drop = FALSE]
    own <- main[main$participant == z$participant[1], , drop = FALSE]
    need <- stats::median(z$sleep_hours, na.rm = TRUE)
    tr <- if (is.null(training)) NULL else training[training$participant == z$participant[1], , drop = FALSE]
    at <- if (is.null(tr)) rep(NA_integer_, nrow(z)) else match(z$date - 1, tr$date)
    # yesterday: no report -> 0 (the "no session" band); reported with a blank load -> unknown (NA)
    z$load_prev <- ifelse(is.na(at), 0, tr$load[at])
    z$load_prev[!(z$date - 1) %in% z$date] <- NA_real_
    z$sleep_prev <- c(NA_real_, utils::head(z$sleep_hours, -1))
    z$mean5 <- c(NA_real_, utils::head(as.numeric(stats::filter(z$readiness, rep(1 / 5, 5), sides = 1)), -1))
    z$balance7 <- vapply(z$date, function(t) {
      w <- z$sleep_hours[z$date < t & z$date >= t - 7]; w <- w[is.finite(w)]
      if (length(w) < 4) NA_real_ else sum(w - need)
    }, numeric(1))
    z$onset_sd7 <- vapply(z$date, function(t) {
      w <- own$onset[own$date < t & own$date >= t - 7]; w <- w[is.finite(w)]
      if (length(w) < 4) NA_real_ else stats::sd(w)
    }, numeric(1))
    z
  })
  z <- do.call(rbind, out); rownames(z) <- NULL
  z$load_band <- cut(z$load_prev, SORENESS_BANDS, labels = SORENESS_LABELS)
  z
}

# ---- Within-person correlation with a 95% interval ----
within_person_r <- function(x, y, g) {
  ok <- is.finite(x) & is.finite(y)
  x <- x[ok]; y <- y[ok]; g <- g[ok]
  if (length(x) < 30) return(list(n = length(x), r = NA_real_, lo = NA_real_, hi = NA_real_))
  cx <- x - stats::ave(x, g, FUN = mean)
  cy <- y - stats::ave(y, g, FUN = mean)
  if (stats::sd(cx) < 1e-9 || stats::sd(cy) < 1e-9) return(list(n = length(x), r = NA_real_, lo = NA_real_, hi = NA_real_))
  ct <- stats::cor.test(cx, cy)
  list(n = length(x), r = unname(ct$estimate), lo = ct$conf.int[1], hi = ct$conf.int[2])
}

EVIDENCE_CANDIDATES <- list(
  list(key = "mean5",     outcome = "readiness", cause = "average of the last 5 check-ins", effect = "today's readiness"),
  list(key = "load_prev", outcome = "soreness",  cause = "yesterday's training load",       effect = "today's soreness answer"),
  list(key = "load_prev", outcome = "readiness", cause = "yesterday's training load",       effect = "today's readiness"),
  list(key = "sleep_prev", outcome = "readiness", cause = "hours slept last night",         effect = "today's readiness"),
  list(key = "balance7",  outcome = "readiness", cause = "sleep balance over 7 days",        effect = "today's readiness"),
  list(key = "onset_sd7", outcome = "readiness", cause = "bedtime regularity over 7 days",   effect = "today's readiness")
)

build_candidates <- function(z) {
  rows <- lapply(EVIDENCE_CANDIDATES, function(c) {
    e <- within_person_r(z[[c$key]], z[[c$outcome]], z$participant)
    visible <- is.finite(e$lo) && is.finite(e$hi) && (e$lo > 0 || e$hi < 0)
    data.frame(key = c$key, outcome = c$outcome, cause = c$cause, effect = c$effect, label = paste0(c$cause, " → ", c$effect),
               n = e$n, r = e$r, lo = e$lo, hi = e$hi, visible = visible, stringsAsFactors = FALSE)
  })
  do.call(rbind, rows)
}

# ---- Yesterday's load vs this morning's soreness answer ----
load_soreness_summary <- function(z) {
  k <- z[is.finite(z$soreness) & !is.na(z$load_band), , drop = FALSE]
  do.call(rbind, lapply(SORENESS_LABELS, function(b) {
    one <- k[k$load_band == b, , drop = FALSE]
    n <- nrow(one); if (!n) return(NULL)
    p <- mean(one$soreness <= 2); se <- sqrt(p * (1 - p) / n)
    counts <- vapply(1:5, function(v) sum(one$soreness == v), numeric(1))
    data.frame(band = b, n = n, worse = p,
               lo = max(0, p - 1.96 * se), hi = min(1, p + 1.96 * se),
               s1 = counts[1], s2 = counts[2], s3 = counts[3], s4 = counts[4], s5 = counts[5],
               stringsAsFactors = FALSE)
  }))
}

load_soreness_shares <- function(sum_tbl) {
  levels_lab <- names(SORENESS_FILL)
  do.call(rbind, lapply(seq_len(nrow(sum_tbl)), function(i) {
    r <- sum_tbl[i, ]; counts <- as.numeric(r[c("s1", "s2", "s3", "s4", "s5")])
    data.frame(band = r$band, level = factor(levels_lab, levels = levels_lab),
               count = counts, share = counts / r$n, n = r$n, stringsAsFactors = FALSE)
  }))
}

# Where one participant-day sits. Only the load band is returned: the same day's soreness answer
# belongs to the hidden check-in and is added by the page only after it has been revealed.
focal_load_band <- function(z, participant, day) {
  r <- z[z$participant == participant & z$date == as.Date(day), , drop = FALSE]
  if (!nrow(r)) return(NULL)
  if (!is.finite(r$load_prev[1])) return(list(band = NA_character_, load = NA_real_,
    status = if (!(as.Date(day) - 1) %in% z$date[z$participant == participant]) "no record for the day before" else "a session was reported the day before, but its load is blank"))
  list(band = as.character(r$load_band[1]), load = r$load_prev[1], status = "ok")
}

# ---- What had happened by this morning, and how such days usually went ----
# Target is the SAME day's readiness. Only TRACKED signals are used (training log and Fitbit):
# self-reports are what the dashboard checks against, so they are never an input. Every condition
# is estimated on its own (within-person) with a participant-clustered 95% interval, and the family
# carries one Benjamini-Hochberg correction. The conditions overlap, so the separate estimates are
# never added up. "Usual" is the participant's median over the whole study (retrospective).
TODAY_LAYERS <- c("Past 7 days", "2 days ago", "Yesterday", "Last night")
SAME_FORM_LAYER <- "Same check-in"   # kept only so older code paths can test for it; no factor uses it
TODAY_FACTOR_SPECS <- list(
  list(key = "wk_high",   layer = "Past 7 days", label = "Past 7 days: more training load than usual",
       detail = "Known load over the previous 7 days above the participant's median; unknown if any load is blank"),
  list(key = "rep2",      layer = "2 days ago", label = "Trained 2 days ago", detail = "PMSys training log; no report is not a confirmed rest day"),
  list(key = "strength2", layer = "2 days ago", label = "Strength session 2 days ago", detail = "Activity tags include strength (multi-label)"),
  list(key = "big2",      layer = "2 days ago", label = "Load of 400+ two days ago", detail = "Minutes × RPE; blank load is unknown"),
  list(key = "rep1",      layer = "Yesterday", label = "Trained yesterday", detail = "PMSys training log; no report is not a confirmed rest day"),
  list(key = "big1",      layer = "Yesterday", label = "Load of 400+ yesterday", detail = "Minutes × RPE; blank load is unknown"),
  list(key = "strength1", layer = "Yesterday", label = "Strength session yesterday", detail = "Activity tags include strength (multi-label)"),
  list(key = "running1",  layer = "Yesterday", label = "Ran yesterday", detail = "Activity tags include running (multi-label)"),
  list(key = "team1",     layer = "Yesterday", label = "Team sport yesterday", detail = "Activity tags include team or soccer (multi-label)"),
  list(key = "late0",     layer = "Last night", label = "Went to bed 1 h+ later than usual", detail = "Fitbit bedtime more than 1 h after the participant's median"),
  list(key = "short0",    layer = "Last night", label = "Slept 1 h+ less than usual", detail = "Fitbit main sleep more than 1 h below the participant's median"),
  list(key = "under7",    layer = "Last night", label = "Slept under 7 hours", detail = "Fitbit main sleep < 7 h (absolute)"),
  list(key = "awake0",    layer = "Last night", label = "More time awake in the night than usual", detail = "Awake minutes above the participant's median (Fitbit)")
)

build_today_frame <- function(daily, episodes, training) {
  main <- episodes[(episodes$main_sleep %in% c(TRUE, "TRUE")) & is.finite(episodes$start_hour), , drop = FALSE]
  main$date <- as.Date(main$date)
  main$onset <- ifelse(main$start_hour > 12, main$start_hour - 24, main$start_hour)
  worse <- function(v) ifelse(is.finite(v), as.numeric(v <= 2), NA_real_)
  z <- do.call(rbind, lapply(split(daily, daily$participant), function(z) {
    z <- z[order(z$date), , drop = FALSE]
    own <- main[main$participant == z$participant[1], , drop = FALSE]
    tr <- if (is.null(training)) NULL else training[training$participant == z$participant[1], , drop = FALSE]
    lag <- function(v, k) v[match(z$date - k, z$date)]
    tk <- function(col, k) { at <- if (is.null(tr)) rep(NA_integer_, nrow(z)) else match(z$date - k, tr$date)
      if (col == "reported") !is.na(at) else tr[[col]][at] }
    inside <- function(k) (z$date - k) %in% z$date
    for (k in 1:2) {
      rep <- tk("reported", k); ld <- tk("load", k)
      z[[paste0("rep", k)]] <- ifelse(inside(k), as.numeric(rep), NA_real_)
      z[[paste0("big", k)]] <- ifelse(!inside(k), NA_real_, ifelse(!rep, 0, ifelse(is.finite(ld), as.numeric(ld >= 400), NA_real_)))
      for (ty in c("strength", "running", "team")) {
        v <- tk(ty, k); z[[paste0(ty, k)]] <- ifelse(inside(k), as.numeric(rep & !is.na(v) & v), NA_real_)
      }
      z[[paste0("stress", k)]] <- worse(lag(z$stress, k))
    }
    z$tired1 <- worse(lag(z$fatigue, 1)); z$sq1 <- worse(lag(z$sleep_quality, 1)); z$sore1 <- worse(lag(z$soreness, 1))
    z$wk_load <- vapply(z$date, function(t) {
      if (sum(z$date >= t - 7 & z$date <= t - 1) < 7) return(NA_real_)
      w <- if (is.null(tr)) tr else tr[tr$date >= t - 7 & tr$date <= t - 1, , drop = FALSE]
      if (is.null(w) || !nrow(w)) return(0)
      if (any(!is.finite(w$load))) NA_real_ else sum(w$load)
    }, numeric(1))
    z$onset <- own$onset[match(z$date, own$date)]
    z
  }))
  rownames(z) <- NULL
  own_med <- function(v) stats::ave(v, z$participant, FUN = function(x) stats::median(x, na.rm = TRUE))
  z$onset_usual <- own_med(z$onset); z$sleep_usual <- own_med(z$sleep_hours)
  z$awake_usual <- own_med(z$awake_minutes); z$wk_usual <- own_med(z$wk_load)
  z$wk_high <- as.numeric(z$wk_load > z$wk_usual)
  z$late0 <- as.numeric(z$onset > z$onset_usual + 1)
  z$short0 <- as.numeric(z$sleep_hours < z$sleep_usual - 1)
  z$under7 <- as.numeric(z$sleep_hours < 7)
  z$awake0 <- as.numeric(z$awake_minutes > z$awake_usual)
  z$tired0 <- worse(z$fatigue); z$mood0 <- worse(z$mood); z$sq0 <- worse(z$sleep_quality)
  z$sore0 <- worse(z$soreness); z$stress0 <- worse(z$stress)
  z
}

# One within-person contrast: both arms need enough days before the estimate means anything.
# Within-person contrast with a participant-clustered (CR1) standard error. Days from the same
# person are not independent (habits persist from day to day), so an ordinary regression standard
# error is too small. The interval uses t with (people - 1) degrees of freedom, where "people" are
# the participants who contribute both kinds of day. Days are pooled, so people with more records
# weigh more.
within_contrast <- function(y, x, g) {
  cy <- y - stats::ave(y, g, FUN = mean); cx <- x - stats::ave(x, g, FUN = mean)
  b <- sum(cx * cy) / sum(cx^2); u <- cy - b * cx
  contributing <- tapply(cx, g, function(v) any(abs(v) > 1e-12))
  G <- sum(contributing, na.rm = TRUE); N <- length(y)
  if (G < 3) return(list(effect = b, lo = NA_real_, hi = NA_real_, p = NA_real_))
  v <- sum(tapply(cx * u, g, sum)^2) / sum(cx^2)^2 * G / (G - 1) * (N - 1) / (N - 2)
  se <- sqrt(v); tq <- stats::qt(.975, G - 1)
  list(effect = b, lo = b - tq * se, hi = b + tq * se, p = 2 * stats::pt(-abs(b / se), G - 1))
}

within_effect <- function(frame, key, target = "readiness", min_arm = 40) {
  ok <- is.finite(frame[[target]]) & is.finite(frame[[key]])
  k <- frame[ok, , drop = FALSE]; x <- k[[key]]
  both <- tapply(x, k$participant, function(v) any(v == 1) && any(v == 0))
  out <- list(n = nrow(k), yes = sum(x == 1), people = sum(both, na.rm = TRUE),
              effect = NA_real_, lo = NA_real_, hi = NA_real_, p = NA_real_)
  if (nrow(k) < 80 || sum(x == 1) < min_arm || sum(x == 0) < min_arm) return(out)
  e <- within_contrast(k[[target]], x, k$participant)
  out[c("effect", "lo", "hi", "p")] <- e[c("effect", "lo", "hi", "p")]
  out
}

estimate_today_factors <- function(frame) {
  out <- do.call(rbind, lapply(TODAY_FACTOR_SPECS, function(s) {
    e <- within_effect(frame, s$key)
    data.frame(key = s$key, layer = s$layer, label = s$label, detail = s$detail,
               n = e$n, yes = e$yes, people = e$people, effect = e$effect, lo = e$lo, hi = e$hi,
               p = e$p, stringsAsFactors = FALSE)
  }))
  out$p_bh <- stats::p.adjust(out$p, method = "BH")
  out$clear <- is.finite(out$p_bh) & out$p_bh < .05
  out$verdict <- ifelse(!is.finite(out$effect), "Too few days to estimate",
    ifelse(out$clear, paste0("Clear link (BH-adjusted p < .05) · readiness ", ifelse(out$effect > 0, "higher", "lower"), " on average"),
           "No clear link"))
  out
}

# Which conditions held on one day. The same-check-in layer stays unknown until the day is revealed:
# those answers were written on the same form as the hidden readiness score.
today_factor_state <- function(frame, effects, participant, day, revealed = FALSE) {
  r <- frame[frame$participant == participant & frame$date == as.Date(day), , drop = FALSE]
  if (!nrow(r)) return(NULL)
  e <- effects
  e$value <- vapply(e$key, function(k) as.numeric(r[[k]][1]), numeric(1))
  e$locked <- e$layer == SAME_FORM_LAYER & !revealed
  e$value[e$locked] <- NA_real_
  e$state <- ifelse(e$locked, "shown after reveal", ifelse(!is.finite(e$value), "unknown (no record)",
    ifelse(e$value == 1, "true", "not true")))
  attr(e, "row") <- r
  e
}
