# Focused visual stories for the page-1 detail views. They use ggplot2/ggiraph, plus echarts4r for
# the one animated chart. Product screenshots informed hierarchy only; no product asset,
# proprietary score or hidden algorithm is copied.

# ---- What the participant reported for yesterday and the day before (training log facts only) ----
today_soreness_context <- function(training, participant, day) {
  day <- as.Date(day)
  one <- function(offset, when) {
    date <- day - offset
    r <- if (is.null(training)) NULL else training[training$participant == participant & training$date == date, , drop = FALSE]
    if (is.null(r) || !nrow(r)) return(data.frame(when = when, date = date, reported = FALSE, sessions = 0, load = NA_real_,
      minutes = NA_real_, rpe = NA_real_, types = "No session reported", stringsAsFactors = FALSE))
    data.frame(when = when, date = date, reported = TRUE, sessions = r$sessions[1], load = r$load[1],
      minutes = r$minutes[1], rpe = r$rpe[1], types = train_types_text(r[1, ]), stringsAsFactors = FALSE)
  }
  list(rows = rbind(one(1, "Yesterday"), one(2, "2 days ago")), day = day, participant = participant)
}

today_soreness_context_ui <- function(context) {
  if (is.null(context)) return(htmltools::p(class = "empty-note", "No training records available."))
  card <- function(r) htmltools::div(class = "soreness-load-day",
    htmltools::div(htmltools::strong(r$when), htmltools::span(day_label(r$date, year = FALSE))),
    htmltools::p(if (r$reported) tools::toTitleCase(r$types) else r$types),
    htmltools::tags$small(if (!r$reported) "Not a confirmed rest day — just nothing logged" else if (!is.finite(r$load))
      "Session logged, but load left blank" else
      paste0(r$sessions, if (r$sessions > 1) " sessions" else " session", " · load ", fmt(r$load),
        if (is.finite(r$minutes)) paste0(" (", fmt(r$minutes), " min", if (is.finite(r$rpe)) paste0(" × RPE ", fmt(r$rpe)) else "", ")") else "")))
  rows <- context$rows
  htmltools::div(class = "soreness-load-grid", card(rows[1, ]), card(rows[2, ]))
}

# ---- How the expected value is built: usual level + 13 tracked signals, left to right ----
# The y-axis always spans at least ±1 readiness point around the usual level. A tighter axis would
# blow a −0.03 step up into a tall bar; at this scale small steps look as small as they are.
# After "Reveal", the participant's felt value is drawn as a green line on the same axis.
health_readiness_factor_sequence <- function(parts, actual = NA_real_) {
  z <- parts
  if (is.null(z) || !nrow(z)) return(NULL)
  colours <- c("#0a84ff", "#5e5ce6", "#ff375f")
  baseline <- attr(parts, "baseline")
  values <- c(baseline, z$before, z$after, if (is.finite(actual)) actual)
  half <- max(1, max(abs(values - baseline), na.rm = TRUE) * 1.25)
  lo <- max(0, floor((baseline - half) * 2) / 2); hi <- min(10, ceiling((baseline + half) * 2) / 2)
  z$baseline_line <- baseline
  metadata <- lapply(seq_len(nrow(z)), function(i) list(number = z$number[i], stage = z$stage_title[i],
    label = z$label[i], detail = z$detail[i], delta = readiness_delta_label(z$contribution[i]),
    before = fmt(z$before[i], 2), after = fmt(z$after[i], 2), state = z$state[i]))
  meta_json <- jsonlite::toJSON(metadata, auto_unbox = TRUE)
  tooltip_js <- htmlwidgets::JS(paste0(
    "function(p){var m=", meta_json, "[p.dataIndex];",
    "return '<b>'+m.number+'. '+m.label+'</b><br>'+m.stage+'<br>'+m.detail+",
    "'<br>This day: '+m.state+'<br>Step '+m.delta+' points: '+m.before+' → '+m.after;}"))
  label_js <- htmlwidgets::JS(paste0(
    "function(p){var m=", meta_json, "[p.dataIndex];",
    "return Math.abs(Number(m.delta))<0.005?'':m.delta;}"))
  chart <- z |>
    echarts4r::e_charts(axis) |>
    echarts4r::e_bar(segment_base, name = "start", stack = "waterfall", legend = FALSE,
      barWidth = 24, silent = TRUE, itemStyle = list(color = "transparent"), animation = FALSE) |>
    echarts4r::e_bar(segment_height, name = "step", stack = "waterfall", legend = FALSE,
      barWidth = 24, barMinHeight = 2, itemStyle = list(borderRadius = 5)) |>
    echarts4r::e_labels(show = TRUE, position = "top", formatter = label_js,
      color = "#1c1c1e", fontSize = 11, fontWeight = 700) |>
    echarts4r::e_line(after, name = "Running estimate", legend = FALSE, symbol = "circle", symbolSize = 7,
      lineStyle = list(color = "#1c1c1e", width = 2), itemStyle = list(color = "#1c1c1e")) |>
    echarts4r::e_line(baseline_line, name = "Usual level", legend = FALSE, symbol = "none",
      lineStyle = list(color = "#8e8e93", width = 1.2, type = "dashed"), animation = FALSE) |>
    echarts4r::e_y_axis(min = lo, max = hi, interval = if (hi - lo <= 3) .5 else 1, name = "Readiness (0–10)",
      nameLocation = "middle", nameGap = 40,
      axisLabel = list(formatter = htmlwidgets::JS("function(v){return Number(v).toFixed(1);}")),
      splitLine = list(lineStyle = list(color = "#e5e5ea"))) |>
    echarts4r::e_x_axis(name = "The 13 tracked signals, added one at a time (numbered in the lists below)", nameLocation = "middle", nameGap = 30,
      axisLabel = list(interval = 0), axisTick = list(alignWithLabel = TRUE)) |>
    echarts4r::e_grid(left = 58, right = 24, top = 28, bottom = 68) |>
    echarts4r::e_tooltip(trigger = "item", formatter = tooltip_js) |>
    echarts4r::e_animation(duration = 520, easing = "cubicOut",
      delay = htmlwidgets::JS("function(idx){return idx * 110;}"))
  # e_labels() is broadcast to both stacked bars; the transparent base must not print a second label.
  chart$x$opts$series[[1]]$label <- list(show = FALSE)
  for (i in seq_len(nrow(z))) {
    active_colour <- colours[z$stage[i]]
    inactive_colour <- if (z$known[i]) "#b8b8bf" else "#dedee3"
    chart$x$opts$series[[2]]$data[[i]]$itemStyle <- list(
      color = if (z$held[i]) active_colour else inactive_colour, opacity = 1,
      borderColor = if (z$held[i]) "#1c1c1e" else inactive_colour,
      borderWidth = if (z$held[i]) 2 else 0, borderRadius = 5)
    chart$x$opts$series[[3]]$data[[i]]$itemStyle <- list(
      color = if (z$held[i]) active_colour else inactive_colour, borderColor = "#ffffff", borderWidth = 1.5)
    chart$x$opts$series[[3]]$data[[i]]$symbolSize <- if (z$held[i]) 9 else 6
  }
  chart$x$opts$series[[4]]$markLine <- list(symbol = "none", silent = TRUE,
    data = list(list(yAxis = baseline)), lineStyle = list(color = "#8e8e93", type = "dashed", width = 1),
    label = list(formatter = paste0("usual level ", fmt(baseline, 1)), position = "insideStartTop", color = "#636366", fontSize = 11))
  if (is.finite(actual)) chart$x$opts$series[[3]]$markLine <- list(symbol = "none", silent = TRUE,
    data = list(list(yAxis = actual)), lineStyle = list(color = "#187545", type = "solid", width = 2.5),
    label = list(formatter = paste0("felt ", fmt(actual, 0), "/10"), position = "insideStartBottom", color = "#187545", fontWeight = 700, fontSize = 12))
  chart$x$opts$series[[2]]$animationDelay <- htmlwidgets::JS("function(idx){return idx * 110;}")
  chart$x$opts$series[[3]]$animationDelay <- htmlwidgets::JS("function(idx){return idx * 110 + 160;}")
  chart
}

readiness_factor_key_ui <- function(parts) {
  z <- parts
  if (is.null(z) || !nrow(z)) return(htmltools::p(class = "empty-note", "No factor information for the selected day."))
  stage_card <- function(stage, title, range_text) {
    one <- z[z$stage == stage, , drop = FALSE]
    htmltools::div(class = paste("factor-sequence-stage", paste0("stage-", stage)),
      htmltools::div(class = "factor-stage-heading", htmltools::strong(title), htmltools::span(range_text)),
      htmltools::tags$ol(start = min(one$number), lapply(seq_len(nrow(one)), function(i) {
        r <- one[i, ]
        htmltools::tags$li(class = paste(if (r$held) "held" else "", if (!r$known) "unknown" else ""),
          htmltools::span(r$label), htmltools::tags$small(paste0(r$state, if (r$held || !r$known) paste0(" · ", readiness_delta_label(r$contribution), " pts", if (!r$known) " (average)" else "") else "")))
      })))
  }
  htmltools::div(class = "factor-sequence-key",
    stage_card(1, "Past week & 2 days ago", "1–4"),
    stage_card(2, "Yesterday", "5–9"),
    stage_card(3, "Last night's sleep", "10–13"))
}

# ---- Sleep windows for the 7 days on the date strip ----
sleep_window_data <- function(d, day, span = 7L) {
  dates <- seq(as.Date(day) - as.integer(span) + 1L, as.Date(day), by = "day")
  z <- merge(data.frame(date = dates), d[c("date", "start_hour", "end_hour", "sleep_hours", "sleep_minutes", "awake_minutes")], by = "date", all.x = TRUE)
  z$start_plot <- z$start_hour
  z$start_plot[is.finite(z$start_plot) & z$start_plot < 12] <- z$start_plot[is.finite(z$start_plot) & z$start_plot < 12] + 24
  z$end_plot <- z$end_hour
  z$end_plot[is.finite(z$end_plot) & z$end_plot < 18] <- z$end_plot[is.finite(z$end_plot) & z$end_plot < 18] + 24
  z$valid <- is.finite(z$start_plot) & is.finite(z$end_plot) & z$end_plot > z$start_plot & z$end_plot - z$start_plot <= 18
  z$efficiency <- ifelse(is.finite(z$sleep_minutes + z$awake_minutes) & z$sleep_minutes + z$awake_minutes > 0,
    100 * z$sleep_minutes / (z$sleep_minutes + z$awake_minutes), NA_real_)
  z$tip <- paste0("Night ending ", day_label(z$date), "<br>Asleep ", clock_text(z$start_hour), " · awake ", clock_text(z$end_hour),
    "<br>Time asleep ", duration_label(z$sleep_hours),
    ifelse(is.finite(z$efficiency), paste0("<br>Sleep efficiency ", fmt_vec(z$efficiency, 0), "%"), ""), "<br>Click to open this day")
  z
}

clock_axis_label <- function(v) sprintf("%02d:00", as.integer(round(v)) %% 24)

# A rounded rectangle whose top and bottom edges sit exactly on its y values. The corner radius is
# given in pixels and converted to data units on each axis, so corners stay round, and they are
# drawn inside the box: the bar never reaches past the moment of falling asleep or waking.
rounded_rect <- function(x0, x1, y0, y1, rx, ry, n = 7) {
  rx <- min(rx, (x1 - x0) / 2); ry <- min(ry, (y1 - y0) / 2)
  arc <- function(cx, cy, from, to) { t <- seq(from, to, length.out = n); cbind(cx + rx * cos(t), cy + ry * sin(t)) }
  pts <- rbind(arc(x1 - rx, y0 + ry, -pi / 2, 0), arc(x1 - rx, y1 - ry, 0, pi / 2),
    arc(x0 + rx, y1 - ry, pi / 2, pi), arc(x0 + rx, y0 + ry, pi, 3 * pi / 2))
  data.frame(x = pts[, 1], y = pts[, 2])
}

# Each bar runs from falling asleep to waking; colour AND a printed percentage give efficiency.
# The colour range is fixed at 80-100% (where nearly all nights fall) so differences are visible.
# Nights without a record are shown as "no record" instead of silently disappearing.
health_sleep_window_plot <- function(d, day, span = 7L, px_w = 800, px_h = 380) {
  z <- sleep_window_data(d, day, span); shown <- z[z$valid, , drop = FALSE]
  if (!nrow(shown)) return(health_empty("No main-sleep windows in this week"))
  all <- sleep_window_data(d, max(d$date), nrow(d)); usual_start <- stats::median(all$start_plot[all$valid], na.rm = TRUE)
  usual_end <- stats::median(all$end_plot[all$valid], na.rm = TRUE)
  lo <- floor(min(c(shown$start_plot, usual_start), na.rm = TRUE) - .7); hi <- ceiling(max(c(shown$end_plot, usual_end), na.rm = TRUE) + 1.6)
  gaps <- z[!z$valid, , drop = FALSE]
  gaps$y <- rep((usual_start + usual_end) / 2, nrow(gaps))
  gaps$tip <- paste0("Night ending ", day_label(gaps$date), "<br>No main-sleep record", recycle0 = TRUE)
  # pixels -> data units for the plotting panel (axis labels, legend and margins taken off)
  per_day <- max(40, px_w - 70) / span; per_hour <- max(120, px_h - 130) / (hi - lo)
  half <- 12 / per_day
  shown$id <- as.character(shown$date)
  bars <- do.call(rbind, lapply(seq_len(nrow(shown)), function(i) {
    r <- rounded_rect(as.numeric(shown$date[i]) - half, as.numeric(shown$date[i]) + half, shown$start_plot[i], shown$end_plot[i], 7 / per_day, 7 / per_hour)
    r$id <- shown$id[i]; r$efficiency <- shown$efficiency[i]; r$tip <- shown$tip[i]; r
  }))
  bars$x <- as.Date(bars$x)
  ggplot2::ggplot(shown, ggplot2::aes(date)) +
    ggplot2::geom_hline(yintercept = c(usual_start, usual_end), colour = VIZ$muted, linewidth = .45, linetype = "dashed") +
    ggiraph::geom_polygon_interactive(data = bars, ggplot2::aes(x, y, group = id, fill = efficiency, tooltip = tip, data_id = id), colour = NA) +
    ggplot2::geom_text(ggplot2::aes(y = end_plot + 14 / per_hour, label = ifelse(is.finite(efficiency), paste0(round(efficiency), "%"), "")),
      vjust = 0, size = 3.1, colour = VIZ$ink, family = PLOT_FONT) +
    (if (nrow(gaps)) list(ggplot2::geom_point(data = gaps, ggplot2::aes(date, y), shape = 4, size = 3, stroke = .9, colour = VIZ$muted),
      ggiraph::geom_text_interactive(data = gaps, ggplot2::aes(date, y, label = "no record", tooltip = tip), vjust = 2, size = 2.9, colour = VIZ$muted, family = PLOT_FONT)) else NULL) +
    ggplot2::scale_fill_gradient(low = "#d6cbf5", high = "#2e1470", na.value = VIZ$muted, limits = c(80, 100), oob = scales::squish,
      name = "Sleep efficiency (time asleep ÷ time in bed)", breaks = c(80, 90, 100), labels = c("80% or less", "90%", "100%"),
      guide = ggplot2::guide_colourbar(barwidth = grid::unit(60, "mm"), barheight = grid::unit(4, "mm"), title.position = "top")) +
    ggplot2::scale_x_date(limits = c(min(z$date) - .5, max(z$date) + .5), breaks = z$date, labels = paste0(short_date(z$date), "\n", WEEKDAY[as.POSIXlt(z$date)$wday + 1L])) +
    ggplot2::scale_y_reverse(limits = c(hi, lo), breaks = seq(lo, hi, by = 2), labels = clock_axis_label) +
    ggplot2::labs(x = NULL, y = NULL) + health_theme() +
    ggplot2::theme(panel.grid.major.x = ggplot2::element_blank(), legend.position = "top", legend.justification = "left",
      legend.title = ggplot2::element_text(size = 10))
}

sleep_window_table <- function(d, day, span = 7L) {
  z <- sleep_window_data(d, day, span)
  rows <- lapply(seq_len(nrow(z)), function(i) list(view_date_button(z$date[i]),
    if (z$valid[i]) clock_text(z$start_hour[i]) else "no record", if (z$valid[i]) clock_text(z$end_hour[i]) else "no record",
    if (is.finite(z$sleep_hours[i])) duration_label(z$sleep_hours[i]) else "no record",
    if (is.finite(z$efficiency[i])) paste0(fmt(z$efficiency[i]), "%") else "—"))
  view_table("The same nights as the chart (dated by the morning they end)", c("Morning", "Asleep", "Awake", "Time asleep", "Efficiency"), rows)
}

sleep_window_note <- function(d, day, span = 7L) {
  z <- sleep_window_data(d, day, span); z <- z[z$valid, , drop = FALSE]
  if (!nrow(z)) return(htmltools::p(class = "empty-note", "No valid main-sleep records this week."))
  all <- sleep_window_data(d, max(d$date), nrow(d))
  htmltools::tagList(
    htmltools::p(class = "comparison-conclusion", paste0(nrow(z), " of ", span, " nights recorded: typically asleep at ",
      clock_text(stats::median(z$start_plot, na.rm = TRUE) %% 24), " and awake at ", clock_text(stats::median(z$end_plot, na.rm = TRUE) %% 24),
      ", averaging ", duration_label(mean(z$sleep_hours, na.rm = TRUE)), " asleep.")),
    htmltools::p(class = "fine-print", paste0("Dashed lines: this participant's usual bedtime (", clock_text(stats::median(all$start_plot[all$valid], na.rm = TRUE) %% 24),
      ") and wake time (", clock_text(stats::median(all$end_plot[all$valid], na.rm = TRUE) %% 24), ") over the whole record.")))
}

# ---- Reported training load: 7-day total vs 28-day weekly average ----
# Only days inside the participant's record count. A day before `first_day` is not a zero-load day,
# it is a day with no record at all, so it never enters a total: the 7-day total needs all 7 days
# on record, and the weekly average is the load over the days on record in the last 28, scaled to
# 7 days, once at least LOAD_MIN_DAYS of them exist. Otherwise both stay missing and no percentage
# is given. Inside the record, a day with no session adds 0 to "load logged" (and a blank load is
# counted as 0 but flagged), as before.
LOAD_MIN_DAYS <- 14L
training_load_series <- function(training, participant, day, span = 56L, first_day = NULL) {
  day <- as.Date(day); all_days <- seq(day - as.integer(span) - 27L + 1L, day, by = "day")
  first_day <- if (is.null(first_day)) min(all_days) else as.Date(first_day)
  z <- data.frame(date = all_days, load = 0, reported = FALSE, unknown = FALSE, on_record = all_days >= first_day)
  tr <- if (is.null(training)) NULL else training[training$participant == participant & training$date %in% all_days, , drop = FALSE]
  if (!is.null(tr) && nrow(tr)) {
    at <- match(tr$date, z$date); z$reported[at] <- TRUE; z$unknown[at] <- !is.finite(tr$load)
    z$load[at] <- ifelse(is.finite(tr$load), tr$load, 0)
  }
  window_sum <- function(v, n) vapply(seq_along(v), function(i) sum(v[max(1, i - n + 1):i]), numeric(1))
  known <- ifelse(z$on_record, z$load, 0)
  z$days7 <- window_sum(z$on_record, 7); z$days28 <- window_sum(z$on_record, 28)
  z$load7 <- ifelse(z$days7 == 7, window_sum(known, 7), NA_real_)
  z$load28_weekly <- ifelse(z$days28 >= LOAD_MIN_DAYS, window_sum(known, 28) / z$days28 * 7, NA_real_)
  z$unknown7 <- as.integer(window_sum(z$unknown, 7)); z$unknown28 <- as.integer(window_sum(z$unknown, 28))
  z <- utils::tail(z, span)
  z$tip7 <- paste0(day_label(z$date), "<br>Last 7 days: ",
    ifelse(is.finite(z$load7), fmt_vec(z$load7, 0), paste0("not all 7 days on record yet (", z$days7, " of 7)")),
    ifelse(z$unknown7 > 0, paste0("<br>", z$unknown7, " session day(s) with blank load"), ""), "<br>Click to inspect this day")
  z$tip28 <- paste0(day_label(z$date), "<br>Weekly average over the last 28 days: ",
    ifelse(is.finite(z$load28_weekly), paste0(fmt_vec(z$load28_weekly, 0), ifelse(z$days28 < 28, paste0(" (from the ", z$days28, " days on record)"), "")),
      paste0("not enough days on record yet (", z$days28, "; needs ", LOAD_MIN_DAYS, ")")),
    ifelse(z$unknown28 > 0, paste0("<br>", z$unknown28, " session day(s) with blank load"), ""), "<br>Click to inspect this day")
  z
}
# How far the 7-day total sits from the usual week, or NA when either is not available.
load_change_pct <- function(r) if (is.finite(r$load7) && is.finite(r$load28_weekly) && r$load28_weekly > 0) 100 * (r$load7 / r$load28_weekly - 1) else NA_real_

# Like the Apple Fitness trend view: clicking a point only INSPECTS that day (the selection ring
# and the callout above the chart follow it); the dashboard's selected day stays locked, marked by
# the large hollow ring at the right-hand end.
health_training_load_plot <- function(training, participant, day, span = 56L, first_day = NULL, narrow = FALSE) {
  z <- training_load_series(training, participant, day, span, first_day)
  long <- rbind(data.frame(date = z$date, value = z$load7, series = "Last 7 days (total)", tip = z$tip7),
    data.frame(date = z$date, value = z$load28_weekly, series = "Last 28 days (weekly average)", tip = z$tip28))
  long$series <- factor(long$series, levels = c("Last 7 days (total)", "Last 28 days (weekly average)"))
  # days without a value (not enough of the window on record) leave a gap, never a zero
  shown <- long[is.finite(long$value), , drop = FALSE]
  if (!nrow(shown)) return(health_empty("Not enough days on record yet for a 7-day total"))
  sel <- utils::tail(long[long$series == "Last 7 days (total)", ], 1)
  p <- ggplot2::ggplot(long, ggplot2::aes(date, value, colour = series, group = series)) +
    ggplot2::geom_area(data = z, ggplot2::aes(date, load7), inherit.aes = FALSE, fill = VIZ$purple, alpha = .09, na.rm = TRUE) +
    # a line needs two points: a series with a single value so far is drawn as its point only
    ggplot2::geom_line(data = shown[stats::ave(seq_len(nrow(shown)), shown$series, FUN = length) >= 2, , drop = FALSE], linewidth = 1.15) +
    ggiraph::geom_point_interactive(data = shown[shown$series == "Last 7 days (total)", ], ggplot2::aes(tooltip = tip, data_id = as.character(date)), size = 2.4) +
    (if (is.finite(sel$value)) ggplot2::geom_point(data = sel, shape = 21, size = 5, stroke = 1.3, fill = VIZ$card)) +
    ggplot2::scale_colour_manual(values = c("Last 7 days (total)" = VIZ$purple, "Last 28 days (weekly average)" = VIZ$ink)) +
    # phone width: a date every two weeks instead of every week, so the labels do not collide
    ggplot2::scale_x_date(date_breaks = if (narrow) "2 weeks" else "1 week", labels = function(x) short_date(x)) +
    ggplot2::scale_y_continuous(labels = scales::label_number(big.mark = ","), expand = ggplot2::expansion(mult = c(0, .1))) +
    ggplot2::labs(x = NULL, y = "Reported load (min × RPE)", colour = NULL) + health_theme() +
    ggplot2::theme(legend.position = "top", legend.justification = "left", panel.grid.major.x = ggplot2::element_blank())
  # at phone width the two legend keys go on two rows instead of running off the right edge
  if (narrow) p <- p + ggplot2::guides(colour = ggplot2::guide_legend(nrow = 2))
  p
}

# The callout for the day being inspected: how the 7-day total compares with the usual week, and
# what was logged on that day. It never moves the dashboard's selected day by itself.
LOAD_WORDS <- function(pct) if (!is.finite(pct)) "Not enough days on record yet" else if (pct <= -50) "Well below usual" else if (pct <= -20) "Below usual" else
  if (pct < 20) "Near usual" else if (pct < 50) "Above usual" else "Well above usual"
training_load_callout <- function(training, participant, day, pick, span = 56L, first_day = NULL) {
  z <- training_load_series(training, participant, day, span, first_day)
  pick <- if (is.null(pick) || !as.Date(pick) %in% z$date) as.Date(day) else as.Date(pick)
  r <- z[z$date == pick, , drop = FALSE]
  pct <- load_change_pct(r)
  t <- if (is.null(training)) NULL else training[training$participant == participant & training$date == pick, , drop = FALSE]
  that_day <- if (is.null(t) || !nrow(t)) "No session logged that day" else paste0(tools::toTitleCase(train_types_text(t[1, ])),
    if (is.finite(t$load[1])) paste0(" · load ", fmt(t$load[1])) else " · load blank")
  locked <- pick == as.Date(day)
  htmltools::div(class = paste("load-callout", if (locked) "locked" else "inspecting"),
    htmltools::div(class = "load-callout-main",
      htmltools::span(class = "load-callout-date", paste0(day_label(pick, year = FALSE), if (locked) " · selected day" else " · inspecting")),
      htmltools::strong(LOAD_WORDS(pct)),
      htmltools::span(class = "load-callout-pct", if (is.finite(pct)) paste0(if (pct >= 0) "+" else "−", fmt(abs(pct)), "%") else "—")),
    htmltools::div(class = "load-callout-facts",
      htmltools::span(paste0("7-day total ", if (is.finite(r$load7)) fmt(r$load7) else paste0("— (", r$days7, " of 7 days on record)"))),
      htmltools::span(paste0("usual week ", if (is.finite(r$load28_weekly)) fmt(r$load28_weekly) else paste0("— (", r$days28, " days on record; needs ", LOAD_MIN_DAYS, ")"))),
      htmltools::span(that_day)),
    if (!locked) htmltools::tags$button(type = "button", class = "btn text-button load-open",
      onclick = sprintf("Shiny.setInputValue('calendar_day','%s',{priority:'event'})", as.character(pick)), "Open this day"))
}

training_load_table <- function(training, participant, day, span = 56L, first_day = NULL) {
  z <- training_load_series(training, participant, day, span, first_day)
  rows <- lapply(seq_len(nrow(z)), function(i) list(view_date_button(z$date[i]), fmt(z$load7[i]),
    fmt(z$load28_weekly[i]), paste0(z$days28[i], " of 28"), as.character(z$unknown7[i]), as.character(z$unknown28[i])))
  view_table(paste0("The same days as the chart; the weekly average is the load over the days on record in the last 28, scaled to 7 days (needs ", LOAD_MIN_DAYS, " days on record; days before the record are not counted as zero)"),
    c("Date", "7-day total", "28-day weekly average", "Days on record (28 d)", "Blank loads (7 d)", "Blank loads (28 d)"), rows)
}

# ---- Felt vs expected over the last four weeks (the main readiness chart) ----
# Blue line and rings: what the participant's usual level and tracked data led us to expect.
# Green dots: how they actually felt. The grey stick between them is the gap. The selected day's
# felt value stays hidden until "Reveal"; days without a check-in keep a small cross.
health_felt_expected_plot <- function(s, day) {
  if (is.null(s) || !any(is.finite(s$expected))) return(health_empty("No expected values yet: needs a check-in in at least 3 of the 4 weeks before the most recent one"))
  s$gap <- s$felt - s$expected
  vals <- c(s$expected, s$felt); vals <- vals[is.finite(vals)]
  lo <- max(0, floor(min(vals)) - 1); hi <- min(10, ceiling(max(vals)) + 1)
  if (hi - lo < 4) { hi <- min(10, lo + 4); lo <- max(0, hi - 4) }
  words <- function(g) ifelse(abs(g) < .05, "as expected", paste0(fmt_vec(abs(g), 1), ifelse(g > 0, " better", " worse"), " than expected"))
  s$tip <- paste0(day_label(s$date), "<br>Expected ", fmt_vec(s$expected, 1), "/10",
    ifelse(is.finite(s$felt), paste0("<br>Felt ", s$felt, "/10 · ", words(s$gap)), ifelse(s$date == day, "<br>Felt: hidden until you reveal", "<br>No check-in")),
    "<br>Click to open this day")
  both <- s[is.finite(s$felt) & is.finite(s$expected), , drop = FALSE]
  exp_pts <- s[is.finite(s$expected), , drop = FALSE]
  miss <- s[!is.finite(s$felt) & s$date != day, , drop = FALSE]
  sel <- s[s$date == day, , drop = FALSE]
  ggplot2::ggplot() +
    ggplot2::annotate("rect", xmin = day - .5, xmax = day + .5, ymin = -Inf, ymax = Inf, fill = "#e9eff9") +
    ggplot2::geom_segment(data = both, ggplot2::aes(x = date, xend = date, y = expected, yend = felt), colour = "#9a9aa2", linewidth = .9) +
    ggplot2::geom_line(data = exp_pts, ggplot2::aes(date, expected), colour = VIZ$blue, linewidth = .8) +
    ggiraph::geom_point_interactive(data = exp_pts, ggplot2::aes(date, expected, tooltip = tip, data_id = as.character(date)),
      shape = 21, fill = VIZ$card, colour = VIZ$blue, size = 2.4, stroke = 1) +
    ggiraph::geom_point_interactive(data = both, ggplot2::aes(date, felt, tooltip = tip, data_id = as.character(date)),
      colour = VIZ$green, size = 3) +
    (if (nrow(miss)) ggiraph::geom_point_interactive(data = miss, ggplot2::aes(date, lo + .25, tooltip = tip, data_id = as.character(date)),
      shape = 4, size = 2, colour = "#8e8e94") else NULL) +
    (if (nrow(sel) && !is.finite(sel$felt[1]) && is.finite(sel$expected[1]))
      ggplot2::annotate("text", x = day, y = sel$expected[1] + .55, label = "?", size = 4.2, fontface = "bold", colour = VIZ$blue, family = PLOT_FONT) else NULL) +
    ggplot2::scale_x_date(limits = range(s$date) + c(-.6, .6), date_breaks = "1 week", labels = function(x) short_date(x)) +
    ggplot2::scale_y_continuous(limits = c(lo, hi), breaks = seq(lo, hi, 1)) +
    ggplot2::labs(x = NULL, y = "Readiness (0–10)") + health_theme() +
    ggplot2::theme(panel.grid.major.x = ggplot2::element_blank())
}

felt_expected_note <- function(s, who) {
  both <- s[is.finite(s$felt) & is.finite(s$expected), , drop = FALSE]
  if (nrow(both) < 3) return(htmltools::p(class = "empty-note", "Too few days with both a check-in and an expected value."))
  g <- both$felt - both$expected
  htmltools::p(class = "comparison-conclusion", paste0("Over these ", nrow(both), " days, ", who, " felt on average ", fmt(mean(abs(g)), 1),
    " points away from expected: better by more than 1 point on ", sum(g > 1), " days, worse by more than 1 point on ", sum(g < -1), "."))
}

felt_expected_table <- function(s) {
  view_table("The same days as the chart; a hidden check-in stays hidden",
    c("Date", "Usual level", "Tracked data", "Expected", "Felt", "Felt − expected"),
    lapply(rev(seq_len(nrow(s))), function(i) { r <- s[i, ]
      list(view_date_button(r$date), fmt(r$level, 1), readiness_delta_label(r$adjustment), fmt(r$expected, 1),
        if (is.finite(r$felt)) paste0(r$felt, "/10") else "—", if (is.finite(r$felt) && is.finite(r$expected)) deviation_label(r$felt - r$expected, 1L) else "—") }))
}
