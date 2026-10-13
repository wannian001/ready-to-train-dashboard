# body: Today › Soreness detail and Today › Sleep detail.
#   web/data/body.json         where people were sore after each kind of "yesterday" (body_regions.R: one comparison group per
#                              kind of training day that occurs, as counts), and the body figure's fixed colour scale
#   web/data/body/<id>.json    one participant's sleep start / end, hours asleep and resting heart rate at the precision R
#                              reads them from daily.csv, so clock times and medians round exactly as in the app
#   tests/fixtures/body.json   R's own output for every participant-day, taken from the app's server code itself
#                              (the renderUI bodies of output$compare_rows, output$soreness_today, ...), for tests/body.test.mjs

# ---- the server's render expressions, read from app.R (so the fixture runs the app's code, not a copy) ----
srv <- NULL
for (e in parse("app.R", keep.source = FALSE)) if (is.call(e) && identical(e[[1]], as.name("<-")) && identical(e[[2]], as.name("server"))) srv <- e[[3]]
stopifnot(!is.null(srv))
srv_body <- as.list(srv[[3]])[-1]
assigned <- function(target) {
  for (s in srv_body) {
    if (!is.call(s) || !identical(s[[1]], as.name("<-"))) next
    lhs <- s[[2]]
    if (is.character(target) && is.name(lhs) && identical(as.character(lhs), target)) return(s)
    if (is.call(target) && identical(lhs, target)) return(s)
  }
  stop("not found in server(): ", deparse(target))
}
output_expr <- function(id) assigned(call("$", as.name("output"), as.name(id)))[[3]][[2]]      # renderUI(expr) -> expr
reactive_expr <- function(name) assigned(name)[[3]][[2]]                                       # reactive(expr) -> expr
# an environment that stands in for one session: participant p, selected day, revealed or not
session_env <- function(p, day, revealed = FALSE) {
  env <- new.env(parent = globalenv())
  z <- person_rows(p)
  env$input <- list(participant = p)
  env$person <- function() z
  env$focus <- function() as.Date(day)
  env$truth <- function() revealed
  env$pv <- function() visible_person(z, as.Date(day), revealed)
  for (r in c("has_checkin", "soreness_band")) local({ ex <- reactive_expr(r); env[[r]] <- function() eval(ex, env) })
  eval(assigned("revealed_value"), env)
  env
}
html_of <- function(x) paste(as.character(x), collapse = "")
unescape <- function(s) { s <- gsub("&lt;", "<", s, fixed = TRUE); s <- gsub("&gt;", ">", s, fixed = TRUE)
  s <- gsub("&#39;", "'", s, fixed = TRUE); s <- gsub("&quot;", "\"", s, fixed = TRUE); gsub("&amp;", "&", s, fixed = TRUE) }
# the text of every element whose opening tag matches `open` (a regex), up to its first child tag
grab <- function(html, open) {
  m <- regmatches(html, gregexpr(paste0(open, "([^<]*)<"), html, perl = TRUE))[[1]]
  unescape(sub("<$", "", sub(paste0("^", open), "", m, perl = TRUE)))
}
attr_of <- function(html, open, name) {
  m <- regmatches(html, gregexpr(paste0(open, "[^>]*", name, '="[^"]*"'), html, perl = TRUE))[[1]]
  unescape(sub(paste0('^.*', name, '="([^"]*)"$'), "\\1", m, perl = TRUE))
}
table_cells <- function(html) {
  html <- gsub("\n", "", html)
  rows <- regmatches(html, gregexpr("<tr>.*?</tr>", html, perl = TRUE))[[1]][-1]
  lapply(rows, function(r) { cells <- regmatches(r, gregexpr("<td>.*?</td>", r, perl = TRUE))[[1]]
    unescape(gsub("<[^>]+>", "", cells)) })
}

# ---- web data: the comparison groups behind the body figure ----
key_of <- function(p, day) {
  r <- TRAIN_DAYS[TRAIN_DAYS$participant == p & TRAIN_DAYS$date == as.Date(day) - 1, , drop = FALSE]
  if (!nrow(r)) return("none")
  paste0("s:", paste(names(BODY_TYPES)[vapply(names(BODY_TYPES), function(k) isTRUE(r[[k]][1]), logical(1))], collapse = "+"))
}
hist <- body_history(BODY_REGIONS, TRAIN_DAYS)
profiles <- list(); prof_ref <- list(); prof_ui <- list(); day_prof <- list()
for (p in PIDS) {
  days <- person_days(p); idx <- integer(length(days))
  for (i in seq_along(days)) {
    pr <- body_region_profile(BODY_REGIONS, TRAIN_DAYS, p, days[i])
    key <- key_of(p, days[i]); grp <- attr(pr, "group")
    if (is.null(profiles[[key]])) {
      # the same selection again, as counts: rate = ticked / answered for each area
      level <- if (key == "none") "none" else if (grp == "any day with a logged session") "any" else if (startsWith(grp, "any day that included")) "included" else "exact"
      tags <- if (key == "none") character() else strsplit(sub("^s:", "", key), "+", fixed = TRUE)[[1]]
      keep <- switch(level, none = !hist$reported, any = hist$reported,
        included = hist$reported & Reduce(`&`, lapply(tags, function(k) hist[[k]])),
        exact = hist$reported & Reduce(`&`, lapply(names(BODY_TYPES), function(k) hist[[k]] == (k %in% tags))))
      one <- hist[keep, , drop = FALSE]
      ticked <- vapply(BODY_REGION_SPECS$key, function(k) sum(one[[k]], na.rm = TRUE), numeric(1))
      answered <- vapply(BODY_REGION_SPECS$key, function(k) sum(!is.na(one[[k]])), numeric(1))
      stopifnot(nrow(one) == attr(pr, "n"), isTRUE(all.equal(unname(ticked / answered), unname(pr$rate))))
      profiles[[key]] <- list(level = level, n = nrow(one), ticked = unname(ticked), answered = unname(answered))
    }
    # R's own profile, and its figure as the app draws it (once per distinct profile)
    sig <- paste(grp, attr(pr, "n"), paste(format(pr$rate, digits = 15), collapse = ","))
    if (is.null(prof_ref[[sig]])) {
      for (g in c("male", "female")) {
        h <- html_of(body_region_model_ui(pr, "PXX", g, BODY_SCALE_TOP))
        prof_ui[[paste(sig, g)]] <- list(
          chips = grab(h, '<span class="scope-chip">'),
          list_labels = grab(h, '<div>\\s*<span class="region-swatch"[^>]*></span>\\s*<strong>'),
          list_values = grab(h, '</strong>\\s*<span>'),
          swatches = attr_of(h, '<span class="region-swatch"', "style"),
          fills = attr_of(h, '<g class="body-region-shape[^"]*"', "fill"),
          aria = attr_of(h, '<g class="body-region-shape[^"]*"[^>]*role="img"', "aria-label"),
          titles = grab(h, "<title>"),
          legend = grab(h, '<div class="body-legend">\\s*<span>'), legend_top = grab(h, '<span class="body-legend-bar" aria-hidden="true"></span>\\s*<span>'),
          legend_small = grab(h, '<div class="body-legend">[\\s\\S]*?<small>'),
          caveat = grab(h, '<p class="body-caveat">\\s*<strong>[^<]*</strong>'),
          lede = grab(h, '<p class="chart-lede">'))
      }
      prof_ref[[sig]] <- list(key = key, group = grp, n = attr(pr, "n"), rate = pr$rate, sig = sig)
    }
    idx[i] <- match(sig, names(prof_ref))
  }
  day_prof[[p]] <- idx
}
out_json("body.json", list(
  scale_top = BODY_SCALE_TOP, cap = BODY_SCALE_CAP, regions = BODY_REGION_SPECS$key,
  profiles = profiles))

# ---- web data: each participant's sleep times at full precision (daily.csv keeps 15 significant digits) ----
full <- function(x) { x <- suppressWarnings(as.numeric(x)); x[!is.finite(x)] <- NA_real_; x }
for (p in PIDS) {
  z <- person_rows(p)
  out_json(file.path("body", paste0(p, ".json")), list(id = p, first = day_str(min(z$date)), n = nrow(z),
    start_hour = full(z$start_hour), end_hour = full(z$end_hour), sleep_hours = full(z$sleep_hours), resting_hr = full(z$resting_hr)))
}

# ---- the R reference values ----
# repeated sentences are written once: per-day fields hold indices (0-based) into ref$pool
POOL <- character()
intern <- function(x) {
  if (!length(x)) return(integer())
  i <- match(x, POOL); if (anyNA(i)) { POOL <<- c(POOL, unique(x[is.na(i)])); i <- match(x, POOL) }
  i - 1L
}
ref <- list(profiles = unname(lapply(prof_ref, function(x) list(key = x$key, group = x$group, n = x$n, rate = x$rate,
  ui = list(male = prof_ui[[paste(x$sig, "male")]], female = prof_ui[[paste(x$sig, "female")]])))), people = list())

# the fixed load-vs-soreness reference
ls_html <- html_of(load_soreness_table(LOAD_SORENESS))
titles <- load_band_titles(LOAD_SORENESS_SHARES)
env <- session_env(PIDS[1], person_days(PIDS[1])[2])
ref$load_soreness <- list(
  worse = LOAD_SORENESS$worse, lo = LOAD_SORENESS$lo, hi = LOAD_SORENESS$hi,
  table = table_cells(ls_html), titles = titles$title,
  shares_tip = paste0(LOAD_SORENESS_SHARES$band, "<br>", LOAD_SORENESS_SHARES$level, ": ", LOAD_SORENESS_SHARES$count, " mornings",
    "<br>", fmt_vec(LOAD_SORENESS_SHARES$share * 100, 1), "% of this band (", LOAD_SORENESS_SHARES$n, " mornings)"),
  shares_label = ifelse(LOAD_SORENESS_SHARES$share >= .07, paste0(round(LOAD_SORENESS_SHARES$share * 100), "%"), ""),
  note = grab(html_of(eval(output_expr("load_soreness_note"), env)), '<p class="comparison-conclusion">'))

for (p in PIDS) {
  z <- person_rows(p); days <- person_days(p); last <- max(days)
  # every night of the record, as the sleep table and tooltip write it (a night's row is the same in any week)
  all <- sleep_window_data(z, last, length(days))
  nights <- table_cells(html_of(sleep_window_table(z, last, length(days))))
  first_week <- table_cells(html_of(sleep_window_table(z, days[1], 7L)))
  per_day <- lapply(seq_along(days), function(i) {
    day <- days[i]
    note <- html_of(sleep_window_note(z, day, 7L))
    hidden <- session_env(p, day, FALSE); shown <- session_env(p, day, TRUE)
    cmp <- html_of(eval(output_expr("compare_rows"), hidden))
    so0 <- html_of(eval(output_expr("soreness_today"), hidden)); so1 <- html_of(eval(output_expr("soreness_today"), shown))
    pooled <- list(
      note = c(grab(note, '<p class="comparison-conclusion">'), grab(note, '<p class="fine-print">'), grab(note, '<p class="empty-note">')),
      v = grab(cmp, '<div class="cmp-main">\\s*<strong>'), d = grab(cmp, '<span class="cmp-diff">'),
      sc = grab(cmp, '<span class="cmp-scale">'), end = grab(cmp, '<span class="cmp-end">'),
      pos = sub("^left:", "", attr_of(cmp, '<span class="cmp-(?:band|usual|value)"', "style")),
      lk = sub(" of 5, .*$", "", sub("^(Sleep quality|Fatigue|Soreness|Stress|Mood) ", "", attr_of(cmp, '<span class="likert-cells"', "aria-label"))),
      so = c(grab(so0, '<p class="locked-line">'), grab(so0, '<p class="comparison-conclusion">'), grab(so0, '<p class="fine-print">')),
      felt = c(attr_of(so1, '<span class="likert-cells"', "aria-label"), grab(so1, '<p class="locked-line">')),
      ctx = c(grab(so0, '<div class="soreness-load-day">\\s*<div>\\s*<strong>[^<]*</strong>\\s*<span>'), grab(so0, '</div>\\s*<p>'), grab(so0, '<small>')),
      profile = day_prof[[p]][i])
    for (f in c("note", "v", "d", "so", "felt", "ctx")) pooled[[f]] <- I(intern(pooled[[f]]))
    pooled
  })
  # what is the same on every day of a participant is written once
  keep_first <- function(field) { v <- lapply(per_day, `[[`, field); u <- unique(v); if (length(u) == 1) u[[1]] else NULL }
  static <- list(sc = keep_first("sc"))
  if (!is.null(static$sc)) per_day <- lapply(per_day, function(x) { x$sc <- NULL; x })
  # the y range and breaks of the week chart, on every 5th day (ggplot_build is slow)
  axis <- lapply(seq(1, length(days), by = 5), function(i) {
    g <- health_sleep_window_plot(z, days[i], 7L)
    if (!is.data.frame(g$data) || !nrow(g$data)) return(list(day = day_str(days[i]), empty = TRUE))
    b <- ggplot2::ggplot_build(g); pp <- b$layout$panel_params[[1]]
    list(day = day_str(days[i]), empty = FALSE, breaks = -pp$y$breaks, labels = pp$y$get_labels(),
      range = sort(-pp$y$continuous_range))
  })
  ref$people[[p]] <- list(
    days = day_str(days),
    night_tip = all$tip, night_valid = all$valid, night_eff_label = ifelse(is.finite(all$efficiency), paste0(round(all$efficiency), "%"), ""),
    nights = nights, first_week = first_week, axis = axis,
    static = static,
    usual = lapply(list(sleep = usual_stats(z$sleep_hours), onset = usual_stats(ifelse(is.finite(z$start_hour) & z$start_hour < 12, z$start_hour, NA_real_)),
      hr = usual_stats(z$resting_hr)), function(s) if (is.null(s)) NULL else s),
    per_day = per_day)
}
ref$pool <- POOL
ref_json("body.json", ref)
