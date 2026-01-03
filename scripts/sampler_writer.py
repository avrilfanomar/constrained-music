#!/usr/bin/env python3
"""
sampler_writer.py - Generate sampler-ready output for realistic violin playback

This script reads the JSON output from Picat's companion.pi and generates
MIDI files with expression control (CC automation) and keyswitches for
use with sample libraries like Spitfire, EastWest, or any SFZ player.

Usage:
    python sampler_writer.py session.json --format midi_cc
    python sampler_writer.py session.json --format sfz
    python sampler_writer.py session.json --library spitfire

Requirements:
    pip install midiutil

Supported formats:
    midi_cc  - MIDI file with CC automation for expression parameters
    sfz      - SFZ control file for sampler mapping (reference only)

Supported library mappings:
    spitfire - Spitfire-style keyswitches
    eastwest - EastWest Hollywood Strings style
    generic  - Generic MIDI CC mapping
"""

import json
import sys
import argparse
from pathlib import Path
from typing import Dict, Any, List, Optional

try:
    from midiutil import MIDIFile
except ImportError:
    print("Error: midiutil is required. Install with: pip install midiutil")
    sys.exit(1)


# ==============================================================================
# KEYSWITCH MAPPINGS
# ==============================================================================
# Different sample libraries use different keyswitch notes

KEYSWITCH_MAPPINGS = {
    'spitfire': {
        'arco': 24,         # C0
        'legato': 25,       # C#0
        'staccato': 26,     # D0
        'spiccato': 27,     # D#0
        'tremolo': 28,      # E0
        'pizzicato': 29,    # F0
        'col_legno': 30,    # F#0
        'martele': 31,      # G0
        'detache': 32,      # G#0
    },
    'eastwest': {
        'arco': 0,          # C-2
        'legato': 1,        # C#-2
        'staccato': 2,      # D-2
        'spiccato': 3,      # D#-2
        'tremolo': 4,       # E-2
        'pizzicato': 5,     # F-2
        'col_legno': 6,     # F#-2
        'martele': 7,       # G-2
        'detache': 8,       # G#-2
    },
    'generic': {
        # Uses program changes instead of keyswitches
        'arco': 0,
        'legato': 0,
        'staccato': 0,
        'spiccato': 0,
        'tremolo': 0,
        'pizzicato': 0,
        'col_legno': 0,
        'martele': 0,
        'detache': 0,
    },
}

# ==============================================================================
# MIDI CC MAPPINGS
# ==============================================================================
# Standard and extended MIDI CC numbers for expression

CC_MAPPINGS = {
    'mod_wheel': 1,         # General modulation
    'expression': 11,       # Expression (volume)
    'vibrato_rate': 76,     # Sound Controller 7
    'vibrato_depth': 77,    # Sound Controller 8
    # Custom CCs for extended expression (may vary by library)
    'vibrato': 21,          # Custom: vibrato intensity
    'bow_pressure': 22,     # Custom: bow pressure
    'bow_speed': 23,        # Custom: bow speed
    'bow_position': 24,     # Custom: bow position (tasto/pont)
}


class SamplerWriter:
    """Generates sampler-ready output from Music Companion JSON."""

    def __init__(self, json_data: Dict[str, Any], library: str = 'spitfire'):
        self.data = json_data
        self.metadata = json_data.get('metadata', {})
        self.tempo_changes = json_data.get('tempo_changes', [])

        # Prefer violin_notes if available
        if 'violin_notes' in json_data:
            self.notes = json_data['violin_notes']
            self.has_violin_data = True
        else:
            self.notes = json_data.get('notes', [])
            self.has_violin_data = False

        self.library = library
        self.keyswitch_map = KEYSWITCH_MAPPINGS.get(library, KEYSWITCH_MAPPINGS['generic'])
        self.beats_per_bar = 4

    def generate_midi_with_cc(self, output_path: str) -> None:
        """Generate MIDI file with CC automation for expression."""

        # Create MIDI file with 2 tracks:
        # Track 0: Notes and keyswitches
        # Track 1: CC automation (optional, for clarity)
        midi = MIDIFile(1, deinterleave=False, ticks_per_quarternote=480)
        track = 0
        channel = 0

        # Set track name
        midi.addTrackName(track, 0, "Violin - Sampler")

        # Initial tempo
        initial_tempo = 120
        if self.tempo_changes:
            initial_tempo = self.tempo_changes[0]['bpm']
        midi.addTempo(track, 0, initial_tempo)

        # Build tempo map
        tempo_map = {tc['bar']: tc['bpm'] for tc in self.tempo_changes}
        current_tempo = initial_tempo
        added_tempos = {0}

        # Track current articulation for keyswitch changes
        current_articulation = None

        for note in self.notes:
            start_beat = self._calculate_start_beat(note)
            duration_beats = self._calculate_duration(note)
            pitch = note['pitch']
            velocity = note['velocity']

            # Tempo changes
            bar = note.get('bar', 1)
            if bar in tempo_map and start_beat not in added_tempos:
                new_tempo = tempo_map[bar]
                if new_tempo != current_tempo:
                    midi.addTempo(track, start_beat, new_tempo)
                    current_tempo = new_tempo
                    added_tempos.add(start_beat)

            # Keyswitch if articulation changed
            if self.has_violin_data:
                articulation = note.get('articulation', 'arco')
                if articulation != current_articulation:
                    ks_note = self.keyswitch_map.get(articulation, self.keyswitch_map.get('arco', 24))
                    # Add keyswitch slightly before the note
                    ks_time = max(0, start_beat - 0.01)
                    midi.addNote(track, channel, ks_note, ks_time, 0.01, 100)
                    current_articulation = articulation

                # Add CC automation for expression
                self._add_expression_cc(midi, track, channel, start_beat, note)

            # Add the actual note
            midi.addNote(track, channel, pitch, start_beat, duration_beats, velocity)

        # Write MIDI file
        with open(output_path, 'wb') as f:
            midi.writeFile(f)

    def _add_expression_cc(self, midi: MIDIFile, track: int, channel: int,
                           time: float, note: Dict[str, Any]) -> None:
        """Add CC events for expression parameters."""

        expression = note.get('expression', {})
        if not isinstance(expression, dict):
            return

        # Vibrato (CC21 or mod wheel CC1)
        vibrato = expression.get('vibrato', 0.5)
        vibrato_cc = int(vibrato * 127)
        midi.addControllerEvent(track, channel, time, CC_MAPPINGS['vibrato'], vibrato_cc)

        # Expression (CC11) based on bow pressure
        bow_pressure = expression.get('bow_pressure', 0.5)
        expression_cc = int(bow_pressure * 127)
        midi.addControllerEvent(track, channel, time, CC_MAPPINGS['expression'], expression_cc)

        # Mod wheel (CC1) for general expression/dynamics
        # Combine bow speed and position for overall "intensity"
        bow_speed = expression.get('bow_speed', 0.5)
        mod_value = int((bow_pressure * 0.6 + bow_speed * 0.4) * 127)
        midi.addControllerEvent(track, channel, time, CC_MAPPINGS['mod_wheel'], mod_value)

    def _calculate_start_beat(self, note: Dict[str, Any]) -> float:
        """Calculate start time in beats."""
        bar = note.get('bar', 1)
        beat = note.get('beat', 1)
        sub = note.get('sub', 0)
        return (bar - 1) * self.beats_per_bar + (beat - 1) + sub

    def _calculate_duration(self, note: Dict[str, Any]) -> float:
        """Calculate duration in beats."""
        dur_num = note['dur_num']
        dur_den = note['dur_den']
        return (dur_num * self.beats_per_bar) / dur_den

    def generate_sfz_reference(self, output_path: str) -> None:
        """Generate an SFZ reference file for articulation mapping.

        This is a template/reference file, not a complete SFZ instrument.
        Users should adapt it for their specific sample library.
        """

        lines = []
        lines.append('// SFZ Reference File - Generated by Music Companion')
        lines.append('// Adapt this template for your violin sample library')
        lines.append('//')
        lines.append(f'// Library style: {self.library}')
        lines.append('')

        lines.append('<control>')
        lines.append('default_path=samples/')
        lines.append('')

        lines.append('// ==== KEYSWITCH DEFINITIONS ====')
        lines.append('// Each keyswitch triggers a different articulation group')
        lines.append('')

        for articulation, ks_note in sorted(self.keyswitch_map.items(), key=lambda x: x[1]):
            note_name = self._midi_to_note_name(ks_note)
            lines.append(f'// {articulation.upper()}: Keyswitch {note_name} (MIDI {ks_note})')
            lines.append(f'<group> sw_lokey={ks_note} sw_hikey={ks_note} sw_default={ks_note}')
            lines.append(f'// Add your {articulation} samples here')
            lines.append(f'// <region> sample={articulation}_g3.wav lokey=55 hikey=58 pitch_keycenter=55')
            lines.append('')

        lines.append('// ==== CC MAPPINGS ====')
        lines.append('// Use these CCs for expression control')
        lines.append('//')
        for name, cc in CC_MAPPINGS.items():
            lines.append(f'// CC{cc}: {name}')
        lines.append('')

        lines.append('// ==== EXPRESSION EXAMPLE ====')
        lines.append('// Map mod wheel to dynamics/vibrato')
        lines.append('<control>')
        lines.append(f'set_cc{CC_MAPPINGS["mod_wheel"]}=64  // Default mod wheel position')
        lines.append('')

        with open(output_path, 'w') as f:
            f.write('\n'.join(lines))

    def _midi_to_note_name(self, midi: int) -> str:
        """Convert MIDI note to name (e.g., 60 -> C4)."""
        notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        octave = midi // 12 - 1
        note = notes[midi % 12]
        return f'{note}{octave}'


def print_keyswitch_info(library: str) -> None:
    """Print keyswitch mapping for a library."""
    mapping = KEYSWITCH_MAPPINGS.get(library, KEYSWITCH_MAPPINGS['generic'])

    print(f"\nKeyswitch mapping for '{library}':")
    print("-" * 40)

    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    for articulation, ks in sorted(mapping.items(), key=lambda x: x[1]):
        octave = ks // 12 - 1
        note_name = notes[ks % 12]
        print(f"  {articulation:12s}  ->  {note_name}{octave} (MIDI {ks})")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Generate sampler-ready output for violin playback',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python sampler_writer.py session.json --format midi_cc
  python sampler_writer.py session.json --format midi_cc --library eastwest
  python sampler_writer.py session.json --format sfz
  python sampler_writer.py --list-keyswitches spitfire
        """
    )

    parser.add_argument('input', nargs='?', help='Input JSON file')
    parser.add_argument('--format', '-f', choices=['midi_cc', 'sfz'], default='midi_cc',
                        help='Output format (default: midi_cc)')
    parser.add_argument('--library', '-l', choices=['spitfire', 'eastwest', 'generic'],
                        default='spitfire', help='Sample library mapping (default: spitfire)')
    parser.add_argument('--output', '-o', help='Output file path')
    parser.add_argument('--list-keyswitches', metavar='LIBRARY',
                        help='Print keyswitch mapping for a library and exit')

    args = parser.parse_args()

    # List keyswitches mode
    if args.list_keyswitches:
        print_keyswitch_info(args.list_keyswitches)
        sys.exit(0)

    # Normal mode - require input file
    if not args.input:
        parser.print_help()
        sys.exit(1)

    json_path = args.input

    # Validate input
    if not Path(json_path).exists():
        print(f"Error: Input file not found: {json_path}")
        sys.exit(1)

    # Load JSON
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Check for violin data
    metadata = data.get('metadata', {})
    has_violin = 'violin_notes' in data

    print(f"Converting {json_path} to sampler format...")
    print(f"  Format: {args.format}")
    print(f"  Library: {args.library}")
    print(f"  Violin data: {'Yes' if has_violin else 'No (using basic notes)'}")

    # Create writer
    writer = SamplerWriter(data, args.library)

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        base = Path(json_path).stem
        if args.format == 'midi_cc':
            output_path = f"{base}_sampler.mid"
        else:
            output_path = f"{base}_reference.sfz"

    # Generate output
    if args.format == 'midi_cc':
        writer.generate_midi_with_cc(output_path)
        print(f"  Output: {output_path}")
        print(f"  Notes: {len(writer.notes)}")
        if has_violin:
            print(f"  Keyswitches: {args.library} style")
            print(f"  CC automation: Expression, Mod wheel, Vibrato")
    else:
        writer.generate_sfz_reference(output_path)
        print(f"  Output: {output_path}")
        print("  Note: This is a reference template, adapt for your samples")

    print("Done!")


if __name__ == '__main__':
    main()
