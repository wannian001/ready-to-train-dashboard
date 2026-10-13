# training: the Today › Training detail and Today › Steps (activity) detail.
#   web/data/training/<id>.json   one participant: hourly steps (one 24-slot array per day of the record, null = no
#                                 record in that hour, a day with no record at all is null) with the minutes recorded
#                                 in each hour, and monthly_training() (training.R), the sessions per month
#   tests/fixtures/training.json  R's own values for tests/training.test.mjs: the energy ledger (battery_series,
#                                 battery_agreement, battery_conclusion) for several participants, days, reveal states
#                                 and settings; the training-load callout; the activity summary, lede and table
#
# The energy ledger depends on the reader's two numbers, so the page computes it (web/js/sections/training.js);
# everything that does not depend on the day or a control is exported here.

H <- APP_DATA$hourly
for (p in PIDS) {
  days <- person_days(p)
  h <- H[H$participant == p, , drop = FALSE]
  i <- match(as.Date(h$date), days)
  stopifnot(!anyNA(i))   # every hourly record falls inside the participant's record
  steps <- matrix(NA_real_, length(days), 24); minutes <- matrix(NA_real_, length(days), 24)
  steps[cbind(i, h$hour + 1L)] <- h$steps; minutes[cbind(i, h$hour + 1L)] <- h$observed_minutes
  as_days <- function(m) lapply(seq_len(nrow(m)), function(r) if (all(is.na(m[r, ]))) NULL else as.list(num(m[r, ], 0)))
  m <- monthly_training(SESSIONS, p, min(days), max(days))
  out_json(file.path("training", paste0(p, ".json")), list(
    id = p, first = day_str(days[1]), n = length(days),
    # steps[i] / minutes[i]: the day first + i, hour 0..23
    steps = as_days(steps), minutes = as_days(minutes),
    monthly = if (is.null(m)) list() else rows(transform(m, month = day_str(month), rpe = num(rpe, 4)))))
}

# ---- R reference values ----
pick_days <- function(p) {
  z <- person_rows(p); days <- person_days(p)
  no_checkin <- days[!is.finite(z$readiness)]
  sort(unique(c(days[1], days[2], days[min(10, length(days))], days[seq(15, length(days), by = 17)],
    utils::head(no_checkin, 2), as.Date(default_research_day(z)), max(days))))
}
SETTINGS <- list(c(3, 25), c(1, 5), c(10, 60), c(5.5, 40), c(2.5, 15))
ag_list <- function(e) list(n = e$n, r = num(e$r, 6), lo = num(e$lo, 6), hi = num(e$hi, 6))

battery <- list(); agreement <- list(); callout <- list(); activity <- list(); activity_rows <- list(); monthly_note <- list()
for (p in PIDS) {
  z <- person_rows(p); days <- person_days(p)
  # the ledger itself does not depend on the day (only the check-ins it is compared with do)
  b0 <- battery_series(z, TRAIN_DAYS, p)
  battery[[p]] <- list(load_prev = num(b0$load_prev, 4), reported_prev = flag(b0$reported_prev), unknown_prev = flag(b0$unknown_prev),
    table = day_str(b0$date[b0$reported_prev | seq_len(nrow(b0)) %% 7 == 1]),
    runs = lapply(SETTINGS, function(s) {
      b <- battery_series(z, TRAIN_DAYS, p, s[1], s[2])
      list(cost = s[1], recovery = s[2], level = num(b$level, 4), drain = num(b$drain, 4), gain = num(b$gain, 4))
    }))
  for (day in as.list(pick_days(p))) {
    for (rev in c(FALSE, TRUE)) {
      pv <- visible_person(z, day, rev)
      for (k in c(1, 4)) {
        s <- SETTINGS[[k]]
        b <- battery_series(pv, TRAIN_DAYS, p, s[1], s[2]); ag <- battery_agreement(b)
        agreement[[length(agreement) + 1]] <- list(id = p, day = day_str(day), revealed = rev, cost = s[1], recovery = s[2],
          readiness = ag_list(ag$readiness), soreness = ag_list(ag$soreness), conclusion = battery_conclusion(b, ag, toupper(p)))
      }
    }
    # the training-load callout on the selected day (locked) and on an inspected earlier day, for both ranges
    for (span in c(56L, 84L)) for (back in c(0L, 9L)) {
      pick <- day - back
      ct <- training_load_callout(TRAIN_DAYS, p, day, pick, span, min(z$date))
      txt <- function(tag) gsub("\\s+", " ", trimws(paste(htmltools::renderTags(tag)$html)))
      main <- ct$children[[1]]$children; facts <- ct$children[[2]]$children
      callout[[length(callout) + 1]] <- list(id = p, day = day_str(day), pick = day_str(pick), span = span,
        date = main[[1]]$children[[1]], words = main[[2]]$children[[1]], pct = main[[3]]$children[[1]],
        facts = vapply(facts, function(f) f$children[[1]], ""), open = !is.null(ct$children[[3]]))
    }
    # the activity summary, the heatmap lede and the table, for both ranges
    one <- function(n) {
      w <- z[z$date > day - n & z$date <= day, , drop = FALSE]; ok <- is.finite(w$steps)
      list(days = sum(ok), steps = num(if (any(ok)) mean(w$steps[ok]) else NA_real_, 6),
        minutes = num(if (any(ok & is.finite(w$step_minutes))) mean(w$step_minutes[ok & is.finite(w$step_minutes)]) else NA_real_, 6))
    }
    recs <- vapply(c(7L, 28L), function(span) nrow(H[H$participant == p & H$date > day - span & H$date <= day, , drop = FALSE]), 0L)
    activity[[length(activity) + 1]] <- list(id = p, day = day_str(day), s7 = one(7), s28 = one(28), records = recs)
  }
  # activity_table() rows for every day a 4-week window can reach (a row depends only on its date)
  dates <- seq(min(days) - 27L, max(days), by = "day")
  hh <- merge(expand.grid(date = dates, hour = 0:23), H[H$participant == p, c("date", "hour", "steps"), drop = FALSE], by = c("date", "hour"), all.x = TRUE)
  block <- function(one, lo, hi) { v <- one$steps[one$hour >= lo & one$hour <= hi]
    if (!any(is.finite(v))) "no record" else format(sum(v, na.rm = TRUE), big.mark = ",", trim = TRUE) }
  activity_rows[[p]] <- lapply(split(hh, hh$date), function(one)
    c(day_str(one$date[1]), block(one, 0, 5), block(one, 6, 11), block(one, 12, 17), block(one, 18, 23), as.character(sum(!is.finite(one$steps)))))
  names(activity_rows[[p]]) <- NULL
  m <- monthly_training(SESSIONS, p, min(days), max(days))
  monthly_note[[p]] <- if (is.null(m)) "This participant reported no sessions." else {
    busiest <- m[which.max(m$sessions), ]
    paste0(toupper(p), " logged ", sum(m$sessions), " sessions; the busiest month was ", month_label(busiest$month), " with ", busiest$sessions, ".")
  }
}
# the conclusion's rarer wordings, on series where one answer never changes (not in the data as it is)
synthetic <- lapply(list(c("p07", "soreness"), c("p07", "readiness"), c("p02", "both")), function(x) {
  b <- battery_series(person_rows(x[1]), TRAIN_DAYS, x[1])
  for (k in if (x[2] == "both") c("readiness", "soreness") else x[2]) b[[k]][is.finite(b[[k]])] <- 3
  ag <- battery_agreement(b)
  list(id = x[1], constant = x[2], conclusion = battery_conclusion(b, ag, toupper(x[1])))
})
ref_json("training.json", list(synthetic = synthetic, settings = SETTINGS, battery = battery, agreement = agreement, callout = callout,
  activity = activity, activity_rows = activity_rows, monthly_note = monthly_note))
