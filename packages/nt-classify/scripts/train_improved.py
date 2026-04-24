#!/usr/bin/env python3
"""Train & A/B-compare: baseline SGD+TFIDF vs. improved pipeline.

Improvements under test:
- Explicit LC-prefix one-hot feature (stacked with TF-IDF via ColumnTransformer)
- class_weight='balanced' to help underrepresented classes
- Isotonic probability calibration (CalibratedClassifierCV, cv='prefit')

Both models are trained on training_reduced.csv (the held-out 15% never touches
either) and evaluated on frozen_test.csv. Results are appended to
data/evaluation/history.jsonl alongside the original baseline.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

SEED = 42


def prepare_X(df: pd.DataFrame) -> pd.DataFrame:
    subjects = df.get("Subjects", df.get("subjects", pd.Series([""] * len(df), index=df.index)))
    text = (
        df["title"].fillna("").astype(str)
        + " "
        + df["call_number"].fillna("").astype(str)
        + " "
        + subjects.fillna("").astype(str)
    )
    lc_prefix = (
        df["call_number"].astype(str).str.extract(r"^([A-Z]+)", expand=False).fillna("OTHER")
    )
    return pd.DataFrame({"text": text.values, "lc_prefix": lc_prefix.values})


def build_baseline() -> Pipeline:
    return Pipeline(
        [
            (
                "vectorizer",
                TfidfVectorizer(
                    ngram_range=(1, 2), max_features=5000, stop_words="english"
                ),
            ),
            (
                "classifier",
                SGDClassifier(
                    loss="modified_huber", max_iter=1000, tol=1e-3, random_state=SEED
                ),
            ),
        ]
    )


def build_improved() -> Pipeline:
    preprocess = ColumnTransformer(
        [
            (
                "text",
                TfidfVectorizer(
                    ngram_range=(1, 2), max_features=5000, stop_words="english"
                ),
                "text",
            ),
            (
                "prefix",
                OneHotEncoder(handle_unknown="ignore", min_frequency=3),
                ["lc_prefix"],
            ),
        ]
    )
    return Pipeline(
        [
            ("preprocess", preprocess),
            (
                "classifier",
                SGDClassifier(
                    loss="modified_huber",
                    class_weight="balanced",
                    max_iter=1000,
                    tol=1e-3,
                    random_state=SEED,
                ),
            ),
        ]
    )


def eval_model(name: str, y_true, y_pred, classes) -> dict:
    report = classification_report(
        y_true, y_pred, labels=classes, zero_division=0, output_dict=True
    )
    macro = f1_score(y_true, y_pred, average="macro", zero_division=0)
    weighted = f1_score(y_true, y_pred, average="weighted", zero_division=0)
    acc = report["accuracy"]

    print(f"\n=== {name} ===")
    print(f"Accuracy:    {acc:.3f}")
    print(f"Macro F1:    {macro:.3f}")
    print(f"Weighted F1: {weighted:.3f}")
    print("Per-class F1:")
    per_class = {}
    for c in classes:
        if c in report:
            f1c = report[c]["f1-score"]
            per_class[c] = {
                "f1": round(f1c, 3),
                "precision": round(report[c]["precision"], 3),
                "recall": round(report[c]["recall"], 3),
                "support": int(report[c]["support"]),
            }
            print(f"  {c:40s} f1={f1c:.3f}  n={int(report[c]['support'])}")
    return {
        "accuracy": round(acc, 4),
        "macro_f1": round(macro, 4),
        "weighted_f1": round(weighted, 4),
        "per_class": per_class,
    }


def main() -> int:
    here = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=here / "data" / "raw" / "training_reduced.csv")
    parser.add_argument("--test", type=Path, default=here / "data" / "evaluation" / "frozen_test.csv")
    parser.add_argument("--history", type=Path, default=here / "data" / "evaluation" / "history.jsonl")
    parser.add_argument("--models-out", type=Path, default=here / "models")
    args = parser.parse_args()

    train = pd.read_csv(args.train)
    test = pd.read_csv(args.test)
    label_col_train = "label" if "label" in train.columns else "category"
    label_col_test = "label" if "label" in test.columns else "category"

    X_train_all = prepare_X(train)
    y_train_all = train[label_col_train].values
    X_test = prepare_X(test)
    y_test = test[label_col_test].values

    # Reserve a 10% calibration slice of training_reduced for isotonic calibration.
    X_tr, X_cal, y_tr, y_cal = train_test_split(
        X_train_all, y_train_all, test_size=0.10, random_state=SEED, stratify=y_train_all
    )

    classes = sorted(np.unique(y_train_all).tolist())

    # --- Baseline
    baseline = build_baseline()
    baseline.fit(X_tr["text"], y_tr)
    y_pred_baseline = baseline.predict(X_test["text"])
    baseline_metrics = eval_model("Baseline (TF-IDF + SGD, no calibration)", y_test, y_pred_baseline, classes)

    # --- Improved (LC prefix + balanced, uncalibrated)
    improved_uncal = build_improved()
    improved_uncal.fit(X_tr, y_tr)
    y_pred_improved = improved_uncal.predict(X_test)
    improved_metrics = eval_model(
        "Improved, uncalibrated (+ LC prefix + class_weight)",
        y_test,
        y_pred_improved,
        classes,
    )

    # --- Improved + isotonic calibration (sklearn 1.6+ requires FrozenEstimator for prefit calibration)
    frozen = FrozenEstimator(improved_uncal)
    improved_cal = CalibratedClassifierCV(frozen, method="isotonic", cv=2)
    improved_cal.fit(X_cal, y_cal)
    y_pred_cal = improved_cal.predict(X_test)
    cal_metrics = eval_model("Improved + isotonic calibration", y_test, y_pred_cal, classes)

    # Calibration sanity: what fraction of >=80%-confidence predictions are right?
    probs_cal = improved_cal.predict_proba(X_test)
    max_probs = probs_cal.max(axis=1)
    high_conf_mask = max_probs >= 0.8
    high_conf_acc = (
        (y_pred_cal[high_conf_mask] == y_test[high_conf_mask]).mean()
        if high_conf_mask.sum() > 0
        else float("nan")
    )
    print(
        f"\nCalibration sanity: of {high_conf_mask.sum()} predictions at >=80% confidence, "
        f"{high_conf_acc:.2%} are correct"
    )

    # Save the improved+calibrated model to its own path. Keep the old model untouched.
    args.models_out.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    model_path = args.models_out / f"improved_calibrated_{ts}.joblib"
    joblib.dump({
        "model": improved_cal,
        "classes": classes,
        "built_at": ts,
        "training_rows": len(train),
        "eval_macro_f1": cal_metrics["macro_f1"],
    }, model_path)
    print(f"\nSaved → {model_path}")

    # Append run summary to history
    args.history.parent.mkdir(parents=True, exist_ok=True)
    for label, m in [("baseline_retrained", baseline_metrics),
                     ("improved_uncalibrated", improved_metrics),
                     ("improved_calibrated", cal_metrics)]:
        entry = {
            "evaluated_at": datetime.now(UTC).isoformat(),
            "label": label,
            "n_test": len(test),
            **m,
            "high_conf_accuracy_at_0.8": round(float(high_conf_acc), 4) if label == "improved_calibrated" else None,
        }
        with args.history.open("a") as fh:
            fh.write(json.dumps(entry) + "\n")

    # Summary table
    print("\n=== Summary (macro F1) ===")
    print("  Current production baseline (contaminated, trained on full data): 0.662")
    print(f"  Baseline retrained (no contamination):                             {baseline_metrics['macro_f1']}")
    print(f"  Improved, uncalibrated:                                            {improved_metrics['macro_f1']}")
    print(f"  Improved + isotonic calibration:                                   {cal_metrics['macro_f1']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
