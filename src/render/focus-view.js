// Focus stages: the one instrument being worked on, as large as the window
// allows, in its stacked layout (full-width step grid; the drum machines
// always show all lanes). Above it, chrome that keeps one size whatever SHOW
// picks: the stage bar, and in AUTOMATE the loop timeline.
import { BASS_IDS } from '../state.js';
import { BASS_STACKED_MIN, Bassline } from './devices/bassline.js';
import { DRUM_STACKED_MIN, DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { keysHint, STAGE_BAR_H, STAGE_BAR_MIN_W, StageBar } from './devices/stage-bar.js';
import { Timeline, TIMELINE_H } from './devices/timeline.js';
import { C } from './theme.js';
import { drawWindows } from './windows.js';

const MARGIN = 6;
const GAP = 6;

export const SHOWS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', '808'],
  ['r909', '909'],
];
const DRUMS = { r808: R808, r909: R909 };

// Kept as a list: the layout code stacks any number of devices.
export const shownDevices = (state) => [SHOWS.some(([id]) => id === state.ui.show) ? state.ui.show : SHOWS[0][0]];
const minSize = (id) => (DRUMS[id] ? DRUM_STACKED_MIN : BASS_STACKED_MIN);
// Devices only; the chrome is sized apart (see main.js resize).
function devicesSize(ids) {
  const sizes = ids.map(minSize);
  const w = Math.max(...sizes.map((s) => s.w)) + MARGIN * 2;
  const h = sizes.reduce((sum, s) => sum + GAP + s.h, 0) + MARGIN;
  return { w, h };
}

class FocusView {
  static timeline = false;

  static key(state) {
    return `${this.stage}:${shownDevices(state).join('+')}`;
  }

  static chromeH() {
    return MARGIN + STAGE_BAR_H + (this.timeline ? GAP + TIMELINE_H : 0);
  }

  // Two scales. The chrome takes the scale PATTERNS with one bass line would
  // get, whatever the stage or SHOW, so the bar never changes size; the
  // devices take whatever scale fits the room left under this stage's chrome.
  // Either way the devices then stretch to fill the window, any proportion.
  static size(state) {
    const bass = devicesSize(['bass1']);
    return {
      min: devicesSize(shownDevices(state)),
      chrome: this.chromeH(),
      chromeW: STAGE_BAR_MIN_W + MARGIN * 2,
      reference: { w: bass.w, h: bass.h + MARGIN + STAGE_BAR_H },
      stretch: { w: Infinity, h: Infinity },
      // Under the AUTOMATE timeline a short window can need a bit under 1:1;
      // still bigger than in the rack.
      minScale: 0.5,
    };
  }

  // chromeScale: chrome units per view unit.
  constructor(state, app, width, height, chromeScale = 1) {
    const V = this.constructor;
    Object.assign(this, { state, app, width, height, key: V.key(state) });
    // A narrow canvas (stretch limit) can't fit the chrome at full size: shrink it.
    const k = Math.min(chromeScale, width / (STAGE_BAR_MIN_W + MARGIN * 2));
    this.chromeScale = chromeScale;
    this.k = k;
    const ids = shownDevices(state);
    state.ui.show = ids[0]; // a SHOW choice saved by an older version

    const chromeW = width / k - MARGIN * 2;
    this.chrome = [
      new StageBar(state, app, MARGIN, MARGIN, chromeW, {
        options: SHOWS,
        current: () => state.ui.show,
        pick: (id) => (state.ui.show = id),
      }),
    ];
    if (V.timeline) this.chrome.push(new Timeline(state, app, MARGIN, MARGIN + STAGE_BAR_H + GAP, chromeW, TIMELINE_H, ids));

    // Extra height goes to the devices in proportion to their minimum heights.
    const w = width - MARGIN * 2;
    const mins = ids.map((id) => minSize(id).h);
    const chromeBottom = V.chromeH() * k;
    const room = height - chromeBottom - MARGIN - GAP * ids.length;
    const total = mins.reduce((a, b) => a + b, 0);
    let y = chromeBottom + GAP;
    this.devices = ids.map((id, i) => {
      const h = (room * mins[i]) / total;
      const d = DRUMS[id]
        ? new DrumMachine(state, app, MARGIN, y, w, h, DRUMS[id], { stacked: true })
        : new Bassline(state, app, MARGIN, y, w, h, {
          id,
          number: BASS_IDS.indexOf(id) + 1,
          stacked: true,
          // Typing notes works in PATTERNS: say how, where the subtitle goes.
          subtitle: V.stage === 'patterns' ? () => keysHint(state) : null,
        });
      y += h + GAP;
      return d;
    });
  }

  // chromeScale: device pixels per chrome unit (see main.js render).
  draw(ctx, { chromeScale }) {
    const { state } = this;
    ctx.fillStyle = C.rackBg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.setTransform(chromeScale, 0, 0, chromeScale, 0, 0);
    for (const d of this.chrome) drawAt(ctx, d);
    ctx.restore();
    for (const d of this.devices) drawAt(ctx, d);
    drawWindows(ctx, this.width, this.height, state, this.app);
  }
}

function drawAt(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  d.draw(ctx);
  ctx.restore();
}

export class PatternsView extends FocusView {
  static stage = 'patterns';
}

export class AutomateView extends FocusView {
  static stage = 'automate';
  static timeline = true;
}
