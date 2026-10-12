# Input loading, prior-only personal baselines and the NHANES survey cohort.
# Design: student discussion. R implementation assistance: OpenAI Codex; revised by Anthropic Claude (v27).

load_research_inputs <- function(directory = ".") {
  x <- load_inputs(directory)
  read <- function(file) read.csv(file.path(directory, file), na.strings = "", stringsAsFactors = FALSE)
  x$people <- read("participants.csv")
  x$nhanes <- read("nhanes_sleep.csv")
  d <- x$daily
  key <- paste(d$participant, d$date)
  d$prior_readiness <- d$readiness[match(paste(d$participant, d$date - 1), key)]
  x$daily <- d
  stopifnot(!anyDuplicated(x$people$participant), all(x$nhanes$weight > 0), all(x$nhanes$sex_code %in% 1:2))
  x
}

day_row <- function(d, day) d[d$date == as.Date(day), , drop = FALSE]

# A record window is prior-only and may span more than five calendar days.
recent_valid_rows <- function(d, day, keys, n = 5L, period = NULL) {
  past <- d[d$date < as.Date(day), , drop = FALSE]
  if (!is.null(period)) {
    wd <- as.POSIXlt(past$date)$wday
    past <- past[if (period == "workday") wd %in% 1:5 else wd %in% c(0, 6), , drop = FALSE]
  }
  valid <- if (nrow(past)) Reduce(`&`, lapply(keys, function(k) is.finite(past[[k]]))) else logical()
  tail(past[valid, , drop = FALSE][order(past$date[valid]), , drop = FALSE], as.integer(n))
}
# The opening day is the latest one with last night's sleep, yesterday's check-in and a check-in of
# its own, so the reveal step always has something to show.
default_research_day <- function(d) {
  available <- d$date[is.finite(d$sleep_hours) & is.finite(d$prior_readiness) & is.finite(d$readiness)]
  if (length(available)) max(available) else max(d$date)
}

# NHANES 2017-March 2020 self-reported usual sleep. Answers are recorded to the half hour and
# heap on whole hours, so half-hour bins draw a comb that is an artefact of rounding; whole-hour
# bins [h, h+1) hold the h and h.5 answers together. Survey weights give population shares.
nhanes_cohort <- function(nhanes, person, period = "workday", radius = 5L) {
  gender <- if (person$gender[1] == "male") 1 else 2
  lo <- max(18, person$age[1] - radius); hi <- min(79, person$age[1] + radius)
  key <- if (period == "workday") "workday_sleep" else "nonworkday_sleep"
  rows <- nhanes[nhanes$age >= lo & nhanes$age <= hi & nhanes$sex_code == gender &
                  is.finite(nhanes[[key]]), , drop = FALSE]
  rows$hours <- rows[[key]]
  rows$bin <- pmin(14, pmax(2, floor(rows$hours)))
  if (nrow(rows)) {
    counts <- aggregate(weight ~ bin, rows, sum)
    counts$percent <- counts$weight / sum(counts$weight) * 100
  } else counts <- data.frame(bin = numeric(), weight = numeric(), percent = numeric())
  list(rows = rows, bins = counts, n = nrow(rows), lo = lo, hi = hi,
       gender = if (gender == 1) "men" else "women", period = period)
}
