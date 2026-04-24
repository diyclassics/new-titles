#!/usr/bin/env python3
"""Evaluate a classifier against the frozen held-out test set.

This is the ONLY honest generalization measurement we have. Run every time a
model is updated (partial_fit or full retrain) and log results to
`data/evaluation/history.jsonl`. If macro-F1 drops, reject the update.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sklearn.metrics import classification_report, f1_score


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--test-csv",
        type=Path,
        default=Path(__file__).parent.parent / "data" / "evaluation" / "frozen_test.csv",
    )
    parser.add_argument(
        "--classifier-src",
        type=Path,
        required=True,
        help="Path to nt-classify src/ dir (for BookClassifier import)",
    )
    parser.add_argument(
        "--model-dir", type=Path, required=True, help="Directory with latest_model.txt"
    )
    parser.add_argument(
        "--history",
        type=Path,
        default=Path(__file__).parent.parent / "data" / "evaluation" / "history.jsonl",
    )
    parser.add_argument("--label", default=None, help="Optional label for this run")
    args = parser.parse_args()

    sys.path.insert(0, str(args.classifier_src))
    from models.train_model import BookClassifier  # type: ignore

    df = pd.read_csv(args.test_csv)
    label_col = "label" if "label" in df.columns else "category"
    y_true = df[label_col].tolist()

    classifier = BookClassifier.load_model(model_dir=str(args.model_dir))
    preds = classifier.predict(df)
    y_pred = preds["predicted_label"].tolist()

    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    macro_f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)
    weighted_f1 = f1_score(y_true, y_pred, average="weighted", zero_division=0)
    accuracy = report["accuracy"]

    # Per-class F1
    per_class = {
        cls: {
            "f1": round(report[cls]["f1-score"], 3),
            "precision": round(report[cls]["precision"], 3),
            "recall": round(report[cls]["recall"], 3),
            "support": int(report[cls]["support"]),
        }
        for cls in classifier.label_encoder.classes_
        if cls in report
    }

    print(f"\n=== Frozen test evaluation ({args.test_csv.name}) ===")
    print(f"N = {len(df)}")
    print(f"Accuracy:    {accuracy:.3f}")
    print(f"Macro F1:    {macro_f1:.3f}")
    print(f"Weighted F1: {weighted_f1:.3f}")
    print("\nPer-class F1:")
    for cls, m in sorted(per_class.items(), key=lambda x: -x[1]["f1"]):
        print(f"  {cls:40s} f1={m['f1']:.3f}  p={m['precision']:.3f}  r={m['recall']:.3f}  n={m['support']}")

    model_timestamp = (args.model_dir / "latest_model.txt").read_text().strip()
    entry = {
        "evaluated_at": datetime.now(UTC).isoformat(),
        "model_timestamp": model_timestamp,
        "label": args.label,
        "n_test": len(df),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class": per_class,
    }
    args.history.parent.mkdir(parents=True, exist_ok=True)
    with args.history.open("a") as fh:
        fh.write(json.dumps(entry) + "\n")

    print(f"\nAppended to {args.history}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
