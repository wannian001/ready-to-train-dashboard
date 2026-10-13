# habits: the "Compare habits" page (app.R page 3; habits.R, peers.R, insights.R nhanes_cohort, visuals.R cohort_context).
#   web/data/habits.json         HABIT_RATES (numerator / denominator per participant x habit, with the record gate),
#                                HABIT_EVIDENCE (the within-person estimate behind each habit), PEER_LONG (the ten
#                                measures), PEER_EXCLUDED (who is missing from which measure) and the NHANES cohort of
#                                every participant x nights (Mon-Fri / weekend) x age range (+-5 / +-10 years): weighted
#                                whole-hour bins, n, ages, the weighted median and the y-axis breaks R's chart uses.
#   tests/fixtures/habits.json   R's own strings and numbers for tests/habits.test.mjs: the last five matching nights
#                                (cohort_context) for every participant-day and both kinds of night, the tables'
#                                cells, the summary sentences and the peer value labels.

ids <- vapply(HABIT_SPECS, `[[`, "", "id")
txt <- function(tag) {   # the text of an htmltools tag, tags removed and entities decoded
  s <- gsub("<[^>]+>", "", as.character(tag))
  s <- gsub("&amp;", "&", gsub("&lt;", "<", gsub("&gt;", ">", gsub("&#39;", "'", gsub("&quot;", "\"", s)))))
  trimws(gsub("[[:space:]]+", " ", s))
}
# the cells of each body row of a view_table(), as text
table_cells <- function(tag) {
  h <- as.character(tag)
  body <- regmatches(h, regexpr("<tbody>.*</tbody>", h))
  if (!length(body)) return(list())
  trs <- regmatches(body, gregexpr("<tr>.*?</tr>", body))[[1]]
  out <- lapply(trs, function(tr) unname(vapply(regmatches(tr, gregexpr("<td>.*?</td>", tr))[[1]], txt, "")))
  out[lengths(out) > 0]
}
table_caption <- function(tag) { h <- as.character(tag); m <- regmatches(h, regexpr("<caption>.*?</caption>", h)); if (length(m)) txt(m) else "" }

# ---- habits ----
gate_of <- setNames(vapply(HABIT_SPECS, `[[`, "", "gate"), ids)
gate_n <- function(p, h) {
  if (gate_of[[h]] == "forms") { q <- FORMS[FORMS$participant == p, , drop = FALSE]; nrow(q) }
  else { t <- TODAY_FRAME[TODAY_FRAME$participant == p, , drop = FALSE]; sum(is.finite(t$onset)) }
}
rates <- HABIT_RATES
rates$gate_n <- mapply(gate_n, rates$participant, rates$habit)
# the reason is rebuilt in the page from gate + gate_n + need; check it is the same sentence
rebuilt <- ifelse(rates$eligible, "", ifelse(gate_of[rates$habit] == "forms", paste0(rates$gate_n, " food-log days, fewer than ", PEER_MIN_FORMS),
  paste0(rates$gate_n, " nights with a bedtime, fewer than ", PEER_MIN_SLEEP_NIGHTS)))
stopifnot(identical(rebuilt, rates$reason))

ev <- HABIT_EVIDENCE
habits <- list(
  specs = lapply(HABIT_SPECS, function(h) list(id = h$id, label = h$label, unit = h$unit, outcome = h$outcome, gate = h$gate)),
  min = list(forms = PEER_MIN_FORMS, nights = PEER_MIN_SLEEP_NIGHTS, sessions = PEER_MIN_SESSIONS),
  # one row per participant x habit: [participant, habit, num, den, eligible, gate_n]
  rates = lapply(seq_len(nrow(rates)), function(i) list(rates$participant[i], rates$habit[i], as.integer(rates$num[i]), as.integer(rates$den[i]),
    as.integer(rates$eligible[i]), as.integer(rates$gate_n[i]))),
  evidence = rows(data.frame(habit = ev$habit, effect = num(ev$effect, 6), lo = num(ev$lo, 6), hi = num(ev$hi, 6), clear = ev$clear,
    direction = ifelse(is.na(ev$direction), NA_character_, ev$direction), stringsAsFactors = FALSE)),
  # ---- the ten measures ----
  peer_dims = lapply(PEER_DIMENSIONS[vapply(PEER_DIMENSIONS, function(d) d$key %in% PEER_LONG$key, TRUE)],
    function(d) list(key = d$key, label = d$label, unit = d$unit, gate = d$gate, hint = d$hint)),
  peer_people = sort(unique(PEER_PROFILES$participant)),
  # [key, participant, value] in PEER_LONG's own order; the value as text with 17 significant digits, so the page
  # rounds the very same double R does (a bedtime of 22:50.5 must stay below or above the half exactly as in R)
  peer_long = lapply(seq_len(nrow(PEER_LONG)), function(i) list(PEER_LONG$key[i], PEER_LONG$participant[i], sprintf("%.17g", PEER_LONG$value[i]))),
  peer_excluded = NULL
)
# who is missing from which measure: peers.R peer_exclusions(), with a key for the reason so it can be translated
excl <- list()
pp <- PEER_PROFILES
add <- function(who, kind) if (length(who)) excl[[length(excl) + 1]] <<- list(who = as.list(who), kind = kind)
add(pp$participant[pp$nights < PEER_MIN_SLEEP_NIGHTS], "nights")
add(pp$participant[pp$load_rows < PEER_MIN_SESSIONS], "load")
add(pp$participant[pp$forms < PEER_MIN_FORMS], "forms")
add(pp$participant[!is.finite(pp$rhr)], "rhr")
stopifnot(length(excl) == if (is.null(PEER_EXCLUDED)) 0 else nrow(PEER_EXCLUDED))
for (i in seq_along(excl)) stopifnot(identical(paste(toupper(unlist(excl[[i]]$who)), collapse = ", "), PEER_EXCLUDED$who[i]))
habits$peer_excluded <- excl

# ---- NHANES cohorts: every participant x period x radius ----
cohorts <- list(); ref_cohorts <- list()
for (p in PIDS) {
  prof <- PEOPLE[PEOPLE$participant == p, , drop = FALSE]
  for (period in c("workday", "nonworkday")) for (radius in c(5L, 10L)) {
    co <- nhanes_cohort(APP_DATA$nhanes, prof, period, radius)
    rws <- co$rows[order(co$rows$hours), , drop = FALSE]
    med <- if (nrow(rws)) rws$hours[which(cumsum(rws$weight) >= sum(rws$weight) / 2)[1]] else NA_real_
    top <- if (nrow(co$bins)) max(co$bins$percent) * 1.12 else NA_real_
    ticks <- if (is.finite(top)) { b <- pretty(c(0, top), 3); b[b >= 0] } else numeric()
    key <- paste(p, period, radius, sep = "|")
    cohorts[[key]] <- list(n = co$n, lo = co$lo, hi = co$hi, gender = co$gender,
      bins = lapply(seq_len(nrow(co$bins)), function(i) c(co$bins$bin[i], num(co$bins$percent[i], 6))),
      median = num(med, 4), ticks = num(ticks, 6))
    cx <- cohort_context(co, person_rows(p), max(person_rows(p)$date))
    ref_cohorts[[key]] <- list(median_label = cx$median_label,
      caption = paste0("US ", co$gender, " aged ", co$lo, "–", co$hi, " · ", format(co$n, big.mark = ","), " survey answers"),
      bins = if (co$n >= 30) table_cells(population_table(co, person_rows(p), max(person_rows(p)$date)))[seq_len(nrow(co$bins))] else list(),
      paused = co$n < 30)
  }
}
habits$cohorts <- cohorts
out_json("habits.json", habits)

# ---- R's own values for the tests ----
ref <- list(cohorts = ref_cohorts, nights = list(), habit_table = list(), peers_table = list(), summary = list(), chips = list(),
  detail_table = list(), excluded = NULL, compare_choices = list(), habit_tag = "")
ref$habit_tag <- paste0(length(unique(HABIT_RATES$participant[HABIT_RATES$eligible])), " participants")
ex <- HABIT_RATES[!HABIT_RATES$eligible, , drop = FALSE]
ref$excluded <- if (nrow(ex)) paste0("Not shown: ", paste(unique(paste0(toupper(ex$participant), " (", ex$reason, ")")), collapse = "; "), ".") else ""
# the last five matching nights before each day (visuals.R sleep_window via cohort_context)
for (p in PIDS) {
  z <- person_rows(p); days <- person_days(p)
  one <- function(period) {
    w <- lapply(as.character(days), function(t) sleep_window(z, as.Date(t), period))
    list(n = vapply(w, `[[`, 0L, "n"), start = vapply(w, function(x) if (x$n) day_str(x$start) else NA_character_, ""),
      end = vapply(w, function(x) if (x$n) day_str(x$end) else NA_character_, ""), mean = num(vapply(w, `[[`, 0, "mean"), 6),
      mean_label = vapply(w, function(x) duration_label(x$mean), ""),
      range = vapply(w, function(x) record_range(x$start, x$end), ""))
  }
  ref$nights[[p]] <- list(workday = one("workday"), nonworkday = one("nonworkday"))
}
# compare_summary (app.R output$compare_summary), for every viewing x comparison participant x habit
compare_summary_text <- function(participant, compare, h) {
  ev <- HABIT_EVIDENCE[HABIT_EVIDENCE$habit == h, , drop = FALSE]
  me <- HABIT_RATES[HABIT_RATES$habit == h & HABIT_RATES$participant == participant, , drop = FALSE]
  cp <- HABIT_RATES[HABIT_RATES$habit == h & HABIT_RATES$participant == compare, , drop = FALSE]
  show <- function(r) if (!nrow(r) || !r$eligible[1]) paste0(toupper(r$participant[1]), " is below the record threshold") else paste0(toupper(r$participant[1]), " ", round(r$share[1]), "% (", r$num[1], "/", r$den[1], " days)")
  c(paste0(ev$label, ": ", show(me), if (nrow(cp)) paste0(" vs ", show(cp),
    if (me$eligible[1] && cp$eligible[1]) { gap <- abs(round(cp$share[1] - me$share[1])); paste0(" — ", gap, if (gap == 1) " percentage point apart" else " percentage points apart") } else "") else " · click another participant or use 'Compare with' to compare", "."),
    paste0("Link with readiness (within participants, all participants): ", if (isTRUE(ev$clear)) paste0(ev$direction_text, ", ", ev$evidence_text) else "no clear link", ". A different frequency is not a different readiness level."))
}
for (p in PIDS) {
  ref$habit_table[[p]] <- table_cells(habit_table(HABIT_RATES, HABIT_EVIDENCE, p))
  ref$peers_table[[p]] <- table_cells(peers_table(PEER_LONG, PEER_PROFILES, p))
  ref$chips[[p]] <- txt(habit_profile_summary_ui(HABIT_RATES, p, HABIT_EVIDENCE))
  others <- PEOPLE$participant[PEOPLE$participant != p & PEOPLE$participant %in% HABIT_RATES$participant[HABIT_RATES$eligible]]
  ref$compare_choices[[p]] <- others
  ref$summary[[p]] <- lapply(setNames(ids, ids), function(h) lapply(setNames(c("", setdiff(PIDS, p)), c("none", setdiff(PIDS, p))), function(cmp) compare_summary_text(p, cmp, h)))
  # the "Show the data" table under the one-habit chart, with p07 as the comparison (or p03 when viewing p07)
  cmp <- if (p == "p07") "p03" else "p07"
  ref$detail_table[[p]] <- lapply(setNames(ids, ids), function(h) {
    z <- HABIT_RATES[HABIT_RATES$habit == h, , drop = FALSE]; z <- z[order(-z$eligible, -z$share), , drop = FALSE]
    list(compare = cmp, caption = paste0("'", HABIT_EVIDENCE$label[HABIT_EVIDENCE$habit == h], "' by participant; denominator = ", HABIT_EVIDENCE$unit[HABIT_EVIDENCE$habit == h]),
      rows = lapply(seq_len(nrow(z)), function(i) { r <- z[i, ]
        c(paste0(toupper(r$participant), if (r$participant == p) " · viewing" else if (r$participant == cmp) " · comparison" else ""),
          as.character(r$num), as.character(r$den), if (is.finite(r$share)) paste0(round(r$share), "%") else "—", if (r$eligible) "yes" else r$reason) }))
  })
}
# peer value labels, row by row, and each measure's two ends
ref$peer_labels <- vapply(seq_len(nrow(PEER_LONG)), function(i) peer_value_label(PEER_LONG$value[i], PEER_LONG$unit[i]), "")
ref$peer_ends <- lapply(split(PEER_LONG, factor(PEER_LONG$key, levels = unique(PEER_LONG$key))), function(z)
  c(peer_value_label(min(z$value), z$unit[1]), peer_value_label(max(z$value), z$unit[1])))
ref$peer_excluded <- if (is.null(PEER_EXCLUDED)) list() else lapply(seq_len(nrow(PEER_EXCLUDED)), function(i) paste0(PEER_EXCLUDED$who[i], " — ", PEER_EXCLUDED$why[i]))
# the population table's nights for a few days per participant
ref$population_nights <- list()
for (p in PIDS) {
  z <- person_rows(p); days <- person_days(p); pick <- unique(days[c(1, 2, 8, 30, length(days) %/% 2, length(days))])
  pick <- pick[!is.na(pick)]
  prof <- PEOPLE[PEOPLE$participant == p, , drop = FALSE]
  ref$population_nights[[p]] <- lapply(as.character(pick), function(t) { t <- as.Date(t)
    co <- nhanes_cohort(APP_DATA$nhanes, prof, "nonworkday", 10L)
    cells <- table_cells(population_table(co, z, t))
    list(day = day_str(t), rows = if (co$n >= 30) cells[-seq_len(nrow(co$bins))] else list())
  })
}
ref_json("habits.json", ref)
