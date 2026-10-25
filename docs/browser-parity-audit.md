# Browser version: operational parity audit

Scope: the existing browser application in the repository root (`src/`), not the JUCE prototype under `VST3/rb-vst3/` and not the separate embedded UI copy under `VST3/web-ui/`.

## Initial static inspection

This is a source inspection plus CI regression tests and binary-structure inspection of the user's original song fixture. It is not a claim that the app has been run through full interactive browser QA. Runtime, MIDI hardware, and audio comparisons still need execution.

### Confirmed from source

- The browser app owns the real application path: `src/main.js` creates `State`, `AudioEngine`, `Clock`, `Files`, `Rack`, and `Midi`.
- Sequencer state defines two bass lines and two drum machines, 16 steps per pattern, and 32 patterns per device.
- The clock has distinct pattern/song modes, look-ahead scheduling, queued pattern changes, and song-player integration.
- Song handling parses ReBirth `.rbs` files, serializes the app's own JSON session format, autosaves, and has a ReBirth-format writer.
- MIDI is implemented as browser Web MIDI input in `src/midi.js`; the source explicitly notes that Safari does not support Web MIDI.
- The browser audio engine is Web Audio based. The JUCE native processor is a separate prototype path and must not be used as evidence that browser parity has passed.

### Real original-song fixture inspected

The saved file `ReBirth 1.0 Default Song.rbs` is already available in the project investigation library; it was not necessary to ask the user to upload it again.

- Size: 16,840 bytes.
- SHA-256: `f23f9aa77fffa82d4c39c66548ece2cba80aff785b6e667dc7999d4f705de116`.
- The outer `CAT ` chunk declares 16,832 payload bytes, matching the file size minus its 8-byte header.
- It contains `HEAD`, `GLOB`, and a 712-byte `USRI` chunk.
- The `DEVL` container includes `MIXR`, `DELY`, `PCF `, `DIST`, `COMP`, two `303 ` chunks (1,097 bytes each), an `808 ` chunk (6,238 bytes), and a `909 ` chunk (6,239 bytes).
- The `TRKL` container has nine `TRAK` chunks, matching the reader/writer's expected mixer + two bass + two drum + four effect tracks.
- The 808/909 payload lengths agree with the implementation's different pattern-header offsets: 30 bytes for the 808 and 31 for the 909. The odd 909 payload is padded before the following chunk, as required by IFF chunk alignment.

This validates the actual file's top-level/chunk layout against assumptions in the source. It does **not** yet prove that every control, pattern byte, or song event is decoded to the correct semantic value; that requires parsing the original fixture through the app and comparing its loaded state and audio against ReBirth. The file's “1.0” name should not be taken as proof of the encoded version: its payload includes a 909 chunk and must be interpreted by its actual header/version fields.

### Regression-test coverage added

The feature branch has `tests/song-io.test.js`, an `npm test` script using Node's built-in test runner, and `.github/workflows/browser-tests.yml`. The CI run for commit `98b96713d65a40bcb30eb55096677e76f69b52d8` succeeded:

- `npm ci`
- `npm test`
- `npm run build`

The tests cover:

- RBS writer output identification and metadata (standard mod, title, tempo and version).
- Writer-to-parser round-trip of transport mode/loop, selected bass and 909 patterns, representative bass flags, drum hit levels, and automation.
- Applying a parsed RBS session into fresh application state.
- Rejection of a non-RBS input.

These are useful regression tests, but the round-trip test creates its own fixture. It does not substitute for a regression test against the real original song or prove that arbitrary real-world ReBirth songs import perfectly.

### Main risks to verify

1. **Original song import:** run the actual saved-song fixture through `parseRbs` and `applySession`; inspect the resulting state for pattern data, machine settings, tempo, song arrangement, and unsupported fields.
2. **Round-trip limits:** export a loaded `.rbs` back to `.rbs`, reopen it in ReBirth, and document any losses. The app has an explicit loss-reporting path for fields the legacy format cannot represent.
3. **Sequencer timing:** verify 16-step timing, short pattern lengths, shuffle, queued pattern changes, song end/loop behaviour, stop/rewind and seek under real playback.
4. **Bass-line semantics:** verify note entry, octave, tuning, accent, gate, slide and tie behaviour against the original.
5. **Drum semantics:** verify all 808/909 tracks, 909 double accents and flams, tuning/decay controls, and 808 alternate instrument switches.
6. **Mixer/effects:** verify per-channel routing, mute/solo, pan, delay sends/return, distortion, compressor and PCF routing.
7. **MIDI:** verify note entry and drum pads, CC learn, controller setup, disconnect/reconnect, channel handling and transport controls on a supported browser with actual hardware.
8. **Export parity:** compare offline WAV export against real-time browser playback for the same session; then compare isolated voices against reference ReBirth exports.


## Newly confirmed fidelity blocker: sound-source architecture

Inspection of `src/audio/drums.js` confirms that both drum machines are currently generated from Web Audio oscillators, noise, filters, and envelopes. The module header explicitly says `Synthesized drum voices (no samples)`; the 808 and 909 voice tables implement kicks, snares, hats, cymbals, toms and other sounds algorithmically. This is not merely an unverified tuning detail: it is a known architectural difference from original ReBirth's sample-based 909 and its bundled/customizable drum sound resources.

The original-AIFF reference pack already in the investigation assets contains 46 extracted audio resources. The existing spectral cross-reference has strong candidate matches for many voices (for example, similarity scores around 0.96–0.99 for several 808 snare/clap/cowbell matches), but it also has weak or ambiguous matches. Those scores are useful for triage, not proof of exact sample identity or parameter behaviour. The cross-reference is not yet wired into the browser engine.

### Consequence

- **909 sample fidelity: known architectural mismatch**, not just “unproven”. The current synthesized 909 may be musically useful, but it cannot be described as using the original sample-based sound source.
- **808 fidelity: unproven.** Original ReBirth's 808 is an emulation, so a synthesized voice is not automatically wrong; it must be compared against controlled original exports. The current algorithmic voice remains a reconstruction, not evidence of parity.
- **303 fidelity: unproven.** It is also synthesized, and needs isolated comparisons of waveform, pitch/tune mapping, accent, slide/tie, filter resonance and envelope against ReBirth renders.
- **Do not blindly commit extracted proprietary samples to the public repository.** Before integrating them, establish the source/licence and intended distribution rights. The implementation can be designed to load a user-supplied local reference/sample pack or use properly licensed assets; the provenance question should not be hidden by a code change.

### Updated priority order

1. Use the existing original-AIFF reference pack and its manifest to map each resource to likely 808/909 voice and variant; mark confidence and ambiguous mappings.
2. Produce controlled, isolated ReBirth exports and compare the browser render with level alignment, duration/envelope, spectral shape and transient behaviour.
3. Decide per voice whether to retain synthesis, improve its model, or use a sample-based source where the original demonstrably does so and asset rights permit it.
4. Add tests against an independently captured original-song fixture/state. Existing writer-to-reader tests alone can pass when the reader and writer share the same mistake.

This finding changes the status of the audit: the project is not simply awaiting listening tests. We have identified at least one concrete architectural difference (the 909 sound source) and an existing body of reference assets that can drive the next comparison. It still does not tell us how close the current output sounds by ear or by measurement.


## Application validity and original-song compatibility: status matrix

This is a separate audit from sound fidelity. “Build passes” means the code bundles; it does not mean the application is a valid replacement for ReBirth. The current evidence is deliberately graded below.

| Area | Current evidence | Status |
|---|---|---|
| App starts / bundles | CI ran `npm ci`, `npm test`, and `npm run build` successfully at commit `98b96713d65a40bcb30eb55096677e76f69b52d8`. | **Build/test pass at that commit; latest branch head not yet CI-verified** |
| Real original `.rbs` import | One original 16,840-byte file has been structurally inspected. The current automated tests do not load that binary fixture. | **Untested semantically** |
| Broad real-song compatibility | No corpus of diverse original songs is represented in `tests/`; only `tests/song-io.test.js` exists. | **Not established** |
| Own writer → own parser | Synthetic state generated by the writer is parsed back and checked for selected values. | **Narrow regression pass only** |
| ReBirth reopens exported `.rbs` | Writer emits a claimed 2.0.1 file, but no automated test launches the original program and reopens it. | **Not verified in ReBirth** |
| Song arrangement and automation parity | Synthetic automation events are round-tripped; no independently captured original-song state is used as a golden reference. | **Partial coverage only** |
| Browser interactive operation | Source inspection only; no recorded end-to-end browser smoke-test result for the current branch. | **Not verified** |
| Sequencer/audio timing and transport | Source contains a look-ahead clock and song player, but no regression suite measures timing against original playback. | **Not verified** |
| MIDI hardware behaviour | Web MIDI implementation exists; no hardware/browser test record is present. | **Not verified** |
| Audio fidelity | The drum engine is algorithmic, and original-reference comparisons are not a completed regression suite. | **Not established** |

### Why the current RBS tests are insufficient

The existing test fixture is created in JavaScript by `fixtureState()`, serialized with `writeRbs()`, and immediately parsed with `parseRbs()`. If the writer and reader share a wrong field offset, enumeration, or interpretation, this test can still pass. The independent real-song file is only checked structurally in the investigation notes; it is not currently an automated parser regression test.

### Validity gates before calling this a faithful replacement

1. **Real-file parser gate:** add an independently derived, rights-safe golden test from the already available original `.rbs` fixture. Assert metadata, all device parameter values, all pattern step data, song tracks/events, and chunk handling against values verified from the original application or an independent decoder. Do not treat values produced only by this parser as ground truth.
2. **Corpus gate:** test a varied set of real songs, including 303 slides/accents, 808 alternate voices, 909 accents/flams, effects, pattern banks, and song arrangements. Keep original files local if redistribution rights are uncertain; tests can use user-provided local fixtures and report missing corpus coverage.
3. **Original-app export gate:** open Re-ReBirth-generated `.rbs` files in the original ReBirth 2.0.1 application and record actual results. The file header alone is not proof of compatibility.
4. **Browser smoke gate:** launch the built app, load the known original song, confirm controls render, start/stop works, patterns switch, and no runtime errors occur. Save logs/screenshots and the exact tested commit.
5. **Audio/transport gate:** render matched short tests from both engines and compare timing, duration, levels and signal shape, with explicit tolerances.

No result should be marked “pass” merely because a corresponding function exists. The current overall application-validity verdict is **partially implemented, not validated as a ReBirth replacement**.


## Original ReBirth vs Re-ReBirth parity protocol

### Principle

The original application is the reference implementation. Compare the same song, tempo, pattern, knob positions, mixer routing, and playback duration in both programs. Record observed differences; do not correct Re-ReBirth based only on assumptions. Keep the original executable and song files local unless redistribution rights are clear.

### A. Functional parity matrix

| Test ID | Test | Procedure | Evidence to capture | Pass condition |
|---|---|---|---|---|
| F01 | Startup/default state | Launch each application fresh; record initial tempo, selected mode/pattern, knob defaults and enabled devices. | Screenshots and values | Expected defaults match where the original defines them. |
| F02 | Original song import | Open the same original .rbs in both applications. Compare title, tempo, device settings, all pattern banks, and song arrangement. | Parsed-state dump from Re-ReBirth plus screenshots/notes from original | No unexplained differences in supported fields. |
| F03 | Pattern steps | Use a song with sparse and dense patterns, accents, rests, slides, ties and drum hits. Inspect each machine and selected banks. | Per-pattern step listing and screenshots | Step positions and event types agree exactly. |
| F04 | Song arrangement | Play a song with repeated patterns, changes, loop points and a clear ending. | Pattern sequence and bar-position log | Transitions and end/loop behaviour agree. |
| F05 | 303 controls | Change tuning, cutoff, resonance, envelope modulation, decay, accent and waveform one at a time; test slide/tie and gate. | Knob positions, MIDI/state log, isolated audio | Control direction/range and musical behaviour match. |
| F06 | 808/909 controls | Test every voice and tuning/decay/tone/attack control, alternate voices, accents and flams where supported. | Settings and isolated renders | Same event/voice selection and broadly matching response. |
| F07 | Mixer/effects | Test level, pan, mute, solo, delay, distortion, compressor and PCF separately, then combinations. | Settings and matched renders | Routing and control semantics match; documented limitations are explicit. |
| F08 | Transport/timing | Start, stop, restart, switch patterns, loop, and change tempo during playback. | Audio loopback and timestamp/bar log | No missing/duplicate steps; timing and transitions within measured tolerance. |
| F09 | Save/reopen | Save in each app; reopen in the same app. Then test Re-ReBirth export in original ReBirth. | Files, warnings, screenshots | Files reopen and supported data survives; losses are documented. |
| F10 | MIDI | On a Web MIDI-capable browser, test note entry, pads, CC learn and transport with the same controller if available. | MIDI event log and result notes | Mapped events and transport behaviour agree. |

### B. Audio parity protocol

1. Choose one deterministic original .rbs song. Disable modulation/automation unless that behaviour is the test; set the same tempo, pattern, knobs, levels, pan and effects in both programs.
2. Capture lossless WAV at the same sample rate if possible. If the original outputs 44.1 kHz, preserve that reference and resample only a copy for aligned analysis. Avoid MP3, normalization, limiters and OS audio enhancements.
3. Capture a full mix and isolated tests: each 303, each 808/909 voice, then effects. Use the same number of bars and include a short tail.
4. Align recordings by transient/cross-correlation, compensate for fixed device latency, and match loudness only for diagnostic comparisons—not before measuring the original level difference.
5. Report objective measures separately: onset timing/drift, peak and RMS level, duration/envelope, waveform correlation, spectral centroid/band energy, and residual/null difference. Low waveform correlation alone does not prove a poor musical match when oscillator phase or noise differs.
6. Listen to level-matched blind A/Bs after measurements. Keep the original and processed files and record the exact settings.

### C. Results ledger template

For each run record: test ID; date; original ReBirth version/build; OS; Re-ReBirth commit SHA; browser/build; song filename and SHA-256; sample rate/bit depth; exact settings; steps performed; expected result; actual result; pass/fail/blocked; evidence file paths; and a short note about the discrepancy.

### First checkpoint / current result

The repository has not yet passed this protocol. The current tests cover a synthetic RBS writer/parser round-trip and a few state assertions. One real original .rbs file has had its chunk layout inspected, but there is no recorded side-by-side run of the original executable, no original-app reopen result for a Re-ReBirth export, and no matched WAV parity report. Therefore the parity status is not yet measured, not pass. The first practical target is F02 plus a short matched audio capture from the same original song; expand only after this baseline is reproducible.

## Current verdict

- **Application breadth:** substantial; the browser code already implements the core instrument, sequencer, song, MIDI and export systems.
- **Automated song-I/O tests and production build:** passed in CI for the recorded commit above.
- **Actual original-song chunk layout:** inspected and structurally consistent with the reader's expected container layout.
- **Semantic import parity and interactive browser operation:** not yet verified.
- **Sound parity:** not established by source inspection alone; it requires controlled, level-matched ReBirth exports.
- **Native standalone/VST3 parity:** not established and deliberately out of scope for this browser audit.

## Test record

For each manual test, record browser/OS, source `.rbs` or test-session name, exact actions, expected original behaviour, actual Re-ReBirth behaviour, and pass/fail. Do not mark a test passed based solely on the presence of a corresponding function in source.
