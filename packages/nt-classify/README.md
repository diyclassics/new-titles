# nt-classify

Region classifier for new-titles acquisitions. Tags each record with one of six regions of interest.

**Status: post-launch.** Scaffold only. Implementation begins once the labeled training set is ported in.

## Stack

Python 3.12 + scikit-learn, managed with [`uv`](https://github.com/astral-sh/uv). This is the only Python package in the monorepo — everything else is TypeScript.

## Planned commands

```bash
uv sync                                       # install deps
uv run nt-classify train --data <labeled>     # train the model, persist to models/
uv run nt-classify predict --input acquisitions.json --output classifications.json
uv run pytest                                 # run tests
uv run ruff check                             # lint
```

## Planned artifacts

```
src/nt_classify/
  regions.py       Six region constants
  features.py      MARC field extraction & feature engineering
  train.py         Training pipeline
  predict.py       Batch inference
  cli.py           CLI entrypoint
models/            Trained model artifacts (committed)
data/
  labeled.csv      Training set (ported from prior work)
  classifications.json   Built artifact — keyed by acquisition id
tests/             Unit tests + a tiny eval harness
```

## Outputs

`classifications.json` is keyed by acquisition id and records: predicted region, confidence, model version, training-set checksum. Keep model version alongside each prediction so results are reproducible and re-classifications are visible in git history.
