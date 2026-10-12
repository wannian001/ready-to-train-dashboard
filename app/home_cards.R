# ---- Page 1 overview: five summary cards, each with a 14-day sparkline ----
# Sparklines are plain inline SVG (no extra package, instant to draw). Every sparkline keeps the
# same rules as the full charts: missing days stay visible as a small cross, never as zero, the
# selected day is highlighted, and a dashed line marks the participant's usual value where one exists.
SPARK_DAYS <- 14L
SPARK_W <- 280; SPARK_H <- 60; SPARK_PAD <- 6

spark_x <- function(i, n) SPARK_PAD + (i - .5) * (SPARK_W - 2 * SPARK_PAD) / n
spark_frame <- function(parts, label, first, last) htmltools::div(class = "spark",
  htmltools::tags$svg(class = "spark-svg", viewBox = paste(0, 0, SPARK_W, SPARK_H), preserveAspectRatio = "none",
    role = "img", `aria-label` = label, parts),
  htmltools::div(class = "spark-axis", htmltools::span(short_date(first)), htmltools::span(class = "spark-span", paste0(as.integer(last - first) + 1L, " days")), htmltools::span(short_date(last))))

# Bars for a quantity with a natural zero (sleep hours, training load, steps).
spark_bars <- function(dates, values, focus_date, label, colour, usual = NA_real_, top = NULL, zero_is_value = FALSE) {
  n <- length(dates); top <- top %||% max(c(values, usual, 1), na.rm = TRUE)
  y <- function(v) SPARK_H - 4 - pmax(0, v) / top * (SPARK_H - 10)
  bw <- (SPARK_W - 2 * SPARK_PAD) / n * .62
  parts <- lapply(seq_len(n), function(i) {
    x <- spark_x(i, n); v <- values[i]; on <- dates[i] == focus_date
    if (!is.finite(v)) return(htmltools::tags$path(d = sprintf("M%.1f %.1f l6 -6 m-6 0 l6 6", x - 3, SPARK_H - 4), class = "spark-miss"))
    if (v <= 0 && !zero_is_value) return(htmltools::tags$rect(x = x - bw / 2, y = SPARK_H - 5, width = bw, height = 1.5, class = "spark-zero"))
    htmltools::tags$rect(x = x - bw / 2, y = y(v), width = bw, height = max(1.5, SPARK_H - 4 - y(v)), rx = 2,
      fill = colour, `fill-opacity` = if (on) 1 else .38)
  })
  if (is.finite(usual)) parts <- c(parts, list(htmltools::tags$line(x1 = SPARK_PAD, x2 = SPARK_W - SPARK_PAD, y1 = y(usual), y2 = y(usual), class = "spark-usual")))
  spark_frame(parts, label, dates[1], dates[n])
}

# Dots on a fixed 0-10 axis for readiness; the hidden selected day is a hollow ring at the estimate.
spark_readiness <- function(dates, values, focus_date, estimate, label, revealed_value = NA_real_) {
  n <- length(dates); y <- function(v) SPARK_H - 5 - v / 10 * (SPARK_H - 10)
  pts <- which(is.finite(values))
  path <- if (length(pts) > 1) htmltools::tags$polyline(points = paste(sprintf("%.1f,%.1f", spark_x(pts, n), y(values[pts])), collapse = " "), class = "spark-line") else NULL
  dots <- lapply(seq_len(n), function(i) {
    x <- spark_x(i, n); v <- values[i]
    if (dates[i] == focus_date) {
      if (is.finite(revealed_value)) return(htmltools::tags$circle(cx = x, cy = y(revealed_value), r = 4.2, class = "spark-actual"))
      if (is.finite(estimate)) return(htmltools::tags$circle(cx = x, cy = y(estimate), r = 4.2, class = "spark-estimate"))
      return(NULL)
    }
    if (!is.finite(v)) return(htmltools::tags$path(d = sprintf("M%.1f %.1f l6 -6 m-6 0 l6 6", x - 3, SPARK_H - 4), class = "spark-miss"))
    htmltools::tags$circle(cx = x, cy = y(v), r = 2.6, class = "spark-dot")
  })
  mid <- htmltools::tags$line(x1 = SPARK_PAD, x2 = SPARK_W - SPARK_PAD, y1 = y(5), y2 = y(5), class = "spark-grid")
  spark_frame(c(list(mid, path), dots), label, dates[1], dates[n])
}

# One cell per check-in for the 1-5 soreness answer (an ordinal scale: cells, never a mean line).
spark_likert <- function(dates, values, focus_date, label) {
  n <- length(dates); w <- (SPARK_W - 2 * SPARK_PAD) / n
  cells <- lapply(seq_len(n), function(i) {
    x <- SPARK_PAD + (i - 1) * w + 1.5; v <- values[i]
    fill <- if (is.finite(v)) unname(SORENESS_FILL[v]) else "#eeeef2"
    htmltools::tags$rect(x = x, y = 16, width = w - 3, height = 28, rx = 3, fill = fill,
      class = if (dates[i] == focus_date) "spark-cell focus" else "spark-cell")
  })
  spark_frame(cells, label, dates[1], dates[n])
}

spark_window <- function(day) seq(as.Date(day) - SPARK_DAYS + 1L, as.Date(day), by = "day")
spark_series <- function(d, dates, key) d[[key]][match(dates, d$date)]

home_card_body <- function(value, unit = NULL, headline, detail, spark = NULL, badge = NULL)
  htmltools::div(class = "home-card-body",
    if (!is.null(badge)) htmltools::span(class = paste("home-badge", badge$kind), badge$text),
    htmltools::div(class = "home-card-value", htmltools::strong(value), if (!is.null(unit)) htmltools::span(unit)),
    htmltools::p(headline), htmltools::tags$small(detail), spark)
