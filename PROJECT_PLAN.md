# Music Companion: Emotional Transition Through Music

## 1. Vision

**Music Companion** is a constraint-based music generation system that helps people transition between emotional states through dynamically generated music.

**Core Concept**: Generate 5-10 minute musical pieces that:
1. Start by "meeting" the user at their current emotional state (e.g., sad, anxious)
2. Gradually transition through intermediate states via continuous gradient
3. Arrive at the desired emotional state (e.g., energized, calm, focused)

**Example Use Case**:
> "I feel sad and depressed and would like to transition to become energized and motivated"

The system generates music that begins with slower tempos, minor modes, and sparse textures that acknowledge the sad state, then smoothly evolves toward faster tempos, major modes, and denser textures to guide the user toward energy and motivation.

---

## 2. Psychological Model

### 2.1 Valence-Arousal Framework

We use the well-researched **Valence-Arousal** (VA) model of affect:

- **Valence**: Negative (-1) to Positive (+1) — the pleasantness dimension
- **Arousal**: Low (-1) to High (+1) — the energy/activation dimension

```
                    High Arousal (+1)
                         |
         Anxious         |         Excited
         Stressed        |         Energized
                         |
Negative (-1) -----------+----------- Positive (+1)
 Valence                 |            Valence
                         |
         Sad             |         Calm
         Depressed       |         Peaceful
                         |
                    Low Arousal (-1)
```

### 2.2 Mood Presets

| Preset | Valence | Arousal | Description |
|--------|---------|---------|-------------|
| `sad_depressed` | -0.7 | -0.3 | Low energy negative state |
| `anxious` | -0.4 | 0.7 | High energy negative state |
| `calm_peaceful` | 0.3 | -0.6 | Low energy positive state |
| `focused` | 0.2 | 0.3 | Moderate energy, slight positive |
| `energized` | 0.5 | 0.8 | High energy positive state |
| `happy` | 0.8 | 0.5 | Positive, moderately active |
| `melancholic` | -0.5 | -0.4 | Reflective sadness |

---

## 3. Musical Parameter Mapping

### 3.1 Valence-Arousal to Music

| Parameter | Mapping | Range |
|-----------|---------|-------|
| **Tempo** | `70 + (A+1)*45 + (V+1)*10` | 70-180 BPM |
| **Mode** | V<-0.5: minor/phrygian; V>0.5: major/lydian | 14 modes |
| **Note Density** | `2 + (A+1)*3` | 2-8 notes/bar |
| **Velocity** | `50 + (A+1)*25` | 50-100 |
| **Max Interval** | `3 + (1-|V|)*2 + A*1.5` | 2-7 semitones |
| **Register** | Low A + Low V: tenor; High A + High V: soprano | 8 voices |

### 3.2 Mode Selection by Valence

| Valence Range | Primary Modes | Character |
|---------------|---------------|-----------|
| V < -0.5 | minor, phrygian, locrian | Dark, sad |
| -0.5 ≤ V < 0 | dorian, natural_minor, aeolian | Melancholic |
| 0 ≤ V < 0.5 | mixolydian, major | Neutral-positive |
| V ≥ 0.5 | major, lydian, pentatonic_major | Bright, joyful |

---

## 4. System Architecture

```
User Input: (start_mood, end_mood, duration_seconds)
                         |
                         v
              Transition Path Planner
              (interpolate VA coordinates)
                         |
                         v
              Segment Parameter Generator
              (~15-20 segments, ~30 sec each)
                         |
                         v
              [For each segment]
                   |
                   v
              Mood-to-Music Mapping
              (derive tempo, mode, density, etc.)
                   |
                   v
              Constraint-Based Melody Generator
              (Picat CP solver)
                   |
                   v
              Segment Notes
                         |
                         v
              Segment Concatenator
              (absolute timing, smooth transitions)
                         |
                         v
              MIDI File Writer
                         |
                         v
              Output: session.mid
```

---

## 5. Transition Strategies

### 5.1 Continuous Gradient

Segments are generated with smoothly interpolated VA coordinates using easing functions:

- **Linear**: Uniform progression
- **Ease-in**: Slow start, accelerating change
- **Ease-out**: Fast start, decelerating change
- **Ease-in-out**: Slow at both ends, faster in middle

### 5.2 Smooth Musical Transitions

| Aspect | Strategy |
|--------|----------|
| **Tempo** | Gradual ramps (max 10 BPM jump between segments) |
| **Mode** | Common-tone modulation (prefer modes sharing 6/7 notes) |
| **Register** | Overlap voice ranges at segment boundaries |
| **Density** | Gradual increase/decrease (max 1 note/bar difference) |

---

## 6. Technical Implementation

### 6.1 Module Structure

```
picat/
├── companion.pi          # Main orchestrator
├── mood.pi               # Mood model & presets
├── mood_mapping.pi       # VA → music parameters
├── transition.pi         # Path planning & easing
├── midi_export.pi        # JSON export for MIDI
├── music_types.pi        # Musical primitives
├── temporal.pi           # Time structures
├── generators/
│   └── melody.pi         # Constraint-based generation (extended)
├── constraints/
│   └── basic.pi          # Constraint building blocks
└── utils/
    ├── midi_utils.pi     # MIDI conversions
    └── scale_utils.pi    # Scales and modes

scripts/
└── midi_writer.py        # Python MIDI file writer
```

### 6.2 Key Technologies

- **Picat**: Constraint logic programming for melody generation
- **Python (midiutil)**: MIDI file creation
- **Valence-Arousal Model**: Psychological affect mapping

---

## 7. Usage

### 7.1 Command Line

```bash
# Basic usage with presets
picat companion.pi --from sad_depressed --to energized --duration 300 --output session.mid

# Custom VA coordinates
picat companion.pi --from-va -0.7,-0.3 --to-va 0.5,0.8 --duration 600 --output session.mid

# With easing curve
picat companion.pi --from anxious --to calm_peaceful --duration 480 --easing ease_out --output session.mid
```

### 7.2 Programmatic

```picat
main =>
    StartMood = mood_preset(sad_depressed),
    EndMood = mood_preset(energized),
    Duration = 300,  % 5 minutes

    run_companion(StartMood, EndMood, Duration, "session.mid").
```

---

## 8. Milestones

| Phase | Deliverable |
|-------|-------------|
| 1 | Mood module with VA model and presets |
| 2 | Mood-to-music parameter mapping |
| 3 | Transition path planner with easing |
| 4 | Extended melody generator (mood-aware) |
| 5 | Session orchestrator |
| 6 | MIDI export pipeline |
| 7 | Testing and parameter tuning |

---

## 9. Example Session Output

**Transition: sad_depressed → energized (5 min)**

| Time | Tempo | Mode | Density | Register | Character |
|------|-------|------|---------|----------|-----------|
| 0:00-1:00 | ~75 BPM | minor | 2-3 n/bar | tenor | Acknowledging sadness |
| 1:00-2:00 | ~90 BPM | dorian | 3-4 n/bar | alto | Beginning to lift |
| 2:00-3:00 | ~110 BPM | mixolydian | 4-5 n/bar | alto | Building momentum |
| 3:00-4:00 | ~130 BPM | major | 5-6 n/bar | soprano | Growing energy |
| 4:00-5:00 | ~150 BPM | lydian | 6-7 n/bar | soprano | Energized arrival |

---

## 10. Future Extensions

- **Harmony layer**: Chord progressions that support melodic lines
- **Multiple voices**: Counterpoint and accompaniment
- **Real-time adaptation**: Adjust based on biometric feedback
- **Audio rendering**: Direct audio synthesis from constraints
- **User learning**: Personalized mappings based on feedback

---

## 11. Research Foundation

The Valence-Arousal model is based on:
- Russell, J. A. (1980). A circumplex model of affect
- Thayer, R. E. (1989). The biopsychology of mood and arousal
- Eerola, T., & Vuoskoski, J. K. (2011). A comparison of the discrete and dimensional models of emotion in music