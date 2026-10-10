// PATTERNS stage: only the instruments being written, as large as the window
// allows. The bass lines switch to their stacked layout (full-width step grid);
// the drum machines keep their rack layout.
import { BASS_IDS } from '../state.js';
import { BASS_STACKED_MIN, Bassline } from './devices/bassline.js';
import { DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { keysHint, STAGE_BAR_H, STAGE_BAR_MIN_W, StageBar } from './devices/stage-bar.js';
import { rrect } from './primitives.js';
import { C } from './theme.js';
import { drawWindows } from './windows.js';

const MARGIN = 6;
const GAP = 6;
const DRUM_W = 772;

export const SHOWS = [
  ['bass1', 'BASS 1', ['bass1']],
  ['bass2', 'BASS 2', ['bass2']],
  ['basses', '1 + 2', ['bass1', 'bass2']],
  ['r808', '808', ['r808']],
  ['r909', '909', ['r909']],
  ['drums', '08 + 09', ['r808', 'r909']],
];
const DRUMS = { r808: R808, r909: R909 };

export const shownDevices = (state) => (SHOWS.find(([id]) => id === state.ui.show) ?? SHOWS[0])[2];
const minSize = (id) => (DRUMS[id] ? { w: DRUM_W, h: DRUMS[id].base.h } : BASS_STACKED_MIN);
// Devices only; the bar is chrome, sized apart (see main.js resize).
function devicesSize(ids) {
  const sizes = ids.map(minSize);
  const w = Math.max(...sizes.map((s) => s.w)) + MARGIN * 2;
  const h = sizes.reduce((sum, s) => sum + GAP + s.h, 0) + MARGIN;
  return { w, h };
}

export class PatternsView {
  static key = (state) => `patterns:${shownDevices(state).join('+')}`;

  // The bar keeps the scale one bass line would get, so it doesn't jump in size
  // when SHOW changes; only the devices below it grow or shrink.
  static size(state) {
    return {
      min: devicesSize(shownDevices(state)),
      chrome: MARGIN + STAGE_BAR_H,
      chromeW: STAGE_BAR_MIN_W + MARGIN * 2,
      reference: devicesSize(['bass1']),
      stretch: { w: 1.6, h: 1.6 },
    };
  }

  // chromeScale: bar units per view unit.
  constructor(state, app, width, height, chromeScale = 1) {
    Object.assign(this, { state, app, width, height, key: PatternsView.key(state) });
    // A narrow canvas (stretch limit) can't fit the bar at full size: shrink it.
    const k = Math.min(chromeScale, width / (STAGE_BAR_MIN_W + MARGIN * 2));
    this.chromeScale = chromeScale;
    this.k = k;
    const ids = shownDevices(state);
    const basses = ids.filter((id) => BASS_IDS.includes(id));
    if (basses.length && !basses.includes(state.ui.keysTarget)) state.ui.keysTarget = basses[0];
    this.hasKeys = basses.length > 0;
    this.twoBasses = basses.length > 1;

    const w = width - MARGIN * 2;
    this.bar = new StageBar(state, app, MARGIN, MARGIN, width / k - MARGIN * 2, {
      options: SHOWS.map(([id, label]) => [id, label]),
      current: () => state.ui.show,
      pick: (id) => (state.ui.show = id),
      hint: this.hasKeys ? () => keysHint(state) : null,
    });

    // Extra height goes to the devices in proportion to their minimum heights.
    const mins = ids.map((id) => minSize(id).h);
    const barBottom = (MARGIN + STAGE_BAR_H) * k;
    const room = height - barBottom - MARGIN - GAP * ids.length;
    const total = mins.reduce((a, b) => a + b, 0);
    let y = barBottom + GAP;
    this.devices = ids.map((id, i) => {
      const h = (room * mins[i]) / total;
      const d = DRUMS[id]
        ? new DrumMachine(state, app, MARGIN, y, w, h, DRUMS[id])
        : new Bassline(state, app, MARGIN, y, w, h, { id, number: BASS_IDS.indexOf(id) + 1 });
      y += h + GAP;
      return d;
    });
  }

  draw(ctx) {
    const { state } = this;
    ctx.fillStyle = C.rackBg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.scale(this.k, this.k);
    ctx.translate(this.bar.x, this.bar.y);
    this.bar.draw(ctx);
    ctx.restore();
    for (const d of this.devices) {
      ctx.save();
      ctx.translate(d.x, d.y);
      d.draw(ctx);
      ctx.restore();
    }
    // With both bass lines up, outline the one the computer keyboard writes to.
    const target = this.twoBasses && this.devices.find((d) => d.id === state.ui.keysTarget);
    if (target) {
      rrect(ctx, target.x - 2.5, target.y - 2.5, target.w + 5, target.h + 5, 4);
      ctx.strokeStyle = C.bassAccent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawWindows(ctx, this.width, this.height, state, this.app);
  }
}
