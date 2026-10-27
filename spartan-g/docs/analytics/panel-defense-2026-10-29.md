# Referral analytics: presentation notes for October 29, 2026

## A short explanation to practice

"In SPARTAN-G, a referral means a student requesting a facilitator. Our dashboard describes request counts, current statuses and weekly trends. Its predictive prototype estimates weekly request volume so guidance staff can explore future demand. Students still choose their facilitator.

"We compared Ridge Regression, Poisson count regression and fitted exponential smoothing with three simple benchmarks. We use chronological evaluation: earlier weeks fit the model, a separate earlier validation segment chooses a candidate, and later weeks measure prediction error. We measure MAE and RMSE rather than inventing an accuracy percentage.

"Our current data are development records, not real pilot usage. The simple last-week benchmark performs better overall in the present backtest. We report that result instead of claiming the learned model is validated for real demand. The implemented pipeline is ready for a real pilot and a fresh evaluation."

## How the analytics connects to the project title

The title includes both Assessment and Referral Analytics. Assessment reporting describes submitted instrument responses. Referral reporting describes the student's request to a facilitator. Forecasting is one predictive component of referral analytics; it does not decide whether a student needs care or which facilitator the student must choose. Partner referrals are a separate planned workflow in the deck and must not be described as already implemented.

## Likely questions and defensible answers

**What exactly is being predicted?**

The full-week count of student-to-facilitator requests for the week after the last complete input week. Read the target dates on screen: with history through October 19, the target is October 26-November 1, which is the current week on the audit date. It is not always an upcoming week if historical filters are selected.

**Why these models?**

Ridge is a simple, interpretable regularized model for the previous two weekly counts. Poisson is an alternative for a nonnegative count mean, using a log link. Smoothing learns how much weight to place on recent history. These provide distinct candidate families without adding deep-network complexity to only 16 usable weekly observations. We have not proved that this shortlist contains the best possible model. ARIMA, intermittent-demand methods and other models remain possible future comparisons with adequate data.

**What makes this learned rather than rule-based?**

Ridge and Poisson fit coefficients from outcomes; smoothing estimates its alpha from training history. Features, regularization and optimization settings are declared design choices. They do not prescribe the predicted count. Last-week, historical-mean and zero forecasts are explicitly labeled benchmarks. Existing assessment risk logic elsewhere in the system has not been replaced by this work.

**How much data do you actually have?**

The audited collection contains 36 development request documents dated June 29-October 20. Excluding incomplete/uncertain boundary weeks leaves 16 complete weekly observations, containing 34 request documents. Thirty-six individual requests do not mean 36 independent weekly training examples. Zero-filled gaps are an experimental assumption; uninterrupted real-world logging is unverified.

**How did you prevent data leakage?**

We never randomly mix past and future weeks. Each fit uses only earlier outcomes, and regression feature scaling is refitted on that training portion only. Candidate selection uses August 31-September 21 validation errors. September 28-October 19 is the later comparison period. Earlier backtest outcomes may enter the next fit only once they would have been observed. We test that changing the final outcome cannot alter earlier predictions or the validation selection.

**Is that later segment an untouched independent test?**

No. These development periods were already inspected while building the prototype. The code separates validation from later backtesting, but the entire comparison remains exploratory. A fresh, real pilot dataset is required for confirmatory performance claims.

**Which model won?**

Poisson had the lowest validation error among the three learned candidates. However, all four validation weeks contained zero stored requests, so the selection is weak evidence. On the four later development weeks, last-week forecasting had MAE 0.75, Poisson 1.0732 and Ridge 1.0769. The baseline performed better overall. We do not automatically promote Poisson or claim that it is statistically better than Ridge.

**What do the metrics mean?**

MAE is the average absolute miss, in requests per week. RMSE penalizes larger misses more. Bias is average predicted minus actual demand: positive means overprediction. Active-week MAE considers only weeks with actual requests, which helps expose a model that looks good merely by predicting zero. It uses a different subset from overall MAE and is descriptive, not a new selection criterion.

**Why not show an accuracy percentage or 95% confidence range?**

This predicts counts, not correct/incorrect classes. MAE/RMSE fit that task. Several weeks have zero counts, making percentage errors problematic. Four reused backtest weeks cannot substantiate a reliable uncertainty interval or precise accuracy claim, so we do not display invented ones.

**Can you say the model is accurate enough for real use?**

No. Functional tests verify code behavior and mathematics; they do not establish real-world predictive validity. The real next step is to collect genuine request history with known logging coverage, separate test and pilot provenance, and evaluate on new later periods. Production forecasting remains disabled.

## Demo sequence

1. Open Super Admin > Statistics > Referral Analytics. Leave All campuses and the twelve-month period selected to include all available history.
2. Explain the request total and current-status breakdown. A historical creation cohort still shows statuses when the snapshot was fetched, not past statuses.
3. Show the test-data notice before discussing predictions.
4. Scroll to forecasting. Identify the exact target week, Ridge reference errors and benchmark result.
5. Open the extended comparison. Show earlier validation dates, later backtest dates, learned models, benchmarks and the zero-validation warning.
6. Open weekly predictions and explain one actual/predicted pair. Do not cherry-pick a single favorable week.
7. Close with what is implemented and what still needs real-data validation. Do not claim live deployment unless separately verified.

## Evidence and method references

- The saved experiment is `referral-forecast-prototype.json` beside this file. It contains the aggregate input series, Ridge parameters, candidate comparison, weekly predictions and development-only provenance.
- Reproduce it using the documented `train:referral-prototype` command in `statistics-implementation.md`.
- [Ridge regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html)
- [Poisson count regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.PoissonRegressor.html)
- [Simple exponential smoothing](https://otexts.com/fpp3/ses.html)
- [Training, validation and evaluation separation](https://scikit-learn.org/stable/modules/cross_validation.html)

These notes describe the implemented prototype, not approval from an adviser, clinical validation or proof that the project meets every panel requirement.
