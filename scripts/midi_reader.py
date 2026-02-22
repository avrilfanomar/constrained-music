#!/usr/bin/env python3
"""
midi_reader.py - Convert MIDI files to Music Companion JSON format

Reads a MIDI file and outputs:
1. JSON file compatible with the companion's internal format (same as midi_writer.py input)
2. A .dat file with one note per line for easy Picat parsing

This enables importing real pieces for variation/continuation input and analysis.

Usage:
    python midi_reader.py input.mid output.json
    python midi_reader.py input.mid              # outputs input.json + input.dat

Requirements:
    pip install mido
"""

import json
import sys
from pathlib import Path

try:
    import mido
except ImportError:
    print("Error: mido is required. Install with: pip install mido")
    sys.exit(1)


def approximate_duration(beats):
    """Convert a beat duration to a simple fraction (numerator, denominator).

    Duration is in quarter-note beats. We express as fraction of a whole note.
    1 beat = 1/4 whole note, 2 beats = 1/2, 0.5 beats = 1/8, etc.
    """
    # Common durations: (beats, whole-note-fraction-num, whole-note-fraction-den)
    common = [
        (4.0, 1, 1),      # Whole note
        (3.0, 3, 4),      # Dotted half
        (2.0, 1, 2),      # Half note
        (1.5, 3, 8),      # Dotted quarter
        (1.0, 1, 4),      # Quarter note
        (0.75, 3, 16),    # Dotted eighth
        (0.5, 1, 8),      # Eighth note
        (0.375, 3, 32),   # Dotted sixteenth
        (0.25, 1, 16),    # Sixteenth note
        (0.125, 1, 32),   # Thirty-second note
    ]

    best_match = (1, 4)  # Default: quarter note
    best_diff = float('inf')

    for beat_val, num, den in common:
        diff = abs(beats - beat_val)
        if diff < best_diff:
            best_diff = diff
            best_match = (num, den)

    return best_match


def midi_to_json(midi_path, json_path):
    """Convert a MIDI file to Music Companion JSON format.

    Also writes a .dat file with simple space-delimited note data for Picat.
    """
    mid = mido.MidiFile(midi_path)

    print(f"Reading {midi_path}...")
    print(f"  Type: {mid.type}")
    print(f"  Tracks: {len(mid.tracks)}")
    print(f"  Ticks per beat: {mid.ticks_per_beat}")

    # Extract time signature from first track
    time_sig = {'beats': 4, 'beat_unit': 4}  # Default 4/4
    initial_tempo = 500000  # Default 120 BPM (microseconds per beat)

    # Build tempo map from all tracks
    tempo_changes = []  # List of (tick, bpm)

    for track in mid.tracks:
        abs_tick = 0
        for msg in track:
            abs_tick += msg.time
            if msg.type == 'set_tempo':
                bpm = round(mido.tempo2bpm(msg.tempo))
                tempo_changes.append((abs_tick, bpm))
                if abs_tick == 0:
                    initial_tempo = msg.tempo
            elif msg.type == 'time_signature':
                time_sig = {
                    'beats': msg.numerator,
                    'beat_unit': msg.denominator
                }

    ticks_per_beat = mid.ticks_per_beat
    ticks_per_bar = ticks_per_beat * time_sig['beats'] * 4 // time_sig['beat_unit']
    ticks_per_beat_unit = ticks_per_beat * 4 // time_sig['beat_unit']

    # Sort tempo changes by tick
    tempo_changes.sort(key=lambda x: x[0])
    if not tempo_changes:
        tempo_changes = [(0, round(mido.tempo2bpm(initial_tempo)))]

    # Convert tempo changes to bar-based format
    bar_tempo_changes = []
    seen_bars = set()
    for tick, bpm in tempo_changes:
        bar = tick // ticks_per_bar + 1
        if bar not in seen_bars:
            bar_tempo_changes.append({'bar': bar, 'bpm': bpm})
            seen_bars.add(bar)

    # Extract notes from all tracks
    all_notes = []

    for track_idx, track in enumerate(mid.tracks):
        abs_tick = 0
        active_notes = {}  # pitch -> (start_tick, velocity)

        for msg in track:
            abs_tick += msg.time

            if msg.type == 'note_on' and msg.velocity > 0:
                # If note already active, close it first (overlapping notes)
                if msg.note in active_notes:
                    start_tick, velocity = active_notes.pop(msg.note)
                    duration_ticks = abs_tick - start_tick
                    if duration_ticks > 0:
                        note = _make_note(msg.note, start_tick, duration_ticks,
                                          velocity, track_idx, ticks_per_bar,
                                          ticks_per_beat_unit, ticks_per_beat)
                        all_notes.append(note)
                active_notes[msg.note] = (abs_tick, msg.velocity)

            elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                if msg.note in active_notes:
                    start_tick, velocity = active_notes.pop(msg.note)
                    duration_ticks = abs_tick - start_tick

                    if duration_ticks > 0:
                        note = _make_note(msg.note, start_tick, duration_ticks,
                                          velocity, track_idx, ticks_per_bar,
                                          ticks_per_beat_unit, ticks_per_beat)
                        all_notes.append(note)

    # Sort by position then pitch
    all_notes.sort(key=lambda n: (n['bar'], n['beat'], n['sub'], n['pitch']))

    print(f"  Notes: {len(all_notes)}")
    print(f"  Time signature: {time_sig['beats']}/{time_sig['beat_unit']}")
    print(f"  Tempo changes: {len(bar_tempo_changes)}")

    if all_notes:
        bars = max(n['bar'] for n in all_notes)
        pitches = [n['pitch'] for n in all_notes]
        print(f"  Bars: {bars}")
        print(f"  Pitch range: {min(pitches)}-{max(pitches)} ({max(pitches) - min(pitches)} semitones)")

    # Build JSON output
    output = {
        'metadata': {
            'generator': 'midi_reader',
            'source': str(Path(midi_path).name),
            'version': '1.0',
            'num_notes': len(all_notes),
            'num_tempo_changes': len(bar_tempo_changes),
            'time_signature': time_sig
        },
        'tempo_changes': bar_tempo_changes,
        'notes': all_notes
    }

    with open(json_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"  JSON output: {json_path}")

    # Write .dat file for Picat import
    dat_path = str(Path(json_path).with_suffix('.dat'))
    write_dat_format(all_notes, bar_tempo_changes, time_sig, dat_path)

    print("Done!")


def _make_note(pitch, start_tick, duration_ticks, velocity, track_idx,
               ticks_per_bar, ticks_per_beat_unit, ticks_per_beat):
    """Create a note dict from raw MIDI data."""
    bar = start_tick // ticks_per_bar + 1
    tick_in_bar = start_tick % ticks_per_bar
    beat = tick_in_bar // ticks_per_beat_unit + 1
    sub_ticks = tick_in_bar % ticks_per_beat_unit
    sub = sub_ticks / ticks_per_beat_unit if ticks_per_beat_unit > 0 else 0.0

    dur_beats = duration_ticks / ticks_per_beat
    dur_num, dur_den = approximate_duration(dur_beats)

    # Voice: track 0-1 = voice 1 (melody), track 2+ = voice 10 (accompaniment)
    voice = 1 if track_idx <= 1 else 10

    return {
        'pitch': pitch,
        'dur_num': dur_num,
        'dur_den': dur_den,
        'bar': bar,
        'beat': beat,
        'sub': round(sub, 3),
        'voice': voice,
        'velocity': velocity
    }


def write_dat_format(notes, tempo_changes, time_sig, dat_path):
    """Write a simple space-delimited data file for Picat import.

    Format:
      Line 1: HEADER num_notes num_tempo_changes beats beat_unit
      Lines 2..N+1: TEMPO bar bpm
      Lines N+2..: NOTE pitch dur_num dur_den bar beat sub voice velocity

    All fields are integers except sub which is a float with 3 decimal places.
    """
    with open(dat_path, 'w') as f:
        # Header
        f.write(f"HEADER {len(notes)} {len(tempo_changes)} "
                f"{time_sig['beats']} {time_sig['beat_unit']}\n")

        # Tempo changes
        for tc in tempo_changes:
            f.write(f"TEMPO {tc['bar']} {tc['bpm']}\n")

        # Notes
        for note in notes:
            f.write(f"NOTE {note['pitch']} {note['dur_num']} {note['dur_den']} "
                    f"{note['bar']} {note['beat']} {note['sub']:.3f} "
                    f"{note['voice']} {note['velocity']}\n")

    print(f"  DAT output: {dat_path}")


def main():
    if len(sys.argv) < 2 or (len(sys.argv) == 2 and sys.argv[1] in ['-h', '--help']):
        print("Usage: python midi_reader.py <input.mid> [output.json]")
        print()
        print("Convert MIDI file to Music Companion JSON format.")
        print("Also produces a .dat file for Picat import.")
        print()
        print("Arguments:")
        print("  input.mid    MIDI file to read")
        print("  output.json  Output JSON file (default: same name with .json)")
        print()
        print("Output files:")
        print("  output.json  JSON format (compatible with midi_writer.py)")
        print("  output.dat   Simple text format (for picat/midi_import.pi)")
        print()
        print("Examples:")
        print("  python midi_reader.py song.mid")
        print("  python midi_reader.py song.mid imported.json")
        sys.exit(0 if sys.argv[1:] and sys.argv[1] in ['-h', '--help'] else 1)

    midi_path = sys.argv[1]
    if not Path(midi_path).exists():
        print(f"Error: File not found: {midi_path}")
        sys.exit(1)

    if len(sys.argv) >= 3:
        json_path = sys.argv[2]
    else:
        json_path = str(Path(midi_path).with_suffix('.json'))

    midi_to_json(midi_path, json_path)


if __name__ == '__main__':
    main()
