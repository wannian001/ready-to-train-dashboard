# readiness: Today › Readiness detail and the Everyday habits page.
#   web/data/readiness.json        the two interval charts' fixed axes (R's limits and pretty() breaks) and the
#                                  everyday habits' definition order (LEVER_SPECS), which study.json does not carry
#   tests/fixtures/readiness.json  R's own values for tests/readiness.test.mjs: readiness_waterfall_parts() for every
#                                  participant-day, expected_series() over 28 days for sample days (hidden and
#                                  revealed), lever_rows() for every filter and order, and the R sentences built
#                                  from the numbers (verdicts, BH notes, headline, felt-vs-expected note, tooltips)

# ---- the charts' axes ----
factor_rows_all <- today_factor_rows(today_factor_state(TODAY_FRAME, TODAY_EFFECTS, PIDS[1], person_days(PIDS[1])[30]))
factor_lim <- { l <- range(c(0, factor_rows_all$lo, factor_rows_all$hi), na.rm = TRUE); l + c(-1, 1) * diff(l) * .06 }
inside <- function(b, lim) b[b >= lim[1] - 1e-9 & b <= lim[2] + 1e-9]
out_json("readiness.json", list(
  factor_xlim = num(factor_lim, 6), factor_breaks = num(inside(pretty(factor_lim, 6), factor_lim), 6),
  lever_xlim = num(LEVER_XLIM, 6), lever_breaks = num(inside(pretty(LEVER_XLIM, 6), LEVER_XLIM), 6),
  lever_order = vapply(LEVER_SPECS, `[[`, "", "key"),
  # the estimates at full precision (study.json rounds them to 4 decimals, which can move a 2-decimal label)
  today_effects = lapply(setNames(TODAY_EFFECTS$key, TODAY_EFFECTS$key), function(k) { r <- TODAY_EFFECTS[TODAY_EFFECTS$key == k, ]
    num(c(r$effect, r$lo, r$hi, r$p, r$p_bh), 10) }),
  lever_effects = lapply(setNames(LEVER_EFFECTS$key, LEVER_EFFECTS$key), function(k) { r <- LEVER_EFFECTS[LEVER_EFFECTS$key == k, ]
    num(c(r$effect, r$lo, r$hi, r$p, r$p_bh), 10) }),
  lever_group_short = as.list(LEVER_GROUP_SHORT)
))

# ---- reference values for the tests ----
ref <- list()

# readiness_waterfall_parts() for every participant-day (what app.R readiness_parts() gives on that day), one array
# per field aligned with the participant's days; state = one character per signal (1 true, 0 not true, ? unknown),
# step = readiness_delta_label() of each step joined by "|"; headline (readiness_factor_headline) every 10th day
wf <- list()
for (p in PIDS) {
  z <- person_rows(p); days <- person_days(p)
  one <- lapply(seq_along(days), function(i) {
    t <- days[i]; lv <- personal_level(z, t)
    parts <- readiness_waterfall_parts(READINESS_WATERFALL, today_factor_state(TODAY_FRAME, TODAY_EFFECTS, p, t, FALSE), lv$value)
    ok <- !is.null(parts)
    list(n = lv$n, range = if (lv$n) record_range(lv$start, lv$end) else "",
      state = if (ok) paste(ifelse(!parts$known, "?", ifelse(parts$held, "1", "0")), collapse = "") else NA_character_,
      adjustment = if (ok) attr(parts, "adjustment") else NA_real_, prediction = if (ok) attr(parts, "prediction") else NA_real_,
      step = if (ok) paste(vapply(parts$contribution, readiness_delta_label, ""), collapse = "|") else NA_character_,
      headline = if (ok && i %% 10 == 0) paste0("Together, the ", sum(parts$held), " tracked signals that were true changed the expectation by ",
        deviation_label(attr(parts, "adjustment"), 2L), " points: essentially unchanged. The usual level does almost all the work.") else NA_character_)
  })
  col <- function(k) vapply(one, function(x) x[[k]], one[[1]][[k]])
  wf[[p]] <- list(n = col("n"), range = col("range"), state = col("state"), adjustment = num(col("adjustment"), 7),
    prediction = num(col("prediction"), 7), step = col("step"), headline = col("headline"),
    adj_label = ifelse(is.na(col("adjustment")), NA_character_, vapply(col("adjustment"), readiness_delta_label, "")))
}
ref$waterfall <- wf

# expected_series() over the 28 days up to sample days, from visible_person() (hidden; revealed on two of them)
pick_days <- function(p) {
  days <- person_days(p); z <- person_rows(p)
  i <- unique(round(seq(1, length(days), length.out = 9)))
  unique(c(days[i], default_research_day(z), days[min(length(days), 30)]))
}
series <- list()
for (p in PIDS) {
  z <- person_rows(p); picked <- pick_days(p)
  for (j in seq_along(picked)) for (rev in if (j %in% c(5, length(picked) - 1)) c(FALSE, TRUE) else FALSE) {
    t <- picked[j]
    pv <- visible_person(z, t, rev)
    s <- expected_series(READINESS_WATERFALL, pv, TODAY_FRAME, p, seq(t - 27, t, by = "day"))
    note <- felt_expected_note(s, toupper(p))
    series[[length(series) + 1]] <- list(id = p, day = day_str(t), revealed = rev,
      level = num(s$level, 5), adjustment = num(s$adjustment, 6), expected = num(s$expected, 5), felt = num(s$felt, 0),
      note = paste(unlist(note$children), collapse = ""), note_class = note$attribs$class)
  }
}
ref$series <- series

# lever_rows() for every filter and order
lv <- list()
for (f in LEVER_FILTERS) for (o in LEVER_ORDERS) {
  r <- lever_rows(LEVER_EFFECTS, f, o)
  lv[[paste(f, o, sep = "|")]] <- list(keys = r$key, group = as.character(r$group), tag = ifelse(is.na(r$group_tag), "", r$group_tag),
    height = interval_rows_height(r, "group"))
}
ref$levers <- lv
ref$lever_filters <- unname(LEVER_FILTERS)

# sentences built from the numbers
ref$today_verdict <- as.list(setNames(TODAY_EFFECTS$verdict, TODAY_EFFECTS$key))
ref$lever_verdict <- as.list(setNames(LEVER_EFFECTS$verdict, LEVER_EFFECTS$key))
ref$today_bh <- bh_interval_note(TODAY_EFFECTS, TODAY_EFFECTS$clear, "signals")
ref$lever_bh <- bh_interval_note(LEVER_EFFECTS, LEVER_EFFECTS$effective, "rows")
ref$levers_tag <- paste0(sum(LEVER_EFFECTS$effective), " of ", sum(is.finite(LEVER_EFFECTS$effect)), " with a clear link")
g2 <- function(v) vapply(v, function(x) if (is.finite(x)) formatC(x, format = "g", digits = 2) else "—", "")   # one value at a time, as the tables do
ref$p_bh_g <- as.list(setNames(c(g2(TODAY_EFFECTS$p_bh), g2(LEVER_EFFECTS$p_bh)), c(TODAY_EFFECTS$key, LEVER_EFFECTS$key)))
{
  e <- TODAY_EFFECTS[is.finite(TODAY_EFFECTS$effect), , drop = FALSE]
  clear <- e[e$clear, , drop = FALSE]; clear <- clear[order(clear$effect), , drop = FALSE]
  ref$factors_conclusion <- if (nrow(clear)) paste0(nrow(clear), " of ", nrow(e), " tracked signals have a clear link: ",
    paste0(tolower(clear$label), " (", deviation_label(clear$effect, 2L), ")", collapse = " and "), ". Both are about disrupted sleep.") else
    paste0("None of the ", nrow(e), " tracked signals has a clear link.")
}
ref$mae <- list(ridge = model_mae("test", "ridge"), level = model_mae("test", "^level$"), level_all = model_mae("test", "level_all"), last5 = model_mae("test", "last5"))
# one day's tooltips on both interval charts (plain text: <br> → newline)
{
  p <- "p07"; t <- as.Date("2020-03-26")
  st <- today_factor_state(TODAY_FRAME, TODAY_EFFECTS, p, t, FALSE)
  rows <- today_factor_rows(st)
  rows$ring <- is.finite(rows$value) & rows$value == 1
  tips <- paste0(rows$layer, " · ", rows$label, "<br>", rows$detail, "<br>True on ", rows$yes, " of ", format(rows$n, big.mark = ","), " participant-days · ", rows$people, " participants",
    "<br>Same-day readiness ", deviation_label(rows$effect, 2L), " points on average<br>95% interval ", deviation_label(rows$lo, 2L), " to ", deviation_label(rows$hi, 2L), " (clustered by participant, not adjusted for multiple tests)",
    "<br>", rows$verdict, "<br>This day: ", rows$state)
  ref$factor_tips <- list(id = p, day = day_str(t), keys = rows$key, tips = gsub("<br>", "\n", tips), height = today_factors_height(rows))
  z <- lever_rows(LEVER_EFFECTS, "all", "effect")
  ltips <- paste0(ifelse(is.na(z$group_tag), as.character(z$group), z$group_tag), " · ", z$label, "<br>", z$detail, "<br>Happened on ", z$yes, " of ", format(z$n, big.mark = ","),
    " participant-days · ", z$people, " participants with both kinds of day<br>Next-morning readiness ", deviation_label(z$effect, 2L), " points on average",
    "<br>95% interval ", deviation_label(z$lo, 2L), " to ", deviation_label(z$hi, 2L), " (clustered by participant, not adjusted for multiple tests)<br>", z$verdict)
  ref$lever_tips <- list(keys = z$key, tips = gsub("<br>", "\n", ltips))
}
ref_json("readiness.json", ref)
