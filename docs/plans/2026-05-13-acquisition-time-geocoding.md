# Acquisition-Time Geocoding — Future Direction

**Status:** Future direction. Post-beta. Not scheduled — captured here so the
shape is clear before any work starts.

**One-line goal:** Assist (and eventually bootstrap) the circulation librarian's
manual MARC geo-tagging by inferring places at acquisition time from the
catalog metadata we already have.

---

## Motivation

Today, geographic metadata on MARC records is added by hand by the circulation
librarian. That work is the upstream source of every place that ends up in
`nt-data` → `nt-map`. It's accurate but slow, and recall is bounded by what a
human cataloger has time to tag.

If `new-titles` can propose place candidates per record — with confidence and
source — the librarian's workflow shifts from "type the place" to "approve or
correct the suggestion," and records that would otherwise have no geo data at
all get a candidate proposal to evaluate.

Downstream payoff: `nt-map` gets richer per-record geocoding without changing
its read model, and `acquisitions.json` becomes a useful signal back to the
ILS rather than only a downstream consumer.

## Scope

In scope:

- Inferring **place candidates** from MARC metadata at acquisition ingest.
- Outputting `{place_string, candidate_ids[], confidence, source_span}` for
  the librarian to confirm.
- A small human-in-the-loop review surface (CLI or static HTML report; not a
  service).

Out of scope:

- Automatic write-back to the ILS / MARC records. The librarian remains the
  authority. Confirmed suggestions can be exported as a worklist; the ILS
  write step is theirs.
- Replacing `nt-classify` (regional classification). Different task — region
  vs. specific place. The two layers are complementary.
- A full geoparser for prose corpora. We're scoped to titles + structured
  metadata + (when available) short prose fields like scope notes / TOC.

## Pipeline shape (proposed)

Two passes, in this order. Each pass writes candidates with a `source`
field so review and audit are trivial.

### Pass 1 — Structured cataloging metadata

Deterministic, high precision, no model risk. Where most of the recall will
actually come from for a well-cataloged record.

- **MARC 651** (geographic subject access) — direct place strings, often with
  `$0` URIs pointing to LCSH / LCNAF / TGN.
- **MARC 650 `$z`** subfield chains — geographic subdivisions of topical
  subjects ("Pottery — Greece — Athens").
- **MARC 043** geographic area codes — broad regional bucketing, useful as a
  secondary signal / sanity check on Pass 2 candidates.
- **MARC 651/650 `$0` URI resolution** — when an LCSH/LCNAF URI is present,
  follow it; otherwise fall back to string lookup against our gazetteer.

Implementation note: this layer is a pure parser + a gazetteer lookup. No
ML. It should live in `packages/nt-data` next to the existing
gazetteer/ingest code, not in `nt-classify`.

### Pass 2 — NLP on titles (and short prose fields when available)

For records Pass 1 didn't cover, or to corroborate Pass 1 candidates. Short
titles like *"Excavations at Sardis"* or *"Le théâtre de Délos"* often
carry the salient toponym; Pass 1 will miss these whenever the cataloger
didn't add a 651.

Two real options to evaluate before committing:

1. **Mordecai 3 as an NER component** (Halterman 2023,
   <https://github.com/ahalterman/mordecai3>,
   <https://arxiv.org/abs/2303.13675>). spaCy-based place NER + neural
   similarity resolver. The NER half transfers; the GeoNames-backed
   resolver does **not** — GeoNames has "Lyon," not "Lugdunum." If we go
   this route, we use Mordecai for span extraction and route candidates
   into our Pleiades-first resolver. Worth reading the paper to confirm
   the similarity model is swappable to a custom gazetteer index before
   committing.
2. **LLM with structured output.** At ISAW acquisition volume
   (hundreds/month, not millions), a per-title model call returning
   `{place_string, candidate_pleiades_ids[], confidence}` is genuinely
   competitive. Especially strong for multilingual titles, transliteration
   variants ("Karchedon" / "Carthago" / "Carthage"), and ancient↔modern
   aliasing — the cases where Mordecai+GeoNames is weakest.

A pure-spaCy GPE/LOC NER pipeline + our own gazetteer is also on the table
as a baseline before either of the above.

### Resolution always owns the gazetteer

Whichever extractor is used in Pass 2, **resolution must be Pleiades-first,
Wikidata-fallback, TGN-fallback**, matching what `nt-data` already does.
Don't let an extractor's built-in gazetteer (GeoNames in Mordecai's case)
leak into output.

### Human-in-the-loop, always

Output candidates with confidence + source span; the librarian confirms
before anything authoritative changes. Low-confidence candidates appear in
the review surface but never auto-write.

## Why not just "use Mordecai"

Mordecai 3 is a good piece of work and the right shape conceptually, but
two structural mismatches keep it from being a drop-in:

1. **Gazetteer.** GeoNames is modern-toponym-centric. ISAW Library is
   ancient-world. Pleiades is the correct vocabulary; Wikidata and TGN
   fill modern and art-historical gaps.
2. **Input shape today.** Pass 1 (LCSH) gives us most of the wins without
   touching ML. Mordecai earns its keep on free-text corpora — we have
   structured metadata + short titles. The NER component might still be
   useful, but the resolver isn't.

Net: Mordecai is a candidate component for Pass 2, not a project to graft
on.

## Open questions

- **Mordecai gazetteer swap viability** — does Halterman's similarity
  model index against an arbitrary gazetteer dump, or is it baked to
  GeoNames? Read the paper / repo before building anything around it.
- **Multilingual title coverage** — ISAW's collection is heavily
  non-English. spaCy NER quality varies by language; LLM extraction is
  more even but costs per record. Need a small benchmark on real
  shelflist titles before choosing.
- **Per-record cost ceiling** — at what point does LLM extraction stop
  being acceptable? Need a back-of-envelope on monthly cost given current
  acquisition rates.
- **Review surface shape** — CLI worklist vs. static HTML report vs.
  inline annotations in the existing `nt-classify` review HTML. The
  classifier already produces a review HTML; consolidating into one
  surface would reduce librarian context-switching.
- **Confidence calibration** — what threshold do candidates need to clear
  to appear in the worklist at all? Tune against a held-out set once one
  exists.

## Where this fits in the repo

- **Pass 1 (LCSH/MARC structured)** → `packages/nt-data`. Pure parsing +
  gazetteer lookup. No new Python package.
- **Pass 2 (NLP on titles)** → likely a new sibling package or a module
  inside `nt-classify` (Python already; spaCy / LLM clients already in
  scope). Decide when work actually starts, not now.
- **Review surface** → ideally merges with the existing `nt-classify`
  monthly review HTML so the librarian has one workflow, not two.

## Sequencing

Don't start this until:

1. `nt-data` ingest is real (not stubbed) and `acquisitions.json` is being
   produced from actual shelflist exports end-to-end.
2. `nt-classify` is past beta and stable on the monthly pipeline.

Then: Pass 1 first (cheap, deterministic, immediately useful), evaluate
Pass 2 options against a benchmark, pick one, build the review surface.
