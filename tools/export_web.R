# Writes web/data/ for the web version from the submitted app's own R code, so every statistic on the web page
# is the number the Shiny app computes. app/ is read, never changed.
#
# Run from the repository root (R 4.x with the packages listed in README.md):
#   Rscript tools/export_web.R              every area
#   Rscript tools/export_web.R core sleep   only these areas (core always runs first)
#
# Each file in tools/export/ is one area. It runs after the app's start-up code, so it can use the app's
# globals (APP_DATA, TODAY_EFFECTS, LEVER_EFFECTS ...) and functions, and writes its own files with out_json().
# Per-participant files hold one array per field, aligned with that participant's days from `first` on (every
# participant's record is a run of consecutive days).

args <- commandArgs(trailingOnly = TRUE)
ROOT <- normalizePath(".")
if (!file.exists(file.path(ROOT, "app", "app.R"))) stop("Run this from the repository root.")
OUT <- file.path(ROOT, "web", "data")
REF <- file.path(ROOT, "tests", "fixtures")   # R reference values the JS tests compare against (not published)

# ---- the app's start-up: everything in app.R before the interface is built ----
setwd(file.path(ROOT, "app"))
suppressPackageStartupMessages({
  for (e in parse("app.R")) {
    if (is.call(e) && identical(e[[1]], as.name("<-")) && identical(e[[2]], as.name("ui"))) break
    eval(e, globalenv())
  }
})

# ---- helpers every area uses ----
# numbers rounded for size; NA, NaN and Inf become null
num <- function(x, digits = 4) { x <- suppressWarnings(as.numeric(x)); x[!is.finite(x)] <- NA_real_; round(x, digits) }
flag <- function(x) ifelse(is.na(x), NA_integer_, as.integer(as.logical(x)))
day_str <- function(x) format(as.Date(x), "%Y-%m-%d")
# a data frame as a list of rows (small tables) with dates written as strings
rows <- function(df) {
  df <- as.data.frame(df, stringsAsFactors = FALSE)
  for (n in names(df)) if (inherits(df[[n]], "Date")) df[[n]] <- day_str(df[[n]]) else if (is.factor(df[[n]])) df[[n]] <- as.character(df[[n]])
  rownames(df) <- NULL
  df
}
out_json <- function(rel, obj, dir = OUT) {
  path <- file.path(dir, rel)
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(obj, path, auto_unbox = TRUE, na = "null", null = "null", digits = NA, dataframe = "rows")
  cat(sprintf("  %-34s %7.1f KB\n", sub(paste0("^", ROOT, "/"), "", path), file.size(path) / 1024))
}
ref_json <- function(rel, obj) out_json(rel, obj, dir = REF)

PIDS <- sort(unique(APP_DATA$daily$participant))
person_rows <- function(p) { z <- APP_DATA$daily[APP_DATA$daily$participant == p, , drop = FALSE]; z[order(z$date), , drop = FALSE] }
# the days of one participant's record, first to last
person_days <- function(p) { z <- person_rows(p); seq(min(z$date), max(z$date), by = "day") }
# values of `frame[[key]]` for participant p on each of their days (NA where the frame has no row)
by_day <- function(frame, p, key, days = person_days(p)) {
  f <- frame[frame$participant == p, , drop = FALSE]
  f[[key]][match(days, as.Date(f$date))]
}

# ---- run the areas ----
areas <- sub("[.]R$", "", list.files(file.path(ROOT, "tools", "export"), pattern = "[.]R$"))
if (length(args)) areas <- intersect(areas, unique(c("core", args)))
areas <- c(intersect("core", areas), setdiff(areas, "core"))
failed <- character()
for (a in areas) {
  cat(a, "\n")
  ok <- tryCatch({ sys.source(file.path(ROOT, "tools", "export", paste0(a, ".R")), envir = new.env(parent = globalenv())); TRUE },
    error = function(e) { message("  FAILED: ", conditionMessage(e)); FALSE })
  if (!ok) failed <- c(failed, a)
}
if (length(failed)) { message("areas that failed: ", paste(failed, collapse = ", ")); quit(status = 1) }
