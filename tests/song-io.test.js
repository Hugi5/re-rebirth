import test from 'node:test';
import assert from 'node:assert/strict';

import { State, emptyBassPattern, emptyDrumPattern } from '../src/state.js';
import { parseRbs, isRbs, rbsInfo } from '../src/song/rbs.js';
import { writeRbs } from '../src/song/rbs-write.js';
import { applySession, serialize } from '../src/song/session.js';

function fixtureState() {
  const state = new State();
  // Include distinct values across each device and a few structural edge cases.
  state.info.title = 'Parity regression fixture';
  state.info.text = 'RBS import/export round-trip';
  state.setTempo(127.5);
  state.transport.mode = 'song';
  state.transport.loop = true;
  state.song.length = 128;
  state.song.loopStart = 32;
  state.song.loopEnd = 96;

  const b = state.bass.bass1;
  b.bank = 2;
  b.pattern = 3;
  b.patterns[19] = emptyBassPattern();
  b.patterns[19].length = 4;
  b.patterns[19].steps[0] = { note: 7, octave: 1, accent: true, slide: true, gate: true, tie: false };
  b.patterns[19].steps[1] = { note: 7, octave: 0, accent: false, slide: false, gate: true, tie: true };

  const d = state.drums.r909;
  d.bank = 1;
  d.pattern = 5;
  d.patterns[13] = emptyDrumPattern();
  d.patterns[13].length = 8;
  d.patterns[13].tracks.bd = Array(16).fill(0);
  d.patterns[13].tracks.bd[0] = 2;
  d.patterns[13].tracks.sd = Array(16).fill(0);
  d.patterns[13].tracks.sd[4] = 3;

  state.song.tracks.bass1 = [
    { tick: 0, key: 'bass1.cutoff', value: 0.25 },
    { tick: 32, key: 'bass1.cutoff', value: 0.75 },
  ];
  state.song.tracks.mixer = [
    { tick: 0, key: 'mixer.bass1.level', value: 0.8 },
    { tick: 32, key: 'mixer.bass1.pan', value: 0.25 },
  ];
  return state;
}

test('RBS writer output is recognised and reports its metadata', () => {
  const state = fixtureState();
  const bytes = writeRbs(serialize(state));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  assert.equal(isRbs(buffer), true);
  const info = rbsInfo(buffer);
  assert.equal(info.mod, 'Standard ReBirth');
  assert.equal(info.title, 'Parity regression fixture');
  assert.equal(info.tempo, 127.5);
  assert.equal(info.version, '2.0.1');
});

test('RBS writer -> parser preserves transport, selected patterns, steps and automation', () => {
  const source = fixtureState();
  const bytes = writeRbs(serialize(source));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = parseRbs(buffer, 'fixture.rbs');

  assert.equal(parsed.transport.mode, 'song');
  assert.equal(parsed.transport.loop, true);
  assert.equal(parsed.transport.tempo, 127.5);
  assert.equal(parsed.info.title, 'Parity regression fixture');
  assert.equal(parsed.info.file, 'fixture.rbs');

  assert.equal(parsed.bass.bass1.bank, 2);
  assert.equal(parsed.bass.bass1.pattern, 3);
  assert.equal(parsed.bass.bass1.patterns[19].length, 4);
  assert.equal(parsed.bass.bass1.patterns[19].steps[0].note, 7);
  assert.equal(parsed.bass.bass1.patterns[19].steps[0].octave, 1);
  assert.equal(parsed.bass.bass1.patterns[19].steps[0].accent, true);
  assert.equal(parsed.bass.bass1.patterns[19].steps[0].slide, true);

  assert.equal(parsed.drums.r909.bank, 1);
  assert.equal(parsed.drums.r909.pattern, 5);
  assert.equal(parsed.drums.r909.patterns[13].length, 8);
  assert.equal(parsed.drums.r909.patterns[13].tracks.bd[0], 2);
  assert.equal(parsed.drums.r909.patterns[13].tracks.sd[4], 3);

  assert.deepEqual(
    parsed.song.tracks.bass1.map(({ tick, key, value }) => ({ tick, key, value })),
    [
      { tick: 0, key: 'bass1.cutoff', value: 0.25 },
      { tick: 32, key: 'bass1.cutoff', value: 0.75 },
    ],
  );
  assert.ok(parsed.song.tracks.mixer.some((e) => e.tick === 32 && e.key === 'mixer.bass1.pan'));
});

test('opening a parsed RBS session into State retains its selected pattern and notes', () => {
  const source = fixtureState();
  const bytes = writeRbs(serialize(source));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = parseRbs(buffer, 'fixture.rbs');
  const restored = new State();

  applySession(restored, parsed);
  assert.equal(restored.transport.tempo, 127.5);
  assert.equal(restored.transport.mode, 'song');
  assert.equal(restored.bass.bass1.bank, 2);
  assert.equal(restored.bass.bass1.pattern, 3);
  assert.equal(restored.bass.bass1.patterns[19].steps[0].note, 7);
  assert.equal(restored.drums.r909.patterns[13].tracks.sd[4], 3);
  assert.equal(restored.song.tracks.bass1.length, 2);
});

test('RBS parser rejects a non-RBS file instead of treating it as a song', () => {
  const bad = new TextEncoder().encode('not an RBS file').buffer;
  assert.equal(isRbs(bad), false);
  assert.throws(() => parseRbs(bad), /Not a ReBirth 2\.0 song/);
});
