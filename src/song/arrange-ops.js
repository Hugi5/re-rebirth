// Arrangement edits over the song's event lists, in whole bars: paint a
// machine's pattern or on/off over bars, and insert, delete or duplicate
// bars across every track (automation moves along).
import { eraseRange, TICKS_PER_BAR, TRACK_IDS, valueAt, writeEvent } from './song.js';

const T = TICKS_PER_BAR;

// Writes `value` for `key` at `tick` unless it already holds there.
function ensureAt(events, key, tick, value) {
  if (value === undefined || valueAt(events, key, tick) === value) return;
  writeEvent(events, { tick, key, value });
}

// Drops events that repeat the value already in force. Not for patterns: a
// repeated pattern event restarts the pattern at the bar line, which keeps
// patterns shorter than a bar in step.
function dedupe(events, key) {
  if (key === 'pattern') return;
  let last;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.key !== key) continue;
    if (e.value === last) events.splice(i--, 1);
    else last = e.value;
  }
}

function grow(song, endTick) {
  if (endTick > song.length) song.length = endTick;
}

// Sets `key` to `value` over bars [from, to): what played from bar `to` on
// carries on as before. `base` is the value where the track has none yet.
function paint(song, id, key, from, to, value, base) {
  const events = song.tracks[id];
  const after = valueAt(events, key, to * T) ?? base;
  eraseRange(events, from * T, to * T, (k) => k === key);
  // Patterns get an event per bar, like songs store them; switches one.
  for (let bar = from; bar < (key === 'pattern' ? to : from + 1); bar++) writeEvent(events, { tick: bar * T, key, value });
  if (from > 0) ensureAt(events, key, 0, valueAt(events, key, 0) ?? base);
  ensureAt(events, key, to * T, after);
  dedupe(events, key);
  grow(song, to * T);
}

export const patternAt = (song, id, bar) => valueAt(song.tracks[id], 'pattern', bar * T);

export function paintPattern(song, id, from, to, index) {
  paint(song, id, 'pattern', from, to, index, 0);
}

// A machine's ON switch over bars (1 plays, 0 silent). Without events it plays.
export const onAt = (song, id, bar) => valueAt(song.tracks[id], `${id}.on`, bar * T) ?? 1;

export function paintOn(song, id, from, to, on) {
  paint(song, id, `${id}.on`, from, to, on ? 1 : 0, 1);
}

const keysOf = (events) => new Set(events.map((e) => e.key));

// Opens `n` empty-of-changes bars at bar `at`: everything from there moves on.
// The state in force at `at` simply continues through the new bars.
export function insertBars(song, at, n) {
  for (const id of TRACK_IDS) for (const e of song.tracks[id]) if (e.tick >= at * T) e.tick += n * T;
  song.length += n * T;
  if (song.loopStart >= at * T) song.loopStart += n * T;
  if (song.loopEnd > at * T) song.loopEnd += n * T;
}

// Removes bars [from, to); what was in force at `to` takes over at `from`.
export function deleteBars(song, from, to) {
  const n = to - from;
  for (const id of TRACK_IDS) {
    const events = song.tracks[id];
    const carry = [...keysOf(events)].map((key) => [key, valueAt(events, key, to * T)]);
    eraseRange(events, from * T, to * T, () => true);
    for (const e of events) if (e.tick >= to * T) e.tick -= n * T;
    for (const [key, value] of carry) ensureAt(events, key, from * T, value);
    for (const key of keysOf(events)) dedupe(events, key);
  }
  song.length = Math.max(0, song.length - n * T);
  const shift = (t) => (t >= to * T ? t - n * T : Math.min(t, from * T));
  song.loopStart = shift(song.loopStart);
  song.loopEnd = shift(song.loopEnd);
}

// Copies bars [from, to) right after themselves, automation included.
export function duplicateBars(song, from, to) {
  const n = to - from;
  const original = Object.fromEntries(TRACK_IDS.map((id) => [id, song.tracks[id].map((e) => ({ ...e }))]));
  insertBars(song, to, n);
  for (const id of TRACK_IDS) {
    const src = original[id];
    const events = song.tracks[id];
    for (const e of src) if (e.tick >= from * T && e.tick < to * T) writeEvent(events, { ...e, tick: e.tick + n * T });
    for (const key of keysOf(src)) {
      // The copy starts as the original did, and the rest resumes after it.
      ensureAt(events, key, to * T, valueAt(src, key, from * T));
      ensureAt(events, key, (to + n) * T, valueAt(src, key, to * T));
      dedupe(events, key);
    }
  }
}

export function setLength(song, bars) {
  song.length = Math.max(1, Math.round(bars)) * T;
  if (song.loopEnd > song.length) song.loopEnd = song.length;
  if (song.loopStart >= song.loopEnd) song.loopStart = 0;
}
