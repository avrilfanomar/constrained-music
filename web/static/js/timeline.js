/**
 * timeline.js - Meter-aware beat/time math shared by playback + piano roll.
 *
 * The one common unit is the QUARTER NOTE ("quarter-beat"):
 *   - note durations arrive as dur_num/dur_den of a whole note, ×4 = quarters
 *   - tempo_changes bpm is quarter-note BPM (standard MIDI)
 * so every position below is expressed in quarter-beats, regardless of meter.
 *
 * A note's ($time_pos) beat/sub are in the METER's beats (1..beats, sub a
 * fraction of one such beat). Each meter-beat is (4 / beat_unit) quarters, so
 * 4/4 → 1 quarter/beat, 3/4 → 1, 6/8 → 0.5. The old code hard-coded 4
 * quarter-beats per bar, which desynced every non-4/4 piece.
 */

/** Normalize metadata.time_signature to {beats, beat_unit}, defaulting to 4/4. */
export function timeSig(metadata) {
    const ts = metadata && metadata.time_signature;
    const beats = ts && ts.beats ? ts.beats : 4;
    const beatUnit = ts && ts.beat_unit ? ts.beat_unit : 4;
    return { beats, beat_unit: beatUnit };
}

/** Quarter-beats in one of the meter's beats. */
export function quartersPerBeat(ts) {
    return 4 / ts.beat_unit;
}

/** Quarter-beats spanned by one bar in this meter. */
export function quarterBeatsPerBar(ts) {
    return ts.beats * quartersPerBeat(ts);
}

/** Absolute start position of a note, in quarter-beats. */
export function noteStartBeat(n, ts) {
    const qpb = quartersPerBeat(ts);
    return (n.bar - 1) * quarterBeatsPerBar(ts) + (n.beat - 1 + (n.sub || 0)) * qpb;
}

/** Duration of a note in quarter-beats (meter-independent). */
export function noteDurBeats(n) {
    return (n.dur_num * 4) / n.dur_den;
}

/** Bar number (1-based) mapped to its start position in quarter-beats. */
export function barStartBeat(bar, ts) {
    return (bar - 1) * quarterBeatsPerBar(ts);
}

/**
 * Build a sorted tempo map [{ beat, bpm }, ...] in quarter-beats.
 * Always yields at least one entry so beatToSec can index [0].
 */
export function buildTempoMap(tempoChanges, ts) {
    const map = (tempoChanges || [])
        .map(tc => ({ beat: barStartBeat(tc.bar, ts), bpm: tc.bpm }))
        .sort((a, b) => a.beat - b.beat);
    if (map.length === 0) map.push({ beat: 0, bpm: 120 });
    return map;
}

/** Convert a quarter-beat position to absolute seconds via the tempo map. */
export function beatToSec(tempoMap, targetBeat) {
    let sec = 0;
    let prevBeat = 0;
    let bpm = tempoMap[0].bpm;
    for (const tc of tempoMap) {
        if (tc.beat >= targetBeat) break;
        if (tc.beat > prevBeat) {
            sec += (tc.beat - prevBeat) * (60 / bpm);
            prevBeat = tc.beat;
        }
        bpm = tc.bpm;
    }
    sec += (targetBeat - prevBeat) * (60 / bpm);
    return sec;
}

/** Inverse of beatToSec: absolute seconds → quarter-beat position. */
export function secToBeat(tempoMap, targetSec) {
    let sec = 0;
    let prevBeat = 0;
    let bpm = tempoMap[0].bpm;
    for (let i = 0; i < tempoMap.length; i++) {
        const tc = tempoMap[i];
        if (tc.beat > prevBeat) {
            const segSec = (tc.beat - prevBeat) * (60 / bpm);
            if (sec + segSec >= targetSec) {
                return prevBeat + (targetSec - sec) / (60 / bpm);
            }
            sec += segSec;
            prevBeat = tc.beat;
        }
        bpm = tc.bpm;
    }
    // Past the last tempo change: extrapolate at the final bpm.
    return prevBeat + (targetSec - sec) / (60 / bpm);
}
