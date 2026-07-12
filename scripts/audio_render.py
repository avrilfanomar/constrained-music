#!/usr/bin/env python3
"""
audio_render.py - Render Music Companion MIDI to audio (WAV/MP3)

Uses FluidSynth with a General MIDI soundfont for synthesis and ffmpeg for
MP3 encoding. Both are optional system dependencies; call capabilities()
to find out what the current machine supports before offering audio export.

Usage:
    python audio_render.py song.mid                 # -> song.wav
    python audio_render.py song.mid song.mp3        # -> mp3 (needs ffmpeg)
    python audio_render.py --check                  # print capabilities

Soundfont resolution order:
    1. $CMS_SOUNDFONT environment variable
    2. Common Linux/macOS soundfont locations (FluidR3_GM preferred)
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

SOUNDFONT_CANDIDATES = [
    "/usr/share/sounds/sf2/FluidR3_GM.sf2",
    "/usr/share/sounds/sf2/default-GM.sf2",
    "/usr/share/sounds/sf2/TimGM6mb.sf2",
    "/usr/share/soundfonts/FluidR3_GM.sf2",
    "/usr/share/soundfonts/default.sf2",
    "/usr/local/share/soundfonts/FluidR3_GM.sf2",
    "/opt/homebrew/share/soundfonts/FluidR3_GM.sf2",
]


def find_soundfont():
    env = os.environ.get("CMS_SOUNDFONT")
    if env and Path(env).is_file():
        return env
    for cand in SOUNDFONT_CANDIDATES:
        if Path(cand).is_file():
            return cand
    return None


def capabilities():
    """What audio formats can this machine render?"""
    # Kill-switch: force the browser onto the Tone.js sampler fallback and
    # let tests exercise the "no server audio" path on a machine that has
    # fluidsynth installed.
    if os.environ.get("CMS_NO_AUDIO"):
        return {"wav": False, "mp3": False,
                "fluidsynth": None, "ffmpeg": None, "soundfont": None}
    fluidsynth = shutil.which("fluidsynth")
    ffmpeg = shutil.which("ffmpeg")
    soundfont = find_soundfont()
    wav = bool(fluidsynth and soundfont)
    return {
        "wav": wav,
        "mp3": bool(wav and ffmpeg),
        "fluidsynth": fluidsynth,
        "ffmpeg": ffmpeg,
        "soundfont": soundfont,
    }


def midi_to_wav(midi_path: str, wav_path: str, sample_rate: int = 44100,
                gain: float = 0.7, reverb: bool = True) -> None:
    """Render MIDI to WAV via FluidSynth with reverb. Raises RuntimeError on failure."""
    caps = capabilities()
    if not caps["fluidsynth"]:
        raise RuntimeError("fluidsynth is not installed (apt install fluidsynth)")
    if not caps["soundfont"]:
        raise RuntimeError(
            "No GM soundfont found (apt install fluid-soundfont-gm, "
            "or set CMS_SOUNDFONT=/path/to/font.sf2)")
    cmd = [
        caps["fluidsynth"], "-ni",
        "-g", str(gain),
        "-F", wav_path,
        "-r", str(sample_rate),
    ]
    # Enable reverb for a professional studio sound (medium room)
    if reverb:
        cmd.extend([
            "-o", "synth.reverb.active=1",
            "-o", "synth.reverb.room-size=0.6",
            "-o", "synth.reverb.damp=0.5",
            "-o", "synth.reverb.width=5.0",
            "-o", "synth.reverb.level=0.3",
        ])
    cmd.extend([caps["soundfont"], midi_path])
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0 or not Path(wav_path).is_file():
        raise RuntimeError(f"fluidsynth failed: {proc.stderr or proc.stdout}")


def normalize_wav(wav_path: str) -> None:
    """Peak-normalize WAV file in-place to -1.0 dBFS using ffmpeg."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return  # Silently skip if ffmpeg not available
    tmp_path = str(Path(wav_path).with_suffix(".norm.wav"))
    try:
        cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", wav_path,
               "-af", "loudnorm=I=-16:TP=-1.0:LRA=11",
               tmp_path]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if proc.returncode == 0 and Path(tmp_path).is_file():
            os.replace(tmp_path, wav_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def wav_to_mp3(wav_path: str, mp3_path: str, quality: int = 2, normalize: bool = True) -> None:
    """Encode WAV to MP3 via ffmpeg (VBR ~190kbps at quality 2) with loudness normalization."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not installed (apt install ffmpeg)")
    # EBU R128 loudness normalization for professional broadcast-ready audio
    if normalize:
        cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", wav_path,
               "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
               "-codec:a", "libmp3lame", "-qscale:a", str(quality), mp3_path]
    else:
        cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", wav_path,
               "-codec:a", "libmp3lame", "-qscale:a", str(quality), mp3_path]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0 or not Path(mp3_path).is_file():
        raise RuntimeError(f"ffmpeg failed: {proc.stderr}")


def midi_to_audio(midi_path: str, out_path: str) -> None:
    """Render MIDI to WAV or MP3 depending on out_path extension with normalization."""
    out = Path(out_path)
    if out.suffix.lower() == ".wav":
        midi_to_wav(midi_path, out_path)
        normalize_wav(out_path)  # Peak-normalize WAV for consistent volume
    elif out.suffix.lower() == ".mp3":
        tmp_wav = str(out.with_suffix(".tmp.wav"))
        try:
            midi_to_wav(midi_path, tmp_wav)
            wav_to_mp3(tmp_wav, out_path)  # MP3 normalization happens inside wav_to_mp3
        finally:
            try:
                os.unlink(tmp_wav)
            except OSError:
                pass
    else:
        raise ValueError(f"Unsupported audio format: {out.suffix}")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if args else 1)
    if args[0] == "--check":
        caps = capabilities()
        for k, v in caps.items():
            print(f"{k}: {v}")
        sys.exit(0)
    midi_path = args[0]
    if not Path(midi_path).is_file():
        print(f"Error: not found: {midi_path}")
        sys.exit(1)
    out_path = args[1] if len(args) > 1 else str(Path(midi_path).with_suffix(".wav"))
    print(f"Rendering {midi_path} -> {out_path} ...")
    midi_to_audio(midi_path, out_path)
    size_kb = Path(out_path).stat().st_size // 1024
    print(f"Done ({size_kb} KB)")


if __name__ == "__main__":
    main()
