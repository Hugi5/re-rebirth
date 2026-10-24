// AUTOMATE's loop timeline: loop and record-mode controls, a ruler over the
// whole song where A and B are dragged, and the shown devices' automation
// lanes, zoomed to the A-B loop while it's on.
import { songBars, TICKS_PER_BAR } from '../../song/song.js';
import { hits } from '../../ui/hits.js';
import { drawBlocks, drawLevel, laneGroups, lastAt, valueText } from '../automation.js';
import { led, line, MONO, panel, rgba, rrect, text, textWidth, vgrad } from '../primitives.js';
import { C } from '../theme.js';
import { tab } from './stage-bar.js';

export const TIMELINE_H = 104;
const ROW = { y: 5, h: 18 };
const RULER = { y: 28, h: 16 };
const LANES_Y = 48;
const LABEL_W = 96;
const MIN_LANE_H = 11;
const BEAT = TICKS_PER_BAR / 4;
const MIN_BARS = 16;
const GRAB = 5; // units either side of a marker that pick it up
const COPY = {
  loop: 'LOOP A\u2013B',
  latch: 'LATCH',
  touch: 'TOUCH',
  undo: '\u21B6 UNDO PASS',
  status: (a, b, pass) => `BARS ${a}\u2013${b}${pass ? ` \u00B7 PASS ${pass}` : ''}`,
  empty: 'NO AUTOMATION HERE YET \u00B7 ARM REC, PLAY AND TURN A KNOB: WHATEVER YOU TOUCH IS RECORDED',
  more: (n) => `+${n} MORE`,
};
const LABEL = { size: 6, weight: 700, align: 'left', color: C.inkLight, spacing: 0.3 };

export class Timeline {
  constructor(state, app, x, y, w, h, ids) {
    Object.assign(this, { state, app, x, y, w, h, ids });
  }

  get player() {
    return this.app.clock.player;
  }

  draw(ctx) {
    const { w, h } = this;
    panel(ctx, 0, 0, w, h, C.transport);
    this.drawControls(ctx);
    this.drawRuler(ctx);
    this.drawLanes(ctx, LANES_Y, h - 4 - LANES_Y);
  }

  drawControls(ctx) {
    const { state, app, w } = this;
    const { transport: t, song } = state;
    const ui = state.ui;
    let x = 8;
    x += tab(ctx, x, ROW, COPY.loop, t.loop, () => app.clock.toggleLoop(), 'tl.loop') + 10;
    x += tab(ctx, x, ROW, COPY.latch, ui.recMode === 'latch', () => (ui.recMode = 'latch'), 'tl.latch') + 4;
    x += tab(ctx, x, ROW, COPY.touch, ui.recMode === 'touch', () => (ui.recMode = 'touch'), 'tl.touch') + 10;
    const canUndo = this.player.canUndo();
    const bw = tab(ctx, x, ROW, COPY.undo, false, canUndo ? () => app.clock.undoPass() : null, 'tl.undo');
    if (!canUndo) {
      rrect(ctx, x, ROW.y, bw, ROW.h + 1, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
    }
    const passes = this.player.undoStack.length + (this.player.inPass ? 1 : 0);
    const status = COPY.status(song.loopStart / TICKS_PER_BAR + 1, song.loopEnd / TICKS_PER_BAR, t.rec ? passes : 0);
    if (t.loop && song.loopEnd > song.loopStart) {
      text(ctx, status, w - 10, ROW.y + ROW.h / 2 + 0.5, { size: 7, weight: 800, family: MONO, align: 'right', color: C.ledYellow });
    }
    if (t.rec && t.playing) led(ctx, w - 10 - textWidth(ctx, status, { size: 7, weight: 800, family: MONO }) - 10, ROW.y + ROW.h / 2, 2.6, true, C.ledRed);
  }


  // Ticks shown on the ruler: the whole song, at least MIN_BARS, and the loop.
  rulerSpan() {
    const { song } = this.state;
    return Math.max(songBars(song), MIN_BARS) * TICKS_PER_BAR + (song.loopEnd > song.length ? song.loopEnd - song.length : 0);
  }

  drawRuler(ctx) {
    const { state, w } = this;
    const { song, transport: t } = state;
    const gx = 8;
    const gw = w - 16;
    const span = this.rulerSpan();
    const X = (tick) => gx + (tick * gw) / span;
    const { y, h } = RULER;
    rrect(ctx, gx, y, gw, h, 2);
    ctx.fillStyle = vgrad(ctx, y, y + h, C.lcdGreen);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, y, gw, h);
    ctx.clip();
    const bars = span / TICKS_PER_BAR;
    const step = [1, 2, 4, 8, 16, 32, 64, 128].find((s) => (s * gw) / bars >= 26) ?? 256;
    ctx.strokeStyle = C.lcdGreenDim;
    ctx.lineWidth = 1;
    for (let b = 0; b < bars; b += step) {
      const bx = Math.round(X(b * TICKS_PER_BAR)) + 0.5;
      line(ctx, bx, y + h - 4, bx, y + h);
      text(ctx, String(b + 1), bx + 2, y + h / 2 - 1, { size: 6, weight: 700, family: MONO, align: 'left', color: C.lcdGreenMid });
    }
    if (song.length) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(X(song.length), y, gx + gw - X(song.length), h);
    }
    const hasLoop = song.loopEnd > song.loopStart;
    if (hasLoop) {
      const [a, b] = [X(song.loopStart), X(song.loopEnd)];
      ctx.fillStyle = rgba(C.ledYellow, t.loop ? 0.25 : 0.08);
      ctx.fillRect(a, y, b - a, h);
    }
    const px = X(playTick(state));
    ctx.strokeStyle = C.ledGreen;
    line(ctx, Math.round(px) + 0.5, y, Math.round(px) + 0.5, y + h);
    ctx.restore();
    if (hasLoop) {
      this.marker(ctx, X(song.loopStart), 'A', t.loop);
      this.marker(ctx, X(song.loopEnd), 'B', t.loop);
    }
    hits.rect(ctx, gx - GRAB, y - 4, gw + GRAB * 2, h + 4, this.rulerDrag(gx, gw, span));
  }

  marker(ctx, x, label, on) {
    const { y, h } = RULER;
    const color = on ? C.ledYellow : C.inkMuted;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) - 0.5, y, 1.5, h);
    rrect(ctx, x - 5, y - 4, 10, 9, 1.5);
    ctx.fill();
    text(ctx, label, x, y + 0.5, { size: 6.5, weight: 900, color: C.bassInk });
  }

  // Drag A or B; drag anywhere else to draw a new loop; click to move the song
  // position there. Markers snap to bars, to beats with Shift.
  rulerDrag(gx, gw, span) {
    const { state, app } = this;
    const { song, transport: t } = state;
    const tickAt = (x) => Math.max(0, ((x - gx) * span) / gw);
    const snap = (tick, fine) => {
      const grid = fine ? BEAT : TICKS_PER_BAR;
      return Math.round(tick / grid) * grid;
    };
    const near = (x, tick) => Math.abs(x - (gx + (tick * gw) / span)) <= GRAB;
    return {
      cursor: 'ew-resize',
      down: (ev) => {
        const x0 = ev.p.x;
        const hasLoop = song.loopEnd > song.loopStart;
        let grab = hasLoop && near(x0, song.loopEnd) ? 'B' : hasLoop && near(x0, song.loopStart) ? 'A' : null;
        let moved = false;
        return {
          move: (ev) => {
            const grid = ev.fine ? BEAT : TICKS_PER_BAR;
            if (!grab) {
              if (Math.abs(ev.p.x - x0) < 3) return;
              // A new loop from where the drag began, in either direction.
              song.loopStart = song.loopEnd = snap(tickAt(x0), ev.fine);
              grab = ev.p.x < x0 ? 'A' : 'B';
            }
            moved = true;
            t.loop = true;
            const tick = snap(tickAt(ev.p.x), ev.fine);
            if (grab === 'A') song.loopStart = Math.max(0, Math.min(tick, song.loopEnd - grid));
            else song.loopEnd = Math.max(tick, song.loopStart + grid);
          },
          up: () => {
            if (!moved && !grab) app.clock.seekTo(Math.floor(tickAt(x0) / TICKS_PER_BAR) + 1);
          },
        };
      },
    };
  }

  drawLanes(ctx, top, height) {
    const { state, w } = this;
    const { song, transport: t } = state;
    const lanes = laneGroups(song)
      .filter((g) => this.ids.includes(g.id))
      .flatMap((g) => g.lanes.map((lane) => ({ ...lane, color: g.color })));
    const gx = 8 + LABEL_W;
    const gw = w - 8 - gx;
    rrect(ctx, 8, top, w - 16, height, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    if (!lanes.length) {
      text(ctx, COPY.empty, w / 2, top + height / 2, { size: 6.5, weight: 800, color: C.inkMuted, spacing: 0.5 });
      return;
    }
    // Touched in this pass first, then the rest as they fit.
    const touched = this.player.overrides;
    lanes.sort((a, b) => touched.has(b.key) - touched.has(a.key));
    const fit = Math.max(1, Math.floor(height / MIN_LANE_H));
    const shown = lanes.length > fit ? lanes.slice(0, fit - 1) : lanes;
    const laneH = height / (shown.length + (lanes.length > fit ? 1 : 0));

    const loop = t.loop && song.loopEnd > song.loopStart;
    const from = loop ? song.loopStart : 0;
    const to = loop ? song.loopEnd : Math.max(song.length, MIN_BARS * TICKS_PER_BAR);
    const X = (tick) => gx + ((tick - from) * gw) / (to - from);
    const now = playTick(state);
    shown.forEach((lane, i) => {
      const y = top + i * laneH;
      const hot = touched.has(lane.key);
      if (hot) led(ctx, 15, y + laneH / 2, 2.2, true, C.ledRed);
      text(ctx, lane.label, 22, y + laneH / 2 + 0.5, { ...LABEL, size: Math.min(6, laneH * 0.55), color: hot ? C.inkLight : C.inkMuted });
      const at = lastAt(lane.events, now);
      text(ctx, valueText(lane, lane.events[at]?.value), gx - 4, y + laneH / 2 + 0.5, { size: Math.min(6, laneH * 0.55), weight: 700, family: MONO, align: 'right', color: C.lcdGreenMid });
      const lt = y + 1;
      const lh = laneH - 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, lt, gw, lh);
      ctx.clip();
      ctx.fillStyle = vgrad(ctx, lt, lt + lh, C.screen);
      ctx.fillRect(gx, lt, gw, lh);
      const end = Math.max(song.length, lane.events.at(-1).tick + TICKS_PER_BAR);
      const span = { from: Math.max(0, lastAt(lane.events, from)), to, end };
      if (lane.kind === 'level') drawLevel(ctx, lane.events, lane.color, X, lt, lh, span);
      else drawBlocks(ctx, lane, lane.color, X, lt, lh, span);
      ctx.restore();
    });
    if (shown.length < lanes.length) {
      text(ctx, COPY.more(lanes.length - shown.length), 22, top + shown.length * laneH + laneH / 2 + 0.5, { ...LABEL, color: C.inkMuted });
    }
    const px = X(now);
    if (px >= gx && px <= gx + gw) {
      ctx.strokeStyle = rgba(C.ledGreen, 0.85);
      ctx.lineWidth = 1;
      line(ctx, Math.round(px) + 0.5, top, Math.round(px) + 0.5, top + height);
    }
  }
}

const playTick = (state) => (state.transport.bar - 1) * TICKS_PER_BAR + Math.max(0, state.transport.step) * 2;
