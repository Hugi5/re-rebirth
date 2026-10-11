// The "/" overlay: the keyboard shortcuts that work right here, read from the
// same table that handles them (ui/shortcuts.js), most specific group first.
import { shortcutGroups } from '../ui/shortcuts.js';
import { hits } from '../ui/hits.js';
import { click } from '../ui/handlers.js';
import { MONO, panel, px, rrect, text, textWidth } from './primitives.js';
import { C } from './theme.js';

// Big on purpose: it's read from a playing position, not leaned into.
const PAD = 18;
const ROW_H = 15;
const HEAD_H = 22;
const GROUP_GAP = 10;
const COL_GAP = 28;
const KEY = { size: 9.5, weight: 800, family: MONO, align: 'left', color: C.ledYellow };
const LABEL = { size: 9.5, weight: 600, align: 'left', color: C.inkLight };
const HEAD = { size: 8.5, weight: 900, align: 'left', color: C.inkMuted, spacing: 1.2 };
const COPY = { title: 'KEYBOARD', footer: 'PRESS / OR ESC TO CLOSE' };

export function drawShortcuts(ctx, viewW, viewH, state, app) {
  const groups = shortcutGroups(state, app).map((g) => ({ ...g, items: g.items.filter((i) => i.keys) }));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  hits.rect(ctx, 0, 0, viewW, viewH, { ...click(() => (state.ui.help = false)), cursor: 'default' });

  // Two columns, filled in order, the first taking groups until it holds about half.
  const height = (g) => HEAD_H + g.items.length * ROW_H + GROUP_GAP;
  const total = groups.reduce((s, g) => s + height(g), 0);
  const cols = [[], []];
  let acc = 0;
  for (const g of groups) {
    (acc < total / 2 ? cols[0] : cols[1]).push(g);
    acc += height(g);
  }
  const keyW = Math.max(...groups.flatMap((g) => g.items.map((i) => textWidth(ctx, i.keys, KEY)))) + 14;
  const labelW = Math.max(...groups.flatMap((g) => g.items.map((i) => textWidth(ctx, i.label, LABEL))));
  const colW = keyW + labelW;
  const colH = cols.map((c) => c.reduce((s, g) => s + height(g), 0));
  const W = PAD * 2 + colW * 2 + COL_GAP;
  const H = 36 + Math.max(...colH) + 18;
  // As large as the window allows: fills it, whatever the view's own scale.
  const s = Math.min((viewW * 0.96) / W, (viewH * 0.96) / H);

  ctx.save();
  ctx.translate((viewW - W * s) / 2, (viewH - H * s) / 2);
  ctx.scale(s, s);
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  text(ctx, COPY.title, PAD, 19, { size: 11, weight: 900, align: 'left', spacing: 1.6 });
  text(ctx, COPY.footer, W - PAD, 19, { size: 7.5, weight: 700, align: 'right', color: C.inkMuted, spacing: 0.6 });
  cols.forEach((col, c) => {
    let y = 40;
    const x = PAD + c * (colW + COL_GAP);
    for (const g of col) {
      text(ctx, g.title, x, y + 7, HEAD);
      rrect(ctx, x, y + 14, colW, px(1), 0);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      y += HEAD_H;
      for (const item of g.items) {
        text(ctx, item.keys, x, y + ROW_H / 2, KEY);
        text(ctx, item.label, x + keyW, y + ROW_H / 2, LABEL);
        y += ROW_H;
      }
      y += GROUP_GAP;
    }
  });
  ctx.restore();
}
