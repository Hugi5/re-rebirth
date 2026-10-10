// PATTERNS stage: only the instruments being written, as large as the window
// allows. The bass lines switch to their stacked layout (full-width step grid);
// the drum machines keep their rack layout.
import { BASS_IDS } from '../state.js';
import { BASS_STACKED_MIN, Bassline } from './devices/bassline.js';
import { DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { keysHint, STAGE_BAR_H, StageBar } from './devices/stage-bar.js';
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

export class PatternsView {
  static key = (state) => `patterns:${shownDevices(state).join('+')}`;

  static size(state) {
    const sizes = shownDevices(state).map(minSize);
    const w = Math.max(...sizes.map((s) => s.w)) + MARGIN * 2;
    const h = MARGIN + STAGE_BAR_H + sizes.reduce((sum, s) => sum + GAP + s.h, 0) + MARGIN;
    return { min: { w, h }, stretch: { w: 1.6, h: 1.6 } };
  }

  constructor(state, app, width, height) {
    Object.assign(this, { state, app, width, height, key: PatternsView.key(state) });
    const ids = shownDevices(state);
    const basses = ids.filter((id) => BASS_IDS.includes(id));
    if (basses.length && !basses.includes(state.ui.keysTarget)) state.ui.keysTarget = basses[0];
    this.hasKeys = basses.length > 0;
    this.twoBasses = basses.length > 1;

    const w = width - MARGIN * 2;
    this.bar = new StageBar(state, app, MARGIN, MARGIN, w, {
      options: SHOWS.map(([id, label]) => [id, label]),
      current: () => state.ui.show,
      pick: (id) => (state.ui.show = id),
      hint: this.hasKeys ? () => keysHint(state) : null,
    });

    // Extra height goes to the devices in proportion to their minimum heights.
    const mins = ids.map((id) => minSize(id).h);
    const room = height - MARGIN * 2 - STAGE_BAR_H - GAP * ids.length;
    const total = mins.reduce((a, b) => a + b, 0);
    let y = MARGIN + STAGE_BAR_H + GAP;
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
    for (const d of [this.bar, ...this.devices]) {
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
