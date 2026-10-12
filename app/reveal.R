# ---- What a page may show before the reader reveals the day ----
# The selected day's morning check-in (readiness, fatigue, mood, stress, sleep quality, soreness and
# self-reported sleep hours) stays hidden until the reader presses "Reveal". Hiding happens HERE, on
# the rows every chart and table is built from, not in CSS: a hidden answer never reaches an SVG, a
# tooltip, a table or a screen-reader label. Later check-ins are also kept out of page-1 history.
# Design: student discussion and the v18 implementation plan. R implementation: Claude (Anthropic).
WELLNESS_FIELDS <- c("readiness", "fatigue", "mood", "stress", "sleep_quality", "soreness",
                     "self_reported_sleep_h", "wellness_time_utc", "wellness_ref")

# d: one participant's daily rows (with the prior_ copy added by load_research_inputs).
visible_person <- function(d, day, revealed = FALSE, keep_after = FALSE) {
  day <- as.Date(day)
  hidden <- function(dates) (dates == day & !revealed) | (dates > day & !keep_after)
  own <- hidden(d$date)
  for (f in intersect(WELLNESS_FIELDS, names(d))) d[[f]][own] <- NA
  # the same answers also travel in the derived column of the next row
  if ("prior_readiness" %in% names(d)) d$prior_readiness[hidden(d$date - 1)] <- NA
  d
}
