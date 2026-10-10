// Compact transport for the focus stages: stage tabs, zoom and full screen on
// top; play controls, tempo and position below, plus the stage's own options
// (PATTERNS: what to show) on the right. Big type: it's meant to be read at a
// glance from a playing position.
import { hits } from '../../ui/hits.js';
import { click, tempoDrag } from '../../ui/handlers.js';
import { button, icon, lcd, led, MONO, panel, sevenSeg, sevenSegWidth, text, textWidth } from '../primitives.js';
import { C } from '../theme.js';

export const STAGE_BAR_H = 60;
// Narrowest bar that fits every button: a stacked bass line's width, so the
// bar never widens the PATTERNS reference layout.
export const STAGE_BAR_MIN_W = 580;
export const STAGES = [
  ['rack', 'RACK'],
  ['patterns', 'PATTERNS'],
];
export const ZOOMS = [1, 1.25, 1.5, 1.75, 2];
const COPY = {
  zoom: 'ZOOM',
  full: 'FULL SCREEN',
  tempo: 'BPM',
  keys: (oct) => `A\u2013K NOTES \u00B7 Z X OCTAVE ${oct > 0 ? '+' : ''}${oct} \u00B7 \u21E7 ACCENT \u00B7 TAB SLIDE \u00B7 \u232B REST`,
};
const TAB = { size: 7.5, weight: 800, spacing: 0.4 };
const ROW1 = { y: 5, h: 18 };
const ROW2 = { y: 29, h: 26 };

export class StageBar {
  // options: [[value, label], ...] for the stage's own selector; current(), pick(value).
  constructor(state, app, x, y, w, { options = [], current, pick, hint } = {}) {
    Object.assign(this, { state, app, x, y, w, h: STAGE_BAR_H, options, current, pick, hint });
  }

  draw(ctx) {
    const { w, h, state } = this;
    panel(ctx, 0, 0, w, h, C.transport);

    // Stage tabs
    let x = 8;
    for (const [stage, label] of STAGES) {
      x += this.tab(ctx, x, ROW1, label, state.ui.stage === stage, () => (state.ui.stage = stage), `stage.${stage}`) + 4;
    }
    if (this.hint) {
      const hint = this.hint();
      text(ctx, hint, x + 6, ROW1.y + ROW1.h / 2 + 0.5, { size: 5.6, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.2 });
    }

    // Zoom and full screen, right-aligned
    let rx = w - 8;
    rx -= this.tab(ctx, rx, ROW1, COPY.full, false, () => this.app.toggleFullscreen(), 'stage.full', 'right') + 10;
    const zooms = (state.ui.zoom ??= {});
    const zoom = zooms[state.ui.stage] ?? 1;
    const at = ZOOMS.indexOf(zoom);
    const setZoom = (d) => (zooms[state.ui.stage] = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (at < 0 ? 0 : at) + d))]);
    rx -= this.tab(ctx, rx, ROW1, '+', false, () => setZoom(1), 'stage.zoom.in', 'right', 18) + 3;
    const pct = `${Math.round(zoom * 100)}%`;
    lcd(ctx, rx - 34, ROW1.y, 34, ROW1.h);
    text(ctx, pct, rx - 17, ROW1.y + ROW1.h / 2 + 0.5, { size: 7.5, weight: 700, family: MONO, color: C.lcdOn });
    rx -= 34 + 3;
    rx -= this.tab(ctx, rx, ROW1, '\u2212', false, () => setZoom(-1), 'stage.zoom.out', 'right', 18) + 4;
    text(ctx, COPY.zoom, rx, ROW1.y + ROW1.h / 2 + 0.5, { ...TAB, size: 6, align: 'right', color: C.inkMuted });

    this.drawTransport(ctx);

    // Stage options, right-aligned on the second row
    rx = w - 8;
    for (const [value, label] of [...this.options].reverse()) {
      rx -= this.tab(ctx, rx, ROW2, label, this.current?.() === value, () => this.pick(value), `stage.opt.${value}`, 'right') + 4;
    }
  }

  drawTransport(ctx) {
    const { state, app } = this;
    const t = state.transport;
    const { y, h } = ROW2;
    const buttons = [
      ['stop', () => app.clock.stop(), !t.playing, C.ledRed],
      ['play', () => app.clock.play(), t.playing, C.ledGreen],
      ['rec', () => app.clock.setRec(!t.rec), t.rec, C.ledRed],
    ];
    let x = 8;
    for (const [kind, fn, on, color] of buttons) {
      const key = `stage.${kind}`;
      const held = on || hits.isPressed(key);
      const off = button(ctx, x, y, 36, h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
      icon(ctx, kind, x + 18, y + h / 2 + off, 11, kind === 'rec' || on ? color : C.inkLight);
      hits.rect(ctx, x, y, 36, h, click(fn, key));
      x += 40;
    }

    // Tempo: drag or scroll the readout (shift: 0.1 BPM), like the rack's.
    x += 6;
    lcd(ctx, x, y, 78, h);
    const tempo = t.tempo.toFixed(1).padStart(5, ' ');
    sevenSeg(ctx, tempo, x + (62 - sevenSegWidth(tempo, 10)) / 2, y + 5, 10, h - 10);
    text(ctx, COPY.tempo, x + 74, y + h / 2 + 0.5, { size: 5.5, weight: 800, align: 'right', color: C.lcdOn });
    hits.rect(ctx, x, y, 78, h, tempoDrag(state));

    x += 84;
    lcd(ctx, x, y, 72, h);
    const pos = `${String(t.bar).padStart(3, '0')}.${String(Math.max(0, t.step) + 1).padStart(2, '0')}`;
    sevenSeg(ctx, pos, x + (72 - sevenSegWidth(pos, 9)) / 2, y + 6, 9, h - 12);
    led(ctx, x + 80, y + h / 2, 2.6, t.playing && t.step % 4 === 0, C.ledYellow);
  }

  // A labelled button; returns its width. align 'right' lays it out leftwards from x.
  tab(ctx, x, row, label, on, fn, key, align = 'left', minW = 0) {
    const bw = Math.max(minW, textWidth(ctx, label, TAB) + 16);
    const bx = align === 'right' ? x - bw : x;
    const held = on || hits.isPressed(key);
    const off = button(ctx, bx, row.y, bw, row.h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
    text(ctx, label, bx + bw / 2, row.y + row.h / 2 + 0.5 + off, { ...TAB, color: on ? C.ledYellow : C.inkLight });
    hits.rect(ctx, bx, row.y, bw, row.h, click(fn, key));
    return bw;
  }
}


export const keysHint = (state) => COPY.keys(state.ui.octave);
