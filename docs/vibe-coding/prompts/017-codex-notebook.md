---
id: 017
autor: Claude Code
destino: Codex (conta2)
pai: 016
data: 2026-10-26
area: ml
modelo: gpt-6.1-sol / reasoning high
---

Create and EXECUTE a Jupyter notebook `trash/notebooks/01_eda_e_treino.ipynb` in C:\codigo\pessoal\fraudradar (Windows, 32 GB RAM). It is exploratory (lives in trash/, later we port the winning features to src/fraudradar). Read AGENTS.md first and `C:\codigo\pessoal\Bootcamp\Dossiê FraudRadar.md` (sections "FraudRadar PLD", "Rótulos", "Sinais por conta e semana", "Armadilhas específicas da Rota B"). Markdown cells and chart titles/labels in PT-BR, short and explanatory: before each chart say what to look for, after it a 1-2 line reading of the actual result.

Data: `dados/SAML-D.csv` (~1 GB, 9.5M rows; columns Time, Date, Sender_account, Receiver_account, Amount, Payment_currency, Received_currency, Sender_bank_location, Receiver_bank_location, Payment_type, Is_laundering, Laundering_type). Synthetic UK AML dataset (Oztas et al. 2023). Load once with pyarrow engine and categorical dtypes; parameter cell at the top: CAMINHO, a flag AMOSTRA_SEMANAS=None (or N to use only the first N weeks for quick runs), SEED. Use the env `uv run --all-groups` (pandas, pyarrow, scikit-learn, lightgbm, matplotlib, seaborn, jupyter are installed; add nothing heavy; networkx only if already available).

HARD RULES: Is_laundering is only the target; Laundering_type is NEVER a feature (Normal_* typologies leak the label) — split label columns off right after loading, like the `avaliacao` table. All history features must use ONLY transactions strictly before the current one (closed='left' time windows), and the split is temporal. Add a cell with an explicit leakage check (e.g. assert features of a transaction don't change when future rows are removed, on a small sample).

## Part 1 — Dataset analysis (many charts, seaborn style, consistent palette, readable sizes)
- Overview: rows, period, accounts, memory, nulls, duplicates, Amount describe.
- Class balance (count and %), laundering rate per week over time (line), volume per week.
- Amount: histogram in log scale by class; boxplot by payment type and class.
- Payment_type: share per class and laundering rate per type (bar).
- Geography: laundering rate by Receiver_bank_location and Sender_bank_location (top), cross-border vs domestic rate, currency mismatch rate; heatmap sender x receiver location.
- Time: rate by hour and by weekday (heatmap hour x weekday).
- Typologies (descriptive only): count per Laundering_type split normal/suspicious, horizontal bars; amount by suspicious typology.
- Accounts: distribution of fan-out (distinct receivers) and fan-in per account (log-log), laundering accounts vs normal; tx per account.
- Correlation heatmap of the engineered numeric features (after Part 2 features exist, can be placed there).
- One example: 2-hop network of a laundering account drawn with networkx (if available) or skip.

## Part 2 — Features (pandas, vectorized, past-only)
Per transaction: hour, weekday, log amount, is_cross_border, currency_mismatch, is_cash. Sender history over 1d/7d/30d: count, sum, mean amount, distinct receivers, distinct receiver locations, ratio amount / sender 30d mean, seconds since previous sender tx. Receiver history 7d/30d: count, sum, distinct senders (fan-in). Account "rapid pass-through": amount received by the sender in the previous 24h vs amount sent. Keep it efficient (sort once, groupby + rolling on time index); report how long it took.

## Part 3 — Training
- Temporal split: train until 2023-04-20, validation 2023-04-21..2023-05-18, test after 2023-05-18 (print sizes and positive rate of each).
- Baseline: 3-4 SQL-like scenario rules (many origins, rapid pass-through, cash + abroad) evaluated as scores.
- Logistic regression (scaled) and LightGBM binary (early stopping on validation, is_unbalance or scale_pos_weight). Plot the LightGBM validation metric per iteration.
- Calibration: isotonic regression fitted on validation; reliability diagram before/after and Brier score before/after on test. Explain in markdown that for 2 classes softmax == sigmoid and that calibration is what makes the probability trustworthy.
- Test charts: PR curves (rules, logreg, LightGBM) with PR-AUC in legend; ROC; score distribution per class (log y); confusion matrix at the threshold chosen ON VALIDATION for 0.13% FPR; recall per suspicious typology (bar, using Laundering_type only for evaluation); feature importance (gain) top 25; mean |pred_contrib| top 20 and contributions for 3 example alerts.
- Weekly account queue: per account and week, max calibrated score; top 300 per week -> recall and precision per week (line) and overall; compare with the paper's ~79% transaction recall.
- Fairness: alert rate by receiver location and by payment type at the chosen threshold; retrain LightGBM without location features and compare PR-AUC (bar).
- Typology model (softmax): LightGBM multiclass trained only on laundering transactions to predict the suspicious typology (group typologies with < 1% of positives into "Outras"); normalized confusion matrix heatmap and per-class F1 on test.
- Final summary table (markdown + DataFrame) of all metrics, and save metrics JSON to `trash/notebooks/metricas_01.json`. Do not write to models/ or src/.

Execute the whole notebook with `uv run --all-groups jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=-1 trash/notebooks/01_eda_e_treino.ipynb` so the outputs (charts) are saved inside it. Fix errors until it runs end to end on the FULL dataset. Do not read the whole CSV just to inspect it (use head/nrows). At the end report in Brazilian Portuguese: runtime, peak memory if known, key metrics (PR-AUC per model, recall at 0.13% FPR, queue recall/precision, Brier before/after, typology macro-F1), and the 5 most important observations about the data.
