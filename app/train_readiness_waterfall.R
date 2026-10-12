#!/usr/bin/env Rscript
# Train the expected-readiness model: personal level (one check-in a week, weeks 2-5 back) + 13 tracked signals
# in one strongly shrunk ridge regression. Nov-Jan fits, February picks lambda, March is a
# development hold-out (never used for fitting or tuning, though it was viewed during development).
suppressPackageStartupMessages(library(jsonlite))
source("helpers.R")
source("insights.R")
source("training.R")
source("evidence.R")
source("readiness_waterfall.R")

daily <- load_research_inputs()$daily
episodes <- read.csv("sleep_episodes.csv", stringsAsFactors = FALSE)
episodes$date <- as.Date(episodes$date)
training <- daily_training(load_training_sessions())
today <- build_today_frame(daily, episodes, training)
frame <- build_readiness_waterfall_frame(daily, today)
# Only what the model actually uses decides who is in the sample: a check-in and a personal level.
frame <- frame[is.finite(frame$target) & is.finite(frame$level), , drop = FALSE]

train <- frame[frame$target_date <= as.Date("2020-01-31"), , drop = FALSE]
validation <- frame[frame$target_date >= as.Date("2020-02-01") & frame$target_date <= as.Date("2020-02-29"), , drop = FALSE]
test <- frame[frame$target_date >= as.Date("2020-03-01") & frame$target_date <= as.Date("2020-03-31"), , drop = FALSE]
lambdas <- c(1, 3, 10, 30, 100, 300, 1000, 3000)

ranking <- do.call(rbind, lapply(lambdas, function(lambda) {
  model <- fit_readiness_waterfall(train, lambda)
  p <- predict_readiness_waterfall(model, validation)$prediction
  readiness_waterfall_metric(validation, p, "validation", paste0("ridge_", lambda))
}))
# February errors are nearly flat across lambda, so take the strongest shrinkage whose February MAE
# is within 0.005 of the best (a parsimony rule). Overlapping signals (e.g. "slept 1 h+ less" and
# "slept under 7 h") then cannot offset each other with large opposite-signed coefficients.
ranking$lambda <- as.numeric(sub("ridge_", "", ranking$method))
selected <- ranking$method[which.max(ifelse(ranking$mae <= min(ranking$mae) + .005, ranking$lambda, -Inf))]
lambda <- as.numeric(sub("ridge_", "", selected))

validation_model <- fit_readiness_waterfall(train, lambda)
validation_prediction <- predict_readiness_waterfall(validation_model, validation)$prediction
final_model <- fit_readiness_waterfall(rbind(train, validation), lambda)
test_prediction <- predict_readiness_waterfall(final_model, test)$prediction
ok5 <- function(z) is.finite(z$last5)
okall <- function(z) is.finite(z$level_all)
metrics <- rbind(
  readiness_waterfall_metric(validation, validation$level, "validation", "level"),
  readiness_waterfall_metric(validation, validation_prediction, "validation", selected),
  readiness_waterfall_metric(validation[ok5(validation), ], validation$last5[ok5(validation)], "validation", "last5"),
  readiness_waterfall_metric(validation[okall(validation), ], validation$level_all[okall(validation)], "validation", "level_all"),
  readiness_waterfall_metric(test, test$level, "test", "level"),
  readiness_waterfall_metric(test, test_prediction, "test", selected),
  readiness_waterfall_metric(test[ok5(test), ], test$last5[ok5(test)], "test", "last5"),
  readiness_waterfall_metric(test[okall(test), ], test$level_all[okall(test)], "test", "level_all"))

# Per-participant error on the hold-out, so a pooled average cannot hide someone it fits badly.
per_person <- tapply(abs(test_prediction - test$target), test$participant, function(v) if (length(v) >= 5) mean(v) else NA)
per_person <- per_person[is.finite(per_person)]

saveRDS(final_model, "readiness_waterfall_model.rds", version = 3)
write.csv(metrics, "readiness_waterfall_metrics.csv", row.names = FALSE, na = "")

input_files <- READINESS_MODEL_INPUTS
input_md5 <- as.list(unname(as.character(tools::md5sum(input_files))))
names(input_md5) <- input_files
meta <- list(version = "v3-weekly-level-13-tracked-mean-filled", target = "same-day self-reported readiness 0-10",
  baseline = "mean of one check-in per week: the latest in each of the weeks dated 8-14, 15-21, 22-28 and 29-35 days before the day (at least 3 of the 4 weeks)",
  factor_count = length(final_model$keys), unknown_rule = "an unknown signal takes its training-data average (share of known days it was true), in the fit and in the app, and remains labelled unknown",
  fill = as.list(round(final_model$fill, 4)),
  selected_model = selected, lambda = lambda,
  selection = "strongest shrinkage within 0.005 of the lowest February validation MAE",
  limitation = "tracked signals barely change accuracy; the personal level does almost all the work",
  train_n = nrow(train), validation_n = nrow(validation), test_n = nrow(test),
  training_end = as.character(max(validation$target_date)), test_not_used_for_selection = TRUE,
  test_label = "March 2020 development hold-out",
  participant_test_mae = list(n = length(per_person), median = round(stats::median(per_person), 3), min = round(min(per_person), 3), max = round(max(per_person), 3)),
  feature_columns = final_model$keys, generated_at = format(Sys.time(), tz = "UTC", usetz = TRUE),
  input_md5 = input_md5)
write_json(meta, "readiness_waterfall_metadata.json", auto_unbox = TRUE, pretty = TRUE)

cat("selected", selected, "\n")
print(metrics, row.names = FALSE)
cat("per-participant March MAE:", round(range(per_person), 2), "(", length(per_person), "participants )\n")
print(round(final_model$beta, 3))
