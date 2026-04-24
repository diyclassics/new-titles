#!/usr/bin/env python3
"""Carve a frozen, stratified held-out test set from training_data.csv.

The output CSV is never used for training or partial_fit. It exists solely to
give us an honest measure of classifier generalization across model versions.

Run once. Re-running with --force will produce a DIFFERENT split — so only do
that if you genuinely want to retire the existing frozen set and start over.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", type=Path, help="Full training_data.csv")
    parser.add_argument(
        "--train-out", type=Path, required=True, help="Output: reduced training CSV"
    )
    parser.add_argument(
        "--test-out", type=Path, required=True, help="Output: frozen held-out CSV"
    )
    parser.add_argument("--test-size", type=float, default=0.15, help="Fraction for held-out")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing frozen set — retires the current baseline",
    )
    args = parser.parse_args()

    if args.test_out.exists() and not args.force:
        print(
            f"Frozen test set already exists at {args.test_out}. "
            "Refusing to overwrite — re-run with --force to retire it. "
            "(Only retire the frozen set if you know what you are doing; "
            "it resets the generalization baseline.)",
            file=sys.stderr,
        )
        return 1

    df = pd.read_csv(args.input_csv)
    label_col = "label" if "label" in df.columns else "category"
    if label_col not in df.columns:
        raise SystemExit("No 'label' or 'category' column in input CSV")

    train_df, test_df = train_test_split(
        df,
        test_size=args.test_size,
        random_state=args.seed,
        stratify=df[label_col],
    )

    args.train_out.parent.mkdir(parents=True, exist_ok=True)
    args.test_out.parent.mkdir(parents=True, exist_ok=True)
    train_df.to_csv(args.train_out, index=False)
    test_df.to_csv(args.test_out, index=False)

    print(f"Train set: {len(train_df):>5} rows → {args.train_out}")
    print(f"Frozen test: {len(test_df):>5} rows → {args.test_out}")
    print("\nTest distribution (should mirror train):")
    print((test_df[label_col].value_counts(normalize=True) * 100).round(1).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
