// The focus stages' instrument rail: one strip per machine, top to bottom, so
// you see what's sounding and pick what's shown big. Each strip: an ON LED,
// a level bar beside the machine's name (click either to show the machine),
// and the playing pattern.
import { hits } from '../../ui/hits.js';
import { click, toggle } from '../../ui/handlers.js';
import { lcd, led, panel, rgba, rrect, sevenSeg, sevenSegWidth, text, vgrad } from '../primitives.js';
import { C } from '../theme.js';

export const RAIL_W = 44;
export const RAIL_STRIPS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];
const GAP = 4;
const LED_H = 14;
const LCD_H = 14;
const BANKS = 'ABCD';

export class Rail {
  constructor(state, app, x, y, w, h) {
    Object.assign(this, { state, app, x, y, w, h });
  }

  draw(ctx) {
    const sh = (this.h - GAP * (RAIL_STRIPS.length - 1)) / RAIL_STRIPS.length;
    RAIL_STRIPS.forEach(([id, name], i) => {
      ctx.save();
      ctx.translate(0, i * (sh + GAP));
      this.drawStrip(ctx, id, name, sh);
      ctx.restore();
    });
  }

  drawStrip(ctx, id, name, h) {
    const { state, w } = this;
    const shown = state.ui.show === id;
    const on = state.on01(`${id}.on`);
    panel(ctx, 0, 0, w, h, C.transport);
    if (shown) {
      rrect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 2);
      ctx.strokeStyle = C.ledYellow;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ON: the machine's own switch, as on its panel.
    led(ctx, w / 2, LED_H / 2 + 2, 2.6, on, C.ledGreen);
    hits.rect(ctx, 0, 0, w, LED_H + 2, toggle(state, `${id}.on`));

    // Name (vertical) and level; clicking here shows the machine.
    const top = LED_H + 3;
    const bottom = h - LCD_H - 5;
    const mh = bottom - top;
    ctx.save();
    ctx.translate(11, top + mh / 2);
    ctx.rotate(-Math.PI / 2);
    text(ctx, name, 0, 0.5, { size: Math.min(6.5, mh / 5), weight: 800, color: shown ? C.ledYellow : on ? C.inkLight : C.inkMuted, spacing: 0.4 });
    ctx.restore();
    const [l, r] = state.meters[id] ?? [0, 0];
    this.drawLevel(ctx, 20, top, 6, mh, l);
    this.drawLevel(ctx, 29, top, 6, mh, r);
    hits.rect(ctx, 0, top, w, mh, click(() => (state.ui.show = id), `rail.${id}`));

    // Pattern playing (or queued, blinking).
    const dev = state.device(id);
    const blink = state.transport.step % 4 < 2;
    const index = dev.queued !== null && blink ? dev.queued : dev.bank * 8 + dev.pattern;
    const label = `${BANKS[Math.floor(index / 8)]}${(index % 8) + 1}`;
    const ly = h - LCD_H - 3;
    lcd(ctx, 5, ly, w - 10, LCD_H);
    sevenSeg(ctx, label, 5 + (w - 10 - sevenSegWidth(label, 6)) / 2, ly + 2.5, 6, LCD_H - 5);
  }

  // One meter channel: a continuous bar, green to yellow to red.
  drawLevel(ctx, x, y, w, h, level) {
    rrect(ctx, x, y, w, h, 1.5);
    ctx.fillStyle = '#060607';
    ctx.fill();
    const lh = Math.min(1, level) * h;
    if (lh <= 0) return;
    ctx.save();
    rrect(ctx, x, y, w, h, 1.5);
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, y + h, y, [C.ledGreen, C.ledGreen, C.ledYellow, C.ledRed]);
    ctx.fillRect(x, y + h - lh, w, lh);
    ctx.fillStyle = rgba('#ffffff', 0.18);
    ctx.fillRect(x, y + h - lh, w * 0.35, lh);
    ctx.restore();
  }
}
