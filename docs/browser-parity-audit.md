# Browser version: operational parity audit

Scope: the existing browser application in the repository root (`src/`), not the JUCE prototype under `VST3/rb-vst3/` and not the separate embedded UI copy under `VST3/web-ui/`.

## Initial static inspection

This is a source inspection, not a claim that the app has been run through a full browser QA session. Runtime, MIDI hardware, and audio comparisons still need execution.

### Confirmed from source

- The browser app owns the real application path: `src/main.js` creates `State`, `AudioEngine`, `Clock`, `Files`, `Rack`, and `Midi`.
- Sequencer state defines two bass lines and two drum machines, 16 steps per pattern, and 32 patterns per device.
- The clock has distinct pattern/song modes, look-ahead scheduling, queued pattern changes, and song-player integration.
- Song handling parses ReBirth `.rbs` files, serializes the app's own JSON session format, autosaves, and has a ReBirth-format writer.
- MIDI is implemented as browser Web MIDI input in `src/midi.js`; the source explicitly notes that Safari does not support Web MIDI.
- The browser audio engine is Web Audio based. The JUCE native processor is a separate prototype path and must not be used as evidence that browser parity has passed.

### Regression-test coverage added

The feature branch now has `tests/song-io.test.js` and an `npm test` script using Node's built-in test runner. The tests cover:

- RBS writer output identification and metadata (standard mod, title, tempo and version).
- Writer-to-parser round-trip of transport mode/loop, selected bass and 909 patterns, representative bass flags, drum hit levels, and automation.
- Applying a parsed RBS session into fresh application state.
- Rejection of a non-RBS input.

These are regression tests for the file-format path, not proof that arbitrary real-world ReBirth songs import perfectly. They have been added to the branch but have **not been executed in a checked-out runtime here**; run `npm test` locally and report any failures before treating them as passing.

### Main risks to verify

1. **Original song import:** compare representative `.rbs` files in ReBirth and Re-ReBirth. Check pattern data, machine settings, tempo, song arrangement, and any reported unsupported fields.
2. **Round-trip limits:** export a loaded `.rbs` back to `.rbs`, reopen it in ReBirth, and document any losses. The app itself has an explicit loss-reporting path for fields the legacy format cannot represent.
3. **Sequencer timing:** verify 16-step timing, short pattern lengths, shuffle, queued pattern changes, song end/loop behaviour, stop/rewind and seek under real playback.
4. **Bass-line semantics:** verify note entry, octave, tuning, accent, gate, slide and tie behaviour against the original.
5. **Drum semantics:** verify all 808/909 tracks, 909 double accents and flams, tuning/decay controls, and 808 alternate instrument switches.
6. **Mixer/effects:** verify per-channel routing, mute/solo, pan, delay sends/return, distortion, compressor and PCF routing.
7. **MIDI:** verify note entry and drum pads, CC learn, controller setup, disconnect/reconnect, channel handling and transport controls on a supported browser with actual hardware.
8. **Export parity:** compare offline WAV export against real-time browser playback for the same session; then compare isolated voices against reference ReBirth exports.

## Current verdict

- **Application breadth:** substantial; the browser code already implements the core instrument, sequencer, song, MIDI and export systems.
- **Automated song-I/O tests:** test cases are committed; execution result is still pending.
- **Operational parity:** not yet verified by this audit.
- **Sound parity:** not established by source inspection alone; it requires controlled, level-matched ReBirth exports.
- **Native standalone/VST3 parity:** not established and deliberately out of scope for this browser audit.

## Test record

For each manual test, record browser/OS, source `.rbs` or test-session name, exact actions, expected original behaviour, actual Re-ReBirth behaviour, and pass/fail. Do not mark a test passed based solely on the presence of a corresponding function in source.
