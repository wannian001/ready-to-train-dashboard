# "On days when this happened, was the next morning's check-in any different?"
# Each everyday choice is estimated separately from the delivered CSVs: the condition as the
# predictor, TOMORROW's readiness as the outcome, each participant's own mean removed so that
# differences between people cannot create or hide a day-to-day association. 18 conditions are
# tested, so the p-values carry one Benjamini-Hochberg correction.
#
# The conditions OVERLAP ("late snack" and "dinner without a late snack" are the same records read
# two ways), so their estimates must never be summed. Each row answers its own question.
#
# Timing. Fitbit dates a sleep by the morning it ENDS. "Tonight's sleep" after day d is therefore
# the record dated d+1, and that is what the sleep conditions read; the same record sits right
# before the d+1 check-in. The questionnaire has no meal clock times: "Evening" is a ticked meal
# category, not a measured time before bed. A day with no session is "not reported", not rest.

# raw_meals lists the meals actually reported that day, e.g. "Breakfast, Lunch, Dinner, Evening".
# PMSys keeps Dinner (the meal) and Evening (the late snack) apart, which is what lets the
# "dinner but no late snack" condition exist at all.
parse_meals <- function(q) {
  raw <- ifelse(is.na(q$raw_meals), "", q$raw_meals)
  q$m_breakfast <- as.numeric(grepl("Breakfast", raw, fixed = TRUE))
  q$m_lunch     <- as.numeric(grepl("Lunch", raw, fixed = TRUE))
  q$m_dinner    <- as.numeric(grepl("Dinner", raw, fixed = TRUE))
  q$m_evening   <- as.numeric(grepl("Evening", raw, fixed = TRUE))
  q$m_count     <- q$m_breakfast + q$m_lunch + q$m_dinner + q$m_evening
  q
}

load_questionnaire_days <- function(directory = ".") {
  path <- file.path(directory, "questionnaires.csv")
  if (!file.exists(path)) return(NULL)
  q <- read.csv(path, stringsAsFactors = FALSE, na.strings = "")
  q$date <- as.Date(q$date)
  # same eligibility rule the rest of the dashboard already uses
  q <- q[!is.na(q$eligible) & q$eligible == 1 &
         (is.na(q$conflict) | q$conflict == 0) &
         (is.na(q$time_anomaly) | q$time_anomaly == 0), , drop = FALSE]
  parse_meals(q)
}

# One row per participant-day carrying every condition plus tomorrow's readiness.
build_lever_frame <- function(daily, episodes, questionnaires, training) {
  m <- episodes[(episodes$main_sleep %in% c(TRUE, "TRUE")) & is.finite(episodes$start_hour), , drop = FALSE]
  m$date <- as.Date(m$date)
  m$onset <- ifelse(m$start_hour > 12, m$start_hour - 24, m$start_hour)
  z <- do.call(rbind, lapply(split(daily, daily$participant), function(z) {
    z <- z[order(z$date), , drop = FALSE]
    own <- m[m$participant == z$participant[1], , drop = FALSE]
    qq <- if (is.null(questionnaires)) NULL else questionnaires[questionnaires$participant == z$participant[1], , drop = FALSE]
    tr <- if (is.null(training)) NULL else training[training$participant == z$participant[1], , drop = FALSE]
    # tonight = the main sleep that ends on the next calendar date
    tonight <- z$date + 1
    z$onset_tonight <- own$onset[match(tonight, own$date)]
    z$sleep_tonight <- z$sleep_hours[match(tonight, z$date)]
    z$awake_tonight <- z$awake_minutes[match(tonight, z$date)]
    for (v in c("m_breakfast", "m_lunch", "m_dinner", "m_evening", "m_count", "alcohol", "fluid_cups"))
      z[[v]] <- if (is.null(qq)) NA_real_ else qq[[v]][match(z$date, qq$date)]
    at <- if (is.null(tr)) rep(NA_integer_, nrow(z)) else match(z$date, tr$date)
    z$reported <- !is.na(at)
    z$load <- ifelse(is.na(at), NA_real_, tr$load[at])   # NA = not reported, or reported with a blank load
    z$target <- z$readiness[match(tonight, z$date)]      # tomorrow's self-report
    z
  }))
  rownames(z) <- NULL
  own <- function(v) stats::ave(v, z$participant, FUN = function(x) stats::median(x, na.rm = TRUE))
  z$lv_sleep9   <- as.numeric(z$sleep_tonight >= 9)
  z$lv_sleep8   <- as.numeric(z$sleep_tonight >= 8)
  z$lv_sleep7   <- as.numeric(z$sleep_tonight >= 7)
  z$lv_early    <- as.numeric(z$onset_tonight < own(z$onset_tonight) - 1)
  z$lv_late     <- as.numeric(z$onset_tonight > own(z$onset_tonight) + 1)
  z$lv_calm     <- as.numeric(z$awake_tonight < own(z$awake_tonight))
  z$lv_bfast    <- z$m_breakfast
  z$lv_lunch    <- z$m_lunch
  z$lv_dinner   <- z$m_dinner
  z$lv_snack    <- z$m_evening
  z$lv_nosnack  <- as.numeric(z$m_dinner == 1 & z$m_evening == 0)
  z$lv_three    <- as.numeric(z$m_count == 3 & z$m_evening == 0)
  z$lv_alcohol  <- z$alcohol
  z$lv_water    <- as.numeric(z$fluid_cups > own(z$fluid_cups))
  z$lv_walk10k  <- as.numeric(z$steps >= 10000)
  z$lv_walk12k  <- as.numeric(z$steps >= 12000)
  z$lv_rest     <- as.numeric(!z$reported)
  known <- z$reported & is.finite(z$load)
  usual <- own(ifelse(known, z$load, NA_real_))
  z$lv_easy     <- ifelse(!z$reported, 0, ifelse(known, as.numeric(z$load < usual), NA_real_))
  z$lv_sore     <- as.numeric(z$soreness <= 2)
  z
}

LEVER_GROUP_LEVELS <- c("Tonight's sleep", "During the day: food & drink", "During the day: activity", "Reference: states, not choices")
LEVER_GROUP_SHORT <- setNames(c("sleep", "food & drink", "activity", "reference state"), LEVER_GROUP_LEVELS)   # tags when rows are sorted
LEVER_SPECS <- list(
  list(key="lv_late",    label="Go to bed 1 h+ later than usual",   group="Tonight's sleep", detail="Bedtime that night (Fitbit) is more than 1 hour later than the participant's own median bedtime"),
  list(key="lv_early",   label="Go to bed 1 h+ earlier than usual", group="Tonight's sleep", detail="Bedtime that night (Fitbit) is more than 1 hour earlier than the participant's own median bedtime"),
  list(key="lv_sleep9",  label="Sleep 9 h or more",                 group="Tonight's sleep", detail="Main sleep ≥ 9 h; 9, 8 and 7 h are nested thresholds, not separate groups"),
  list(key="lv_sleep8",  label="Sleep 8 h or more",                 group="Tonight's sleep", detail="Main sleep ≥ 8 h"),
  list(key="lv_sleep7",  label="Sleep 7 h or more",                 group="Tonight's sleep", detail="Main sleep ≥ 7 h"),
  list(key="lv_nosnack", label="Dinner, no late snack",             group="During the day: food & drink", detail="Ticked Dinner, not Evening; the form has no meal times, so this is not 'nothing before bed'"),
  list(key="lv_three",   label="Three meals, no late snack",        group="During the day: food & drink", detail="Ticked breakfast, lunch and dinner, not Evening"),
  list(key="lv_snack",   label="Late snack (Evening meal ticked)",  group="During the day: food & drink", detail="Ticked the Evening meal category; no clock time"),
  list(key="lv_bfast",   label="Breakfast",                         group="During the day: food & drink", detail="Ticked Breakfast"),
  list(key="lv_lunch",   label="Lunch",                             group="During the day: food & drink", detail="Ticked Lunch"),
  list(key="lv_alcohol", label="Drank alcohol",                     group="During the day: food & drink", detail="Answered yes to alcohol; 'maybe' or no answer is unknown"),
  list(key="lv_water",   label="More glasses of fluid than usual",  group="During the day: food & drink", detail="Glasses above the participant's median"),
  list(key="lv_rest",    label="No training logged today",        group="During the day: activity", detail="No PMSys session; not a confirmed rest day"),
  list(key="lv_easy",    label="Trained, lighter load than usual",  group="During the day: activity", detail="Known load below the participant's median session load; blank load is unknown"),
  list(key="lv_walk10k", label="10,000+ steps recorded",            group="During the day: activity", detail="Steps over recorded minutes; depends on how long the band recorded steps"),
  list(key="lv_walk12k", label="12,000+ steps recorded",            group="During the day: activity", detail="Steps over recorded minutes; depends on how long the band recorded steps"),
  list(key="lv_calm",    label="Less time awake in the night than usual", group="Reference: states, not choices", detail="Awake minutes below the participant's median; not fully under the participant's control"),
  list(key="lv_sore",    label="Felt sorer than usual today",       group="Reference: states, not choices", detail="Soreness answer 1–2; a state for comparison, not something to choose")
)

estimate_levers <- function(frame) {
  rows <- lapply(LEVER_SPECS, function(s) {
    ok <- is.finite(frame$target) & is.finite(frame[[s$key]])
    k <- frame[ok, , drop = FALSE]; x <- k[[s$key]]
    blank <- data.frame(key = s$key, label = s$label, group = s$group, detail = s$detail,
                        n = nrow(k), yes = sum(x == 1, na.rm = TRUE), effect = NA_real_,
                        lo = NA_real_, hi = NA_real_, p = NA_real_, stringsAsFactors = FALSE)
    # both arms need enough days before a within-person contrast means anything
    if (nrow(k) < 80 || sum(x == 1) < 40 || sum(x == 0) < 40) return(blank)
    e <- within_contrast(k$target, x, k$participant)   # participant-clustered interval (evidence.R)
    blank$effect <- e$effect; blank$lo <- e$lo; blank$hi <- e$hi; blank$p <- e$p
    blank
  })
  out <- do.call(rbind, rows); rownames(out) <- NULL
  out$p_bh <- stats::p.adjust(out$p, method = "BH")
  out$effective <- is.finite(out$p_bh) & out$p_bh < .05
  # "clear of zero after correction" is a statistical threshold, not a switch on a physiological effect
  out$verdict <- ifelse(!is.finite(out$effect), "Too few days to estimate",
                 ifelse(out$effective, ifelse(out$effect > 0, "Clear link (BH-adjusted p < .05) · next morning higher on average", "Clear link (BH-adjusted p < .05) · next morning lower on average"),
                        "No clear link"))
  out$people <- vapply(out$key, function(k) {
    ok <- is.finite(frame$target) & is.finite(frame[[k]])
    both <- tapply(frame[[k]][ok], frame$participant[ok], function(v) any(v == 1) && any(v == 0))
    sum(both, na.rm = TRUE)
  }, numeric(1))
  out[order(-out$effective, out$p), , drop = FALSE]
}

# ---- "Clear link" versus the drawn interval ----
# A clear link is decided by the BH-adjusted p-value. The drawn 95% intervals are clustered by
# participant but NOT adjusted for the number of tests, so a row can have an interval that stays
# clear of zero and still not be a clear link. The verdict says so on that row, and
# bh_interval_note() writes the matching sentence under each interval chart from the live estimates.
interval_clears_zero <- function(d) is.finite(d$lo) & is.finite(d$hi) & (d$lo > 0 | d$hi < 0)
p_short <- function(p) ifelse(is.finite(p), sub("^0[.]", ".", formatC(p, format = "f", digits = 3)), "—")
explain_verdict <- function(d, clear) ifelse(!clear & interval_clears_zero(d),
  paste0(d$verdict, ": BH-adjusted p = ", p_short(d$p_bh), ", not below .05, although the unadjusted interval excludes zero"), d$verdict)
bh_interval_note <- function(d, clear, what) {
  miss <- d[!clear & interval_clears_zero(d), , drop = FALSE]
  base <- paste0("A clear link needs a BH-adjusted p-value below .05: the Benjamini–Hochberg correction allows for testing ",
    sum(is.finite(d$p)), " ", what, " at once. It changes the p-values only; the lines are ordinary 95% intervals, not widened for it.")
  if (!nrow(miss)) return(paste(base, "Here every interval that stays clear of zero also passes the corrected test."))
  paste0(base, " So an interval can stay clear of zero and still miss the corrected threshold: ",
    paste0("“", miss$label, "” (interval ", deviation_label(miss$lo, 2L), " to ", deviation_label(miss$hi, 2L),
      ", BH-adjusted p = ", p_short(miss$p_bh), ")", collapse = " and "), ".")
}
