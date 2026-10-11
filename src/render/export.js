// EXPORT WAV window: renders the song, the A-B loop or the current patterns
// offline with the real engine, then hands over the file (download, or the
// share sheet on iPad/iPhone).
import { renderSession, wavBlob } from '../audio/offline.js';
import { shareFiles } from '../song/library.js';
import { serialize } from '../song/session.js';
import { songBars, TICKS_PER_BAR } from '../song/song.js';
import { hits } from '../ui/hits.js';
import { click, release } from '../ui/handlers.js';
import { brushed, button, lcd, led, MONO, panel, rrect, screws, text, vgrad } from './primitives.js';
import { C } from './theme.js';

const W = 360;
const H = 196;
const PATTERN_BARS = [4, 8, 16, 32];
const TAIL = 2; // seconds after the last bar, for delay and decay tails
const COPY = {
  title: 'EXPORT WAV',
  what: 'WHAT',
  song: 'WHOLE SONG',
  loop: 'LOOP A\u2013B',
  patterns: 'PATTERNS',
  bars: 'BARS',
  render: 'RENDER',
  rendering: 'RENDERING\u2026',
  save: 'SAVE WAV',
  close: 'CLOSE',
  again: 'RENDER AGAIN',
  noSong: 'NO SONG YET: RECORD ONE, OR EXPORT THE PATTERNS',
  summary: (bars, secs) => `${bars} BARS \u00B7 ${formatTime(secs)} \u00B7 48 KHZ 16-BIT STEREO`,
  done: (peak) => `DONE \u00B7 PEAK ${peak > -0.05 ? '0.0' : peak.toFixed(1)} DBFS${peak > -0.05 ? ' \u00B7 CLIPPED, TURN THE MASTER DOWN' : ''}`,
  failed: (msg) => `FAILED: ${msg}`.toUpperCase(),
};

// iPad and iPhone can't download into a folder: they get the share sheet
// (Save to Files, AirDrop...). Desktops download. iPadOS reports itself as a Mac.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function saveFile(file) {
  if (isIOS()) return shareFiles([file]);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function openExport(state) {
  const { song } = state;
  const range = song.length ? 'song' : 'patterns';
  state.ui.export = { range, bars: 8, status: 'idle', progress: 0, file: null, peak: 0, error: '' };
}

export const closeExport = (state) => (state.ui.export = null);

// What a range covers: { startBar, bars, mode } or null when it's not available.
function rangeOf(state, view) {
  const { song } = state;
  if (view.range === 'song') return song.length ? { startBar: 1, bars: songBars(song), mode: 'song' } : null;
  if (view.range === 'loop') {
    if (song.loopEnd <= song.loopStart) return null;
    return { startBar: song.loopStart / TICKS_PER_BAR + 1, bars: (song.loopEnd - song.loopStart) / TICKS_PER_BAR, mode: 'song' };
  }
  return { startBar: 1, bars: view.bars, mode: 'pattern' };
}

const fileName = (state, view) => {
  const { info } = state;
  const base = (info.title || info.file.replace(/\.[^.]+$/, '') || 'untitled').replace(/[\\/:*?"<>|]+/g, '_');
  return `${base}${view.range === 'song' ? '' : view.range === 'loop' ? ' (loop)' : ' (patterns)'}.wav`;
};

async function render(state, app) {
  const view = state.ui.export;
  const range = rangeOf(state, view);
  if (!range) return;
  Object.assign(view, { status: 'rendering', progress: 0, file: null, error: '' });
  app.redraw();
  try {
    const session = serialize(state);
    const prepare = (s) => Object.assign(s.transport, { mode: range.mode, loop: false });
    const onProgress = (p) => {
      view.progress = p;
      app.redraw();
    };
    const { buffer } = await renderSession(session, { startBar: range.startBar, bars: range.bars, tail: TAIL, prepare, onProgress });
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) for (const s of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
    const file = new File([wavBlob(buffer)], fileName(state, view), { type: 'audio/wav' });
    if (state.ui.export === view) Object.assign(view, { status: 'done', file, peak: 20 * Math.log10(peak || 1e-9) });
  } catch (err) {
    console.error(err);
    Object.assign(view, { status: 'error', error: err.message });
  }
  app.redraw();
}

export function drawExport(ctx, rackW, rackH, state, app) {
  const view = state.ui.export;
  const busy = view.status === 'rendering';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, rackW, rackH);
  hits.rect(ctx, 0, 0, rackW, rackH, { ...click(() => !busy && closeExport(state)), cursor: 'default' });

  ctx.save();
  ctx.translate(Math.round((rackW - W) / 2), Math.round((rackH - H) / 2));
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  brushed(ctx, 0, 0, W, H, 0.35);
  ctx.fillStyle = vgrad(ctx, 0, 18, C.bassHeader);
  ctx.fillRect(0, 0, W, 18);
  led(ctx, 16, 9, 2.3, true, busy ? C.ledRed : C.ledGreen);
  text(ctx, COPY.title, 24, 9.5, { size: 7.5, weight: 900, align: 'left', spacing: 1.6 });
  const name = (state.info.title || state.info.file || 'UNTITLED').toUpperCase();
  text(ctx, name.length > 34 ? `${name.slice(0, 33)}\u2026` : name, 104, 9.5, { size: 6, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.6 });
  screws(ctx, W, H, 7, 26);

  // What to render
  const label = { size: 6, color: C.inkMuted, spacing: 1, align: 'left' };
  text(ctx, COPY.what, 24, 40, label);
  const options = [
    ['song', COPY.song],
    ['loop', COPY.loop],
    ['patterns', COPY.patterns],
  ];
  let x = 24;
  for (const [range, text_] of options) {
    const available = !!rangeOf(state, { ...view, range });
    x += option(ctx, x, 48, 96, text_, view.range === range, available && !busy ? () => Object.assign(view, { range, status: 'idle', file: null }) : null, `export.${range}`) + 6;
  }
  if (view.range === 'patterns') {
    text(ctx, COPY.bars, 24, 84, label);
    x = 60;
    for (const bars of PATTERN_BARS) {
      x += option(ctx, x, 76, 34, String(bars), view.bars === bars, busy ? null : () => Object.assign(view, { bars, status: 'idle', file: null }), `export.bars.${bars}`) + 6;
    }
  }

  // Readout: what it'll be, progress, or the result
  const range = rangeOf(state, view);
  lcd(ctx, 24, 104, W - 48, 30, C.lcdGreen);
  const mono = { size: 6.5, weight: 700, family: MONO, color: C.lcdGreenOn };
  if (!range) {
    text(ctx, COPY.noSong, W / 2, 119.5, { ...mono, color: C.lcdGreenMid });
  } else {
    const secs = (range.bars * 16 * 60) / state.transport.tempo / 4 + TAIL;
    text(ctx, COPY.summary(range.bars, secs), W / 2, 113, mono);
    const line2 = view.status === 'rendering' ? null : view.status === 'done' ? COPY.done(view.peak) : view.status === 'error' ? COPY.failed(view.error) : '';
    if (line2 !== null) text(ctx, line2, W / 2, 125.5, { ...mono, size: 6, color: view.status === 'error' || view.peak > -0.05 ? C.ledYellow : C.lcdGreenMid });
    else {
      rrect(ctx, 34, 122, W - 68, 6, 2);
      ctx.fillStyle = 'rgba(121,255,99,0.12)';
      ctx.fill();
      rrect(ctx, 34, 122, (W - 68) * view.progress, 6, 2);
      ctx.fillStyle = C.lcdGreenOn;
      ctx.fill();
    }
  }

  // Actions
  const by = 150;
  const closeW = 70;
  const mainW = 130;
  const gap = 10;
  const bx = (W - mainW - gap - closeW) / 2;
  if (view.status === 'done') {
    // Share/download needs the release of a tap on iOS (see `release`).
    actionButton(ctx, bx, by, mainW, COPY.save, release(() => saveFile(view.file), 'export.save'), 'export.save', true);
  } else {
    const label_ = busy ? COPY.rendering : view.status === 'idle' ? COPY.render : COPY.again;
    actionButton(ctx, bx, by, mainW, label_, range && !busy ? click(() => render(state, app), 'export.render') : null, 'export.render', !!range && !busy);
  }
  actionButton(ctx, bx + mainW + gap, by, closeW, COPY.close, busy ? null : click(() => closeExport(state), 'export.close'), 'export.close', !busy);
  if (view.status === 'done') {
    const again = click(() => render(state, app), 'export.again');
    text(ctx, COPY.again, W / 2, by + 34, { size: 5.5, weight: 800, color: C.inkMuted, spacing: 0.6 });
    hits.rect(ctx, W / 2 - 34, by + 28, 68, 12, again);
  }
  ctx.restore();
}

function option(ctx, x, y, w, label, on, fn, key) {
  const h = 18;
  const held = on || hits.isPressed(key);
  const off = button(ctx, x, y, w, h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
  led(ctx, x + 7, y + h / 2 + off, 1.9, on, C.ledYellow);
  text(ctx, label, x + 7 + (w - 7) / 2, y + h / 2 + 0.5 + off, { size: 6.5, weight: 800, spacing: 0.4, color: fn || on ? C.inkLight : C.inkMuted });
  if (fn) hits.rect(ctx, x, y, w, h, click(fn, key));
  return w;
}

function actionButton(ctx, x, y, w, label, handler, key, enabled) {
  const off = button(ctx, x, y, w, 22, { pressed: hits.isPressed(key) });
  text(ctx, label, x + w / 2, y + 11.5 + off, { size: 7, weight: 800, spacing: 1, color: enabled ? C.inkLight : C.inkMuted });
  if (handler) hits.rect(ctx, x, y, w, 22, handler);
}
