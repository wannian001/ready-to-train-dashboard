# ---- Page 3 · "Compare habits": how often each person recorded the same habit ----
# Only habits whose within-person association (pages 1-2) gives a direction are shown here, and the
# direction is read from those live estimates, not typed in. The comparison is a recording
# FREQUENCY over each person's whole record (numerator / denominator shown), not a health ranking.
# Design: student discussion and the v18 implementation plan. R implementation: Claude (Anthropic).
HABIT_SPECS <- list(
  list(id = "nosnack", label = "Dinner, no late snack", unit = "valid food-log days", source = "lever", key = "lv_nosnack",
       outcome = "next-morning readiness", gate = "forms"),
  list(id = "breakfast", label = "Breakfast", unit = "valid food-log days", source = "lever", key = "lv_bfast",
       outcome = "next-morning readiness", gate = "forms"),
  list(id = "alcohol", label = "Drank alcohol", unit = "days with a clear alcohol answer", source = "lever", key = "lv_alcohol",
       outcome = "next-morning readiness", gate = "forms"),
  list(id = "late", label = "Bed 1 h+ later than usual", unit = "nights with a bedtime", source = "today", key = "late0",
       outcome = "readiness the morning after", gate = "nights"),
  list(id = "short", label = "Slept 1 h+ less than usual", unit = "nights with a sleep length", source = "today", key = "short0",
       outcome = "readiness the morning after", gate = "nights")
)

# One row per participant x habit: numerator, denominator, share, and why anyone is left out.
build_habit_rates <- function(people, forms, today_frame) {
  do.call(rbind, lapply(sort(people), function(p) {
    q <- if (is.null(forms)) NULL else forms[forms$participant == p, , drop = FALSE]
    t <- today_frame[today_frame$participant == p, , drop = FALSE]
    n_forms <- if (is.null(q)) 0L else nrow(q)
    alc_known <- if (is.null(q)) logical() else q$alcohol %in% c(0, 1)
    count <- list(
      nosnack = c(if (n_forms) sum(q$m_dinner == 1 & q$m_evening == 0) else 0, n_forms),
      breakfast = c(if (n_forms) sum(q$m_breakfast == 1) else 0, n_forms),
      alcohol = c(if (n_forms) sum(q$alcohol[alc_known] == 1) else 0, sum(alc_known)),
      late = c(sum(t$late0 == 1, na.rm = TRUE), sum(is.finite(t$late0))),
      short = c(sum(t$short0 == 1, na.rm = TRUE), sum(is.finite(t$short0))))
    do.call(rbind, lapply(HABIT_SPECS, function(h) {
      k <- count[[h$id]]
      gate_n <- if (h$gate == "forms") n_forms else sum(is.finite(t$onset))
      need <- if (h$gate == "forms") PEER_MIN_FORMS else PEER_MIN_SLEEP_NIGHTS
      ok <- gate_n >= need && k[2] > 0
      data.frame(participant = p, habit = h$id, label = h$label, num = k[1], den = k[2],
        share = if (k[2] > 0) 100 * k[1] / k[2] else NA_real_, eligible = ok,
        reason = if (ok) "" else if (h$gate == "forms") paste0(gate_n, " food-log days, fewer than ", need) else
          paste0(gate_n, " nights with a bedtime, fewer than ", need), stringsAsFactors = FALSE)
    }))
  }))
}

# Direction comes from the live estimates of pages 1-2; a habit that is not a clear link (BH-adjusted
# p not below .05) gets no direction at all, even if its unadjusted interval excludes zero.
habit_evidence <- function(lever_effects, today_effects) {
  do.call(rbind, lapply(HABIT_SPECS, function(h) {
    e <- if (h$source == "lever") lever_effects[lever_effects$key == h$key, , drop = FALSE] else today_effects[today_effects$key == h$key, , drop = FALSE]
    clear <- if (h$source == "lever") isTRUE(e$effective[1]) else isTRUE(e$clear[1])
    dir <- if (!clear) NA_character_ else if (e$effect[1] > 0) "up" else "down"
    data.frame(habit = h$id, label = h$label, unit = h$unit, outcome = h$outcome, effect = e$effect[1], lo = e$lo[1], hi = e$hi[1],
      clear = clear, direction = dir,
      direction_text = if (is.na(dir)) "no clear link with readiness" else paste0(if (dir == "up") "higher " else "lower ", h$outcome),
      evidence_text = paste0(deviation_label(e$effect[1], 2L), " points (95% interval ", deviation_label(e$lo[1], 2L), " to ",
        deviation_label(e$hi[1], 2L), ")"), stringsAsFactors = FALSE)
  }))
}

habit_title <- function(ev) paste0(ev$label, "  —  how often (share of recorded days)")

# Five short panels on one shared 0-100% axis. Values within 4 percentage points stack upward by
# count (x stays exact), so near-equal people never hide behind each other and nothing is jittered.
# The two named labels sit in their own lanes under the dots (viewing, then comparison), centred on
# their dot, so they can never cover each other or another participant's dot, however close the values.
health_habit_dots <- function(rates, ev, participant, compare = "", narrow = FALSE) {
  z <- rates[rates$eligible & is.finite(rates$share), , drop = FALSE]
  if (!nrow(z)) return(health_empty("No participant meets the record threshold"))
  # phone width: the panel title is the habit alone; the axis title says what the share is
  titles <- setNames(vapply(seq_len(nrow(ev)), function(i) if (narrow) ev$label[i] else habit_title(ev[i, ]), ""), ev$habit)
  z$panel <- factor(titles[z$habit], levels = unname(titles))
  z$bin <- floor(z$share / 4)
  z <- z[order(z$panel, z$bin, z$participant != participant, z$participant), , drop = FALSE]
  z$stack <- stats::ave(seq_len(nrow(z)), paste(z$panel, z$bin), FUN = seq_along)
  z$y <- (z$stack - 1) * .34
  z$role <- ifelse(z$participant == participant, "me", ifelse(z$participant == compare, "compare", "other"))
  z$tip <- paste0(toupper(z$participant), "<br>", z$label, ": ", z$num, " / ", z$den, " = ", fmt_vec(z$share, 0), "%",
    ifelse(z$role == "me", "<br>The participant you are viewing", ifelse(z$role == "compare", "<br>Comparison participant", "<br>Click to compare with this participant")))
  me <- z[z$role == "me", , drop = FALSE]; cmp <- z[z$role == "compare", , drop = FALSE]
  # label lanes below the dots; near either end a label grows inwards from its dot instead of centring
  edge <- if (narrow) 14 else 8
  lane <- function(d, at) {
    d$ly <- rep(at, nrow(d)); d$lab <- paste0(toupper(d$participant), " ", round(d$share), "%", recycle0 = TRUE)
    d$hj <- ifelse(d$share < edge, 0, ifelse(d$share > 100 - edge, 1, .5)); d }
  me <- lane(me, -.95); cmp <- lane(cmp, -1.65)
  top <- max(z$y) + .6; bottom <- if (nrow(cmp)) -2.05 else -1.35
  ggplot2::ggplot(z, ggplot2::aes(share, y)) +
    ggiraph::geom_point_interactive(ggplot2::aes(tooltip = tip, data_id = participant, colour = role, size = role), alpha = .95) +
    ggplot2::geom_point(data = me, shape = 21, size = 5.6, stroke = 1.2, fill = NA, colour = VIZ$ink) +
    ggplot2::geom_point(data = cmp, shape = 22, size = 5.4, stroke = 1.1, fill = NA, colour = VIZ$ink) +
    ggplot2::geom_text(data = me, ggplot2::aes(share, ly, label = lab, hjust = hj), size = 3, colour = VIZ$blue,
      family = PLOT_FONT, fontface = "bold") +
    ggplot2::geom_text(data = cmp, ggplot2::aes(share, ly, label = lab, hjust = hj), size = 2.9, colour = VIZ$ink, family = PLOT_FONT) +
    ggplot2::scale_colour_manual(values = c(me = VIZ$blue, compare = VIZ$ink, other = "#82828a"), guide = "none") +
    ggplot2::scale_size_manual(values = c(me = 3.4, compare = 3.2, other = 2.6), guide = "none") +
    ggplot2::facet_wrap(~panel, ncol = 1) +
    ggplot2::scale_x_continuous(limits = c(-3, 103), breaks = seq(0, 100, 25), labels = function(v) paste0(v, "%")) +
    ggplot2::scale_y_continuous(limits = c(bottom, top), breaks = NULL) +
    ggplot2::labs(x = if (narrow) "Share of recorded days" else "Share of recorded days on which the habit happened", y = NULL) + health_theme() +
    ggplot2::theme(strip.text = ggplot2::element_text(colour = VIZ$ink, size = 10, hjust = 0),
      panel.grid.major.y = ggplot2::element_blank(), panel.spacing.y = grid::unit(.6, "lines"))
}

habit_profile_summary_ui <- function(rates, participant, ev = NULL) {
  z <- rates[rates$participant == participant & rates$eligible, , drop = FALSE]
  if (!nrow(z)) return(htmltools::p(class = "empty-note", "The participant you are viewing does not meet the record threshold for these habits."))
  # Each chip: how often (this participant) and, separately, whether the habit is linked with
  # readiness at all (within-person, all participants). The chart below shows only the first.
  card <- function(h) {
    r <- z[z$habit == h, , drop = FALSE]
    if (!nrow(r)) return(NULL)
    e <- if (is.null(ev)) NULL else ev[ev$habit == h, , drop = FALSE]
    htmltools::div(class = "habit-count-chip", htmltools::span(r$label),
      htmltools::strong(paste0(fmt(r$share, 0), "%")), htmltools::tags$small(paste0(r$num, " of ", r$den, " days")),
      if (!is.null(e) && nrow(e)) htmltools::tags$small(class = paste("habit-link", if (isTRUE(e$clear)) "clear" else "none"),
        if (isTRUE(e$clear)) paste0("Linked: ", e$evidence_text) else "No clear link with readiness"))
  }
  htmltools::div(class = "habit-profile-summary",
    htmltools::div(class = "card-top", htmltools::h3(paste0(toupper(participant), " at a glance")),
      htmltools::span(class = "subtle-tag", "share of recorded days")),
    htmltools::div(class = "habit-count-grid", lapply(vapply(HABIT_SPECS, `[[`, "", "id"), card)))
}

# One habit in full: every eligible participant, ordered, with numerator / denominator on the label.
health_habit_detail <- function(rates, habit, participant, compare = "", narrow = FALSE) {
  z <- rates[rates$habit == habit & rates$eligible, , drop = FALSE]
  if (!nrow(z)) return(health_empty("No participant meets the record threshold for this habit"))
  z <- z[order(z$share, z$participant), , drop = FALSE]
  z$lab <- paste0(toupper(z$participant), ifelse(z$participant == participant, " (viewing)", ifelse(z$participant == compare, " (comparison)", "")), " · ", z$num, "/", z$den)
  z$lab <- factor(z$lab, levels = z$lab)
  z$role <- ifelse(z$participant == participant, "me", ifelse(z$participant == compare, "compare", "other"))
  z$tip <- paste0(toupper(z$participant), "<br>", z$label, ": ", z$num, " / ", z$den, " = ", fmt_vec(z$share, 0), "%",
    ifelse(z$role == "other", "<br>Click to compare with this participant", ""))
  pair <- z[z$role != "other", , drop = FALSE]
  # value labels right of the dot, or left of it above 90% so they never sit on the dot or run off the
  # panel; the white fill keeps the dashed pairing line from crossing a label
  gap <- if (narrow) 5 else 3
  z$lx <- ifelse(z$share > 90, z$share - gap, z$share + gap); z$lh <- ifelse(z$share > 90, 1, 0)
  p <- ggplot2::ggplot(z, ggplot2::aes(share, lab))
  if (nrow(pair) == 2) p <- p + ggplot2::annotate("segment", x = pair$share[1], xend = pair$share[2], y = pair$lab[1], yend = pair$lab[2],
    colour = VIZ$muted, linewidth = .6, linetype = "22")
  p + ggplot2::geom_segment(ggplot2::aes(x = 0, xend = share, yend = lab), colour = "#e3e3e8", linewidth = .6) +
    ggiraph::geom_point_interactive(ggplot2::aes(tooltip = tip, data_id = participant, colour = role, shape = role), size = 3.2, stroke = 1.1) +
    ggplot2::geom_label(ggplot2::aes(lx, label = paste0(round(share), "%"), hjust = lh), size = 2.9, colour = VIZ$ink, fill = "#ffffff",
      linewidth = 0, label.padding = grid::unit(1.5, "pt"), family = PLOT_FONT) +
    ggplot2::scale_colour_manual(values = c(me = VIZ$blue, compare = VIZ$ink, other = "#82828a"), guide = "none") +
    ggplot2::scale_shape_manual(values = c(me = 16, compare = 15, other = 16), guide = "none") +
    # phone width: three ticks, so '75%' and '100%' never touch
    ggplot2::scale_x_continuous(limits = c(0, 110), breaks = if (narrow) c(0, 50, 100) else seq(0, 100, 25), labels = function(v) paste0(v, "%")) +
    ggplot2::labs(x = NULL, y = NULL) + health_theme() +
    ggplot2::theme(panel.grid.major.y = ggplot2::element_blank(),
      axis.text.y = ggplot2::element_text(colour = VIZ$ink, size = 10))
}

habit_table <- function(rates, ev, participant) {
  view_table("The same five habits; each cell is numerator / denominator = share, '—' means below the record threshold",
    c("Participant", ev$label),
    lapply(sort(unique(rates$participant)), function(p) c(list(paste0(toupper(p), if (identical(p, participant)) " · viewing" else "")),
      lapply(ev$habit, function(h) { r <- rates[rates$participant == p & rates$habit == h, , drop = FALSE]
        if (!nrow(r) || !r$eligible[1]) paste0("— ", if (nrow(r)) r$reason[1] else "") else paste0(r$num[1], " / ", r$den[1], " = ", round(r$share[1]), "%") }))))
}
