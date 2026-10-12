# Table alternatives use the very same rows as their charts. No fitting or scoring happens here.
# chart_ui wraps every ggiraph chart: a screen-reader label, a loading placeholder and a
# "Show the data" disclosure holding the same records as a keyboard-friendly table.
chart_ui <- function(id, height, label, hint = NULL) {
 htmltools::div(class = "chart-shell", `data-chart-label` = label,
  htmltools::p(id = paste0(id, "-instructions"), class = "sr-only", paste0(label, ". The 'Show the data' table below holds the same records; its date buttons open a day.")),
  if (!is.null(hint)) htmltools::p(class = "chart-hint", htmltools::span(class = "hint-glyph", `aria-hidden` = "true", "☝"), hint),
  htmltools::div(class = "chart-frame", style = paste0("min-height:", height),
   ggiraph::girafeOutput(id, height = height)),
  htmltools::tags$details(class = "chart-data", htmltools::tags$summary("Show the data"), shiny::uiOutput(paste0(id, "_data"))))
}
view_value <- function(x, unit = "", digits = 1L) ifelse(is.finite(x), paste0(formatC(x, format = "f", digits = digits), unit), "no record")
view_date_button <- function(day, input = "calendar_day") {
 htmltools::tags$button(type = "button", class = "date-visit", `data-date-input` = input, `data-date` = as.character(day),
  `aria-label` = paste("Open", day_label(day)), short_date(day))
}
view_table <- function(caption, headers, rows) {
 if (!length(rows)) return(htmltools::p(class = "empty-note", "No records to show."))
 htmltools::div(class = "table-wrap", tabindex = "0", role = "region", `aria-label` = paste0(caption, ", scrollable table"),
  htmltools::tags$table(htmltools::tags$caption(caption),
   htmltools::tags$thead(htmltools::tags$tr(lapply(headers, function(x) htmltools::tags$th(scope = "col", x)))),
   htmltools::tags$tbody(lapply(rows, function(row) htmltools::tags$tr(lapply(row, htmltools::tags$td))))))
}
population_table <- function(cohort, d, day) {
 if (cohort$n < 30) return(htmltools::p(class = "empty-note", "Fewer than 30 survey answers; the chart and table are both paused."))
 b <- cohort$bins; w <- cohort_context(cohort, d, day)$person
 htmltools::tagList(
  view_table("NHANES usual sleep; weighted share of the group", c("Hours", "Share"), lapply(seq_len(nrow(b)), function(i)
   list(if (b$bin[i] == 2) "under 3 h" else if (b$bin[i] == 14) "14 h or more" else paste0(b$bin[i], "–", b$bin[i] + 1, " h"), view_value(b$percent[i], "%")))),
  view_table("This participant's 5 most recent matching nights before the selected day (Fitbit main sleep)", c("Date", "Sleep"), lapply(seq_len(nrow(w)), function(i)
   list(view_date_button(w$date[i]), duration_label(w$sleep_hours[i])))))
}
# Same hours as the heatmap, summed into six-hour blocks so the table stays readable.
activity_table <- function(hourly, participant, day, span = 28L) {
 dates <- seq(as.Date(day) - as.integer(span) + 1L, as.Date(day), by = "day")
 h <- merge(expand.grid(date = dates, hour = 0:23),
  hourly[hourly$participant == participant, c("date", "hour", "steps"), drop = FALSE], by = c("date", "hour"), all.x = TRUE)
 if (!nrow(h)) return(htmltools::p(class = "empty-note", "No hourly step records in this period."))
 block <- function(one, lo, hi) { v <- one$steps[one$hour >= lo & one$hour <= hi]
  if (!any(is.finite(v))) "no record" else format(sum(v, na.rm = TRUE), big.mark = ",", trim = TRUE) }
 view_table(paste0("The same ", span, " × 24 hours as the heatmap, summed in 6-hour blocks; hours without records are left out"),
  c("Date", "00–05", "06–11", "12–17", "18–23", "Hours with no record"), lapply(dates, function(dt) {
   one <- h[h$date == dt, , drop = FALSE]
   list(view_date_button(dt), block(one, 0, 5), block(one, 6, 11), block(one, 12, 17), block(one, 18, 23),
    as.character(sum(!is.finite(one$steps)))) }))
}
load_soreness_table <- function(sum_tbl) {
 if (is.null(sum_tbl) || !nrow(sum_tbl)) return(htmltools::p(class = "empty-note", "No training and soreness records to compare."))
 view_table("The same bands as the chart; shares of mornings with a soreness answer",
  c("Load the day before", "Mornings", names(SORENESS_FILL), "Sorer than usual (1–2)", "95% interval"),
  lapply(seq_len(nrow(sum_tbl)), function(i) { r <- sum_tbl[i, ]
   pc <- function(v) paste0(formatC(100 * v / r$n, format = "f", digits = 1), "%")
   list(r$band, format(r$n, big.mark = ","), pc(r$s1), pc(r$s2), pc(r$s3), pc(r$s4), pc(r$s5),
    paste0(formatC(100 * r$worse, format = "f", digits = 1), "%"),
    paste0(formatC(100 * r$lo, format = "f", digits = 1), "–", formatC(100 * r$hi, format = "f", digits = 1), "%")) }))
}
battery_table <- function(series) {
 if (is.null(series) || !nrow(series)) return(htmltools::p(class = "empty-note", "Not enough records to run the energy ledger."))
 z <- series[series$reported_prev | seq_len(nrow(series)) %% 7 == 1, , drop = FALSE]
 view_table("The same series as the chart; only days after a reported session and the start of each week are listed",
  c("Date", "Day before", "Energy used", "Energy regained", "Energy (toy model)", "Self-rated readiness"),
  lapply(seq_len(nrow(z)), function(i) { r <- z[i, ]
   list(view_date_button(r$date),
    if (!r$reported_prev) "no session (uses 0)" else if (r$unknown_prev) "load blank (uses 0)" else paste0("load ", round(r$load_prev)),
    view_value(r$drain, "", 1L), view_value(r$gain, "", 1L), view_value(r$level, "", 1L),
    if (is.finite(r$readiness)) paste0(r$readiness, "/10") else "—") }))
}
monthly_table <- function(monthly) {
 if (is.null(monthly) || !nrow(monthly)) return(htmltools::p(class = "empty-note", "This participant reported no sessions."))
 view_table("The same months as the charts; each session counted once, but tags overlap so the type columns can add up to more than the total",
  c("Month", "Days on record", "Sessions", "Minutes", "Known load", "Blank loads", "Mean RPE", unname(TRAIN_TYPES), "No type"),
  lapply(seq_len(nrow(monthly)), function(i) { r <- monthly[i, ]
   list(month_label(r$month), if (is.finite(r$days_covered)) paste0(r$days_covered, "/", r$days_in_month) else "—",
    as.character(r$sessions), as.character(r$minutes), format(r$load, big.mark = ","), as.character(r$load_unknown),
    view_value(r$rpe, "", 1L), as.character(r$running), as.character(r$endurance), as.character(r$strength),
    as.character(r$team), as.character(r$untyped)) }))
}
levers_table <- function(effects, rows = NULL) {
 if (is.null(effects) || !nrow(effects)) return(htmltools::p(class = "empty-note", "No estimates available."))
 e <- effects
 if (!is.null(rows)) e <- e[e$key %in% rows$key, , drop = FALSE]
 # same order as the chart: by group, or by average difference when the chart is sorted that way
 e <- if (!is.null(rows)) e[match(rows$key, e$key), , drop = FALSE] else e[order(match(e$group, LEVER_GROUP_LEVELS), match(e$key, vapply(LEVER_SPECS, `[[`, "", "key"))), , drop = FALSE]
 view_table(paste0(nrow(e), " rows; each estimated on its own and overlapping, so they cannot be added"),
  c("Group", "Habit or condition", "Definition", "Happened / usable", "Participants", "Next-morning readiness", "95% interval (clustered, unadjusted)", "BH-adjusted p", "Verdict"),
  lapply(seq_len(nrow(e)), function(i) { r <- e[i, ]
   list(r$group, r$label, r$detail, paste0(r$yes, " / ", format(r$n, big.mark = ",")), as.character(r$people),
    if (is.finite(r$effect)) paste0(deviation_label(r$effect, 2L), " pts") else "—",
    if (is.finite(r$lo)) paste0(deviation_label(r$lo, 2L), " to ", deviation_label(r$hi, 2L)) else "—",
    if (is.finite(r$p_bh)) formatC(r$p_bh, format = "g", digits = 2) else "—", r$verdict) }))
}
peers_table <- function(long, profiles, participant) {
 if (is.null(long) || !nrow(long)) return(htmltools::p(class = "empty-note", "No dimension can be compared across participants."))
 keys <- unique(long$key)
 view_table("The same ten measures; one row per participant, '—' means below the record threshold for that measure",
  c("Participant", vapply(keys, function(k) long$label[long$key == k][1], character(1))),
  lapply(sort(unique(profiles$participant)), function(p)
   c(list(paste0(toupper(p), if (identical(p, participant)) " · viewing" else "")),
     lapply(keys, function(k) { z <- long[long$key == k & long$participant == p, , drop = FALSE]
      if (!nrow(z)) "—" else peer_value_label(z$value[1], z$unit[1]) }))))
}
