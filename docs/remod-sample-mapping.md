# ReBirth / ReMod sample mapping and implementation plan

This note turns the existing DLL extraction and spectral cross-reference into an actionable sample-reproduction plan. It deliberately separates evidence from inference.

## Confirmed from the supplied DLL and operation-manual investigation

- The supplied `ReBirth.dll` contains 46 embedded AIFF resources, IDs 1000–1045, extracted without executing the DLL.
- They are 16-bit, mono, 44.1 kHz AIFF resources.
- The compiled resource registry enumerates IDs 1000–1023, the special ID 1024, and IDs 1025–1045.
- The operation-manual descriptions show the drum engine is a hybrid of sample playback and software processing, not a fully synthesized drum machine.
- The reference pack and analysis CSVs are in the user's saved project materials; these files are not copied into this repository.

## Candidate mapping table

| Resource IDs | Candidate role | Evidence | Confidence |
|---|---|---|---|
| 1000 | 808 bass drum sample | 1.649 s; strongest spectral match to the project's 808 kick renders | Candidate; direct code xref still needed |
| 1001–1005 | 808 snare clean/body layers (5) | Identical 0.200 s resources; manual describes five clean samples | Strong documentation + signal-shape match |
| 1006–1009 | 808 snare snappy/noise layers (4) | Identical 0.200 s resources with noisy/high-frequency content; manual describes four filtered noise samples | Strong documentation + signal-shape match |
| 1010–1024 | Other 808 resources | Spectral cross-reference gives likely cymbal, clap, tom/conga, hat, maraca, rim and related candidates, but several IDs are ambiguous | Mixed; do not hard-code role without more evidence |
| 1025–1028 | 909 bass drum tune layers (4) | Four similar-length low-frequency resources; manual says BD Tune crossfades four samples | Strong documentation + signal-shape match |
| 1029–1033 | 909 snare clean/body layers (5) | Related ~0.318 s resources; manual describes five clean samples | Strong documentation + signal-shape match |
| 1034–1036 | 909 snare snappy/noise layers (3) | Same-duration group with noisy/high-frequency content; manual describes three filtered noise samples | Strong documentation + signal-shape match |
| 1037–1045 | Other 909 resources | Likely toms, rim/clap, hats, crash and ride based on duration and spectral comparison; not all IDs uniquely resolved | Mixed; validate before assigning |

The candidate CSV's “best project track” is a spectral-neighbour comparison against the current project's generated WAVs, **not proof of the original instrument assignment**.

## Correct reproduction model

- **808 BD:** play its sample; apply a decay envelope; Tone acts as a low-pass filter.
- **808 SD:** select/blend one of five body samples according to Tune; add one of four high-pass-filtered noise samples, selected per hit; Snappy controls noise amount.
- **808 cymbal:** play its sample; apply software decay and Tone low-pass filtering.
- **808 tom/conga family:** sample playback speed follows Tune.
- **909 BD:** crossfade four kick samples with Tune; apply decay envelope; Attack controls low-pass filtering.
- **909 SD:** select among five body samples; add one of three noise samples in rotating/random order; Snappy controls amount and Tone controls noise length.
- **909 toms:** sample playback speed follows Tune, with decay envelope.
- **909 hats:** shared level and software decay; closed hat chokes open hat.
- **909 crash/ride:** sample playback speed follows Tune.

These are manual-derived target behaviours. The exact knob curves, crossfade weights, random/round-robin policy, filters, and envelope constants must be measured against original ReBirth exports.

## Implementation order

1. Keep the extracted proprietary/reference AIFFs outside the public repository unless distribution rights are established. Use the local reference pack to create a local browser-ready WAV pack.
2. Add a small sample-bank loader that reports missing files clearly and falls back to the current synthesis only when a sample pack is not installed.
3. Implement and test 909 kick crossfade/playback-rate/filter/envelope first; then 909 snare body/noise selection; then remaining 909 voices.
4. Implement the 808 snare's 5+4 sample architecture, then other 808 voices that the evidence confirms are sampled.
5. Add deterministic test mode: fixed sample choices and isolated single-hit rendering so two captures can be compared repeatably.
6. Compare identical single hits and knob sweeps from original ReBirth and the browser clone; update this table only when evidence resolves an assignment.

## Important status

This is a reverse-engineering map, not a claim that the sample playback has already been implemented or that every numeric ID is proven. Current `src/audio/drums.js` synthesizes the 909 voices; comments about fitting its synthesis to exports do not make it sample-faithful.
