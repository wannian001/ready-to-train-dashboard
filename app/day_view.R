# ---- Page 1 · the selected day next to the person's own ordinary days ----
# Builders here take the participant's rows AFTER visible_person() (reveal.R), so a hidden answer
# cannot reach a chart, a tooltip or a table. Charts and their tables share one data frame.
# Design: student discussion and the v18 implementation plan. R implementation: Claude (Anthropic).

clock_text <- function(h) vapply(h, function(v) {
  if (!is.finite(v)) return("—")
  x <- (v + 48) %% 24; m <- as.integer(round(x * 60)) %% 1440
  sprintf("%02d:%02d", m %/% 60, m %% 60)
}, character(1))
# a gap in words: "9 min", "1 h 19 min"
gap_text <- function(h) vapply(h, function(v) {
  if (!is.finite(v)) return("—")
  m <- as.integer(round(abs(v) * 60)); if (m < 60) paste0(m, " min") else paste0(m %/% 60, " h", if (m %% 60) paste0(" ", m %% 60, " min") else "")
}, character(1))
train_types_text <- function(r) {
  t <- unname(TRAIN_TYPES[c("running", "endurance", "strength", "team")][
    c(isTRUE(r$running), isTRUE(r$endurance), isTRUE(r$strength), isTRUE(r$team))])
  if (length(t)) paste(t, collapse = " + ") else "no type given"
}

# ---- Compact comparison rows ----
# Each row: the day's value, the person's usual (median over the whole record, a retrospective
# reference) and the middle half of their record as a band on a labelled min-max track.
usual_stats <- function(v) {
  v <- v[is.finite(v)]
  if (length(v) < 5) return(NULL)
  q <- stats::quantile(v, c(.25, .5, .75), names = FALSE)
  list(n = length(v), q25 = q[1], median = q[2], q75 = q[3], lo = min(v), hi = max(v))
}
compare_row_ui <- function(label, source, value_text, value, stats, diff_text, fmt_fun) {
  track <- if (!is.null(stats) && is.finite(value)) {
    span <- max(stats$hi - stats$lo, 1e-6); pos <- function(v) sprintf("%.2f%%", 100 * (min(max(v, stats$lo), stats$hi) - stats$lo) / span)
    htmltools::div(class = "cmp-track-wrap",
      htmltools::span(class = "cmp-end", fmt_fun(stats$lo)),
      htmltools::div(class = "cmp-track", `aria-hidden` = "true",
        htmltools::span(class = "cmp-band", style = paste0("left:", pos(stats$q25), ";width:", sprintf("%.2f%%", 100 * (stats$q75 - stats$q25) / span))),
        htmltools::span(class = "cmp-usual", style = paste0("left:", pos(stats$median))),
        htmltools::span(class = "cmp-value", style = paste0("left:", pos(value)))),
      htmltools::span(class = "cmp-end", fmt_fun(stats$hi)))
  } else NULL
  htmltools::div(class = "cmp-row",
    htmltools::div(class = "cmp-head", htmltools::span(class = "cmp-label", label), htmltools::span(class = "cmp-source", source)),
    htmltools::div(class = "cmp-main", htmltools::strong(value_text), htmltools::span(class = "cmp-diff", diff_text)),
    track,
    if (!is.null(stats)) htmltools::span(class = "cmp-scale", paste0("Usual ", fmt_fun(stats$median), " · middle half ", fmt_fun(stats$q25), "–", fmt_fun(stats$q75),
      " · ", stats$n, " records")) else htmltools::span(class = "cmp-scale", "Fewer than 5 records, no usual value"))
}
LIKERT_WORDS <- c("much worse", "worse than usual", "same as usual", "better than usual", "much better")
likert_cells_ui <- function(label, v) {
  htmltools::div(class = "likert-row",
    htmltools::span(class = "likert-label", label),
    htmltools::span(class = "likert-cells", role = "img",
      `aria-label` = if (is.finite(v)) paste0(label, " ", v, " of 5, ", LIKERT_WORDS[v]) else paste0(label, " not recorded"),
      lapply(1:5, function(k) htmltools::span(class = paste("likert-cell", if (is.finite(v) && v == k) "on" else ""), k))),
    htmltools::span(class = "likert-word", if (is.finite(v)) LIKERT_WORDS[v] else "not recorded"))
}

# The complete evidence list: every condition, its own estimate and 95% interval, grouped by when
# it happened. A ring marks what held on the selected day. Separate estimates -- never summed.
today_factor_rows <- function(state) {
  if (is.null(state)) return(NULL)
  z <- state[is.finite(state$effect), , drop = FALSE]
  z <- z[z$layer != SAME_FORM_LAYER, , drop = FALSE]
  z$layer <- factor(z$layer, levels = TODAY_LAYERS)
  z[order(z$layer, match(z$key, vapply(TODAY_FACTOR_SPECS, `[[`, "", "key"))), , drop = FALSE]
}
interval_rows_height <- function(rows, group = "layer") if (is.null(rows) || !nrow(rows)) 120 else
  90 + 50 * nrow(rows) + 36 * length(unique(rows[[group]]))
today_factors_height <- function(rows) interval_rows_height(rows, "layer")

# Shared encoding for a list of separately estimated conditions (page 1 and page 2):
# one row per condition, its label ABOVE its own interval so long labels never squeeze the axis
# at 375px. Each mark answers ONE question:
#   the diamond answers "did this hold on the selected day?" -- blue (with a blue label) = yes,
#     white = no or unknown; pages without a selected day show only white diamonds;
#   the interval line answers "is the link clear?" -- thick black plus the words "clear link" next
#     to the value = clear of zero after the BH correction; thin grey = not.
# Blue means "the selected one" across the site (the day on the strip, the viewed participant).
# Zero line fixed.
# `xlim` lets several charts share one axis so their row lengths can be compared.
# `sides` labels the two halves (left of zero, right of zero) above the first row.
# Row labels start a few pixels right of the first gridline, so no gridline runs through them.
# `narrow` (phone width): the two side notes shrink to arrows, and the value keeps only its number
# (the thick line already says "clear link"), so a long row label never runs into it.
health_interval_rows <- function(z, group, x_title, empty_text, xlim = NULL, sides = NULL, narrow = FALSE) {
  if (narrow && !is.null(sides)) sides <- c("lower", "higher")
  if (is.null(z) || !nrow(z)) return(health_empty(empty_text))
  y <- numeric(nrow(z)); head_y <- c(); head_lab <- c(); pos <- 0
  g <- as.character(z[[group]])
  for (i in seq_len(nrow(z))) {
    if (i == 1 || g[i] != g[i - 1]) { pos <- pos - .9; head_y <- c(head_y, pos); head_lab <- c(head_lab, g[i]) }
    pos <- pos - 1.25; y[i] <- pos
  }
  z$y <- y
  lim <- if (is.null(xlim)) { l <- range(c(0, z$lo, z$hi), na.rm = TRUE); l + c(-1, 1) * diff(l) * .06 } else xlim
  ink <- ifelse(z$ring, VIZ$blue, ifelse(z$clear, VIZ$ink, VIZ$muted))
  top <- if (is.null(sides)) .2 else .75
  brk <- pretty(lim, 6); first <- min(brk[brk >= lim[1] - 1e-9])
  lab_x <- first + diff(lim) * .008
  p <- ggplot2::ggplot(z)
  if (!is.null(sides)) p <- p +
    ggplot2::annotate("rect", xmin = lim[1], xmax = 0, ymin = -Inf, ymax = Inf, fill = VIZ$amber, alpha = .05) +
    ggplot2::annotate("rect", xmin = 0, xmax = lim[2], ymin = -Inf, ymax = Inf, fill = VIZ$green, alpha = .05) +
    ggplot2::annotate("text", x = -diff(lim) * .01, y = .38, label = paste0("\u2190 ", sides[1]), hjust = 1, size = 3.2,
      fontface = "bold", colour = VIZ$amber, family = PLOT_FONT) +
    ggplot2::annotate("text", x = diff(lim) * .01, y = .38, label = paste0(sides[2], " \u2192"), hjust = 0, size = 3.2,
      fontface = "bold", colour = VIZ$green, family = PLOT_FONT)
  p +
    ggplot2::geom_vline(xintercept = 0, colour = VIZ$ink, linewidth = .5) +
    ggplot2::annotate("text", x = lab_x, y = head_y + .2, label = head_lab, hjust = 0, vjust = 0, size = 3.4,
      fontface = "bold", colour = VIZ$ink, family = PLOT_FONT) +
    ggplot2::geom_text(ggplot2::aes(lab_x, y + .6, label = label_text), hjust = 0, size = 3.1, colour = ink, family = PLOT_FONT,
      fontface = ifelse(z$ring, "bold", "plain")) +
    ggplot2::geom_text(ggplot2::aes(lim[2], y + .6, label = ifelse(clear & !narrow, paste0("clear link · ", signed_num(effect, 2)), signed_num(effect, 2))),
      hjust = 1, size = 3.1, colour = ifelse(z$clear, VIZ$ink, VIZ$muted), fontface = ifelse(z$clear, "bold", "plain"), family = PLOT_FONT) +
    ggplot2::geom_segment(ggplot2::aes(x = lo, xend = hi, y = y, yend = y), linewidth = ifelse(z$clear, 2.2, 1.1),
      colour = ifelse(z$clear, VIZ$ink, "#c4c4ca"), lineend = "round") +
    ggiraph::geom_point_interactive(ggplot2::aes(effect, y, tooltip = tip, data_id = key),
      shape = 23, size = ifelse(z$ring, 4, 3.4), stroke = 1.1,
      fill = ifelse(z$ring, VIZ$blue, VIZ$card), colour = ifelse(z$ring, VIZ$blue, VIZ$ink)) +
    ggplot2::scale_x_continuous(limits = lim, breaks = pretty(lim, 6), labels = function(v) signed_num(v, 1),
      sec.axis = ggplot2::dup_axis(name = NULL)) +
    ggplot2::scale_y_continuous(limits = c(min(z$y) - .6, top), breaks = NULL, expand = c(0, 0)) +
    ggplot2::labs(x = x_title, y = NULL) + health_theme() +
    ggplot2::theme(panel.grid.major.y = ggplot2::element_blank())
}
health_today_factors <- function(z, narrow = FALSE) {
  if (is.null(z) || !nrow(z)) return(health_empty("No factor could be estimated"))
  z$ring <- is.finite(z$value) & z$value == 1
  # at phone width the people count and "true on this day" move to the tooltip and table only;
  # a true signal is still marked by its blue label and blue diamond
  z$label_text <- if (narrow) z$label else paste0(z$label, "   (", z$people, " people)", ifelse(z$ring, "  · true on this day", ""))
  z$tip <- paste0(z$layer, " · ", z$label, "<br>", z$detail, "<br>True on ", z$yes, " of ", format(z$n, big.mark = ","), " participant-days · ", z$people, " participants",
    "<br>Same-day readiness ", deviation_label(z$effect, 2L), " points on average<br>95% interval ", deviation_label(z$lo, 2L), " to ", deviation_label(z$hi, 2L), " (clustered by participant, not adjusted for multiple tests)",
    "<br>", z$verdict, "<br>This day: ", z$state)
  health_interval_rows(z, "layer", if (narrow) "Same-day readiness difference (points)" else "Difference in same-day readiness (points, 0–10 scale)", "",
    sides = c("lower readiness that day", "higher readiness that day"), narrow = narrow)
}
today_factors_table <- function(state) {
  if (is.null(state)) return(htmltools::p(class = "empty-note", "The selected day is outside this participant's record."))
  z <- state[state$layer != SAME_FORM_LAYER, , drop = FALSE]
  z <- z[order(match(z$layer, TODAY_LAYERS)), , drop = FALSE]
  htmltools::tagList(
    view_table(paste0("All ", nrow(z), " tracked signals; each estimated on its own and overlapping, so they cannot be added"),
      c("When", "Signal", "Definition", "True / usable", "Participants", "Readiness difference", "95% interval (clustered, unadjusted)", "BH-adjusted p", "Verdict", "This day"),
      lapply(seq_len(nrow(z)), function(i) { r <- z[i, ]
        list(r$layer, r$label, r$detail, paste0(r$yes, " / ", format(r$n, big.mark = ",")), as.character(r$people),
          if (is.finite(r$effect)) paste0(deviation_label(r$effect, 2L), " pts") else "—",
          if (is.finite(r$lo)) paste0(deviation_label(r$lo, 2L), " to ", deviation_label(r$hi, 2L)) else "—",
          if (is.finite(r$p_bh)) formatC(r$p_bh, format = "g", digits = 2) else "—", r$verdict, r$state) })))
}
