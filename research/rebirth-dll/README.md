# ReBirth DLL Reverse Engineering

Research notes for understanding the original ReBirth RB-338 engine and improving the accuracy of the re-rebirth fork.

## Layout

- `decompiled/` — selected Ghidra decompiler exports, where redistribution is appropriate.
- `symbols/` — function lists, symbol exports, and cross-reference reports.
- `ghidra/` — analysis notes, screenshots, and investigation logs.

## Current investigation

- Identify the `CTR808Device` constructor and the objects it initializes.
- Trace from drum-device setup to sample loading, trigger handling, and playback.
- Compare verified findings with the remake's 808/909 behavior before changing code.

## Notes

Keep observations separate from hypotheses, and record Ghidra addresses/function names so findings can be reproduced. Check the DLL's licensing and redistribution rights before committing proprietary binaries or extensive decompiled output. Prefer notes and minimal factual observations where possible.
