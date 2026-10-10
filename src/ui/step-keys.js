// Computer-keyboard step entry for the bass lines in PATTERNS: a piano row
// (A W S E D F T G Y H U J K = C..C) writes the selected step and moves on.
import { shownDevices } from '../render/patterns-view.js';
import { BASS_IDS } from '../state.js';

const NOTE_KEYS = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12 };

// Returns true when the key was a step-entry key (the caller re-renders and saves).
export function stepKey(e, state, engine) {
  const { ui } = state;
  if (ui.stage !== 'patterns' || ui.about || ui.library || ui.automation || e.metaKey || e.ctrlKey || e.altKey) return false;
  const shown = shownDevices(state).filter((id) => BASS_IDS.includes(id));
  if (!shown.length) return false;
  const id = shown.includes(state.ui.keysTarget) ? state.ui.keysTarget : shown[0];
  const dev = state.bass[id];
  const pattern = state.pattern(id);
  const len = pattern.length;
  const move = (d) => (dev.selectedStep = (((dev.selectedStep + d) % len) + len) % len);
  const step = pattern.steps[dev.selectedStep];

  if (e.code in NOTE_KEYS) {
    if (e.repeat) return true;
    Object.assign(step, { note: NOTE_KEYS[e.code], octave: state.ui.octave, gate: true, tie: false, accent: e.shiftKey, slide: false });
    engine.auditionBass(id, step);
    move(1);
    return true;
  }
  switch (e.code) {
    case 'KeyZ':
    case 'KeyX':
      state.ui.octave = Math.min(1, Math.max(-1, state.ui.octave + (e.code === 'KeyX' ? 1 : -1)));
      return true;
    // Slide from the note just typed into the next one.
    case 'Tab': {
      const prev = pattern.steps[(dev.selectedStep - 1 + len) % len];
      prev.slide = !prev.slide;
      return true;
    }
    case 'Backspace':
    case 'Delete':
      Object.assign(step, { gate: false, tie: false, accent: false, slide: false });
      move(1);
      return true;
    case 'ArrowLeft':
      move(-1);
      return true;
    case 'ArrowRight':
      move(1);
      return true;
  }
  return false;
}
