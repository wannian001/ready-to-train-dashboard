# core: the study-wide numbers every page uses, and each participant's day-by-day record.
#   web/data/study.json      participants, date range, the expected-readiness model, the two sets of within-person
#                            estimates (13 tracked signals, 18 everyday habits), the key finding, load vs soreness
#   web/data/p/<id>.json     one participant: check-ins, Fitbit, the 13 tracked signals per day, training days
#   tests/fixtures/core.json R's own values for each participant-day, for tests/core.test.mjs

mw <- READINESS_WATERFALL$model
meta <- READINESS_WATERFALL$metadata
everyday <- LEVER_EFFECTS[is.finite(LEVER_EFFECTS$effect) & LEVER_EFFECTS$group != LEVER_GROUP_LEVELS[4], , drop = FALSE]
clear <- everyday[everyday$effective, , drop = FALSE]; clear <- clear[order(clear$p_bh), , drop = FALSE]
soreness_r <- CANDIDATES[CANDIDATES$key == "load_prev" & CANDIDATES$outcome == "soreness", , drop = FALSE]

study <- list(
  people = rows(PEOPLE[, c("participant", "age", "gender", "height_cm")]),
  first = day_str(DATA_FIRST), last = day_str(DATA_LAST),
  initial = list(person = INITIAL_PERSON, day = day_str(INITIAL_DAY)),
  signals = rows(data.frame(key = vapply(TODAY_FACTOR_SPECS, `[[`, "", "key"), layer = vapply(TODAY_FACTOR_SPECS, `[[`, "", "layer"))),
  model = list(status = READINESS_WATERFALL$status, keys = mw$keys, beta = as.list(setNames(num(mw$beta[mw$keys], 8), mw$keys)), fill = as.list(setNames(num(mw$fill[mw$keys], 8), mw$keys)),
    lambda = mw$lambda, n = mw$n, training_start = day_str(mw$training_start), training_end = day_str(mw$training_end),
    metrics = rows(transform(READINESS_WATERFALL$metrics, mae = num(mae), rmse = num(rmse), within_one = num(within_one), bias = num(bias))),
    test_mae = lapply(meta$participant_test_mae, function(v) num(v)), train_n = meta$train_n, validation_n = meta$validation_n, test_n = meta$test_n),
  today_effects = rows(transform(TODAY_EFFECTS[, c("key", "layer", "n", "yes", "people", "effect", "lo", "hi", "p", "p_bh", "clear")],
    effect = num(effect), lo = num(lo), hi = num(hi), p = num(p, 6), p_bh = num(p_bh, 6))),
  lever_effects = rows(transform(LEVER_EFFECTS[, c("key", "group", "n", "yes", "people", "effect", "lo", "hi", "p", "p_bh", "effective")],
    effect = num(effect), lo = num(lo), hi = num(hi), p = num(p, 6), p_bh = num(p_bh, 6))),
  lever_groups = LEVER_GROUP_LEVELS, lever_xlim = num(LEVER_XLIM),
  # the site's theme sentence (app.R key_finding()): the everyday habits whose link survives the BH correction
  key_finding = list(key = if (nrow(clear)) clear$key[1] else NULL, effect = if (nrow(clear)) num(clear$effect[1]) else NULL,
    people = if (nrow(clear)) clear$people[1] else NULL, clear = nrow(clear), habits = nrow(everyday), tests = sum(is.finite(LEVER_EFFECTS$p))),
  # soreness the morning after each load band (bands: 0 no session, 1 light 1-199, 2 moderate 200-399, 3 heavy 400+)
  load_soreness = rows(transform(LOAD_SORENESS, band = match(band, SORENESS_LABELS) - 1L, worse = num(worse), lo = num(lo), hi = num(hi))),
  soreness_r = num(soreness_r$r[1]),
  battery_defaults = BATTERY_DEFAULTS
)
out_json("study.json", study)

DAILY_KEYS <- c(readiness = 0, fatigue = 0, mood = 0, stress = 0, sleep_quality = 0, soreness = 0, wellness_reports = 0,
  sleep_hours = 4, sleep_minutes = 0, awake_minutes = 0, start_hour = 4, end_hour = 4, steps = 0, step_minutes = 0, resting_hr = 2)
TRAIN_KEYS <- c("sessions", "load", "minutes", "rpe", "running", "endurance", "strength", "team")
ref <- list()
for (p in PIDS) {
  z <- person_rows(p); days <- person_days(p)
  stopifnot(length(days) == nrow(z), all(as.Date(z$date) == days))
  tr <- TRAIN_DAYS[TRAIN_DAYS$participant == p, , drop = FALSE]
  person <- list(
    id = p, first = day_str(days[1]), n = length(days), default_day = day_str(default_research_day(z)),
    d = lapply(setNames(names(DAILY_KEYS), names(DAILY_KEYS)), function(k) num(z[[k]], DAILY_KEYS[[k]])),
    signals = lapply(setNames(mw$keys, mw$keys), function(k) num(by_day(TODAY_FRAME, p, k, days), 0)),
    # one row per day with at least one session: [date, sessions, load, minutes, rpe, running, endurance, strength, team]
    train = lapply(seq_len(nrow(tr)), function(i) c(list(day_str(tr$date[i])), lapply(TRAIN_KEYS, function(k) {
      v <- tr[[k]][i]; if (is.logical(v)) as.integer(v) else num(v, 2) })))
  )
  out_json(file.path("p", paste0(p, ".json")), person)

  # R's own values for every day, for the JS tests
  lv <- lapply(days, function(t) personal_level(z, t))
  ex <- expected_series(READINESS_WATERFALL, z, TODAY_FRAME, p, days)
  ld <- lapply(days, function(t) utils::tail(training_load_series(TRAIN_DAYS, p, t, 1L, min(z$date)), 1))
  fb <- lapply(days, function(t) focal_load_band(EVIDENCE, p, t))
  ref[[p]] <- list(
    level = num(vapply(lv, `[[`, 0, "value")), level_n = vapply(lv, `[[`, 0L, "n"),
    expected = num(ex$expected), adjustment = num(ex$adjustment, 6),
    load7 = num(vapply(ld, `[[`, 0, "load7")), load28 = num(vapply(ld, `[[`, 0, "load28_weekly")),
    band = vapply(fb, function(f) if (is.null(f) || !identical(f$status, "ok")) NA_integer_ else match(f$band, SORENESS_LABELS) - 1L, 0L))
}
ref_json("core.json", ref)
