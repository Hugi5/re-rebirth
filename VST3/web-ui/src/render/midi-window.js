// MIDI window, opened from the bar's MIDI button. A menu (set up, learn,
// reset), then SET UP MY CONTROLLER: big prompts and a picture of the
// controller with the control to touch lit, one step at a time (see
// SETUP_STEPS in midi.js), so the whole layout is recorded in half a minute.
import { SETUP_STEPS } from '../midi.js';
import { hits } from '../ui/hits.js';
import { click } from '../ui/handlers.js';
import { brushed, button, circle, lcd, led, MONO, panel, rgba, rrect, screws, text, vgrad } from './primitives.js';
import { C } from './theme.js';

const W = 460;
const H = 300;
const COPY = {
  title: 'MIDI',
  setupTitle: (n, total) => `SET UP MY CONTROLLER \u00B7 STEP ${n} OF ${total}`,
  doneTitle: 'SET UP MY CONTROLLER',
  devices: (names) => (names?.length ? names.join(', ').toUpperCase() : 'NO DEVICE CONNECTED'),
  layout: (custom) => (custom ? 'LAYOUT: SET UP BY YOU' : 'LAYOUT: GUESSED (MINILAB 3 FACTORY)'),
  learned: (n) => (n ? ` \u00B7 ${n} LEARNED KNOB${n > 1 ? 'S' : ''}` : ''),
  setup: 'SET UP MY CONTROLLER',
  setupHint: 'TOUCH EACH CONTROL WHEN ASKED (HALF A MINUTE)',
  learn: 'MIDI LEARN',
  learnHint: 'CLICK A KNOB ON SCREEN, THEN MOVE A CONTROL',
  reset: 'RESET',
  resetHint: 'BACK TO THE GUESSED LAYOUT, NOTHING LEARNED',
  close: 'CLOSE',
  back: '\u2190 BACK',
  skip: 'SKIP',
  cancel: 'CANCEL',
  keepTurning: 'KEEP TURNING\u2026',
  optional: 'NOTHING HAPPENS? SKIP IT',
  allSet: 'ALL SET',
  summary: (d) => {
    const n = (list) => list.filter(Boolean).length;
    const yes = (v) => (v ? 'YES' : '\u2013');
    return [
      `KNOBS ${n(d.knobs)}/8 \u00B7 SLIDERS ${n(d.faders)}/4 \u00B7 BIG KNOB ${yes(d.encoder)} \u00B7 CLICK ${yes(d.encoderPush)}`,
      `SHIFT ${yes(d.shift)} \u00B7 MOD STRIP ${yes(d.mod)} \u00B7 PADS ${yes(d.pads)} \u00B7 TRANSPORT ${n(Object.values(d.transport))}/4`,
    ];
  },
  doneHint: 'KNOBS 1\u20136 PLAY THE INSTRUMENT ON SCREEN, 7 DELAY SEND, 8 DISTORTION \u00B7 SLIDERS: VOLUMES \u00B7 BIG KNOB: PATTERNS',
};

export function drawMidiWindow(ctx, viewW, viewH, state, app) {
  const view = state.ui.midiWindow;
  const close = () => (state.ui.midiWindow = null);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  hits.rect(ctx, 0, 0, viewW, viewH, { ...click(() => view.mode !== 'setup' && close()), cursor: 'default' });

  // As large as the window allows (it's read from a playing position).
  const s = Math.min((viewW * 0.94) / W, (viewH * 0.94) / H);
  ctx.save();
  ctx.translate((viewW - W * s) / 2, (viewH - H * s) / 2);
  ctx.scale(s, s);
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  brushed(ctx, 0, 0, W, H, 0.35);
  ctx.fillStyle = vgrad(ctx, 0, 20, C.bassHeader);
  ctx.fillRect(0, 0, W, 20);
  led(ctx, 16, 10, 2.5, state.ui.midi === 'on', C.ledGreen);
  const title = view.mode === 'setup' ? COPY.setupTitle(view.step + 1, SETUP_STEPS.length) : view.mode === 'done' ? COPY.doneTitle : COPY.title;
  text(ctx, title, 26, 10.5, { size: 8, weight: 900, align: 'left', spacing: 1.4 });
  screws(ctx, W, H, 7, 28);

  if (view.mode === 'setup') drawSetup(ctx, view, app);
  else if (view.mode === 'done') drawDone(ctx, view, close);
  else drawMenu(ctx, state, app, close);
  ctx.restore();
}

function bigButton(ctx, x, y, w, h, label, fn, key, { size = 9, primary = false } = {}) {
  const off = button(ctx, x, y, w, h, { pressed: hits.isPressed(key), face: primary ? [C.ledYellow, '#b98f00'] : C.btnDark });
  text(ctx, label, x + w / 2, y + h / 2 + 0.5 + off, { size, weight: 900, spacing: 0.8, color: primary ? C.bassInk : fn ? C.inkLight : C.inkMuted });
  if (fn) hits.rect(ctx, x, y, w, h, click(fn, key));
}

function drawMenu(ctx, state, app, close) {
  const { midi } = app;
  lcd(ctx, 24, 34, W - 48, 36, C.lcdGreen);
  const mono = { size: 7.5, weight: 700, family: MONO, color: C.lcdGreenOn };
  text(ctx, COPY.devices(midi.inputNames), W / 2, 46, mono);
  text(ctx, COPY.layout(midi.custom) + COPY.learned(midi.bindings.size), W / 2, 60, { ...mono, size: 6.5, color: C.lcdGreenMid });

  const rows = [
    [COPY.setup, COPY.setupHint, () => midi.startSetup(), 'midi.setup', true],
    [COPY.learn, COPY.learnHint, () => (close(), midi.toggleLearn()), 'midi.learn', false],
    [COPY.reset, COPY.resetHint, () => midi.reset(), 'midi.reset', false],
  ];
  rows.forEach(([label, hint, fn, key, primary], i) => {
    const y = 88 + i * 50;
    bigButton(ctx, 24, y, 190, 34, label, fn, key, { primary });
    text(ctx, hint, 226, y + 17.5, { size: 6.8, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.3 });
  });
  bigButton(ctx, W - 24 - 90, H - 24 - 26, 90, 26, COPY.close, close, 'midi.close');
}

function drawSetup(ctx, view, app) {
  const { midi } = app;
  const step = SETUP_STEPS[view.step];
  // The prompt, big.
  text(ctx, step.prompt, W / 2, 44, { size: 15, weight: 900, color: C.ledYellow, spacing: 0.8 });
  const sub = view.pending ? COPY.keepTurning : step.optional ? COPY.optional : '';
  if (sub) text(ctx, sub, W / 2, 62, { size: 7.5, weight: 800, color: C.inkMuted, spacing: 0.6 });
  drawController(ctx, 30, 74, W - 60, 168, view);
  const by = H - 24 - 26;
  bigButton(ctx, 24, by, 96, 26, COPY.back, view.step > 0 ? () => midi.back() : null, 'midi.back');
  bigButton(ctx, W / 2 - 48, by, 96, 26, COPY.skip, () => midi.skip(), 'midi.skip');
  bigButton(ctx, W - 24 - 96, by, 96, 26, COPY.cancel, () => (midi.state.ui.midiWindow = { mode: 'menu' }), 'midi.cancel');
}

function drawDone(ctx, view, close) {
  text(ctx, COPY.allSet, W / 2, 52, { size: 18, weight: 900, color: C.ledGreen, spacing: 1.2 });
  lcd(ctx, 24, 74, W - 48, 44, C.lcdGreen);
  COPY.summary(view.draft).forEach((line, i) => text(ctx, line, W / 2, 88 + i * 16, { size: 7, weight: 700, family: MONO, color: C.lcdGreenOn }));
  text(ctx, COPY.doneHint, W / 2, 140, { size: 6.2, weight: 700, color: C.inkMuted, spacing: 0.3 });
  drawController(ctx, 30, 152, W - 60, 92, { draft: view.draft, step: SETUP_STEPS.length });
  bigButton(ctx, W - 24 - 90, H - 24 - 26 + 6, 90, 26, COPY.close, close, 'midi.done');
}

// A sketch of a MiniLab-style controller (that's the layout the steps
// follow): Shift, mod strip, big knob, 8 knobs, 4 sliders, 8 pads. The
// control the current step asks for is yellow, found ones green.
function drawController(ctx, x, y, w, h, view) {
  const { draft, step } = view;
  const current = SETUP_STEPS[step];
  const k = h / 168;
  const at = (px, py) => [x + px * (w / 400), y + py * k];
  rrect(ctx, x, y, w, h, 6);
  ctx.fillStyle = '#121316';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const is = (role, index) => current && current.role === role && (index === undefined || current.index === index || current.name === index);
  const found = (role, index) => {
    if (role === 'transport') return !!draft.transport[index];
    if (role === 'pads') return !!draft.pads;
    return index === undefined ? !!draft[role] : !!draft[role][index];
  };
  const look = (on, done) => (on ? C.ledYellow : done ? C.ledGreen : null);
  const shape = (color, draw) => {
    draw();
    ctx.fillStyle = color ? rgba(color, 0.35) : '#2a2c31';
    ctx.fill();
    ctx.strokeStyle = color ?? 'rgba(255,255,255,0.18)';
    ctx.lineWidth = color ? 1.6 : 1;
    ctx.stroke();
  };

  // Shift, mod strip
  const shiftOn = is('shift') || is('encoderShift') || (current?.role === 'transport');
  let [sx, sy] = at(12, 14);
  shape(look(shiftOn, found('shift')), () => rrect(ctx, sx, sy, 30 * (w / 400), 14 * k, 2));
  text(ctx, 'SHIFT', sx + 15 * (w / 400), sy + 7 * k, { size: 5.5, weight: 800, color: C.inkMuted });
  [sx, sy] = at(20, 44);
  shape(look(is('mod'), found('mod')), () => rrect(ctx, sx, sy, 12 * (w / 400), 96 * k, 3));
  text(ctx, 'MOD', sx + 6 * (w / 400), sy + 104 * k, { size: 5.5, weight: 800, color: C.inkMuted });

  // Big knob
  const [ex, ey] = at(72, 44);
  const encOn = is('encoder') || is('encoderPush') || is('encoderShift');
  shape(look(encOn, found('encoder')), () => circle(ctx, ex, ey, 17 * k));

  // Knobs, two rows of four
  for (let i = 0; i < 8; i++) {
    const [kx, ky] = at(130 + (i % 4) * 42, 30 + Math.floor(i / 4) * 40);
    shape(look(is('knobs', i), found('knobs', i)), () => circle(ctx, kx, ky, 11 * k));
    text(ctx, String(i + 1), kx, ky + 0.5, { size: 7 * Math.min(1, k * 1.3), weight: 900, color: C.inkLight });
  }

  // Sliders
  for (let i = 0; i < 4; i++) {
    const [fx, fy] = at(312 + i * 22, 12);
    const color = look(is('faders', i), found('faders', i));
    shape(color, () => rrect(ctx, fx, fy, 8 * (w / 400), 76 * k, 2));
    ctx.fillStyle = color ?? C.inkMuted;
    ctx.fillRect(fx - 2, fy + 40 * k, 8 * (w / 400) + 4, 4 * k);
    text(ctx, String(i + 1), fx + 4 * (w / 400), fy + 84 * k, { size: 6, weight: 900, color: C.inkMuted });
  }

  // Pads: pad 1 for the pads step, 4-7 for transport (with Shift).
  const TRANSPORT = { 3: 'loop', 4: 'stop', 5: 'play', 6: 'rec' };
  const ICONS = { 3: 'LOOP', 4: 'STOP', 5: 'PLAY', 6: 'REC' };
  for (let i = 0; i < 8; i++) {
    const [px, py] = at(72 + i * 40, 120);
    const t = TRANSPORT[i];
    const on = (i === 0 && is('pads')) || (t && is('transport', t));
    const done = (i === 0 && found('pads')) || (t && found('transport', t));
    shape(look(on, done), () => rrect(ctx, px, py, 34 * (w / 400), 30 * k, 3));
    if (ICONS[i]) text(ctx, ICONS[i], px + 17 * (w / 400), py + 15 * k, { size: 5.5, weight: 800, color: C.inkMuted });
  }
}
