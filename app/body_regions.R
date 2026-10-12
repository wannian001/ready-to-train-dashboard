# ---- Where soreness is reported after similar training (seven coarse check-in areas) ----
# PMSys only records seven coarse areas, so the figure has seven regions and no muscles.
# The figure uses a user-supplied front/back anatomical reference.  R/L always
# follows the participant: on the front view the participant's right is on the viewer's
# left; on the back view it is on the viewer's right.
BODY_REGION_SPECS <- data.frame(
  key = c("head", "torso", "pelvis", "left_upper_arm", "right_upper_arm", "left_calf", "right_calf"),
  label = c("Head", "Torso", "Pelvis / hips", "Left upper arm", "Right upper arm", "Left calf", "Right calf"),
  stringsAsFactors = FALSE)

load_body_regions <- function(path = "body_regions.csv") {
  z <- read.csv(path, stringsAsFactors = FALSE)
  z$date <- as.Date(z$date)
  z
}

# ---- One comparison group, so every percentage is a plain share that can be recomputed ----
# The group is chosen from YESTERDAY's training log only: mornings after a day with no logged
# session, or mornings after a day with exactly the same activity tags. If that exact group has
# fewer than 30 check-ins, it widens to "any day that included all of yesterday's tags", then to
# "any day with a logged session". The share is the fraction of those check-ins mentioning an area.
BODY_TYPES <- c(running = "running", endurance = "endurance", strength = "strength", team = "team sport")
body_history <- function(body, training) {
  at <- match(paste(body$participant, body$date - 1), paste(training$participant, training$date))
  body$reported <- !is.na(at)
  for (type in names(BODY_TYPES)) { v <- training[[type]][at]; body[[type]] <- !is.na(v) & v }
  body
}
body_rates <- function(one) vapply(BODY_REGION_SPECS$key, function(k) if (nrow(one)) mean(one[[k]], na.rm = TRUE) else NA_real_, numeric(1))

body_region_profile <- function(body, training, participant, day) {
  if (is.null(body) || !nrow(body)) return(NULL)
  hist <- body_history(body, training)
  r <- training[training$participant == participant & training$date == as.Date(day) - 1, , drop = FALSE]
  tags <- if (nrow(r)) names(BODY_TYPES)[vapply(names(BODY_TYPES), function(k) isTRUE(r[[k]][1]), logical(1))] else character()
  same <- function(z) Reduce(`&`, lapply(names(BODY_TYPES), function(k) z[[k]] == (k %in% tags)))
  groups <- if (!nrow(r)) list(list(keep = !hist$reported, label = "a day with no logged session")) else list(
    list(keep = hist$reported & same(hist), label = if (length(tags)) paste0("a ", paste(BODY_TYPES[tags], collapse = " + "), " day") else "a day with an untyped session"),
    if (length(tags)) list(keep = hist$reported & Reduce(`&`, lapply(tags, function(k) hist[[k]])), label = paste0("any day that included ", paste(BODY_TYPES[tags], collapse = " + "))),
    list(keep = hist$reported, label = "any day with a logged session"))
  groups <- Filter(Negate(is.null), groups)
  pick <- groups[[length(groups)]]
  for (g in groups) if (sum(g$keep) >= 30) { pick <- g; break }
  one <- hist[pick$keep, , drop = FALSE]
  data.frame(BODY_REGION_SPECS, rate = body_rates(one), stringsAsFactors = FALSE) |>
    structure(n = nrow(one), group = pick$label)
}

# One colour scale for every selection, so the same shade always means the same percentage. It runs
# from 0 to 30%: almost every group's areas sit between 2% and 26%, and only the small team-sport
# group goes higher (up to 56%), so a scale up to that maximum left nearly everything pale. Shares
# of 30% or more take the darkest shade, the legend says "30%+", and the list gives exact values.
BODY_SCALE_CAP <- 0.30
body_rate_scale_top <- function(body, training) {
  hist <- body_history(body, training)
  groups <- c(list(!hist$reported, hist$reported), lapply(names(BODY_TYPES), function(k) hist$reported & hist[[k]]))
  top <- max(unlist(lapply(groups, function(k) if (sum(k) >= 30) body_rates(hist[k, , drop = FALSE]) else NA_real_)), na.rm = TRUE)
  ceiling(top * 20) / 20
}

BODY_PALETTE <- c("#f5d3dd", "#e27596", "#c0275a", "#86113a")
body_rate_colour <- function(rate, top) {
  if (!is.finite(rate) || !is.finite(top) || top <= 0) return("#e5e5ea")
  palette <- grDevices::colorRampPalette(BODY_PALETTE)(101)
  palette[max(1, min(101, round(rate / top * 100) + 1))]
}

body_region_model_ui <- function(profile, who = "", gender = "male", scale_top = NA_real_) {
  if (is.null(profile) || !nrow(profile)) return(htmltools::p(class = "empty-note", "No soreness-area records available."))
  sex <- if (tolower(gender) == "female") "female" else "male"
  cfg <- if (sex == "female") list(width = 1024, height = 1536, view_box = "-163 60 1350 1350",
    front_x = 273, back_x = 750, orientation_y = 88, side_y = 1385,
    side_x = c(210, 334, 690, 810), display = "assets/body-female-reference.png") else
    list(width = 581, height = 794, view_box = "0 185 581 575",
      front_x = 166, back_x = 411, orientation_y = 206, side_y = 742,
      side_x = c(138, 194, 383, 439), display = "assets/body-male-reference.png")
  top_rate <- min(BODY_SCALE_CAP, if (is.finite(scale_top)) scale_top else max(profile$rate, na.rm = TRUE))
  capped <- max(profile$rate, scale_top, na.rm = TRUE) > top_rate
  rate <- setNames(profile$rate, profile$key); label <- setNames(profile$label, profile$key)
  mask_id <- function(key) paste0("body-mask-", key)
  mask_def <- function(key) htmltools::tags$mask(id = mask_id(key), x = 0, y = 0, width = cfg$width, height = cfg$height,
    maskUnits = "userSpaceOnUse", style = "mask-type:alpha",
    htmltools::tags$image(href = paste0("assets/body-mask-", sex, "-", key, ".png"), x = 0, y = 0, width = cfg$width, height = cfg$height,
      preserveAspectRatio = "none", `aria-hidden` = "true"))
  region <- function(key) htmltools::tags$g(class = paste("body-region-shape", paste0("region-", key)),
    fill = body_rate_colour(rate[[key]], top_rate), role = "img", tabindex = "0",
    `aria-label` = paste0(label[[key]], ": mentioned in ", fmt(rate[[key]] * 100, 1), "% of these check-ins"),
    htmltools::tags$title(paste0(label[[key]], " · ", fmt(rate[[key]] * 100, 1), "%")),
    htmltools::tags$rect(x = 0, y = 0, width = cfg$width, height = cfg$height, mask = paste0("url(#", mask_id(key), ")")))
  side <- function(x, y, text) htmltools::tags$text(x = x, y = y, `text-anchor` = "middle", class = "body-side", text)
  orientation <- function(x, text) htmltools::tags$text(x = x, y = cfg$orientation_y, `text-anchor` = "middle", class = "body-orientation", text)
  top <- profile[order(-profile$rate), , drop = FALSE]
  htmltools::div(class = "body-region-module",
    # The colours are a group's history, not a forecast for this person, and the title says so.
    htmltools::div(class = "card-top", metric_heading("body", "After a day like yesterday, where were people most often sore?", "blue"), evidence_tag("record", "yesterday's training · all participants")),
    htmltools::div(class = "body-chips",
      htmltools::span(class = "scope-chip", paste0("Comparison group: mornings after ", attr(profile, "group"))),
      htmltools::span(class = "scope-chip", paste0(format(attr(profile, "n"), big.mark = ","), " check-ins, all participants")),
      htmltools::span(class = "scope-chip", "7 questionnaire areas, not muscles")),
    htmltools::p(class = "chart-lede", paste0("The comparison group is chosen from yesterday's training log for ", who,
      ". Each percentage is the share of those check-ins that ticked the area. The check-in records where it was sore, not how sore; for how sore, see the card above.")),
    htmltools::div(class = "body-region-layout",
      htmltools::div(class = "body-figure",
        htmltools::tags$svg(class = paste("body-silhouette anatomical-body", paste0("body-", sex)), viewBox = cfg$view_box, role = "img",
          `aria-label` = paste0("Front and back ", sex, " body figures with seven soreness-report areas shaded by historical mention rate"),
          htmltools::tags$defs(lapply(BODY_REGION_SPECS$key, mask_def)),
          htmltools::tags$image(href = cfg$display, x = 0, y = 0, width = cfg$width, height = cfg$height,
            preserveAspectRatio = "none", `aria-hidden` = "true"),
          lapply(BODY_REGION_SPECS$key, region),
          orientation(cfg$front_x, "FRONT"), orientation(cfg$back_x, "BACK"),
          side(cfg$side_x[1], cfg$side_y, "R"), side(cfg$side_x[2], cfg$side_y, "L"),
          side(cfg$side_x[3], cfg$side_y, "L"), side(cfg$side_x[4], cfg$side_y, "R")),
        htmltools::div(class = "body-legend",
          htmltools::span("0%"),
          htmltools::span(class = "body-legend-bar", `aria-hidden` = "true"),
          htmltools::span(paste0(fmt(top_rate * 100, 0), "%", if (capped) "+" else "")),
          htmltools::tags$small(paste0("Fixed scale for every day and participant", if (capped) paste0("; ", fmt(top_rate * 100, 0), "% or more shows as the darkest shade") else "")),
          htmltools::p(class = "body-caveat", htmltools::strong("7 questionnaire areas, not muscles. "),
            paste0("Percentages pool all participants' check-ins; the ", sex, " figure only matches the participant you are viewing. R/L follow the participant's body.")))),
      htmltools::div(class = "body-region-list", lapply(seq_len(nrow(top)), function(i)
        htmltools::div(htmltools::span(class = "region-swatch", style = paste0("background:", body_rate_colour(top$rate[i], top_rate))),
          htmltools::strong(top$label[i]), htmltools::span(paste0(fmt(top$rate[i] * 100, 1), "%")))))),
    htmltools::tags$details(class = "method-note", htmltools::tags$summary("About these areas"),
      htmltools::p(class = "fine-print", "These are the soreness areas ticked in the PMSys check-in, not muscles or trained body parts; only the calves and upper arms are split left/right. An area left unticked does not prove there was no soreness."),
      htmltools::p(class = "fine-print", "The two body figures are AI-generated illustrations made for this project; the coloured areas are drawn over them.")))
}
