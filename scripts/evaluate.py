#!/usr/bin/env python3
"""Evaluate a generated piece against the masterpiece corpus.

Usage:
    scripts/evaluate.py session.json [session2.json ...]
        [--ref data/masterpieces.json] [--json] [--quiet]

Computes melodic statistics for the generated melody line and compares them
with the statistics of the encoded masterpieces (data/masterpieces.json,
regenerate with picat/export_pieces.pi). Lower distance = statistically
closer to the corpus. Also checks intra-piece qualities the corpus can't
teach (harmony agreement with the accompaniment, rhythm variety, climax
uniqueness) against fixed musical targets.

With multiple input files, prints a ranking (used by scripts/batch_render.sh).
"""

import argparse
import json
import math
import os
import sys
from collections import Counter
from fractions import Fraction

DEFAULT_REF = os.path.join(os.path.dirname(__file__), "..", "data", "masterpieces.json")

MAX_INTERVAL_BIN = 12  # |intervals| >= 12 pooled into one bin


# ---------------------------------------------------------------------------
# Melody statistics (work on a plain pitch sequence)
# ---------------------------------------------------------------------------

def interval_histogram(pitches):
    """Distribution of absolute melodic intervals, bins 0..MAX_INTERVAL_BIN."""
    hist = [0.0] * (MAX_INTERVAL_BIN + 1)
    for a, b in zip(pitches, pitches[1:]):
        iv = min(abs(b - a), MAX_INTERVAL_BIN)
        hist[iv] += 1
    total = sum(hist)
    return [h / total for h in hist] if total else hist


def melodic_stats(pitches):
    """Scalar statistics of a melody line."""
    n = len(pitches)
    ivs = [b - a for a, b in zip(pitches, pitches[1:])]
    if not ivs:
        return None
    abs_ivs = [abs(iv) for iv in ivs]
    moves = [iv for iv in ivs if iv != 0]
    dir_changes = sum(1 for a, b in zip(moves, moves[1:]) if (a > 0) != (b > 0))
    ups = sum(1 for iv in ivs if iv > 0)
    downs = sum(1 for iv in ivs if iv < 0)

    # 4-gram interval self-similarity: fraction of 4-interval windows whose
    # pattern occurs at least twice in the piece (memorability proxy)
    gram = 4
    windows = [tuple(ivs[i:i + gram]) for i in range(len(ivs) - gram + 1)]
    counts = Counter(windows)
    gram_rep = (sum(1 for w in windows if counts[w] >= 2) / len(windows)) if windows else 0.0

    return {
        "stepwise_ratio": sum(1 for iv in abs_ivs if iv <= 2) / len(ivs),
        "leap_ratio": sum(1 for iv in abs_ivs if iv >= 5) / len(ivs),
        "repeat_note_ratio": sum(1 for iv in ivs if iv == 0) / len(ivs),
        "contour_turn_rate": dir_changes / len(moves) if moves else 0.0,
        "direction_imbalance": abs(ups - downs) / (ups + downs) if ups + downs else 0.0,
        "range_semitones": max(pitches) - min(pitches),
        "gram4_repetition": gram_rep,
        "num_notes": n,
    }


def js_divergence(p, q):
    """Jensen-Shannon divergence (base 2, in [0,1])."""
    def kl(a, b):
        return sum(x * math.log2(x / y) for x, y in zip(a, b) if x > 0 and y > 0)
    m = [(x + y) / 2 for x, y in zip(p, q)]
    return 0.5 * kl(p, m) + 0.5 * kl(q, m)


# ---------------------------------------------------------------------------
# Reference corpus
# ---------------------------------------------------------------------------

def load_reference(path):
    with open(path) as f:
        corpus = json.load(f)["pieces"]
    per_piece = []
    pooled_hist = [0.0] * (MAX_INTERVAL_BIN + 1)
    for piece in corpus:
        stats = melodic_stats(piece["pitches"])
        if stats is None:
            continue
        per_piece.append(stats)
        for a, b in zip(piece["pitches"], piece["pitches"][1:]):
            iv = min(abs(b - a), MAX_INTERVAL_BIN)
            pooled_hist[iv] += 1
    total = sum(pooled_hist)
    pooled_hist = [h / total for h in pooled_hist]

    ref = {"interval_hist": pooled_hist, "num_pieces": len(per_piece)}
    for key in ("stepwise_ratio", "leap_ratio", "repeat_note_ratio",
                "contour_turn_rate", "direction_imbalance", "range_semitones",
                "gram4_repetition"):
        vals = [s[key] for s in per_piece]
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        ref[key] = (mean, math.sqrt(var))
    return ref


# ---------------------------------------------------------------------------
# Generated-piece loading
# ---------------------------------------------------------------------------

def note_sort_key(n):
    return (n["bar"], n["beat"], n.get("sub", 0.0))


def load_session(path):
    with open(path) as f:
        data = json.load(f)
    notes = data["notes"]
    melody = sorted((n for n in notes if n["voice"] <= 9), key=note_sort_key)
    accomp = sorted((n for n in notes if n["voice"] >= 10), key=note_sort_key)
    return melody, accomp


def duration_of(note):
    return Fraction(note["dur_num"], note["dur_den"])


def rhythm_stats(melody):
    """Duration-distribution entropy and per-bar rhythm-pattern repetition."""
    durs = [duration_of(n) for n in melody]
    counts = Counter(durs)
    total = len(durs)
    entropy = -sum((c / total) * math.log2(c / total) for c in counts.values())

    bars = {}
    for n in melody:
        bars.setdefault(n["bar"], []).append((n["beat"], n.get("sub", 0.0), duration_of(n)))
    patterns = []
    for bar in sorted(bars):
        patterns.append(tuple(d for _, _, d in sorted(bars[bar])))
    pat_counts = Counter(patterns)
    bar_repeat = (sum(1 for p in patterns if pat_counts[p] >= 2) / len(patterns)) if patterns else 0.0
    return entropy, bar_repeat


def harmony_agreement(melody, accomp):
    """Fraction of melody strong-beat notes whose pitch class belongs to the
    accompaniment's chord for that bar.

    Accompaniment figures (Alberti, arpeggios) spread the triad across the
    bar — a half-bar snapshot often sounds only root+fifth while the melody
    correctly holds the third — so chord membership is judged against the
    union of accompaniment pitch classes over the whole bar."""
    if not accomp:
        return None
    acc_pcs = {}  # bar -> set of pitch classes sounded during the bar
    for n in accomp:
        acc_pcs.setdefault(n["bar"], set()).add(n["pitch"] % 12)

    checked = agreed = 0
    for n in melody:
        if n["beat"] not in (1, 3) or n.get("sub", 0.0) > 0.05:
            continue
        pcs = acc_pcs.get(n["bar"])
        if not pcs:
            continue
        checked += 1
        if n["pitch"] % 12 in pcs:
            agreed += 1
    return agreed / checked if checked else None


def climax_bar_spread(melody):
    """Number of distinct bars containing the piece's highest pitch.

    A/A' period restatement legitimately repeats the peak bar (antecedent
    and consequent), so 2-3 bars is idiomatic; a top note scattered across
    many bars means no real climax."""
    top = max(n["pitch"] for n in melody)
    return len({n["bar"] for n in melody if n["pitch"] == top})


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

CORPUS_METRICS = [
    # (key, label, weight)
    ("stepwise_ratio", "stepwise motion ratio", 1.0),
    ("leap_ratio", "leap ratio (>=5 st)", 1.0),
    ("repeat_note_ratio", "repeated-note ratio", 0.7),
    ("contour_turn_rate", "contour turn rate", 0.7),
    ("direction_imbalance", "up/down imbalance", 0.5),
    # Corpus pieces are short excerpts; a full piece legitimately spans more,
    # so range is scored gently (informational more than normative)
    ("range_semitones", "range (semitones)", 0.25),
    ("gram4_repetition", "4-gram self-similarity", 1.2),
]

# (label, target_lo, target_hi, weight, scale) for generated-only qualities;
# penalty = weight * (distance outside [lo, hi]) / scale
TARGET_METRICS = {
    "rhythm_entropy": ("rhythm entropy (bits)", 1.0, 2.4, 1.0, 1.0),
    "bar_rhythm_repeat": ("bar-rhythm repetition", 0.5, 1.0, 1.0, 0.5),
    "harmony_agreement": ("harmony agreement", 0.85, 1.0, 2.0, 0.15),
    "climax_bar_spread": ("climax spread (bars)", 1.0, 3.0, 0.8, 2.0),
}


def evaluate(path, ref):
    melody, accomp = load_session(path)
    pitches = [n["pitch"] for n in melody]
    stats = melodic_stats(pitches)
    if stats is None:
        return {"file": path, "error": "melody too short"}

    rows = []
    distance = 0.0

    jsd = js_divergence(interval_histogram(pitches), ref["interval_hist"])
    distance += 2.0 * jsd
    rows.append(("interval distribution JSD", jsd, "corpus pooled", 2.0 * jsd))

    for key, label, weight in CORPUS_METRICS:
        mean, std = ref[key]
        val = stats[key]
        z = abs(val - mean) / std if std > 1e-9 else 0.0
        z = min(z, 3.0)
        # No penalty inside one standard deviation of the corpus
        pen = weight * max(0.0, z - 1.0)
        distance += pen
        rows.append((label, val, f"{mean:.2f}+-{std:.2f}", pen))

    entropy, bar_repeat = rhythm_stats(melody)
    agreement = harmony_agreement(melody, accomp)
    clx = climax_bar_spread(melody)
    target_values = {
        "rhythm_entropy": entropy,
        "bar_rhythm_repeat": bar_repeat,
        "harmony_agreement": agreement,
        "climax_bar_spread": float(clx),
    }
    for key, (label, lo, hi, weight, scale) in TARGET_METRICS.items():
        val = target_values[key]
        if val is None:
            rows.append((label, None, f"[{lo}, {hi}]", 0.0))
            continue
        out = max(0.0, lo - val, val - hi)
        pen = weight * out / scale
        distance += pen
        rows.append((label, val, f"[{lo}, {hi}]", pen))

    return {
        "file": path,
        "num_notes": stats["num_notes"],
        "rows": rows,
        "distance": distance,
    }


def print_report(result, quiet=False):
    if "error" in result:
        print(f"{result['file']}: ERROR {result['error']}")
        return
    if quiet:
        print(f"{result['distance']:8.3f}  {result['file']}")
        return
    print(f"\n=== {result['file']} ({result['num_notes']} melody notes) ===")
    print(f"  {'metric':<28} {'value':>8}   {'reference':<16} {'penalty':>7}")
    for label, val, refdesc, pen in result["rows"]:
        vs = "   n/a" if val is None else f"{val:8.3f}"
        marker = " " if pen < 0.05 else ("*" if pen < 0.5 else "!")
        print(f"{marker} {label:<28} {vs:>8}   {refdesc:<16} {pen:7.3f}")
    print(f"  {'DISTANCE (lower = closer to corpus)':<54} {result['distance']:7.3f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="+", help="generated session JSON file(s)")
    ap.add_argument("--ref", default=DEFAULT_REF, help="masterpiece corpus JSON")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--quiet", action="store_true", help="one line per file")
    args = ap.parse_args()

    ref = load_reference(args.ref)
    results = [evaluate(path, ref) for path in args.files]

    if args.json:
        print(json.dumps(results, indent=2, default=str))
        return

    for result in results:
        print_report(result, quiet=args.quiet)

    scored = [r for r in results if "distance" in r]
    if len(scored) > 1:
        print("\n=== Ranking (best first) ===")
        for i, r in enumerate(sorted(scored, key=lambda r: r["distance"]), 1):
            print(f"  {i}. {r['distance']:7.3f}  {r['file']}")


if __name__ == "__main__":
    main()
