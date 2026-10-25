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

## Current verdict

- **Application breadth:** substantial; the browser code already implements the core instrument, sequencer, song, MIDI and export systems.
- **Automated song-I/O tests and production build:** passed in CI for the recorded commit above.
- **Actual original-song chunk layout:** inspected and structurally consistent with the reader's expected container layout.
- **Semantic import parity and interactive browser operation:** not yet verified.
- **Sound parity:** not established by source inspection alone; it requires controlled, level-matched ReBirth exports.
- **Native standalone/VST3 parity:** not established and deliberately out of scope for this browser audit.

## Test record

For each manual test, record browser/OS, source `.rbs` or test-session name, exact actions, expected original behaviour, actual Re-ReBirth behaviour, and pass/fail. Do not mark a test passed based solely on the presence of a corresponding function in source.
