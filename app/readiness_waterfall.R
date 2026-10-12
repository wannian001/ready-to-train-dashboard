# Expected readiness: a personal level calibrated from the participant's own check-ins, plus a
# small adjustment from TRACKED signals (training log and Fitbit) only.
# Self-reports are the check, not an everyday input: the level takes ONE check-in per week from the
# four weeks before the most recent one, as if the app asked for a calibration check-in about once a
# week. The 13 tracked signals are fitted jointly in one strongly shrunk ridge regression. A signal
# that is unknown on a day (e.g. no sleep record) counts as its average -- the share of days it was
# true in the training data -- not as "not true".
# The fitted model is trained offline by train_readiness_waterfall.R; the app only loads it and
# checks it still matches its inputs.

# ---- Personal level: one calibration check-in per week ----
# The latest check-in in each of the four weeks dated 8-14, 15-21, 22-28 and 29-35 days before the
# day, averaged; the most recent week is held back. At least three of the four weeks are needed.
LEVEL_WEEKS <- 4L
LEVEL_MIN_WEEKS <- 3L
personal_level <- function(d, day) {
  day <- as.Date(day)
  ok <- d[is.finite(d$readiness), c("date", "readiness"), drop = FALSE]
  v <- do.call(rbind, lapply(seq_len(LEVEL_WEEKS) - 1L, function(w) {
    z <- ok[ok$date >= day - 14L - 7L * w & ok$date <= day - 8L - 7L * w, , drop = FALSE]
    if (nrow(z)) z[which.max(z$date), , drop = FALSE] else NULL
  }))
  n <- if (is.null(v)) 0L else nrow(v)
  list(n = n, value = if (n >= LEVEL_MIN_WEEKS) mean(v$readiness) else NA_real_,
       start = if (n) min(v$date) else as.Date(NA), end = if (n) max(v$date) else as.Date(NA))
}
# Reference only (method note): the same four weeks, but every check-in in them rather than one a
# week -- what a daily check-in habit would add to the usual level.
level_all_checkins <- function(d, day) {
  day <- as.Date(day)
  v <- d[d$date >= day - 35L & d$date <= day - 8L & is.finite(d$readiness), , drop = FALSE]
  if (nrow(v) >= 5) mean(v$readiness) else NA_real_
}
# Reference only (method note): the median of the five check-ins right before the day. It is a bit
# more accurate, but it predicts a feeling from the feelings just before it, which is what the
# dashboard is meant to check, not to use.
last5_median <- function(d, day) {
  v <- d[d$date < as.Date(day) & is.finite(d$readiness), , drop = FALSE]
  if (nrow(v) >= 5) stats::median(utils::tail(v$readiness[order(v$date)], 5)) else NA_real_
}

readiness_waterfall_specs <- function() TODAY_FACTOR_SPECS
readiness_waterfall_keys <- function() vapply(readiness_waterfall_specs(), function(x) x$key, character(1))

# One row per participant-day with a check-in: target, weekly level, two references, 13 signals.
build_readiness_waterfall_frame <- function(daily, today_frame) {
  keys <- readiness_waterfall_keys()
  z <- do.call(rbind, lapply(split(daily, daily$participant), function(d) {
    d <- d[order(d$date), , drop = FALSE]
    rows <- d[is.finite(d$readiness), , drop = FALSE]
    if (!nrow(rows)) return(NULL)
    data.frame(participant = rows$participant, target_date = rows$date, target = rows$readiness,
      level = vapply(rows$date, function(t) personal_level(d, t)$value, numeric(1)),
      level_all = vapply(rows$date, function(t) level_all_checkins(d, t), numeric(1)),
      last5 = vapply(rows$date, function(t) last5_median(d, t), numeric(1)), stringsAsFactors = FALSE)
  }))
  at <- match(paste(z$participant, z$target_date), paste(today_frame$participant, today_frame$date))
  z <- cbind(z, today_frame[at, keys, drop = FALSE])
  rownames(z) <- NULL
  z
}

# An unknown signal takes its training-data average (the share of known days it was true).
readiness_waterfall_matrix <- function(z, keys, fill) {
  x <- as.matrix(z[keys])
  storage.mode(x) <- "double"
  for (k in keys) { miss <- !is.finite(x[, k]); x[miss, k] <- fill[[k]] }
  x
}

fit_readiness_waterfall <- function(z, lambda, keys = readiness_waterfall_keys()) {
  stopifnot(nrow(z) > 30, all(is.finite(z$target)), is.finite(lambda), lambda > 0)
  fill <- vapply(keys, function(k) { v <- as.numeric(z[[k]]); mean(v[is.finite(v)]) }, numeric(1))
  x <- readiness_waterfall_matrix(z, keys, fill)
  residual <- z$target - z$level
  penalty <- diag(rep(lambda, length(keys)))
  beta <- as.numeric(solve(crossprod(x) + penalty, crossprod(x, residual)))
  names(beta) <- keys
  structure(list(beta = beta, fill = fill, lambda = lambda, keys = keys, n = nrow(z),
    training_start = min(z$target_date), training_end = max(z$target_date)),
    class = "pm_readiness_waterfall")
}

predict_readiness_waterfall <- function(model, z) {
  x <- readiness_waterfall_matrix(z, model$keys, model$fill)
  adjustment <- as.numeric(x %*% model$beta)
  raw <- z$level + adjustment
  data.frame(adjustment = adjustment, raw = raw,
    prediction = pmin(10, pmax(0, raw)))
}

readiness_waterfall_metric <- function(z, prediction, stage, method) {
  err <- prediction - z$target
  data.frame(stage = stage, method = method, n = length(err),
    mae = mean(abs(err)), rmse = sqrt(mean(err^2)),
    within_one = mean(abs(err) <= 1), bias = mean(err), stringsAsFactors = FALSE)
}

readiness_delta_label <- function(value) {
  if (!is.finite(value) || abs(value) < 1e-12) return("0.00")
  signed_num(value, if (abs(value) < .005) 3 else 2)
}

# The metadata records an MD5 of every file the model depends on. If data or modelling code
# changes without retraining, the page says so instead of showing stale numbers.
READINESS_MODEL_INPUTS <- c("daily.csv", "sleep_episodes.csv", "training_sessions.csv", "evidence.R",
  "readiness_waterfall.R", "train_readiness_waterfall.R")
load_readiness_waterfall <- function(directory = ".") {
  needed <- c("readiness_waterfall_model.rds", "readiness_waterfall_metrics.csv",
    "readiness_waterfall_metadata.json")
  if (!all(file.exists(file.path(directory, needed))))
    return(list(status = "missing", message = "The expected-readiness model has not been trained yet; run train_readiness_waterfall.R."))
  meta <- jsonlite::read_json(file.path(directory, "readiness_waterfall_metadata.json"), simplifyVector = TRUE)
  actual <- tools::md5sum(file.path(directory, names(meta$input_md5)))
  if (!identical(unname(as.character(actual)), unname(as.character(meta$input_md5))))
    return(list(status = "stale", message = "The model's inputs have changed; run train_readiness_waterfall.R again."))
  model <- readRDS(file.path(directory, "readiness_waterfall_model.rds"))
  metrics <- read.csv(file.path(directory, "readiness_waterfall_metrics.csv"), stringsAsFactors = FALSE)
  stopifnot(inherits(model, "pm_readiness_waterfall"), identical(model$keys, readiness_waterfall_keys()), !is.null(model$fill))
  list(status = "ready", model = model, metrics = metrics, metadata = meta)
}

readiness_waterfall_parts <- function(outputs, state, baseline) {
  if (is.null(state) || !is.list(outputs) || outputs$status != "ready" || !is.finite(baseline)) return(NULL)
  model <- outputs$model
  keys <- model$keys
  at <- match(keys, state$key)
  if (anyNA(at)) return(NULL)
  one <- state[at, , drop = FALSE]
  value <- as.numeric(one$value)
  known <- is.finite(value)
  held <- known & value == 1
  # true: the full weight; not true: nothing; unknown: the weight times how often it was true
  contribution <- ifelse(held, unname(model$beta[keys]), ifelse(known, 0, unname(model$beta[keys] * model$fill[keys])))
  before <- baseline + c(0, utils::head(cumsum(contribution), -1))
  after <- baseline + cumsum(contribution)
  stage <- ifelse(one$layer %in% c("Past 7 days", "2 days ago"), 1L, ifelse(one$layer == "Yesterday", 2L, 3L))   # 4 / 5 / 4 signals
  z <- data.frame(key = keys, layer = as.character(one$layer), label = one$label,
    detail = one$detail, state = one$state, value = value, known = known, held = held,
    number = seq_along(keys), axis = as.character(seq_along(keys)), stage = stage,
    stage_title = c("Past week & 2 days ago", "Yesterday", "Last night's sleep")[stage],
    contribution = contribution, before = before, after = after,
    segment_base = pmin(before, after), segment_height = abs(contribution), stringsAsFactors = FALSE)
  attr(z, "baseline") <- baseline
  attr(z, "adjustment") <- sum(contribution)
  attr(z, "raw_prediction") <- baseline + sum(contribution)
  attr(z, "prediction") <- pmin(10, pmax(0, attr(z, "raw_prediction")))
  z
}

readiness_waterfall_table <- function(parts) {
  if (is.null(parts) || !nrow(parts)) return(htmltools::p(class = "empty-note", "No tracked-signal adjustment for this day."))
  view_table("The 13 tracked signals in the order they are added; a not-true signal adds nothing, an unknown one adds its average (weight × share of days it was true)",
    c("No.", "Group", "Factor", "This day", "Step", "Estimate after step"),
    lapply(seq_len(nrow(parts)), function(i) list(as.character(parts$number[i]), parts$stage_title[i],
      parts$label[i], parts$state[i], readiness_delta_label(parts$contribution[i]), fmt(parts$after[i], 2))))
}

# Expected vs felt for a run of days (the main readiness chart). Felt values come from the rows
# passed in, so a hidden check-in stays hidden. Unknown signals take their training average.
expected_series <- function(outputs, d, frame, participant, dates) {
  model <- if (is.list(outputs) && identical(outputs$status, "ready")) outputs$model else NULL
  rows <- frame[frame$participant == participant, , drop = FALSE]
  do.call(rbind, lapply(dates, function(t) {
    lv <- personal_level(d, t)
    r <- rows[rows$date == t, , drop = FALSE]
    adj <- if (is.null(model) || !nrow(r)) NA_real_ else { x <- as.numeric(r[1, model$keys]); miss <- !is.finite(x); x[miss] <- model$fill[miss]; sum(x * model$beta) }
    felt <- d$readiness[d$date == t]
    data.frame(date = t, level = lv$value, adjustment = adj,
      expected = if (is.finite(lv$value) && is.finite(adj)) min(10, max(0, lv$value + adj)) else NA_real_,
      felt = if (length(felt)) felt[1] else NA_real_, stringsAsFactors = FALSE)
  }))
}
