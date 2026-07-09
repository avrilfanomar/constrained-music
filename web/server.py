#!/usr/bin/env python3
"""
server.py - FastAPI backend for Constrained Music Studio

Serves the web UI and provides REST API endpoints for music generation.
Translates HTTP requests into CLI args for run_picat.sh, returns JSON notes + base64 MIDI.
"""

import asyncio
import base64
import json
import os
import signal
import sys
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Add scripts/ to path so we can import midi_writer
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from midi_writer import json_to_midi

app = FastAPI(title="Constrained Music Studio")

# Serve static files
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ---------------------------------------------------------------------------
# Data: extracted from Picat sources
# ---------------------------------------------------------------------------

MOOD_PRESETS = {
    "sad_depressed":  {"valence": -0.7, "arousal": -0.3},
    "melancholic":    {"valence": -0.5, "arousal": -0.4},
    "tired":          {"valence": -0.3, "arousal": -0.7},
    "bored":          {"valence": -0.2, "arousal": -0.5},
    "anxious":        {"valence": -0.4, "arousal":  0.7},
    "stressed":       {"valence": -0.5, "arousal":  0.6},
    "angry":          {"valence": -0.7, "arousal":  0.8},
    "frustrated":     {"valence": -0.6, "arousal":  0.5},
    "calm_peaceful":  {"valence":  0.3, "arousal": -0.6},
    "relaxed":        {"valence":  0.4, "arousal": -0.5},
    "serene":         {"valence":  0.5, "arousal": -0.7},
    "content":        {"valence":  0.3, "arousal": -0.3},
    "energized":      {"valence":  0.5, "arousal":  0.8},
    "happy":          {"valence":  0.8, "arousal":  0.5},
    "excited":        {"valence":  0.7, "arousal":  0.9},
    "joyful":         {"valence":  0.9, "arousal":  0.6},
    "focused":        {"valence":  0.2, "arousal":  0.3},
    "neutral":        {"valence":  0.0, "arousal":  0.0},
}

GENRES = {
    "classical_period": {
        "name": "Classical Period",
        "description": "Classical Period (Mozart, Haydn): Balanced phrases, clear cadences, strict voice leading",
        "accomp_pattern": "alberti",
    },
    "baroque": {
        "name": "Baroque",
        "description": "Baroque (Bach, Handel): Continuous motion, sequences, ornamental figures",
        "accomp_pattern": "arpeggiated",
    },
    "romantic": {
        "name": "Romantic",
        "description": "Romantic (Chopin, Brahms): Wide range, expressive leaps, emotional intensity",
        "accomp_pattern": "arpeggiated",
    },
    "traditional_jazz": {
        "name": "Traditional Jazz",
        "description": "Traditional Jazz (Bebop): Extended intervals, chromatic approaches",
        "accomp_pattern": "stride",
    },
    "folk_traditional": {
        "name": "Folk",
        "description": "Folk/Traditional: Stepwise motion, simple ranges, repetitive patterns",
        "accomp_pattern": "block",
    },
    "contemporary": {
        "name": "Contemporary",
        "description": "Contemporary/Atonal: Few restrictions, wide intervals",
        "accomp_pattern": "block",
    },
    "sacred_chant": {
        "name": "Sacred Chant",
        "description": "Sacred Chant (Gregorian): Stepwise, narrow range, modal",
        "accomp_pattern": "block",
    },
    "children_songs": {
        "name": "Children's Songs",
        "description": "Children's Songs: Simple, stepwise, limited range",
        "accomp_pattern": "block",
    },
    "minimalist": {
        "name": "Minimalist",
        "description": "Minimalist (Reich, Glass): Pattern repetition, gradual change",
        "accomp_pattern": "block",
    },
    "modal": {
        "name": "Modal",
        "description": "Modal/Impressionist (Debussy): Parallel motion, color over function",
        "accomp_pattern": "arpeggiated",
    },
    "blues": {
        "name": "Blues",
        "description": "Blues: Blue notes, call-response, expressive bends",
        "accomp_pattern": "stride",
    },
    "galant": {
        "name": "Galant",
        "description": "Galant (Early Classical): Light, decorative, high stepwise motion",
        "accomp_pattern": "alberti",
    },
    "high_classical": {
        "name": "High Classical",
        "description": "High Classical (Mozart/Haydn mature): Maximum structural constraints, balanced phrases",
        "accomp_pattern": "alberti",
    },
    "sturm_und_drang": {
        "name": "Sturm und Drang",
        "description": "Sturm und Drang: Dramatic, wider intervals, expressive intensity",
        "accomp_pattern": "arpeggiated",
    },
}

# Genre soft constraint weights (from genre_profiles.pi)
GENRE_WEIGHTS = {
    "classical_period": {
        "no_parallel_fifths_single": 90, "consonant_leaps_only": 85,
        "leading_tone_resolution": 85, "leap_recovery": 80,
        "phrase_ends_stable": 80, "octave_leap_recovery": 80,
        "authentic_cadence_melody": 75, "large_leap_recovery": 75,
        "mostly_stepwise": 75, "chord_tone_on_strong_beats": 70,
        "cadential_descent": 70, "peak_approach_exit": 70,
        "max_octave_leaps": 70, "no_melodic_parallel_fifths": 65,
        "half_cadence_melody": 65, "phrase_arch_contour": 65,
        "balanced_motion": 65, "no_repetitive_intervals": 65,
        "phrase_rhyme": 60, "antecedent_consequent": 60,
        "opening_gesture": 60, "prefer_smaller_intervals": 60,
        "approach_climax_by_step": 60, "leave_climax_contrary": 55,
        "salient_climax": 55, "motivic_repetition": 55,
        "register_consistency": 55, "motivic_fragmentation": 50,
        "single_climax": 50, "registral_return": 50,
    },
    "baroque": {
        "leading_tone_resolution": 85, "consonant_leaps_only": 80,
        "sequence_encouraged": 75, "phrase_ends_stable": 75,
        "leap_recovery": 70, "large_leap_recovery": 70,
        "no_consecutive_same_direction_leaps": 65,
        "prefer_smaller_intervals": 55, "peak_approach_exit": 55,
        "motivic_fragmentation": 45, "register_consistency": 45,
        "no_repetitive_intervals": 40,
    },
    "romantic": {
        "phrase_ends_stable": 75, "min_unique_pitches": 70,
        "no_repetitive_intervals": 60, "leading_tone_resolution": 60,
        "single_climax": 55, "consonant_leaps_only": 50,
        "peak_approach_exit": 50, "large_leap_recovery": 45,
        "prefer_smaller_intervals": 35,
    },
    "traditional_jazz": {
        "min_unique_pitches": 80, "leading_tone_resolution": 75,
        "no_repetitive_intervals": 70, "phrase_ends_stable": 70,
        "no_immediate_repeat": 60, "consonant_leaps_only": 40,
        "peak_approach_exit": 40, "large_leap_recovery": 35,
        "prefer_smaller_intervals": 30,
    },
    "folk_traditional": {
        "mostly_stepwise": 85, "consonant_leaps_only": 80,
        "phrase_ends_stable": 75, "leap_recovery": 70,
        "prefer_smaller_intervals": 70, "large_leap_recovery": 70,
        "peak_approach_exit": 65, "register_consistency": 60,
        "antecedent_consequent": 55, "arch_contour": 55,
        "no_repetitive_intervals": 50, "tonic_anchoring": 50,
    },
    "contemporary": {
        "min_unique_pitches": 75, "no_repetitive_intervals": 65,
        "no_immediate_repeat": 40, "peak_approach_exit": 30,
        "large_leap_recovery": 25, "prefer_smaller_intervals": 20,
        "consonant_leaps_only": 20,
    },
    "sacred_chant": {
        "mostly_stepwise": 95, "consonant_leaps_only": 90,
        "leap_recovery": 85, "large_leap_recovery": 85,
        "no_leading_tone_emphasis": 80, "prefer_smaller_intervals": 80,
        "no_consecutive_same_direction_leaps": 75,
        "register_consistency": 70, "phrase_ends_stable": 70,
        "peak_approach_exit": 60, "no_repetitive_intervals": 35,
    },
    "children_songs": {
        "mostly_stepwise": 90, "consonant_leaps_only": 85,
        "phrase_ends_stable": 80, "large_leap_recovery": 80,
        "leap_recovery": 75, "prefer_smaller_intervals": 75,
        "register_consistency": 70, "peak_approach_exit": 65,
        "arch_contour": 60, "tonic_anchoring": 55,
        "no_repetitive_intervals": 45,
    },
    "minimalist": {
        "mostly_stepwise": 85, "prefer_smaller_intervals": 75,
        "consonant_leaps_only": 75, "large_leap_recovery": 70,
        "register_consistency": 65, "peak_approach_exit": 40,
        "no_immediate_repeat": 30, "no_repetitive_intervals": 25,
    },
    "modal": {
        "no_leading_tone_emphasis": 85, "phrase_ends_stable": 70,
        "min_unique_pitches": 65, "consonant_leaps_only": 60,
        "no_repetitive_intervals": 55, "large_leap_recovery": 55,
        "prefer_smaller_intervals": 50, "peak_approach_exit": 50,
        "single_climax": 45,
    },
    "blues": {
        "phrase_ends_stable": 75, "no_repetitive_intervals": 55,
        "leap_recovery": 55, "consonant_leaps_only": 55,
        "large_leap_recovery": 50, "peak_approach_exit": 45,
        "prefer_smaller_intervals": 40,
    },
    "galant": {
        "mostly_stepwise": 90, "consonant_leaps_only": 85,
        "leading_tone_resolution": 80, "prefer_smaller_intervals": 80,
        "phrase_ends_stable": 75, "leap_recovery": 75,
        "register_consistency": 70, "large_leap_recovery": 70,
        "peak_approach_exit": 65, "chord_tone_on_strong_beats": 65,
        "cadential_descent": 60, "opening_gesture": 60,
        "balanced_motion": 55, "no_repetitive_intervals": 55,
        "motivic_repetition": 50, "registral_return": 50,
    },
    "high_classical": {
        "no_parallel_fifths_single": 90, "consonant_leaps_only": 85,
        "leading_tone_resolution": 85, "octave_leap_recovery": 80,
        "leap_recovery": 80, "phrase_ends_stable": 80,
        "authentic_cadence_melody": 75, "antecedent_consequent": 75,
        "phrase_rhyme": 75, "phrase_arch_contour": 75,
        "large_leap_recovery": 75, "mostly_stepwise": 75,
        "chord_tone_on_strong_beats": 70, "cadential_descent": 70,
        "peak_approach_exit": 70, "max_octave_leaps": 70,
        "half_cadence_melody": 65, "no_melodic_parallel_fifths": 65,
        "balanced_motion": 65, "no_repetitive_intervals": 65,
        "opening_gesture": 65, "prefer_smaller_intervals": 60,
        "motivic_fragmentation": 60, "approach_climax_by_step": 60,
        "register_consistency": 55, "leave_climax_contrary": 55,
        "salient_climax": 55, "motivic_repetition": 55,
        "single_climax": 50, "registral_return": 50,
    },
    "sturm_und_drang": {
        "leading_tone_resolution": 85, "consonant_leaps_only": 75,
        "phrase_ends_stable": 75, "no_parallel_fifths_single": 70,
        "leap_recovery": 65, "large_leap_recovery": 60,
        "cadential_descent": 60, "mostly_stepwise": 55,
        "peak_approach_exit": 55, "antecedent_consequent": 55,
        "min_unique_pitches": 55, "phrase_arch_contour": 50,
        "no_repetitive_intervals": 50, "no_melodic_parallel_fifths": 50,
        "chord_tone_on_strong_beats": 50, "prefer_smaller_intervals": 45,
        "register_consistency": 40, "motivic_repetition": 40,
        "single_climax": 35, "registral_return": 35,
    },
}

# Constraints from constraint_registry.pi
CONSTRAINTS = [
    # Melodic
    {"id": "leap_recovery", "category": "melodic", "type": "soft", "default_weight": 75,
     "description": "After leap >= 5 semitones, move in opposite direction"},
    {"id": "mostly_stepwise", "category": "melodic", "type": "soft", "default_weight": 70,
     "description": "Prefer stepwise motion (intervals <= 2 semitones)"},
    {"id": "no_consecutive_same_direction_leaps", "category": "melodic", "type": "soft", "default_weight": 80,
     "description": "Avoid two consecutive leaps in same direction"},
    {"id": "approach_climax_by_step", "category": "melodic", "type": "soft", "default_weight": 65,
     "description": "Highest note should be approached stepwise"},
    {"id": "leave_climax_contrary", "category": "melodic", "type": "soft", "default_weight": 60,
     "description": "After highest note, descend"},
    {"id": "single_climax", "category": "melodic", "type": "soft", "default_weight": 50,
     "description": "One clear highest point in middle third"},
    {"id": "balanced_motion", "category": "melodic", "type": "soft", "default_weight": 55,
     "description": "Roughly equal ascending and descending intervals"},
    {"id": "min_unique_pitches", "category": "melodic", "type": "soft", "default_weight": 60,
     "description": "Minimum number of distinct pitches"},
    {"id": "max_octave_leaps", "category": "melodic", "type": "soft", "default_weight": 70,
     "description": "Limit leaps of octave or larger"},
    {"id": "no_immediate_repeat", "category": "melodic", "type": "soft", "default_weight": 50,
     "description": "No immediate pitch repetition"},
    {"id": "prefer_smaller_intervals", "category": "melodic", "type": "soft", "default_weight": 60,
     "description": "Penalize intervals proportionally to size beyond stepwise"},
    {"id": "no_repetitive_intervals", "category": "melodic", "type": "soft", "default_weight": 65,
     "description": "Avoid consecutive identical intervals (same direction and size)"},
    {"id": "large_leap_recovery", "category": "melodic", "type": "soft", "default_weight": 75,
     "description": "Large leaps (8+ semitones) require stepwise motion on both sides"},
    {"id": "consonant_leaps_only", "category": "melodic", "type": "soft", "default_weight": 85,
     "description": "Leaps should be consonant (3rds, 4ths, 5ths, 6ths, octaves)"},
    {"id": "peak_approach_exit", "category": "melodic", "type": "soft", "default_weight": 70,
     "description": "Peak approached from below, left by descending step"},
    {"id": "salient_climax", "category": "melodic", "type": "soft", "default_weight": 55,
     "description": "Highest note should be at least 3 semitones above second-highest"},
    {"id": "octave_leap_recovery", "category": "melodic", "type": "soft", "default_weight": 80,
     "description": "Octave leaps (12+ semitones) require stepwise motion on both sides"},
    {"id": "no_melodic_parallel_fifths", "category": "melodic", "type": "soft", "default_weight": 65,
     "description": "Avoid consecutive perfect fifths outlined in the melody"},
    # Harmonic
    {"id": "leading_tone_resolution", "category": "harmonic", "type": "soft", "default_weight": 85,
     "description": "Scale degree 7 resolves up to tonic"},
    {"id": "no_leading_tone_emphasis", "category": "harmonic", "type": "soft", "default_weight": 70,
     "description": "Avoid overusing leading tone"},
    {"id": "chord_tone_on_strong_beats", "category": "harmonic", "type": "soft", "default_weight": 70,
     "description": "Notes on strong beats should be chord tones (root, 3rd, 5th)"},
    # Phrase Structure
    {"id": "phrase_ends_stable", "category": "phrase_structure", "type": "soft", "default_weight": 80,
     "description": "Phrase ends on stable tone (1, 3, or 5)"},
    {"id": "antecedent_consequent", "category": "phrase_structure", "type": "soft", "default_weight": 55,
     "description": "Half cadence then full cadence structure"},
    {"id": "arch_contour", "category": "phrase_structure", "type": "soft", "default_weight": 50,
     "description": "Rise then fall melodic shape"},
    {"id": "tonic_anchoring", "category": "phrase_structure", "type": "soft", "default_weight": 55,
     "description": "Tonic appears regularly"},
    {"id": "opening_gesture", "category": "phrase_structure", "type": "soft", "default_weight": 60,
     "description": "Opening follows common Classical patterns"},
    {"id": "phrase_arch_contour", "category": "phrase_structure", "type": "soft", "default_weight": 65,
     "description": "Peak in middle third, ascending first half, descending second half"},
    {"id": "cadential_descent", "category": "phrase_structure", "type": "soft", "default_weight": 70,
     "description": "Final portion descends stepwise toward tonic"},
    {"id": "registral_return", "category": "phrase_structure", "type": "soft", "default_weight": 50,
     "description": "First and last notes should be within an octave for balance"},
    # Cadence
    {"id": "authentic_cadence_melody", "category": "cadence", "type": "soft", "default_weight": 75,
     "description": "Phrase ends with 2-1 or 7-1 melodic cadence pattern"},
    {"id": "half_cadence_melody", "category": "cadence", "type": "soft", "default_weight": 65,
     "description": "Antecedent phrases end on scale degree 2, 5, or 7"},
    {"id": "phrase_rhyme", "category": "cadence", "type": "soft", "default_weight": 60,
     "description": "Consequent phrase opens similarly to antecedent (melodic rhyme)"},
    # Motivic
    {"id": "sequence_encouraged", "category": "motivic", "type": "soft", "default_weight": 65,
     "description": "Encourage at least one melodic sequence"},
    {"id": "motivic_repetition", "category": "motivic", "type": "soft", "default_weight": 55,
     "description": "Encourage recurring interval patterns for melodic coherence"},
    {"id": "motivic_fragmentation", "category": "motivic", "type": "soft", "default_weight": 50,
     "description": "First-quarter interval patterns reappear in second half"},
    # Idiomatic
    {"id": "register_consistency", "category": "idiomatic", "type": "soft", "default_weight": 55,
     "description": "Penalize consecutive intervals exceeding an octave"},
    {"id": "no_parallel_fifths_single", "category": "voice_leading", "type": "soft", "default_weight": 75,
     "description": "Avoid tritone in single voice (pseudo-parallel 5th)"},
    # Emotional
    {"id": "descending_motion", "category": "emotional", "type": "soft", "default_weight": 50,
     "description": "Penalize ascending intervals (sad melodies gravitate downward)"},
    {"id": "ascending_motion", "category": "emotional", "type": "soft", "default_weight": 50,
     "description": "Penalize descending intervals (joyful melodies tend to rise)"},
    {"id": "narrow_range", "category": "emotional", "type": "soft", "default_weight": 50,
     "description": "Penalize wide pitch range (calm music stays in narrow register)"},
    {"id": "contour_smoothness", "category": "emotional", "type": "soft", "default_weight": 50,
     "description": "Penalize direction changes (peaceful melodies flow smoothly)"},
    {"id": "expressive_leaps", "category": "emotional", "type": "soft", "default_weight": 50,
     "description": "Penalize small intervals (dramatic music uses wide leaps)"},
]

FORMS = [
    {"id": "binary", "name": "Binary (AB)", "description": "Two contrasting sections"},
    {"id": "ternary", "name": "Ternary (ABA)", "description": "Statement, contrast, return"},
    {"id": "rondo", "name": "Rondo (ABACA)", "description": "Recurring refrain with episodes"},
    {"id": "through", "name": "Through-composed", "description": "No repetition (free form)"},
]

ACCOMP_PATTERNS = [
    {"id": "auto", "name": "Auto (genre default)"},
    {"id": "block", "name": "Block chords"},
    {"id": "alberti", "name": "Alberti bass"},
    {"id": "arpeggiated", "name": "Arpeggiated"},
    {"id": "stride", "name": "Stride"},
    {"id": "none", "name": "No accompaniment"},
]

PIECES = {
    "folk": {
        "name": "Folk & Traditional",
        "pieces": [
            {"id": "twinkle_twinkle", "name": "Twinkle Twinkle", "notes": 14, "key": "C major"},
            {"id": "twinkle_twinkle_full", "name": "Twinkle Twinkle (Full)", "notes": 42, "key": "C major"},
            {"id": "amazing_grace", "name": "Amazing Grace", "notes": 25, "key": "C major"},
            {"id": "greensleeves", "name": "Greensleeves", "notes": 19, "key": "A minor"},
            {"id": "scarborough_fair", "name": "Scarborough Fair", "notes": 29, "key": "D dorian"},
            {"id": "mary_had_a_little_lamb", "name": "Mary Had a Little Lamb", "notes": 26, "key": "C major"},
            {"id": "auld_lang_syne", "name": "Auld Lang Syne", "notes": 28, "key": "F major"},
            {"id": "frere_jacques", "name": "Frère Jacques", "notes": 32, "key": "C major"},
        ],
    },
    "bach": {
        "name": "J.S. Bach",
        "pieces": [
            {"id": "bach_invention1_subject", "name": "Invention No. 1 (Subject)", "notes": 17, "key": "C major"},
            {"id": "bach_invention1_bars1_4", "name": "Invention No. 1 (Bars 1–4)", "notes": 32, "key": "C major"},
            {"id": "bach_invention4_subject", "name": "Invention No. 4 (Subject)", "notes": 16, "key": "D minor"},
            {"id": "bach_invention8_subject", "name": "Invention No. 8 (Subject)", "notes": 16, "key": "F major"},
            {"id": "bach_wtc1_prelude_c", "name": "WTC I: Prelude in C", "notes": 32, "key": "C major"},
        ],
    },
    "mozart": {
        "name": "W.A. Mozart",
        "pieces": [
            {"id": "mozart_k545_theme", "name": "Sonata K.545 Theme", "notes": 26, "key": "C major"},
            {"id": "mozart_k545_first_phrase", "name": "K.545 First Phrase", "notes": 13, "key": "C major"},
            {"id": "mozart_k331_theme", "name": "Sonata K.331 (Alla Turca)", "notes": 30, "key": "A major"},
            {"id": "mozart_k333_theme", "name": "Sonata K.333 Theme", "notes": 27, "key": "Bb major"},
            {"id": "mozart_eine_kleine_theme", "name": "Eine Kleine Nachtmusik", "notes": 18, "key": "G major"},
            {"id": "mozart_symphony40_theme", "name": "Symphony No. 40 Theme", "notes": 21, "key": "G minor"},
        ],
    },
    "beethoven": {
        "name": "L. van Beethoven",
        "pieces": [
            {"id": "beethoven_ode_to_joy", "name": "Ode to Joy (C major)", "notes": 30, "key": "C major"},
            {"id": "beethoven_ode_to_joy_d", "name": "Ode to Joy (D major)", "notes": 30, "key": "D major"},
            {"id": "beethoven_fur_elise", "name": "Für Elise Theme", "notes": 27, "key": "A minor"},
            {"id": "beethoven_symphony5_motif", "name": "Symphony No. 5 Motif", "notes": 20, "key": "C minor"},
            {"id": "beethoven_pathetique_adagio", "name": "Pathétique Adagio", "notes": 23, "key": "Ab major"},
            {"id": "beethoven_moonlight", "name": "Moonlight Sonata", "notes": 28, "key": "C# minor"},
            {"id": "beethoven_pastoral", "name": "Pastoral Symphony Theme", "notes": 24, "key": "F major"},
        ],
    },
}

CONSTRAINT_CATEGORIES = [
    {"id": "melodic", "name": "Melodic Motion"},
    {"id": "harmonic", "name": "Tonal & Harmonic"},
    {"id": "phrase_structure", "name": "Contour & Structure"},
    {"id": "cadence", "name": "Cadence & Period"},
    {"id": "motivic", "name": "Motivic"},
    {"id": "voice_leading", "name": "Voice Leading"},
    {"id": "idiomatic", "name": "Idiomatic"},
    {"id": "emotional", "name": "Emotional"},
]


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class VariationRequest(BaseModel):
    mode: str = Field("continue")          # "continue" or "transform"
    piece: str = Field("mozart_k545_theme")
    split: str = Field("50")              # percentage "50" or note count "8n"
    extend: float = Field(1.0, ge=0.5, le=5.0)  # output length multiplier
    technique: str = Field("")            # "inversion" | "retrograde" | "augmentation" | "diminution" | ""
    genre: str = Field("")               # target genre (optional override)
    randomness: float = Field(0.3, ge=0.0, le=1.0)


class GenerateRequest(BaseModel):
    from_valence: float = Field(-0.7, ge=-1.0, le=1.0)
    from_arousal: float = Field(-0.3, ge=-1.0, le=1.0)
    to_valence: float = Field(0.5, ge=-1.0, le=1.0)
    to_arousal: float = Field(0.8, ge=-1.0, le=1.0)
    duration: int = Field(60, ge=10, le=600)
    randomness: float = Field(0.3, ge=0.0, le=1.0)
    genre: str = Field("classical_period")
    form: str = Field("through")
    accompaniment: str = Field("auto")
    intensity: str = Field("standard")
    disabled_constraints: list[str] = Field(default_factory=list)
    weight_overrides: dict[str, int] = Field(default_factory=dict)
    rhythm: bool = Field(False)
    refine: int = Field(1, ge=1, le=10)
    refine_piece: int = Field(1, ge=1, le=5)


# ---------------------------------------------------------------------------
# Subprocess runner
# ---------------------------------------------------------------------------

async def run_picat_bounded(cmd: list[str], timeout_sec: float) -> str:
    """Run a picat command with a hard wall-clock bound.

    run_picat.sh spawns picat as a child, so the subprocess is started in its
    own process group and the WHOLE group is SIGKILLed on timeout — otherwise
    a stalled CP solve outlives the HTTP 504 and spins forever.
    Returns combined stdout/stderr; raises HTTPException on timeout/failure.
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(PROJECT_ROOT),
        start_new_session=True,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec)
    except asyncio.TimeoutError:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        await proc.wait()
        raise HTTPException(
            status_code=504,
            detail=f"Generation timed out ({int(timeout_sec)}s); solver process was terminated",
        )

    picat_output = stdout.decode("utf-8", errors="replace")
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail={
            "error": "Picat generation failed",
            "output": picat_output,
        })
    return picat_output


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/config")
async def get_config():
    return {
        "genres": GENRES,
        "genre_weights": GENRE_WEIGHTS,
        "mood_presets": MOOD_PRESETS,
        "constraints": CONSTRAINTS,
        "constraint_categories": CONSTRAINT_CATEGORIES,
        "forms": FORMS,
        "accompaniment_patterns": ACCOMP_PATTERNS,
        "pieces": PIECES,
    }


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    # Build CLI args
    args = [
        f"from_va={req.from_valence},{req.from_arousal}",
        f"to_va={req.to_valence},{req.to_arousal}",
        f"duration={req.duration}",
        f"randomness={req.randomness}",
    ]

    if req.genre:
        args.append(f"genre={req.genre}")

    if req.form and req.form != "through":
        args.append(f"form={req.form}")

    if req.intensity and req.intensity != "standard":
        args.append(f"intensity={req.intensity}")

    if req.accompaniment:
        args.append(f"accomp={req.accompaniment}")

    # CLI now defaults rhythm=on, so pass the toggle explicitly both ways
    args.append("rhythm=on" if req.rhythm else "rhythm=off")

    if req.refine > 1:
        args.append(f"refine={req.refine}")

    if req.refine_piece > 1:
        args.append(f"refine_piece={req.refine_piece}")

    for c in req.disabled_constraints:
        args.append(f"disable={c}")

    for constraint_id, weight in req.weight_overrides.items():
        args.append(f"weight:{constraint_id}={weight}")

    # Temp output file
    tmp_id = uuid.uuid4().hex[:12]
    tmp_json = os.path.join(tempfile.gettempdir(), f"web_{tmp_id}.json")
    args.append(f"output={tmp_json}")

    # Run picat via run_picat.sh
    script_path = str(PROJECT_ROOT / "scripts" / "run_picat.sh")
    companion_path = "picat/companion.pi"
    cmd = [script_path, companion_path] + args

    # Timeout: base 300s + extra for refinement rounds
    timeout_sec = 300 + (req.refine - 1) * 30 + (req.refine_piece - 1) * 120

    tmp_midi = tmp_json.replace(".json", ".mid")
    try:
        picat_output = await run_picat_bounded(cmd, timeout_sec)

        # Read JSON output
        if not os.path.exists(tmp_json):
            raise HTTPException(status_code=500, detail={
                "error": "No output JSON produced",
                "output": picat_output,
            })

        with open(tmp_json, "r") as f:
            data = json.load(f)

        # Generate MIDI
        try:
            json_to_midi(tmp_json, tmp_midi)
            with open(tmp_midi, "rb") as f:
                midi_base64 = base64.b64encode(f.read()).decode("ascii")
        except Exception as e:
            midi_base64 = None
            picat_output += f"\nMIDI conversion error: {e}"

        return {
            "notes": data.get("notes", []),
            "tempo_changes": data.get("tempo_changes", []),
            "metadata": data.get("metadata", {}),
            "midi_base64": midi_base64,
            "picat_output": picat_output,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in [tmp_json, tmp_midi]:
            try:
                os.unlink(p)
            except OSError:
                pass


@app.post("/api/variation")
async def variation_generate(req: VariationRequest):
    # Build CLI args for variation.pi
    args = [req.mode, f"piece={req.piece}"]

    if req.mode == "continue":
        args.append(f"split={req.split}")
        if req.extend != 1.0:
            args.append(f"extend={req.extend}")
        if req.genre:
            args.append(f"genre={req.genre}")
    elif req.mode == "transform":
        if req.technique:
            args.append(f"technique={req.technique}")
        if req.genre:
            args.append(f"genre={req.genre}")
        if not req.technique and not req.genre:
            raise HTTPException(status_code=400, detail="transform requires technique= or genre=")

    args.append(f"randomness={req.randomness}")

    tmp_id = uuid.uuid4().hex[:12]
    tmp_json = os.path.join(tempfile.gettempdir(), f"web_var_{tmp_id}.json")
    args.append(f"output={tmp_json}")

    script_path = str(PROJECT_ROOT / "scripts" / "run_picat.sh")
    cmd = [script_path, "picat/variation.pi"] + args

    tmp_midi = tmp_json.replace(".json", ".mid")
    try:
        picat_output = await run_picat_bounded(cmd, 90)

        if not os.path.exists(tmp_json):
            raise HTTPException(status_code=500, detail={
                "error": "No output JSON produced",
                "output": picat_output,
            })

        with open(tmp_json, "r") as f:
            data = json.load(f)

        try:
            json_to_midi(tmp_json, tmp_midi)
            with open(tmp_midi, "rb") as f:
                midi_base64 = base64.b64encode(f.read()).decode("ascii")
        except Exception as e:
            midi_base64 = None
            picat_output += f"\nMIDI conversion error: {e}"

        return {
            "notes": data.get("notes", []),
            "tempo_changes": data.get("tempo_changes", []),
            "metadata": data.get("metadata", {}),
            "midi_base64": midi_base64,
            "picat_output": picat_output,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in [tmp_json, tmp_midi]:
            try:
                os.unlink(p)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
