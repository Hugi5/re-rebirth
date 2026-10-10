// Focus stages: the one instrument being worked on, as large as the window
// allows, in its stacked layout (full-width step grid; the drum machines
// always show all lanes). Around it, chrome that keeps one size whatever the
// stage or instrument: the stage bar on top, the instrument rail down the
// left, and in AUTOMATE the loop timeline above the instrument.
import { BASS_IDS } from '../state.js';
import { BASS_STACKED_MIN, Bassline } from './devices/bassline.js';
import { DRUM_STACKED_MIN, DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { Rail, RAIL_STRIPS, RAIL_W } from './devices/rail.js';
import { keysHint, STAGE_BAR_H, STAGE_BAR_MIN_W, StageBar } from './devices/stage-bar.js';
import { Timeline, TIMELINE_H } from './devices/timeline.js';
import { MONO, rgba, rrect, text, textWidth } from './primitives.js';
import { C } from './theme.js';
import { drawWindows } from './windows.js';

const MARGIN = 6;
const GAP = 6;
// Chrome left of the instrument (rail + its margin), and on top of it.
const CHROME_LEFT = MARGIN + RAIL_W;
const BAR_BOTTOM = MARGIN + STAGE_BAR_H;
const DRUMS = { r808: R808, r909: R909 };

// Kept as a list: the layout code stacks any number of devices.
export const shownDevices = (state) => [RAIL_STRIPS.some(([id]) => id === state.ui.show) ? state.ui.show : RAIL_STRIPS[0][0]];
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
    return BAR_BOTTOM + (this.timeline ? GAP + TIMELINE_H : 0);
  }

  // Two scales. The chrome takes the scale PATTERNS with one bass line would
  // get, whatever the stage or instrument, so it never changes size; the
  // devices take whatever scale fits the room left beside and under this
  // stage's chrome. Either way they then stretch to fill the window.
  static size(state) {
    const bass = devicesSize(['bass1']);
    return {
      min: devicesSize(shownDevices(state)),
      chrome: this.chromeH(),
      chromeLeft: CHROME_LEFT,
      chromeW: STAGE_BAR_MIN_W + MARGIN * 2,
      reference: { w: CHROME_LEFT + bass.w, h: BAR_BOTTOM + bass.h },
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
    state.ui.show = ids[0]; // a choice saved by an older version ("1 + 2")

    // Chrome, in chrome units: the bar across, the rail from under it to the
    // bottom, the timeline right of the rail.
    const W = width / k;
    const H = height / k;
    const rightX = CHROME_LEFT + MARGIN;
    this.chrome = [new StageBar(state, app, MARGIN, MARGIN, W - MARGIN * 2), new Rail(state, app, MARGIN, BAR_BOTTOM + GAP, RAIL_W, H - BAR_BOTTOM - GAP - MARGIN)];
    if (V.timeline) this.chrome.push(new Timeline(state, app, rightX, BAR_BOTTOM + GAP, W - rightX - MARGIN, TIMELINE_H, ids));

    // Extra height goes to the devices in proportion to their minimum heights.
    const x = CHROME_LEFT * k + MARGIN;
    const w = width - x - MARGIN;
    const mins = ids.map((id) => minSize(id).h);
    const chromeBottom = V.chromeH() * k;
    const room = height - chromeBottom - MARGIN - GAP * ids.length;
    const total = mins.reduce((a, b) => a + b, 0);
    let y = chromeBottom + GAP;
    this.devices = ids.map((id, i) => {
      const h = (room * mins[i]) / total;
      const d = DRUMS[id]
        ? new DrumMachine(state, app, x, y, w, h, DRUMS[id], { stacked: true })
        : new Bassline(state, app, x, y, w, h, {
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
    // Notices (the rack shows them in its song display), at chrome size.
    const notice = state.notice && performance.now() < state.notice.until ? state.notice.text : null;
    if (notice) {
      ctx.save();
      ctx.setTransform(chromeScale, 0, 0, chromeScale, 0, 0);
      drawToast(ctx, notice, this.width / this.k, this.height / this.k);
      ctx.restore();
    }
    drawWindows(ctx, this.width, this.height, state, this.app);
  }
}

function drawToast(ctx, message, w, h) {
  const opts = { size: 7, weight: 800, family: MONO, color: C.lcdGreenOn };
  const tw = Math.min(w - 40, textWidth(ctx, message, opts) + 20);
  const x = (w - tw) / 2;
  const y = h - 34;
  rrect(ctx, x, y, tw, 20, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fill();
  ctx.strokeStyle = rgba(C.lcdGreenOn, 0.5);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  text(ctx, message, w / 2, y + 10.5, opts);
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
