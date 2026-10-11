// Web MIDI input: hardware knobs, faders, keys and pads (Chrome, Edge, Firefox;
// Safari has no Web MIDI).
//
// Out of the box it follows an Arturia MiniLab 3 in its factory program
// (assumed CC numbers below); MIDI learn binds any control to any knob.
// Knob moves go through state.set like mouse moves, so they're recorded the
// same way, several at once if you turn several.
import { R808, R909 } from './render/devices/drum-machine.js';
import { shownDevices } from './render/focus-view.js';
import { BASS_IDS, DRUM_IDS } from './state.js';
import { enterNote, stepTarget } from './ui/step-keys.js';

const STORE = 're-rebirth.midi';
const ENABLED = 're-rebirth.midi.enabled';
const COPY = {
  learn: 'MIDI LEARN: CLICK A KNOB, THEN MOVE A CONTROL \u00B7 DOUBLE-CLICK FORGETS',
  bound: (cc, param) => `CC ${cc} \u2192 ${param.replace(/\./g, ' ')}`,
  forgot: (param) => `${param.replace(/\./g, ' ')}: BACK TO DEFAULT`,
  connected: (names) => `MIDI: ${names.join(', ') || 'NO DEVICE YET'}`,
  denied: 'MIDI ACCESS WAS NOT ALLOWED',
  monitor: (ch, cc, v) => `CH ${ch + 1} \u00B7 CC ${cc} \u00B7 ${v}`,
};
// MiniLab 3 factory program: encoders 1-8 and faders 1-4, channel 1.
const KNOB_CCS = [74, 71, 76, 77, 93, 18, 19, 16];
const FADER_CCS = [82, 83, 85, 17];
const PAD_CHANNEL = 9; // 10 in MIDI terms
const PAD_NOTE = 36; // pad 1; bank B continues at 44
const BASS_KNOBS = ['cutoff', 'resonance', 'envmod', 'decay', 'accent', 'tuning', 'volume', 'waveform'];
const CHANNEL_LEVELS = ['bass1', 'bass2', 'r808', 'r909'].map((id) => `mixer.${id}.level`);
// Most played first, so the first pad bank covers a beat.
const PAD_LANES = {
  r808: ['bd', 'sd', 'ch', 'oh', 'cp', 'rs', 'lt', 'ht', 'mt', 'cy', 'cb'],
  r909: ['bd', 'sd', 'ch', 'oh', 'cp', 'rs', 'lt', 'ht', 'mt', 'cr', 'rd'],
};
const KITS = { r808: R808, r909: R909 };
const ACCENT_VELOCITY = 100;
const MIDDLE_C = 48; // C3: the 303's middle octave
const GRAB = 2 / 127; // soft takeover: how close an absolute control must come

// One relative step, whichever of the usual encodings the controller uses:
// binary offset (64 + n / 64 - n), two's complement (n / 128 - n) or sign bit
// (n / 64 + n). Ups look alike (1..n or 65..n) but downs don't: offset goes
// below 64 (63..), two's complement to the top (127..), sign bit to 65...
// The one overlap, 65..80 (offset up or sign-bit down), is told apart by what
// else the control has sent.
function relativeDelta(c, v) {
  if (v >= 1 && v <= 15) c.sawLow = true;
  if (v >= 49 && v <= 63) c.sawMid = true;
  if (v < 48) return v;
  if (v <= 64) return v - 64;
  if (v <= 80) return c.sawLow && !c.sawMid ? 64 - v : v - 64;
  return v - 128;
}

export class Midi {
  // onChange: after any state change from MIDI; notify(text): a short message.
  constructor(state, engine, { onChange, notify }) {
    Object.assign(this, { state, engine, onChange, notify });
    this.access = null;
    this.bindings = new Map(); // "channel:cc" -> param
    this.controls = new Map(); // "channel:cc" -> { mode, last, param, grabbed }
    try {
      for (const [k, v] of JSON.parse(localStorage.getItem(STORE) ?? '[]')) this.bindings.set(k, v);
    } catch {
      // Unreadable bindings: start over.
    }
    state.ui.midi = navigator.requestMIDIAccess ? 'off' : 'unavailable';
    // Connected before: permission is remembered, so reconnect without asking.
    if (this.supported && localStorage.getItem(ENABLED)) this.connect({ quiet: true });
  }

  get supported() {
    return !!navigator.requestMIDIAccess;
  }

  async connect({ quiet = false } = {}) {
    if (!this.supported || this.access) return;
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      this.state.ui.midi = 'denied';
      if (!quiet) this.notify(COPY.denied);
      this.onChange();
      return;
    }
    localStorage.setItem(ENABLED, '1');
    this.access.onstatechange = () => this.attach();
    this.attach();
    if (!quiet) this.notify(COPY.connected(this.inputNames));
  }

  attach() {
    const inputs = [...this.access.inputs.values()].filter((i) => i.state === 'connected');
    for (const input of inputs) input.onmidimessage = (e) => this.message(e.data);
    this.state.ui.midi = inputs.length ? 'on' : 'waiting';
    this.inputNames = inputs.map((i) => i.name);
    this.onChange();
  }

  // The bar's MIDI button: connect first, then switch learn on and off.
  press() {
    if (this.state.ui.midi === 'off' || this.state.ui.midi === 'denied') return this.connect();
    this.toggleLearn();
  }

  // MIDI learn: click a knob on screen, then move a hardware control.
  toggleLearn() {
    const { ui } = this.state;
    if (ui.midiLearn) {
      ui.midiLearn = null;
      return;
    }
    ui.midiLearn = { param: null, mapped: new Set(this.bindings.values()), forget: (param) => this.unbind(param) };
    this.notify(COPY.learn);
  }

  unbind(param) {
    for (const [k, v] of this.bindings) if (v === param) this.bindings.delete(k);
    this.save();
    this.notify(COPY.forgot(param));
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.bindings]));
    } catch {
      // Storage unavailable: bindings last for this visit.
    }
    if (this.state.ui.midiLearn) this.state.ui.midiLearn.mapped = new Set(this.bindings.values());
  }

  message([status, a, b = 0]) {
    const type = status & 0xf0;
    const channel = status & 0x0f;
    if (type === 0xb0) this.cc(channel, a, b);
    else if (type === 0x90 && b > 0) this.noteOn(channel, a, b);
    else return;
    this.onChange();
  }

  cc(channel, cc, value) {
    const key = `${channel}:${cc}`;
    const learn = this.state.ui.midiLearn;
    // While learning, show what arrives: tells which CC a control sends and how.
    if (learn) this.notify(COPY.monitor(channel, cc, value));
    if (learn?.param) {
      for (const [k, v] of this.bindings) if (v === learn.param) this.bindings.delete(k);
      this.bindings.set(key, learn.param);
      this.notify(COPY.bound(cc, learn.param));
      learn.param = null;
      this.save();
      this.controls.delete(key);
      return;
    }
    const param = this.bindings.get(key) ?? this.defaultParam(channel, cc);
    if (param) this.turn(key, param, value);
  }

  // What the factory layout controls: knobs follow the instrument on screen.
  defaultParam(channel, cc) {
    if (channel !== 0) return null;
    const fader = FADER_CCS.indexOf(cc);
    if (fader >= 0) return CHANNEL_LEVELS[fader];
    const knob = KNOB_CCS.indexOf(cc);
    if (knob < 0) return null;
    const [id] = shownDevices(this.state);
    if (BASS_IDS.includes(id)) return `${id}.${BASS_KNOBS[knob]}`;
    // Drum machines: the knobs of the selected instrument.
    const cfg = KITS[id];
    const selected = this.state.drums[id].selected;
    const group = cfg.groups.find((g) => g.tracks.includes(selected)) ?? cfg.groups[0];
    const k = group.knobs[knob];
    return k ? `${id}.${group.id}.${k[0]}` : null;
  }

  // Endless encoders send relative steps, plain knobs and faders absolute
  // values. An absolute control only sends when its value changes, so the same
  // value twice in a row means relative. Absolute controls take over softly:
  // only once they reach the current value, so nothing jumps.
  turn(key, param, value) {
    const { state } = this;
    let c = this.controls.get(key);
    if (!c) this.controls.set(key, (c = { relative: false, last: null, param, grabbed: false, sawLow: false, sawMid: false }));
    if (c.param !== param) Object.assign(c, { param, grabbed: false });
    // (Not at 0 or 127: an absolute knob turned past its end may repeat those.)
    if (!c.relative && value === c.last && value > 0 && value < 127) c.relative = true;
    const prev = c.last;
    c.last = value;
    if (c.relative) {
      state.set(param, state.get(param) + relativeDelta(c, value) / 127);
      return;
    }
    const target = value / 127;
    const now = state.get(param);
    if (!c.grabbed) {
      const crossed = prev !== null && (prev / 127 - now) * (target - now) <= 0;
      c.grabbed = crossed || Math.abs(target - now) <= GRAB;
    }
    if (c.grabbed) state.set(param, target);
  }

  noteOn(channel, note, velocity) {
    const accent = velocity > ACCENT_VELOCITY;
    if (channel === PAD_CHANNEL) return this.pad(note, velocity);
    const [shown] = shownDevices(this.state);
    const id = stepTarget(this.state) ?? (BASS_IDS.includes(shown) ? shown : null);
    if (!id) return;
    // The 303 spans C an octave below to C two above; fold other notes in.
    let rel = note - MIDDLE_C;
    while (rel < -12) rel += 12;
    while (rel > 24) rel -= 12;
    const octave = rel === 24 ? 1 : Math.floor(rel / 12);
    const step = { note: rel - octave * 12, octave, accent };
    // PATTERNS writes steps; elsewhere the keys just play the bass line.
    if (stepTarget(this.state)) enterNote(this.state, this.engine, id, step);
    else this.engine.auditionBass(id, { ...step, gate: true, slide: false, tie: false });
  }

  // Pads play the drum machine on screen (Drum 09 when a bass line is), and
  // select the lane they hit.
  pad(note, velocity) {
    const [shown] = shownDevices(this.state);
    const id = DRUM_IDS.includes(shown) ? shown : 'r909';
    const lane = PAD_LANES[id][note - PAD_NOTE];
    if (!lane) return;
    this.state.drums[id].selected = lane;
    this.engine.hitDrum(id, lane, velocity > ACCENT_VELOCITY ? 1 : 0);
  }
}
