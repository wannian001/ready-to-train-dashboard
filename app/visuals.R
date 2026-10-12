# Visual presentation only. Cohorts and baselines are computed in insights.R.
# Inspired by public Apple Health, PeakWatch and Lianjiu (练就) interfaces; no product assets or proprietary
# scoring formulas are reused.
# One hue per category, held across headings, charts and legends: readiness pink, sleep purple,
# model blue, population grey, actual self-report green. Colour is never the only carrier:
# significance is a filled vs hollow shape, the selected day a ring or a band.
VIZ <- list(bg = "#f2f2f7", card = "#ffffff", ink = "#1c1c1e", muted = "#636366",
  grid = "#d1d1d6", blue = "#0056b3", purple = "#6844c5", green = "#187545", amber = "#925100",
  pink = "#ba1645", grey = "#77777d")

duration_label <- function(x) vapply(x, function(v) {
  if (!is.finite(v)) return("—")
  m <- as.integer(round(v * 60)); paste0(m %/% 60, " h ", sprintf("%02d", m %% 60), " min")
}, character(1))
icon_svg <- function(name) {
  paths <- switch(name,
    moon = '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
    pulse = '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    compare = '<path d="M5 20V10m7 10V4m7 16V7"/>',
    calendar = '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    body = '<circle cx="12" cy="4.5" r="2.2"/><path d="M12 7.5v7m0 0-3 6.5m3-6.5 3 6.5M6.5 10.5 12 9l5.5 1.5"/>',
    bulb = '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>',
    info = '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    '<path d="m5 12 4 4L19 6"/>')
  htmltools::HTML(paste0('<svg class="metric-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">', paths, '</svg>'))
}
health_theme <- function() ggplot2::theme_minimal(base_size = 12, base_family = PLOT_FONT) +
  ggplot2::theme(text = ggplot2::element_text(colour = VIZ$muted),
    axis.text = ggplot2::element_text(colour = VIZ$muted, size = 11),
    axis.title = ggplot2::element_text(colour = VIZ$muted, size = 11),
    panel.grid.minor = ggplot2::element_blank(), panel.grid.major = ggplot2::element_line(colour = VIZ$grid, linewidth = .3),
    plot.background = ggplot2::element_rect(fill = "transparent", colour = NA),
    panel.background = ggplot2::element_rect(fill = "transparent", colour = NA),
    legend.background = ggplot2::element_rect(fill = "transparent", colour = NA),
    legend.key = ggplot2::element_rect(fill = "transparent", colour = NA),
    legend.text = ggplot2::element_text(colour = VIZ$muted, size = 11),
    plot.margin = ggplot2::margin(12, 12, 4, 4), legend.position = "none")
health_empty <- function(text) ggplot2::ggplot() + ggplot2::annotate("text", x = 0, y = 0, label = text,
  colour = VIZ$muted, family = PLOT_FONT, size = 3.7) + ggplot2::theme_void() +
  ggplot2::theme(plot.background = ggplot2::element_rect(fill = "transparent", colour = NA))
health_widget <- function(plot, width = 7, height = 3, selected = character(), sel_css = "stroke:#1c1c1e;") {
  ggiraph::girafe(ggobj = plot, width_svg = width, height_svg = height, bg = VIZ$card,
    options = list(ggiraph::opts_selection(type = "single", selected = selected, css = sel_css),
      ggiraph::opts_hover(css = "stroke:#1c1c1e;cursor:pointer;opacity:.85;"),
      ggiraph::opts_tooltip(css = "background:#29374f;color:#fff;padding:10px 13px;border:1px solid #4c6080;border-radius:10px;font:14px -apple-system,'Segoe UI',Arial,sans-serif;line-height:1.6;", opacity = .98),
      ggiraph::opts_toolbar(saveaspng = FALSE, hidden = c("zoom", "selection", "lasso", "misc")),
      ggiraph::opts_sizing(rescale = TRUE)))
}

sleep_window <- function(d, day, period = NULL) {
  used <- recent_valid_rows(d, day, "sleep_hours", 5L, period)
  start <- if (nrow(used)) min(used$date) else min(d$date)
  searched <- if (start < day) merge(data.frame(date = seq(start, day - 1, by = "day")), d, by = "date", all.x = TRUE, sort = TRUE) else d[FALSE, , drop = FALSE]
  wd <- as.POSIXlt(searched$date)$wday
  included <- if (is.null(period)) rep(TRUE, nrow(searched)) else if (period == "workday") wd %in% 1:5 else wd %in% c(0, 6)
  list(days = used, person = used, n = nrow(used), expected = 5L,
       missing = sum(included & !is.finite(searched$sleep_hours)),
       start = if (nrow(used)) min(used$date) else as.Date(NA), end = if (nrow(used)) max(used$date) else as.Date(NA),
       mean = if (nrow(used)) mean(used$sleep_hours) else NA_real_,
       total = if (nrow(used)) sum(used$sleep_hours) else NA_real_)
}
record_range <- function(first, last) {
  if (!length(first) || is.na(first) || is.na(last)) return("no valid dates")
  paste0(short_date(first), " – ", day_label(last, weekday = FALSE))
}
cohort_context <- function(cohort, d, day) {
  recent <- sleep_window(d, day, cohort$period)
  rows <- cohort$rows[order(cohort$rows$hours), , drop = FALSE]
  med <- if (nrow(rows)) rows$hours[which(cumsum(rows$weight) >= sum(rows$weight) / 2)[1]] else NA_real_
  c(recent, list(median = med,
       median_label = if (is.na(med)) "—" else if (med == 2) "under 3 h" else if (med == 14) "14 h or more" else duration_label(med)))
}

# NHANES usual sleep (grey, whole-hour bins) with this person's recent Fitbit nights as a separate
# labelled row underneath, so the dots never sit on the percentage axis.
health_population_plot <- function(cohort, d, day, who = "") {
  if (cohort$n < 30) return(health_empty("Fewer than 30 survey answers in this group\nThe distribution is not shown"))
  b <- cohort$bins; cx <- cohort_context(cohort, d, day); w <- cx$person
  b$label <- ifelse(b$bin == 2, "under 3 h", ifelse(b$bin == 14, "14 h or more", paste0(b$bin, "–", b$bin + 1, " h")))
  b$tip <- paste0(b$label, "<br>", round(b$percent, 1), "% of the weighted survey group")
  w$x <- pmin(14.9, pmax(2.1, w$sleep_hours))
  top <- max(b$percent) * 1.12
  w$y <- if (nrow(w)) -top * (.13 + (seq_len(nrow(w)) - 1) * .035) else numeric()
  w$tip <- if (nrow(w)) paste0(day_label(w$date), "<br>Fitbit main sleep ", duration_label(w$sleep_hours), "<br>Click to open this day") else character()
  ggplot2::ggplot() +
    ggiraph::geom_col_interactive(data = b, ggplot2::aes(bin + .5, percent, tooltip = tip, data_id = paste0("bin", bin)),
      fill = "#8e8e94", width = .86) +
    ggplot2::geom_hline(yintercept = 0, colour = VIZ$muted, linewidth = .4) +
    ggplot2::annotate("text", x = 2.05, y = -top * .06, label = paste0(who, " · recent nights (Fitbit)"),
      hjust = 0, vjust = 1, size = 3, colour = VIZ$purple, family = PLOT_FONT) +
    ggiraph::geom_point_interactive(data = w, ggplot2::aes(x, y, tooltip = tip, data_id = as.character(date)),
      colour = VIZ$purple, size = 3.1) +
    ggplot2::scale_x_continuous(limits = c(2, 15), breaks = c(2.5, 4, 6, 8, 10, 12, 14.5),
      labels = c("<3", "4", "6", "8", "10", "12", "14+"), expand = c(0, 0)) +
    ggplot2::scale_y_continuous(limits = c(-top * (.2 + max(0, nrow(w) - 1) * .035), top), breaks = pretty(c(0, top), 3)[pretty(c(0, top), 3) >= 0],
      labels = function(x) paste0(x, "%")) +
    ggplot2::labs(x = "Usual sleep per night (hours)", y = NULL) + health_theme() +
    ggplot2::theme(panel.grid.major.x = ggplot2::element_blank())
}

# fmt() is scalar by design; scales and labels need a vectorised formatter.
signed_num <- function(x, digits = 2L) {
  r <- round(x, digits); r[is.finite(r) & r == 0] <- 0   # a rounded -0 must not print as "-0.00"
  ifelse(is.finite(x), paste0(ifelse(r > 0, "+", ""), formatC(r, format = "f", digits = digits)), "—")
}
# The sign follows the ROUNDED value, so a tiny adjustment reads "0.00", never "−0.00".
deviation_label <- function(x, digits = 1L) vapply(x, function(v) {
  if (!is.finite(v)) return("—")
  r <- round(v, digits); paste0(if (r > 0) "+" else if (r < 0) "−" else "", fmt(abs(r), digits))
}, character(1))

# Hour-by-hour recorded steps. Colour carries the value; missing hours also carry a cross.
health_activity_heatmap <- function(hourly, participant, day, span = 28L) {
  dates <- seq(as.Date(day) - as.integer(span) + 1L, as.Date(day), by = "day")
  h <- merge(expand.grid(date = dates, hour = 0:23),
    hourly[hourly$participant == participant, c("date", "hour", "steps", "observed_minutes"), drop = FALSE],
    by = c("date", "hour"), all.x = TRUE)
  if (!any(is.finite(h$steps))) return(health_empty("No hourly step records in this period"))
  h$tip <- paste0(day_label(h$date), " ", sprintf("%02d:00", h$hour), "<br>",
    ifelse(is.finite(h$steps), paste0(format(h$steps, big.mark = ",", trim = TRUE), " steps · ", h$observed_minutes, "/60 minutes recorded"),
      "No valid minutes recorded in this hour"), "<br>Click to open this day")
  missing <- h[!is.finite(h$steps), , drop = FALSE]
  ggplot2::ggplot(h, ggplot2::aes(hour, date)) +
    ggiraph::geom_tile_interactive(ggplot2::aes(fill = steps, tooltip = tip, data_id = as.character(date)),
      width = .97, height = .9, colour = VIZ$card, linewidth = .15) +
    ggplot2::geom_point(data = missing, ggplot2::aes(hour, date), shape = 4, size = .85, stroke = .4, colour = "#8e8e94") +
    ggplot2::scale_fill_gradient(low = "#fbeef2", high = VIZ$pink, na.value = "#eaeaef", name = "Steps in the hour (square-root scale)",
      trans = "sqrt", breaks = c(0, 500, 2000, 5000), labels = c("0", "500", "2,000", "5,000"),
      guide = ggplot2::guide_colourbar(barwidth = grid::unit(80, "mm"), barheight = grid::unit(4, "mm"), title.position = "top")) +
    ggplot2::scale_x_continuous(breaks = c(0, 3, 6, 9, 12, 15, 18, 21, 23),
      labels = c("00", "03", "06", "09", "12", "15", "18", "21", "23"), expand = c(0, 0)) +
    (if (length(dates) <= 14) ggplot2::scale_y_date(breaks = dates, expand = c(0, 0), labels = day_label(dates, year = FALSE))
      else ggplot2::scale_y_date(date_breaks = "1 week", labels = function(x) short_date(x), expand = c(0, 0))) +
    ggplot2::labs(x = "Hour of day", y = NULL) + health_theme() +
    ggplot2::theme(panel.grid = ggplot2::element_blank(), legend.position = "top",
      legend.title = ggplot2::element_text(colour = VIZ$muted, size = 10),
      legend.margin = ggplot2::margin(0, 0, 4, 0), legend.justification = "left")
}

# ---- Yesterday's load and this morning's soreness answer, pooled over all participants ----
SORENESS_FILL <- c("1 very sore" = "#7a3d00", "2 sorer than usual" = "#b06500", "3 same as usual" = "#b7b7c0",
  "4 less sore" = "#2f8a5c", "5 feeling great" = "#0f5c34")

# Ordinal self-report as 100% stacked shares, one panel per load band with its label, record count
# and the "sorer" share written above the bar so nothing sits outside the plot at 375px. The five
# answers are mutually exclusive answers to one question, so stacking to 100% is valid here.
load_band_titles <- function(shares) {
  worse <- do.call(rbind, lapply(split(shares, shares$band), function(z)
    data.frame(band = as.character(z$band[1]), n = z$n[1], worse = sum(z$share[z$level %in% names(SORENESS_FILL)[1:2]]))))
  worse <- worse[match(SORENESS_LABELS, worse$band), , drop = FALSE]
  worse <- worse[!is.na(worse$band), , drop = FALSE]
  worse$title <- paste0(worse$band, " · ", format(worse$n, big.mark = ",", trim = TRUE), " mornings · ", round(worse$worse * 100), "% sorer than usual")
  worse
}
health_load_soreness_plot <- function(shares, focal = NULL, narrow = FALSE) {
  if (is.null(shares) || !nrow(shares)) return(health_empty("No training and soreness records to compare"))
  titles <- load_band_titles(shares)
  mark <- if (!is.null(focal) && isTRUE(focal$status == "ok")) focal$band else NA_character_
  # phone width: the band on one line, its counts on the next
  if (narrow) titles$title <- paste0(titles$band, ifelse(titles$band %in% mark, " · this morning", ""), "\n",
    format(titles$n, big.mark = ",", trim = TRUE), " mornings · ", round(titles$worse * 100), "% sorer")
  else titles$title <- paste0(titles$title, ifelse(titles$band %in% mark, "   (this morning's band)", ""))
  shares$panel <- factor(titles$title[match(as.character(shares$band), titles$band)], levels = titles$title)
  shares$tip <- paste0(shares$band, "<br>", shares$level, ": ", shares$count, " mornings",
    "<br>", fmt_vec(shares$share * 100, 1), "% of this band (", shares$n, " mornings)")
  lab <- shares[shares$share >= .07, , drop = FALSE]
  lab$pos <- stats::ave(lab$share, lab$panel, FUN = function(v) cumsum(v) - v / 2)
  lab$ink <- ifelse(lab$level %in% names(SORENESS_FILL)[3:4], VIZ$ink, "#ffffff")
  ggplot2::ggplot() +
    ggiraph::geom_col_interactive(data = shares, ggplot2::aes(share, 1, fill = level, tooltip = tip,
      data_id = paste(band, level)), width = .72, colour = VIZ$card, linewidth = .4,
      position = ggplot2::position_stack(reverse = TRUE), orientation = "y") +
    ggplot2::geom_text(data = lab, ggplot2::aes(pos, 1, label = paste0(round(share * 100), "%"), colour = ink),
      family = PLOT_FONT, size = 3) +
    ggplot2::facet_wrap(~panel, ncol = 1) +
    ggplot2::scale_fill_manual(values = SORENESS_FILL, name = NULL) +
    ggplot2::scale_colour_identity() +
    ggplot2::scale_x_continuous(limits = c(0, 1), breaks = c(0, .25, .5, .75, 1),
      labels = c("0", "25%", "50%", "75%", "100%"), expand = ggplot2::expansion(mult = c(0, .025))) +
    ggplot2::scale_y_continuous(breaks = NULL) +
    ggplot2::labs(x = NULL, y = NULL) + health_theme() +
    ggplot2::theme(strip.text = ggplot2::element_text(colour = VIZ$ink, size = 10, hjust = 0),
      legend.position = "top", legend.justification = "left", legend.text = ggplot2::element_text(size = 9.5),
      panel.grid.major.y = ggplot2::element_blank(), panel.spacing.y = grid::unit(.4, "lines"), plot.margin = ggplot2::margin(8, 20, 4, 4)) +
    (if (narrow) ggplot2::guides(fill = ggplot2::guide_legend(nrow = 3, byrow = TRUE)))
}

# ---- The energy ledger: a concept demo of a possible feature, drawn as a model and never as a reading ----
health_battery_plot <- function(series, day = NULL) {
  if (is.null(series) || !nrow(series)) return(health_empty("Not enough records to run the energy ledger"))
  g <- series; g$tip <- paste0(day_label(g$date), "<br>Energy ", fmt_vec(g$level, 1), " of 100 (concept demo, not a measurement)",
    "<br>Day before: ", ifelse(!g$reported_prev, "no session logged, used 0", ifelse(g$unknown_prev, "session logged but load blank, used 0",
      paste0("load ", fmt_vec(g$load_prev, 0), ", used ", fmt_vec(g$drain, 1), " points"))), "<br>Regained today ", fmt_vec(g$gain, 1),
    ifelse(is.finite(g$readiness), paste0("<br>Self-rated readiness ", g$readiness, "/10"), ""),
    "<br>Click to open this day")
  trained <- g[g$load_prev > 0, , drop = FALSE]
  blank <- g[g$unknown_prev, , drop = FALSE]
  p <- ggplot2::ggplot(g) +
    ggplot2::geom_area(ggplot2::aes(date, level), fill = VIZ$blue, alpha = .12) +
    ggplot2::geom_line(ggplot2::aes(date, level), colour = VIZ$blue, linewidth = .85) +
    ggiraph::geom_point_interactive(ggplot2::aes(date, level, tooltip = tip, data_id = as.character(date)),
      colour = VIZ$blue, size = 1.5, alpha = .01) +
    ggplot2::geom_point(data = trained, ggplot2::aes(date, -4, size = load_prev), shape = 17, colour = "#48484a", alpha = .8) +
    ggplot2::geom_point(data = blank, ggplot2::aes(date, -4), shape = 2, size = 1.6, colour = "#48484a") +
    ggplot2::scale_size_continuous(range = c(.7, 2.6), guide = "none") +
    ggplot2::scale_y_continuous(limits = c(-8, 104), breaks = seq(0, 100, by = 25)) +
    ggplot2::scale_x_date(date_breaks = "1 month", labels = function(x) MONTHS[as.POSIXlt(x)$mon + 1L]) +
    ggplot2::labs(x = NULL, y = "Energy (demo rule)") + health_theme() +
    ggplot2::theme(panel.grid.major.x = ggplot2::element_blank())
  if (!is.null(day) && as.Date(day) >= min(g$date) && as.Date(day) <= max(g$date)) p <- p +
    ggplot2::geom_vline(xintercept = as.Date(day), colour = VIZ$ink, linetype = "dotted", linewidth = .6)
  p
}

# Monthly review. The bar is the number of sessions (each counted once); types are multi-label and
# live in their own month x type matrix, so no coloured block is ever added up into the total.
health_monthly_totals <- function(m) {
  if (is.null(m) || !nrow(m)) return(health_empty("This participant reported no sessions"))
  m$partial <- is.finite(m$days_covered) & m$days_covered < m$days_in_month
  m$tip <- paste0(month_label(m$month), "<br>", m$sessions, " sessions · ", round(m$minutes / 60), " hours",
    ifelse(m$partial, paste0("<br>Record covers only ", m$days_covered, "/", m$days_in_month, " days of this month"), ""))
  cap <- max(1, m$sessions)
  ggplot2::ggplot(m) +
    ggiraph::geom_col_interactive(ggplot2::aes(month, sessions, tooltip = tip, data_id = as.character(month)),
      width = 20, fill = ifelse(m$partial, "#b5b5bf", "#48484a")) +
    ggplot2::geom_text(ggplot2::aes(month, sessions, label = paste0(sessions, ifelse(partial, "*", ""))),
      vjust = -.5, family = PLOT_FONT, size = 3.2, colour = VIZ$ink) +
    ggplot2::scale_x_date(date_breaks = "1 month", labels = function(x) MONTHS[as.POSIXlt(x)$mon + 1L]) +
    ggplot2::scale_y_continuous(limits = c(0, cap * 1.2)) +
    ggplot2::labs(x = NULL, y = "Sessions") + health_theme() +
    ggplot2::theme(panel.grid.major.x = ggplot2::element_blank())
}
health_monthly_types <- function(m) {
  if (is.null(m) || !nrow(m)) return(health_empty("No training types to list"))
  keys <- c(names(TRAIN_TYPES), "untyped"); labs <- c(unname(TRAIN_TYPES), "No type given")
  long <- do.call(rbind, lapply(seq_along(keys), function(i) data.frame(month = m$month, type = labs[i], count = m[[keys[i]]])))
  long$type <- factor(long$type, levels = rev(labs))
  long$tip <- paste0(month_label(long$month), "<br>", long$type, ": ", long$count, " sessions (a session can carry several tags)")
  long$dark <- long$count > max(long$count) * .55
  ggplot2::ggplot(long, ggplot2::aes(month, type)) +
    ggiraph::geom_tile_interactive(ggplot2::aes(fill = count, tooltip = tip, data_id = paste(month, type)),
      width = 26, height = .9, colour = VIZ$card) +
    ggplot2::geom_text(ggplot2::aes(label = count, colour = dark), family = PLOT_FONT, size = 3.2) +
    ggplot2::scale_fill_gradient(low = "#f2f2f7", high = "#48484a", guide = "none") +
    ggplot2::scale_colour_manual(values = c("FALSE" = VIZ$ink, "TRUE" = "#ffffff"), guide = "none") +
    ggplot2::scale_x_date(date_breaks = "1 month", labels = function(x) MONTHS[as.POSIXlt(x)$mon + 1L], expand = c(0, 0)) +
    ggplot2::labs(x = NULL, y = NULL) + health_theme() +
    ggplot2::theme(panel.grid = ggplot2::element_blank(), axis.text.y = ggplot2::element_text(colour = VIZ$ink, size = 10.5))
}

# ---- Page 2 · everyday choices and the next morning's readiness ----
# Same encoding as the page-1 evidence list. One chart lists every choice (never only the ones that
# passed the threshold) on ONE shared axis, so the lengths of different rows can be compared.
# `order = "effect"` sorts every shown row by its average difference (most negative first) under one
# heading, keeping the same shared axis, every row and every interval; the group moves into the label.
lever_rows <- function(effects, group = "all", order = "group") {
  z <- effects[is.finite(effects$effect), , drop = FALSE]
  if (group != "all") z <- z[z$group == group, , drop = FALSE]
  z$group_tag <- unname(LEVER_GROUP_SHORT[as.character(z$group)])
  if (identical(order, "effect")) {
    z <- z[order(z$effect), , drop = FALSE]
    z$group <- factor(rep("Sorted by average difference, most negative first", nrow(z)))
  } else {
    z$group <- factor(z$group, levels = LEVER_GROUP_LEVELS)
    z <- z[order(z$group, match(z$key, vapply(LEVER_SPECS, `[[`, "", "key"))), , drop = FALSE]
    z$group_tag <- NA_character_
  }
  z$ring <- rep(FALSE, nrow(z))
  z
}
lever_axis_limits <- function(effects) {
  lim <- range(c(0, effects$lo, effects$hi), na.rm = TRUE); lim + c(-1, 1) * diff(lim) * .06
}
health_levers_plot <- function(z, xlim = NULL, narrow = FALSE) {
  if (is.null(z) || !nrow(z)) return(health_empty("No choice has enough records"))
  z$clear <- z$effective
  # phone width: the people count stays in the tooltip and table, not on the row
  z$label_text <- paste0(z$label, ifelse(is.na(z$group_tag), "", paste0("  · ", z$group_tag)), if (narrow) "" else paste0("   (", z$people, " people)"))
  z$tip <- paste0(ifelse(is.na(z$group_tag), as.character(z$group), z$group_tag), " · ", z$label, "<br>", z$detail, "<br>Happened on ", z$yes, " of ", format(z$n, big.mark = ","),
    " participant-days · ", z$people, " participants with both kinds of day<br>Next-morning readiness ", deviation_label(z$effect, 2L), " points on average",
    "<br>95% interval ", deviation_label(z$lo, 2L), " to ", deviation_label(z$hi, 2L), " (clustered by participant, not adjusted for multiple tests)<br>", z$verdict)
  health_interval_rows(z, "group", if (narrow) "Next-morning readiness difference (points)" else "Difference in next-morning readiness (points, 0–10 scale)", "", xlim,
    sides = c("lower readiness next morning", "higher readiness next morning"), narrow = narrow)
}

# Ten habits, one strip each, every comparable participant a dot, the selected one ringed. The
# selected person's value is written into the strip title, so no label ever sits on a dot.
# ---- Ten profile measures as parallel coordinates ----
# One line per participant across the ten measures, each measure scaled on its own between the lowest
# and the highest participant, so the lines compare shapes and not units. A measure a participant is
# below the record threshold for is simply absent: the line breaks there instead of being drawn
# through a value that was never computed. At phone width the axes are rows instead of columns.
health_peer_parallel <- function(long, participant, compare = "", labeller, narrow = FALSE) {
  if (is.null(long) || !nrow(long)) return(health_empty("No dimension can be compared across participants"))
  axes <- unique(long$label)                      # the order build_peer_long() wrote, i.e. PEER_DIMENSIONS
  long$ax <- match(long$label, axes)
  long$shown <- vapply(seq_len(nrow(long)), function(i) labeller(long$value[i], long$unit[i]), character(1))
  long$pos <- stats::ave(long$value, long$key, FUN = function(v) {
    r <- range(v, na.rm = TRUE); if (diff(r) < 1e-12) rep(.5, length(v)) else (v - r[1]) / diff(r) })
  long$role <- ifelse(long$participant == participant, "me", ifelse(long$participant == compare, "compare", "other"))
  long$tip <- paste0(toupper(long$participant), "<br>", long$label, ": ", long$shown, "<br>",
    ifelse(long$role == "me", "The participant you are viewing",
      ifelse(long$role == "compare", "Comparison participant", "Click to compare with this participant")))
  long <- long[order(match(long$role, c("other", "compare", "me")), long$participant, long$ax), , drop = FALSE]
  # a segment only between two neighbouring measures this participant actually has
  segs <- do.call(rbind, lapply(split(long, long$participant), function(z) {
    z <- z[order(z$ax), , drop = FALSE]
    keep <- if (nrow(z) < 2) logical(0) else diff(z$ax) == 1
    if (!any(keep)) return(NULL)
    data.frame(participant = z$participant[1], role = z$role[1],
      ax = z$ax[-nrow(z)][keep], axend = z$ax[-1][keep], pos = z$pos[-nrow(z)][keep], posend = z$pos[-1][keep],
      tip = paste0(toupper(z$participant[1]), "<br>", z$label[-nrow(z)][keep], " → ", z$label[-1][keep]),
      stringsAsFactors = FALSE)
  }))
  segs <- segs[order(match(segs$role, c("other", "compare", "me")), segs$participant), , drop = FALSE]
  ends <- do.call(rbind, lapply(split(long, long$ax), function(z) data.frame(ax = z$ax[1],
    lo = labeller(min(z$value), z$unit[1]), hi = labeller(max(z$value), z$unit[1]), stringsAsFactors = FALSE)))
  # phone width: the measures become rows (value left to right); desktop: columns (value bottom to top)
  place <- function(d) { if (narrow) { d$x <- d$pos; d$y <- -d$ax } else { d$x <- d$ax; d$y <- d$pos }; d }
  place_end <- function(d) { if (narrow) { d$xend <- d$posend; d$yend <- -d$axend } else { d$xend <- d$axend; d$yend <- d$posend }; d }
  spine <- place_end(place(data.frame(ax = ends$ax, axend = ends$ax, pos = 0, posend = 1)))
  pts <- place(long); ln <- place_end(place(segs))
  me <- pts[pts$role == "me", , drop = FALSE]; cmp <- pts[pts$role == "compare", , drop = FALSE]
  # desktop: the two ends are written above and below each column. Phone: they join the row's own
  # label on the left, where no line can cross them.
  lo_lab <- place(data.frame(ax = ends$ax, pos = -.085, lab = ends$lo))
  hi_lab <- place(data.frame(ax = ends$ax, pos = 1.085, lab = ends$hi))
  row_lab <- paste0(axes, "\n", ends$lo[order(ends$ax)], " to ", ends$hi[order(ends$ax)])
  wrap <- function(s) gsub(" ", "\n", s)
  g <- ggplot2::ggplot(pts, ggplot2::aes(x, y)) +
    ggplot2::geom_segment(data = spine, ggplot2::aes(x = x, y = y, xend = xend, yend = yend), colour = "#d6d6dc", linewidth = .5) +
    ggiraph::geom_segment_interactive(data = ln, ggplot2::aes(x = x, y = y, xend = xend, yend = yend,
      colour = role, linewidth = role, tooltip = tip, data_id = participant), alpha = .9, lineend = "round") +
    ggiraph::geom_point_interactive(ggplot2::aes(colour = role, size = role, tooltip = tip, data_id = participant), alpha = .95) +
    ggplot2::geom_point(data = cmp, shape = 22, size = 4, stroke = 1.1, fill = NA, colour = VIZ$ink) +
    ggplot2::geom_point(data = me, shape = 21, size = 4.4, stroke = 1.2, fill = NA, colour = VIZ$ink) +
    (if (narrow) NULL else ggplot2::geom_text(data = lo_lab, ggplot2::aes(x, y, label = lab), inherit.aes = FALSE,
      family = PLOT_FONT, size = 2.7, colour = VIZ$muted)) +
    (if (narrow) NULL else ggplot2::geom_text(data = hi_lab, ggplot2::aes(x, y, label = lab), inherit.aes = FALSE,
      family = PLOT_FONT, size = 2.7, colour = VIZ$muted)) +
    ggplot2::scale_colour_manual(values = c(me = VIZ$blue, compare = VIZ$ink, other = "#b8b8c0"), guide = "none") +
    ggplot2::scale_linewidth_manual(values = c(me = 1.25, compare = 1, other = .5), guide = "none") +
    ggplot2::scale_size_manual(values = c(me = 2.6, compare = 2.3, other = 1.4), guide = "none") +
    ggplot2::labs(x = NULL, y = NULL) + health_theme() +
    ggplot2::theme(panel.grid = ggplot2::element_blank())
  if (narrow)
    g + ggplot2::scale_y_continuous(breaks = -ends$ax, labels = row_lab, limits = c(-max(ends$ax) - .5, -.5)) +
      ggplot2::scale_x_continuous(limits = c(-.03, 1.03), breaks = NULL) +
      ggplot2::theme(axis.text.y = ggplot2::element_text(colour = VIZ$ink, size = 8, hjust = 0, lineheight = 1.15))
  else
    g + ggplot2::scale_x_continuous(breaks = ends$ax, labels = wrap(axes), limits = c(.55, max(ends$ax) + .45)) +
      ggplot2::scale_y_continuous(limits = c(-.17, 1.17), breaks = NULL) +
      ggplot2::theme(axis.text.x = ggplot2::element_text(colour = VIZ$ink, size = 8.2, lineheight = .95))
}
