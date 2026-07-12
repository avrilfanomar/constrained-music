#!/usr/bin/env python3
"""
midi_writer.py - Convert Music Companion JSON to MIDI file

This script reads the JSON output from Picat's companion.pi and
creates a playable MIDI file.

Usage:
    python midi_writer.py session.json session.mid
    python midi_writer.py session.json  # outputs session.mid

Requirements:
    pip install midiutil
"""

import json
import math
import sys
from pathlib import Path

try:
    from midiutil import MIDIFile
except ImportError:
    print("Error: midiutil is required. Install with: pip install midiutil")
    sys.exit(1)


def json_to_midi(json_path: str, midi_path: str) -> None:
    """Convert a Music Companion JSON file to MIDI.

    Supports multi-track output: notes are grouped by their 'voice' field.
    Voice 1 (melody) -> Track 0, Voice 10 (accompaniment) -> Track 1, etc.
    Backward compatible: single-voice files produce single-track MIDI.
    """

    # Load JSON data
    with open(json_path, 'r') as f:
        data = json.load(f)

    notes = data['notes']
    tempo_changes = data['tempo_changes']
    metadata = data.get('metadata', {})

    print(f"Converting {json_path} to MIDI...")
    print(f"  Notes: {len(notes)}")
    print(f"  Tempo changes: {len(tempo_changes)}")

    # Group notes into tracks: melody (voice <= 9) and accompaniment (voice 10+)
    ACCOMP_VOICE = 10
    has_accomp = any(note.get('voice', 1) >= ACCOMP_VOICE for note in notes)
    num_tracks = 2 if has_accomp else 1

    # Map all melody voices to track 0, accompaniment to track 1
    def voice_to_track(v):
        return 1 if v >= ACCOMP_VOICE else 0

    TRACK_NAMES = {0: "Melody (RH)", 1: "Accompaniment (LH)"}

    # Read instrument assignments from metadata (default to piano)
    melody_instrument = metadata.get('melody_instrument', 0)
    accomp_instrument = metadata.get('accomp_instrument', 0)
    TRACK_INSTRUMENTS = {0: melody_instrument, 1: accomp_instrument}

    track_labels = [TRACK_NAMES[i] for i in range(num_tracks)]
    print(f"  Tracks: {num_tracks} ({', '.join(track_labels)})")
    print(f"  Instruments: Melody=GM{melody_instrument}, Accompaniment=GM{accomp_instrument}")

    # Create MIDI file
    # Use deinterleave=False to avoid issues with overlapping notes
    # Use high resolution (480 ticks per quarter note) for precise timing
    midi = MIDIFile(num_tracks, deinterleave=False, ticks_per_quarternote=480)

    # Set up each track
    for track_idx in range(num_tracks):
        name = TRACK_NAMES.get(track_idx, f"Track {track_idx}")
        midi.addTrackName(track_idx, 0, name)
        channel = min(track_idx, 15)  # MIDI channels 0-15
        program = TRACK_INSTRUMENTS.get(track_idx, 0)
        midi.addProgramChange(track_idx, channel, 0, program)

    # Default tempo (will be overwritten by first tempo change)
    initial_tempo = 120
    if tempo_changes:
        initial_tempo = tempo_changes[0]['bpm']
    # Tempo events go on track 0 (MIDI convention for format 1)
    midi.addTempo(0, 0, initial_tempo)

    # Build a tempo map: bar -> tempo
    tempo_map = {}
    for tc in tempo_changes:
        tempo_map[tc['bar']] = tc['bpm']

    # Track current tempo for tempo change events
    current_tempo = initial_tempo
    added_tempos = {0}  # Track which beat positions have tempo changes

    # Read time signature from metadata (default 4/4)
    time_sig = metadata.get('time_signature', {'beats': 4, 'beat_unit': 4})
    beats_per_bar = time_sig['beats']
    beat_unit = time_sig['beat_unit']

    # Add time signature to MIDI
    # MIDIFile.addTimeSignature(track, time, numerator, denominator_power, clocks_per_tick, notes_per_quarter)
    denom_power = int(math.log2(beat_unit))
    midi.addTimeSignature(0, 0, beats_per_bar, denom_power, 24, 8)

    print(f"  Time signature: {beats_per_bar}/{beat_unit}")

    # Convert notes to MIDI events

    # Pre-compute timing constants from time signature
    # quarter_beats_per_bar = how many quarter notes fit in one bar
    quarter_beats_per_bar = beats_per_bar * (4 / beat_unit)
    # Each beat in the time signature = 4/beat_unit quarter notes
    quarter_beats_per_beat = 4 / beat_unit

    for note in notes:
        pitch = note['pitch']
        dur_num = note['dur_num']
        dur_den = note['dur_den']
        bar = note['bar']
        beat = note['beat']
        sub = note.get('sub', 0)
        velocity = note['velocity']
        voice = note.get('voice', 1)

        track_idx = voice_to_track(voice)
        channel = min(track_idx, 15)

        # Calculate start time in quarter-note beats (0-indexed)
        start_beat = (bar - 1) * quarter_beats_per_bar + (beat - 1) * quarter_beats_per_beat + sub * quarter_beats_per_beat

        # Calculate duration in beats (quarter notes, the MIDI standard beat unit)
        # duration is a fraction of a whole note; 1 whole note = 4 quarter-note beats
        duration_beats = (dur_num * 4) / dur_den

        # Check for tempo change at this bar (on track 0 only)
        if bar in tempo_map and start_beat not in added_tempos:
            new_tempo = tempo_map[bar]
            if new_tempo != current_tempo:
                midi.addTempo(0, start_beat, new_tempo)
                current_tempo = new_tempo
                added_tempos.add(start_beat)

        # Add note to its track
        midi.addNote(track_idx, channel, pitch, start_beat, duration_beats, velocity)

    # Add sustain pedal events (CC64)
    pedal_events = data.get('pedal_events', [])
    if pedal_events:
        print(f"  Pedal events: {len(pedal_events)}")
        for pe in pedal_events:
            bar = pe['bar']
            beat = pe['beat']
            on = pe['on']
            # Calculate time in quarter-note beats
            time = (bar - 1) * quarter_beats_per_bar + (beat - 1) * quarter_beats_per_beat
            # CC64 = sustain pedal, value 127 = on, 0 = off
            value = 127 if on else 0
            # Add to accompaniment track if exists, otherwise track 0
            pedal_track = 1 if has_accomp else 0
            midi.addControllerEvent(pedal_track, min(pedal_track, 15), time, 64, value)

    # Write MIDI file
    with open(midi_path, 'wb') as f:
        midi.writeFile(f)

    print(f"  Output: {midi_path}")
    print("Done!")


def print_usage():
    """Print usage information."""
    print("Usage: python midi_writer.py <input.json> [output.mid]")
    print()
    print("Convert Music Companion JSON to MIDI file.")
    print()
    print("Arguments:")
    print("  input.json   JSON file generated by Picat companion.pi")
    print("  output.mid   Output MIDI file (default: same name as input)")
    print()
    print("Examples:")
    print("  python midi_writer.py session.json session.mid")
    print("  python midi_writer.py session.json")


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)

    if sys.argv[1] in ['-h', '--help']:
        print_usage()
        sys.exit(0)

    json_path = sys.argv[1]

    # Validate input file exists first
    json_file = Path(json_path)
    if not json_file.exists() or not json_file.is_file():
        # Fall back to session.json if input is invalid
        if json_path in ['.', ''] or not json_file.is_file():
            json_path = 'session.json'
            json_file = Path(json_path)
            if not json_file.exists():
                print(f"Error: Input file not found: {sys.argv[1]}")
                print(f"       And fallback session.json also not found")
                sys.exit(1)
        else:
            print(f"Error: Input file not found: {json_path}")
            sys.exit(1)

    # Determine output path
    if len(sys.argv) >= 3:
        midi_path = sys.argv[2]
    else:
        # Use same name with .mid extension
        midi_path = str(json_file.with_suffix('.mid'))

    json_to_midi(json_path, midi_path)


if __name__ == '__main__':
    main()
