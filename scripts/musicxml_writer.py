#!/usr/bin/env python3
"""
musicxml_writer.py - Convert Music Companion JSON to MusicXML

Produces a score-partwise MusicXML file that opens directly in MuseScore,
Dorico, Sibelius, Finale, etc. The generator's JSON contains *performance*
timing (humanization jitter, legato-scaled durations), so everything is
quantized back to a 16th-note grid — the same 16-ticks-per-whole grid the
CP rhythm solver composed on — before engraving.

Layout:
    Part 1 "Melody"        (voices 1-9, treble clef)
    Part 2 "Accompaniment" (voices 10+, bass clef)   [if present]

Ornament grace notes (tiny durations written slightly before the beat)
are detected and engraved as real <grace/> notes attached to the note
they decorate.

Usage:
    python musicxml_writer.py session.json session.musicxml
    python musicxml_writer.py session.json            # -> session.musicxml
"""

import json
import sys
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

# Divisions per quarter note. 4 = a 16th-note grid, matching the generator's
# 16-ticks-per-whole rhythm system (no tuplets are ever generated).
DIVISIONS = 4

ACCOMP_VOICE = 10

# A note this short (fraction of a whole note) is an ornament grace note,
# not a rhythmic event: the shortest structural duration is a 16th (1/16).
GRACE_MAX_FRACTION = 1.0 / 24.0

# duration in grid units -> (musicxml type, dots)
UNIT_TYPES = {
    16: ("whole", 0),
    12: ("half", 1),
    8: ("half", 0),
    6: ("quarter", 1),
    4: ("quarter", 0),
    3: ("eighth", 1),
    2: ("eighth", 0),
    1: ("16th", 0),
}
UNIT_ORDER = [16, 12, 8, 6, 4, 3, 2, 1]

SHARP_SPELLINGS = [("C", 0), ("C", 1), ("D", 0), ("D", 1), ("E", 0), ("F", 0),
                   ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("A", 1), ("B", 0)]
FLAT_SPELLINGS = [("C", 0), ("D", -1), ("D", 0), ("E", -1), ("E", 0), ("F", 0),
                  ("G", -1), ("G", 0), ("A", -1), ("A", 0), ("B", -1), ("B", 0)]

# Semitone offset of each mode's tonic relative to the major key sharing its
# signature (D dorian -> C major signature, etc.)
MODE_SIGNATURE_OFFSET = {
    "major": 0, "ionian": 0,
    "dorian": 2,
    "phrygian": 4,
    "lydian": 5,
    "mixolydian": 7,
    "minor": 9, "natural_minor": 9, "aeolian": 9,
    "harmonic_minor": 9, "melodic_minor": 9,
    "locrian": 11,
}

# Modes MusicXML names directly; others fall back to major/minor feel
MUSICXML_MODES = {"major", "minor", "dorian", "phrygian", "lydian",
                  "mixolydian", "aeolian", "ionian", "locrian"}


def key_to_fifths(key_root_pc: int, mode: str):
    """Return (fifths, musicxml_mode) for a tonic pitch class + mode name."""
    offset = MODE_SIGNATURE_OFFSET.get(mode, 0)
    ref_major_pc = (key_root_pc - offset) % 12
    # Circle of fifths: C=0, G=1, ... normalized to -6..6 (prefer Gb=-6 over F#=+6
    # only when the mode is flat-leaning; keep +6 for simplicity)
    fifths = (ref_major_pc * 7) % 12
    if fifths > 6:
        fifths -= 12
    if mode in MUSICXML_MODES:
        xml_mode = "minor" if mode == "aeolian" else mode
    elif "minor" in mode:
        xml_mode = "minor"
    else:
        xml_mode = "major"
    return fifths, xml_mode


def spell_pitch(midi: int, fifths: int):
    """MIDI number -> (step, alter, octave), flats in flat keys."""
    table = FLAT_SPELLINGS if fifths < 0 else SHARP_SPELLINGS
    step, alter = table[midi % 12]
    octave = midi // 12 - 1
    return step, alter, octave


def decompose_units(units: int, order=UNIT_ORDER):
    """Split a duration in grid units into displayable values, largest first."""
    parts = []
    remaining = units
    for u in order:
        while remaining >= u:
            parts.append(u)
            remaining -= u
    return parts or [1]


class TimelineNote:
    __slots__ = ("onset", "duration", "pitches", "velocity")

    def __init__(self, onset, duration, pitches, velocity):
        self.onset = onset          # grid units from piece start
        self.duration = duration   # grid units
        self.pitches = pitches      # list of MIDI numbers (chord if > 1)
        self.velocity = velocity


def quantize_part(notes, quarters_per_bar):
    """Quantize raw JSON notes to the grid.

    Returns (timeline, graces) where timeline is a sorted list of
    TimelineNote (chords merged, overlaps clamped) and graces maps a
    principal onset -> list of grace MIDI pitches.
    """
    units_per_beat = DIVISIONS  # onsets computed in quarter-note beats
    raw = []     # (onset_units, dur_units, pitch, velocity)
    grace_raw = []  # (raw_onset_beats, pitch)

    for n in notes:
        start_q = (n["bar"] - 1) * quarters_per_bar + (n["beat"] - 1) + n.get("sub", 0.0)
        frac = n["dur_num"] / n["dur_den"]
        if frac <= GRACE_MAX_FRACTION:
            grace_raw.append((start_q, n["pitch"]))
            continue
        onset = round(start_q * units_per_beat)
        dur = max(1, round(frac * 4 * units_per_beat))
        raw.append((onset, dur, n["pitch"], n.get("velocity", 80)))

    raw.sort(key=lambda r: (r[0], -r[3]))

    # Merge simultaneous onsets into chords
    timeline = []
    for onset, dur, pitch, vel in raw:
        if timeline and timeline[-1].onset == onset:
            if pitch not in timeline[-1].pitches:
                timeline[-1].pitches.append(pitch)
            timeline[-1].duration = max(timeline[-1].duration, dur)
        else:
            timeline.append(TimelineNote(onset, dur, [pitch], vel))

    # Clamp durations so nothing overlaps the next attack
    for i in range(len(timeline) - 1):
        gap = timeline[i + 1].onset - timeline[i].onset
        timeline[i].duration = max(1, min(timeline[i].duration, gap))

    # Attach graces to the nearest following principal note
    graces = {}
    for raw_onset, pitch in sorted(grace_raw):
        principal = None
        for tn in timeline:
            if tn.onset >= (raw_onset - 0.05) * units_per_beat - 0.5:
                if tn.onset <= (raw_onset + 1.0) * units_per_beat:
                    principal = tn
                break
        if principal is not None:
            graces.setdefault(principal.onset, []).append(pitch)

    for tn in timeline:
        tn.pitches.sort()
    return timeline, graces


def render_note_xml(pitches, units, fifths, is_chord_follower, tie_start, tie_stop,
                    grace=False):
    """Render one <note> element (or a chord member)."""
    note_type, dots = UNIT_TYPES[units]
    lines = ["      <note>"]
    if grace:
        lines.append('        <grace slash="yes"/>')
    if is_chord_follower:
        lines.append("        <chord/>")
    step, alter, octave = spell_pitch(pitches, fifths)
    lines.append("        <pitch>")
    lines.append(f"          <step>{step}</step>")
    if alter:
        lines.append(f"          <alter>{alter}</alter>")
    lines.append(f"          <octave>{octave}</octave>")
    lines.append("        </pitch>")
    if not grace:
        lines.append(f"        <duration>{units}</duration>")
    if tie_stop:
        lines.append('        <tie type="stop"/>')
    if tie_start:
        lines.append('        <tie type="start"/>')
    lines.append(f"        <type>{note_type}</type>")
    for _ in range(dots):
        lines.append("        <dot/>")
    if tie_stop or tie_start:
        lines.append("        <notations>")
        if tie_stop:
            lines.append('          <tied type="stop"/>')
        if tie_start:
            lines.append('          <tied type="start"/>')
        lines.append("        </notations>")
    lines.append("      </note>")
    return lines


def render_rest_xml(units):
    note_type, dots = UNIT_TYPES[units]
    lines = ["      <note>",
             "        <rest/>",
             f"        <duration>{units}</duration>",
             f"        <type>{note_type}</type>"]
    for _ in range(dots):
        lines.append("        <dot/>")
    lines.append("      </note>")
    return lines


def render_part(timeline, graces, total_bars, units_per_bar, fifths, xml_mode,
                beats, beat_type, clef_sign, clef_line, tempo_by_bar):
    """Render all <measure> elements for one part."""
    lines = []
    cursor = 0  # grid units, piece-absolute
    idx = 0     # next timeline note

    # Pre-split every event at bar boundaries into (onset, units, pitches,
    # tie_start, tie_stop, grace_list)
    spans = []
    for tn in timeline:
        remaining = tn.duration
        onset = tn.onset
        first = True
        while remaining > 0:
            bar_end = (onset // units_per_bar + 1) * units_per_bar
            chunk = min(remaining, bar_end - onset)
            spans.append({
                "onset": onset, "units": chunk, "pitches": tn.pitches,
                "tie_stop": not first,
                "tie_start": remaining > chunk,
                "graces": graces.get(tn.onset, []) if first else [],
            })
            onset += chunk
            remaining -= chunk
            first = False

    span_idx = 0
    for bar in range(1, total_bars + 1):
        bar_start = (bar - 1) * units_per_bar
        bar_end = bar * units_per_bar
        lines.append(f'    <measure number="{bar}">')
        if bar == 1:
            lines.append("      <attributes>")
            lines.append(f"        <divisions>{DIVISIONS}</divisions>")
            lines.append("        <key>")
            lines.append(f"          <fifths>{fifths}</fifths>")
            lines.append(f"          <mode>{xml_mode}</mode>")
            lines.append("        </key>")
            lines.append("        <time>")
            lines.append(f"          <beats>{beats}</beats>")
            lines.append(f"          <beat-type>{beat_type}</beat-type>")
            lines.append("        </time>")
            lines.append("        <clef>")
            lines.append(f"          <sign>{clef_sign}</sign>")
            lines.append(f"          <line>{clef_line}</line>")
            lines.append("        </clef>")
            lines.append("      </attributes>")
        if bar in tempo_by_bar:
            bpm = tempo_by_bar[bar]
            lines.append('      <direction placement="above">')
            lines.append("        <direction-type>")
            lines.append("          <metronome>")
            lines.append("            <beat-unit>quarter</beat-unit>")
            lines.append(f"            <per-minute>{bpm}</per-minute>")
            lines.append("          </metronome>")
            lines.append("        </direction-type>")
            lines.append(f'        <sound tempo="{bpm}"/>')
            lines.append("      </direction>")

        cursor = bar_start
        while span_idx < len(spans) and spans[span_idx]["onset"] < bar_end:
            span = spans[span_idx]
            # rest gap before this span
            if span["onset"] > cursor:
                for rest_units in decompose_units(span["onset"] - cursor):
                    lines.extend(render_rest_xml(rest_units))
                cursor = span["onset"]
            # grace notes attached to this span
            for gp in span["graces"]:
                lines.extend(render_note_xml(gp, 2, fifths, False, False, False,
                                             grace=True))
            # the span itself (possibly decomposed into tied values)
            pieces = decompose_units(span["units"])
            for pi, pu in enumerate(pieces):
                piece_tie_stop = span["tie_stop"] or pi > 0
                piece_tie_start = span["tie_start"] or pi < len(pieces) - 1
                for ci, pitch in enumerate(span["pitches"]):
                    lines.extend(render_note_xml(
                        pitch, pu, fifths, ci > 0,
                        piece_tie_start, piece_tie_stop))
                cursor += pu
            span_idx += 1
        # trailing rest to fill the bar
        if cursor < bar_end:
            for rest_units in decompose_units(bar_end - cursor):
                lines.extend(render_rest_xml(rest_units))
        lines.append("    </measure>")
    return lines


def json_to_musicxml(json_path: str, xml_path: str) -> None:
    """Convert a Music Companion JSON file to MusicXML."""
    with open(json_path, "r") as f:
        data = json.load(f)
    xml = data_to_musicxml(data)
    with open(xml_path, "w") as f:
        f.write(xml)
    print(f"  Output: {xml_path}")


def data_to_musicxml(data: dict) -> str:
    notes = data.get("notes", [])
    metadata = data.get("metadata", {})
    tempo_changes = data.get("tempo_changes", [])

    time_sig = metadata.get("time_signature", {"beats": 4, "beat_unit": 4})
    beats = time_sig["beats"]
    beat_type = time_sig["beat_unit"]
    quarters_per_bar = beats * (4 / beat_type)
    units_per_bar = int(round(quarters_per_bar * DIVISIONS))

    key_root = metadata.get("key_root", 60)
    mode = metadata.get("mode", "major")
    fifths, xml_mode = key_to_fifths(key_root % 12, mode)

    melody_notes = [n for n in notes if n.get("voice", 1) < ACCOMP_VOICE]
    accomp_notes = [n for n in notes if n.get("voice", 1) >= ACCOMP_VOICE]

    melody_tl, melody_gr = quantize_part(melody_notes, quarters_per_bar)
    accomp_tl, accomp_gr = quantize_part(accomp_notes, quarters_per_bar)

    last_unit = 0
    for tl in (melody_tl, accomp_tl):
        if tl:
            last_unit = max(last_unit, tl[-1].onset + tl[-1].duration)
    total_bars = max(1, -(-last_unit // units_per_bar))  # ceil

    tempo_by_bar = {}
    for tc in tempo_changes:
        tempo_by_bar[tc["bar"]] = tc["bpm"]
    if 1 not in tempo_by_bar:
        tempo_by_bar[1] = metadata.get("base_tempo", 120)

    title = metadata.get("key_name")
    genre = metadata.get("genre")
    if title and genre and genre not in ("none", None):
        pretty_genre = str(genre).replace("_", " ").title()
        work_title = f"Study in {title} ({pretty_genre})"
    elif title:
        work_title = f"Study in {title}"
    else:
        work_title = "Generated Piece"

    parts = [("P1", "Melody", melody_tl, melody_gr, "G", 2)]
    if accomp_tl:
        parts.append(("P2", "Accompaniment", accomp_tl, accomp_gr, "F", 4))

    out = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    out.append('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 '
               'Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">')
    out.append('<score-partwise version="4.0">')
    out.append("  <work>")
    out.append(f"    <work-title>{escape(work_title)}</work-title>")
    out.append("  </work>")
    out.append("  <identification>")
    out.append('    <creator type="composer">Constrained Music Studio</creator>')
    out.append("    <encoding>")
    out.append("      <software>musicxml_writer.py (Music Companion)</software>")
    out.append(f"      <encoding-date>{date.today().isoformat()}</encoding-date>")
    out.append("    </encoding>")
    out.append("  </identification>")
    out.append("  <part-list>")
    for pid, pname, _tl, _gr, _cs, _cl in parts:
        out.append(f'    <score-part id="{pid}">')
        out.append(f"      <part-name>{pname}</part-name>")
        out.append("      <score-instrument id=\"%s-I1\">" % pid)
        out.append("        <instrument-name>Piano</instrument-name>")
        out.append("      </score-instrument>")
        out.append("    </score-part>")
    out.append("  </part-list>")

    for pid, _pname, tl, gr, clef_sign, clef_line in parts:
        out.append(f'  <part id="{pid}">')
        # tempo directions belong to the first part only
        part_tempi = tempo_by_bar if pid == "P1" else {}
        out.extend(render_part(tl, gr, total_bars, units_per_bar, fifths,
                               xml_mode, beats, beat_type, clef_sign, clef_line,
                               part_tempi))
        out.append("  </part>")
    out.append("</score-partwise>")
    return "\n".join(out) + "\n"


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: python musicxml_writer.py <input.json> [output.musicxml]")
        sys.exit(0 if len(sys.argv) >= 2 else 1)
    json_path = sys.argv[1]
    if not Path(json_path).is_file():
        print(f"Error: Input file not found: {json_path}")
        sys.exit(1)
    if len(sys.argv) >= 3:
        xml_path = sys.argv[2]
    else:
        xml_path = str(Path(json_path).with_suffix(".musicxml"))
    print(f"Converting {json_path} to MusicXML...")
    json_to_musicxml(json_path, xml_path)
    print("Done!")


if __name__ == "__main__":
    main()
