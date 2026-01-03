#!/usr/bin/env python3
"""
lilypond_writer.py - Convert Music Companion JSON to LilyPond notation

This script reads the JSON output from Picat's companion.pi and
creates a LilyPond (.ly) file for professional score engraving.

Usage:
    python lilypond_writer.py session.json session.ly
    python lilypond_writer.py session.json  # outputs session.ly

Then compile with: lilypond session.ly

Requirements:
    - Python 3.8+
    - LilyPond installed for PDF generation (optional)
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional


# MIDI pitch to LilyPond note name (sharp preference)
PITCH_NAMES = ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'ais', 'b']

# Alternative names (flat preference)
PITCH_NAMES_FLAT = ['c', 'des', 'd', 'ees', 'e', 'f', 'ges', 'g', 'aes', 'a', 'bes', 'b']

# Articulation to LilyPond notation
ARTICULATIONS = {
    'arco': '',                     # Default, no marking
    'pizzicato': '^\\markup{pizz.}',
    'tremolo': ':32',               # 32nd note tremolo
    'staccato': '-.',
    'legato': '',                   # Handled via slurs
    'spiccato': '-^',               # Marcato as approximation
    'detache': '-',                 # Tenuto
    'martele': '->',                # Accent
    'col_legno': '^\\markup{c.l.}',
}

# Bowing marks
BOWING_MARKS = {
    'up_bow': '\\upbow',
    'down_bow': '\\downbow',
    'auto': '',
}

# String numbers for violin
STRING_NUMBERS = {
    'g_string': '\\4',
    'd_string': '\\3',
    'a_string': '\\2',
    'e_string': '\\1',
    'auto': '',
}

# Dynamic markings
DYNAMICS = {
    'pp': '\\pp',
    'p': '\\p',
    'mp': '\\mp',
    'mf': '\\mf',
    'f': '\\f',
    'ff': '\\ff',
}


def midi_to_lilypond_pitch(midi: int) -> str:
    """Convert MIDI pitch number to LilyPond pitch notation.

    LilyPond uses:
    - c' for middle C (MIDI 60)
    - Octave marks: ' for each octave above c' (MIDI 60)
    - Octave marks: , for each octave below c (MIDI 48)
    """
    octave = midi // 12 - 1  # MIDI octave (60 = C4 = octave 4)
    pitch_class = midi % 12
    pitch_name = PITCH_NAMES[pitch_class]

    # LilyPond's middle C is c' (octave 4 in MIDI terms)
    # c (no mark) = MIDI octave 3 (C3 = 48)
    # c' = MIDI octave 4 (C4 = 60)
    # c'' = MIDI octave 5 (C5 = 72)
    # c, = MIDI octave 2 (C2 = 36)

    lilypond_octave = octave - 3  # Relative to c (octave 3)

    if lilypond_octave > 0:
        octave_marks = "'" * lilypond_octave
    elif lilypond_octave < 0:
        octave_marks = "," * (-lilypond_octave)
    else:
        octave_marks = ""

    return pitch_name + octave_marks


def duration_to_lilypond(dur_num: int, dur_den: int) -> str:
    """Convert duration fraction to LilyPond duration notation.

    Duration is fraction of whole note:
    - 1/1 = whole note = "1"
    - 1/2 = half note = "2"
    - 1/4 = quarter note = "4"
    - 3/8 = dotted quarter = "4."
    """
    # Simple cases: 1/n = n
    if dur_num == 1:
        return str(dur_den)

    # Dotted notes: 3/2n = n.
    if dur_num == 3 and dur_den % 2 == 0:
        base_dur = dur_den // 2
        return str(base_dur) + "."

    # Double-dotted: 7/4n = n..
    if dur_num == 7 and dur_den % 4 == 0:
        base_dur = dur_den // 4
        return str(base_dur) + ".."

    # For complex durations, use the closest simple value
    # (a more complete solution would use ties)
    ratio = dur_num / dur_den
    if ratio >= 0.75:
        return "1"
    elif ratio >= 0.375:
        return "2"
    elif ratio >= 0.1875:
        return "4"
    elif ratio >= 0.09375:
        return "8"
    else:
        return "16"


class LilyPondWriter:
    """Converts Music Companion JSON to LilyPond format."""

    def __init__(self, json_data: Dict[str, Any]):
        self.metadata = json_data.get('metadata', {})
        self.tempo_changes = json_data.get('tempo_changes', [])

        # Prefer violin_notes if available, fall back to notes
        if 'violin_notes' in json_data:
            self.notes = json_data['violin_notes']
            self.has_violin_data = True
        else:
            self.notes = json_data.get('notes', [])
            self.has_violin_data = False

        self.beats_per_bar = 4  # Assume 4/4
        self._last_dynamic = None
        self._last_articulation = None
        self._in_slur = False

    def generate(self) -> str:
        """Generate complete LilyPond file content."""
        lines = []

        # Version
        lines.append('\\version "2.24.0"')
        lines.append('')

        # Header
        lines.append('\\header {')
        lines.append('  title = "Generated Violin Piece"')
        lines.append('  composer = "Music Companion"')
        if self.has_violin_data:
            lines.append('  instrument = "Violin"')
        lines.append('}')
        lines.append('')

        # Paper settings
        lines.append('\\paper {')
        lines.append('  #(set-paper-size "a4")')
        lines.append('}')
        lines.append('')

        # Music content
        lines.append('\\score {')
        lines.append('  \\new Staff \\with {')
        lines.append('    instrumentName = "Violin"')
        lines.append('  } {')
        lines.append('    \\clef treble')

        # Initial tempo
        if self.tempo_changes:
            tempo = self.tempo_changes[0].get('bpm', 120)
            lines.append(f'    \\tempo 4 = {tempo}')

        lines.append('    \\time 4/4')
        lines.append('')

        # Generate notes
        note_lines = self._generate_notes()
        lines.extend(note_lines)

        lines.append('  }')
        lines.append('  \\layout { }')
        lines.append('  \\midi { }')
        lines.append('}')

        return '\n'.join(lines)

    def _generate_notes(self) -> List[str]:
        """Generate note content organized by bars."""
        if not self.notes:
            return ['    % No notes']

        lines = []
        current_bar = 0
        bar_content: List[str] = []

        # Build tempo map for tempo changes within the piece
        tempo_map = {tc['bar']: tc['bpm'] for tc in self.tempo_changes}

        for note in self.notes:
            bar = note.get('bar', 1)

            # New bar
            if bar != current_bar:
                if bar_content:
                    lines.append('    ' + ' '.join(bar_content) + ' |')
                bar_content = []
                current_bar = bar

                # Check for tempo change at bar start
                if bar in tempo_map and bar > 1:
                    tempo = tempo_map[bar]
                    lines.append(f'    \\tempo 4 = {tempo}')

            # Format note
            note_str = self._format_note(note)
            bar_content.append(note_str)

        # Final bar
        if bar_content:
            lines.append('    ' + ' '.join(bar_content) + ' \\bar "|."')

        return lines

    def _format_note(self, note: Dict[str, Any]) -> str:
        """Format a single note with all markings."""
        # Pitch
        pitch_str = midi_to_lilypond_pitch(note['pitch'])

        # Duration
        duration_str = duration_to_lilypond(note['dur_num'], note['dur_den'])

        # Build the note
        result = pitch_str + duration_str

        # Add violin-specific markings if available
        if self.has_violin_data:
            result += self._format_violin_markings(note)

        return result

    def _format_violin_markings(self, note: Dict[str, Any]) -> str:
        """Add violin-specific markings to a note."""
        markings = []

        # Articulation (but not redundantly)
        articulation = note.get('articulation', 'arco')
        if articulation != self._last_articulation:
            art_mark = ARTICULATIONS.get(articulation, '')
            if art_mark:
                markings.append(art_mark)

            # Handle legato slurs
            if articulation == 'legato' and not self._in_slur:
                markings.append('(')
                self._in_slur = True
            elif articulation != 'legato' and self._in_slur:
                markings.insert(0, ')')  # Close previous slur
                self._in_slur = False

            self._last_articulation = articulation

        # Bowing
        bowing = note.get('bowing', 'auto')
        bow_mark = BOWING_MARKS.get(bowing, '')
        if bow_mark:
            markings.append(bow_mark)

        # String number (use sparingly - only when specified explicitly)
        string = note.get('string', 'auto')
        if string != 'auto':
            string_mark = STRING_NUMBERS.get(string, '')
            if string_mark:
                markings.append(string_mark)

        # Dynamics (only on change)
        dynamics = note.get('dynamics', {})
        if isinstance(dynamics, dict):
            level = dynamics.get('level', '')
            if level and level != self._last_dynamic:
                dyn_mark = DYNAMICS.get(level, '')
                if dyn_mark:
                    markings.append(dyn_mark)
                self._last_dynamic = level

                # Crescendo/decrescendo
                cresc_target = dynamics.get('cresc_target')
                if cresc_target and cresc_target != 'none':
                    if self._dynamic_value(cresc_target) > self._dynamic_value(level):
                        markings.append('\\<')  # Crescendo
                    else:
                        markings.append('\\>')  # Decrescendo

        return ''.join(markings)

    def _dynamic_value(self, dyn: str) -> int:
        """Convert dynamic marking to numeric value for comparison."""
        values = {'pp': 1, 'p': 2, 'mp': 3, 'mf': 4, 'f': 5, 'ff': 6}
        return values.get(dyn, 4)


def json_to_lilypond(json_path: str, ly_path: str) -> None:
    """Convert a Music Companion JSON file to LilyPond."""

    with open(json_path, 'r') as f:
        data = json.load(f)

    # Check format
    metadata = data.get('metadata', {})
    format_type = metadata.get('format', 'basic')
    num_notes = metadata.get('num_notes', len(data.get('notes', [])))

    print(f"Converting {json_path} to LilyPond...")
    print(f"  Format: {format_type}")
    print(f"  Notes: {num_notes}")

    if 'violin_notes' in data:
        print("  Violin data: Yes")
    else:
        print("  Violin data: No (using basic notes)")

    # Generate LilyPond content
    writer = LilyPondWriter(data)
    content = writer.generate()

    # Write output
    with open(ly_path, 'w') as f:
        f.write(content)

    print(f"  Output: {ly_path}")
    print(f"  Compile with: lilypond {ly_path}")
    print("Done!")


def print_usage():
    """Print usage information."""
    print("Usage: python lilypond_writer.py <input.json> [output.ly]")
    print()
    print("Convert Music Companion JSON to LilyPond notation.")
    print()
    print("Arguments:")
    print("  input.json   JSON file generated by Picat companion.pi")
    print("  output.ly    Output LilyPond file (default: same name as input)")
    print()
    print("Examples:")
    print("  python lilypond_writer.py session.json session.ly")
    print("  python lilypond_writer.py session.json")
    print()
    print("Then compile the LilyPond file:")
    print("  lilypond session.ly  # Creates session.pdf")


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)

    if sys.argv[1] in ['-h', '--help']:
        print_usage()
        sys.exit(0)

    json_path = sys.argv[1]

    # Determine output path
    if len(sys.argv) >= 3:
        ly_path = sys.argv[2]
    else:
        ly_path = str(Path(json_path).with_suffix('.ly'))

    # Validate input file exists
    if not Path(json_path).exists():
        print(f"Error: Input file not found: {json_path}")
        sys.exit(1)

    json_to_lilypond(json_path, ly_path)


if __name__ == '__main__':
    main()
