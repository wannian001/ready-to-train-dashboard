# Data loading and small formatting helpers shared by every module.
# AI assistance: OpenAI Codex translated the user's design into R code; Anthropic Claude revised it (v27).
# APIs: ggplot2, ggiraph documentation; Shiny reactiveVal/observeEvent documentation.

METRICS <- list(
  readiness = list(label = "Readiness", unit = "/10", source = "PMSys morning check-in",
                   explanation = "Self-rated readiness to train: 0 = not ready at all, 10 = fully ready."),
  fatigue = list(label = "Fatigue", unit = "/5", source = "PMSys morning check-in",
                 explanation = "1-2 worse than usual, 3 same as usual, 4-5 better than usual."),
  mood = list(label = "Mood", unit = "/5", source = "PMSys morning check-in",
              explanation = "1-2 worse than usual, 3 same as usual, 4-5 better than usual."),
  stress = list(label = "Stress", unit = "/5", source = "PMSys morning check-in",
                explanation = "1-2 more stressed than usual, 3 same as usual, 4-5 more relaxed."),
  sleep_hours = list(label = "Main sleep", unit = "h", source = "Fitbit minutesAsleep",
                     explanation = "Minutes asleep in the main sleep episode divided by 60; naps and awake time excluded."),
  steps = list(label = "Recorded steps", unit = "steps", source = "Fitbit minute records",
               explanation = "Sum of steps over recorded minutes; missing minutes are not imputed."),
  resting_hr = list(label = "Resting heart rate", unit = "bpm", source = "Fitbit daily estimate",
                    explanation = "Fitbit's daily resting heart rate estimate; no diagnostic thresholds.")
)

# ---- Read portable app files and validate the minimum schema ----
load_inputs <- function(directory = ".") {
  needed <- c("daily.csv", "hourly_steps.csv", "data_provenance.json")
  missing <- needed[!file.exists(file.path(directory, needed))]
  if (length(missing)) stop("Missing app data: ", paste(missing, collapse = ", "), ". Keep every file in the same folder as app.R.")
  d <- read.csv(file.path(directory, "daily.csv"), stringsAsFactors = FALSE, na.strings = "")
  h <- read.csv(file.path(directory, "hourly_steps.csv"), stringsAsFactors = FALSE, na.strings = "")
  stopifnot(all(c("participant", "date", names(METRICS)) %in% names(d)),
            all(c("participant", "date", "hour", "steps", "observed_minutes") %in% names(h)))
  d$date <- as.Date(d$date)
  h$date <- as.Date(h$date)
  stopifnot(!anyNA(d$date), !anyNA(h$date), !anyDuplicated(d[c("participant", "date")]),
            !anyDuplicated(h[c("participant", "date", "hour")]))
  list(daily = d[order(d$participant, d$date), ], hourly = h,
       provenance = jsonlite::read_json(file.path(directory, "data_provenance.json"), simplifyVector = FALSE))
}
fmt <- function(x, digits = 0) {
  if (!length(x) || is.na(x[1]) || !is.finite(x[1])) return("—")
  formatC(x[1], format = "f", digits = digits, big.mark = ",")
}
fmt_vec <- function(x, digits = 0) ifelse(is.finite(x), formatC(x, format = "f", digits = digits, big.mark = ","), "—")
metric_value <- function(row, key) if (nrow(row)) row[[key]][1] else NA_real_
`%||%` <- function(a, b) if (is.null(a)) b else a

# ---- Dates in plain English: "Mon 30 Mar 2020" ----
WEEKDAY <- c("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
MONTHS <- c("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
day_label <- function(x, weekday = TRUE, year = TRUE) vapply(as.Date(x), function(d) {
  if (is.na(d)) return("—")
  lt <- as.POSIXlt(d)
  paste0(if (weekday) paste0(WEEKDAY[lt$wday + 1L], " ") else "", lt$mday, " ", MONTHS[lt$mon + 1L],
         if (year) paste0(" ", lt$year + 1900L) else "")
}, character(1))
short_date <- function(x) day_label(x, weekday = FALSE, year = FALSE)
month_label <- function(x) vapply(as.Date(x), function(d) {
  lt <- as.POSIXlt(d); paste0(MONTHS[lt$mon + 1L], " ", lt$year + 1900L)
}, character(1))

# ---- Pick a plot font that exists on the marker's machine (SVG text widths depend on it) ----
PLOT_FONT <- local({
  available <- unique(systemfonts::system_fonts()$family)
  candidates <- c("Helvetica Neue", "Segoe UI", "Arial", "Liberation Sans", "DejaVu Sans")
  matched <- candidates[candidates %in% available]
  if (length(matched)) matched[1] else "sans"
})
safe_date_input <- function(x, fallback) {
  if (is.null(x) || !length(x)) return(fallback)
  result <- suppressWarnings(tryCatch(as.Date(x[1]), error = function(e) as.Date(NA)))
  if (is.na(result)) fallback else result
}
