#!/usr/bin/env node
// A video of a song playing in the app, switching views, for YouTube & co.
//
//   node tools/video.mjs <song.rbs|session.json> [out.mp4] [--size 1920x1080] [--seconds N] [--keep]
//
// --seconds N: only the first N seconds (a quick preview).
//
// 1. The sound is rendered offline with the real engine (clean, no dropouts).
// 2. The picture is the app playing the same song live in headless Chrome,
//    recorded as timestamped frames (Chrome's screencast, ~30 fps), with the
//    views cycling (see VIEWS). Song mode stays on in every view.
// 3. ffmpeg joins them, aligned on the moment bar 1 is heard: 1080p30 H.264
//    and 320 kbps AAC.
// The recording runs in real time, so a 5-minute song takes 5 minutes plus
// rendering and encoding. Work files go to tmp/video-<name>/; the frames are
// removed after encoding unless --keep. Needs ffmpeg and the local Chrome
// (CHROME=/path/to/chrome to override).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const files = args.filter((a, i) => !a.startsWith('--') && !['--size', '--seconds'].includes(args[i - 1]));
const [song, outArg] = files;
if (!song) {
  console.error('usage: node tools/video.mjs <song.rbs|session.json> [out.mp4] [--size 1920x1080] [--seconds N] [--keep]');
  process.exit(1);
}
const [W, H] = opt('--size', '1920x1080').split('x').map(Number);
const KEEP = args.includes('--keep');
const LIMIT = Number(opt('--seconds', 0));
const name = basename(song).replace(/(\.rbs|\.json)+.*$/i, '').replace(/[^\w-]+/g, '-');
const WORK = `tmp/video-${name}`;
const FRAMES = `${WORK}/frames`;
const OUT = outArg ?? `${WORK}/${name}.mp4`;
const TAIL = 3; // seconds after the last bar
const START_DELAY = 0.05; // the clock starts this far ahead (sequencer/clock.js)

// Views in order, seconds each, repeated; the last 30 s are the rack.
const VIEWS = [
  ['rack', 'bass1', 28],
  ['patterns', 'bass1', 24],
  ['patterns', 'bass2', 24],
  ['patterns', 'r808', 20],
  ['patterns', 'r909', 20],
  ['picker', 'bass1', 14],
  ['arrange', 'bass1', 30],
  ['automate', 'bass1', 24],
  ['automate', 'r808', 20],
  ['mix', 'bass1', 30],
];
const OUTRO = 30;

const bytes = [...readFileSync(song)];
mkdirSync(WORK, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });

// Offline render of the whole song, loop off, to a 16-bit WAV.
async function renderAudio() {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${base}tools/render.html`);
  await page.waitForFunction(() => window.renderReady);
  const info = await page.evaluate(
    async ([bytes, fileName, tail]) => {
      const { renderSession, pcm16 } = await import('/src/audio/offline.js');
      const { isRbs, parseRbs } = await import('/src/song/rbs.js');
      const buffer = new Uint8Array(bytes).buffer;
      const session = isRbs(buffer) ? parseRbs(buffer, fileName) : JSON.parse(new TextDecoder().decode(buffer));
      const bars = session.song.length / 32;
      const out = await renderSession(session, { startBar: 1, bars, tail, prepare: (s) => (s.transport.loop = false) });
      window.pcm = new Uint8Array(pcm16(out.buffer).buffer);
      return { bars, tempo: out.tempo, length: window.pcm.length, rate: out.buffer.sampleRate };
    },
    [bytes, basename(song), TAIL],
  );
  if (!info.bars) throw new Error('the song has no arrangement (song length 0)');
  // In slices: one string of a whole song's PCM is too much for the bridge.
  const chunks = [];
  const CHUNK = 6 * 1024 * 1024;
  for (let i = 0; i < info.length; i += CHUNK) {
    const b64 = await page.evaluate(
      ([i, n]) => {
        const part = window.pcm.subarray(i, i + n);
        let bin = '';
        for (let j = 0; j < part.length; j += 0x8000) bin += String.fromCharCode(...part.subarray(j, j + 0x8000));
        return btoa(bin);
      },
      [i, CHUNK],
    );
    chunks.push(Buffer.from(b64, 'base64'));
  }
  await page.close();
  const pcm = Buffer.concat(chunks);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(info.rate, 24);
  h.writeUInt32LE(info.rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  writeFileSync(`${WORK}/audio.wav`, Buffer.concat([h, pcm]));
  return info;
}

// The app playing the song live, views cycling, as timestamped JPEG frames.
async function recordFrames() {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?reset&tools`);
  await page.waitForFunction(() => window.reRebirth);
  const seconds = await page.evaluate(
    async ([bytes, fileName]) => {
      const { state, app } = window.reRebirth;
      await app.files.open(new File([new Uint8Array(bytes)], fileName));
      state.transport.loop = false;
      app.clock.setMode('song');
      // Song mode in every view (PATTERNS would switch to pattern mode).
      app.clock.setMode = () => { };
      // Redraw every frame: the screencast only sends frames when the screen
      // changes, and a steady stream keeps the timing even. ARRANGE follows
      // the playhead: 48 bars in view, the playhead a quarter in.
      const follow = () => {
        if (state.ui.stage === 'arrange') {
          const t = state.transport;
          const tick = (t.bar - 1) * 32 + Math.max(0, t.step) * 2;
          state.ui.arrange = { from: Math.max(0, tick - 12 * 32), span: 48 * 32 };
        }
        app.redraw();
        requestAnimationFrame(follow);
      };
      follow();
      return ((state.song.length / 32) * 16 * 60) / state.transport.tempo / 4;
    },
    [bytes, basename(song)],
  );
  await page.mouse.move(W - 1, H - 1);
  await page.waitForTimeout(5000); // the song title notice fades

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `${FRAMES}/${String(frames.length).padStart(6, '0')}.jpg`;
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => { });
  });
  // Every second compositor frame: ~30 fps, half the disk space of 60.
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 2 });
  // Chrome can take a few seconds to start sending: play only once frames flow.
  const t0 = Date.now();
  while (frames.length < 30) {
    if (Date.now() - t0 > 30000) throw new Error('no frames from the screencast');
    await page.waitForTimeout(100);
  }

  // Play, and work out when bar 1 is heard, in the frames' clock (epoch ms).
  const start = await page.evaluate((delay) => {
    const { app } = window.reRebirth;
    const ctx = app.engine.start();
    const audible = ctx.currentTime + delay;
    app.clock.play();
    const ts = ctx.getOutputTimestamp();
    return performance.timeOrigin + ts.performanceTime + (audible - ts.contextTime) * 1000;
  }, START_DELAY);

  const show = (stage, id) =>
    page.evaluate(
      ([stage, id]) => {
        const { state, app } = window.reRebirth;
        Object.assign(state.ui, { stage: stage === 'picker' ? 'patterns' : stage, show: id, picker: stage === 'picker' });
        app.redraw();
      },
      [stage, id],
    );
  const end = LIMIT ? Math.min(LIMIT, seconds + TAIL) : seconds + TAIL;
  let at = 0;
  while (at < end - OUTRO) {
    for (const [stage, id, dur] of VIEWS) {
      if (at >= end - OUTRO) break;
      await show(stage, id);
      const d = Math.min(dur, end - OUTRO - at);
      await page.waitForTimeout(start + (at + d) * 1000 - Date.now());
      at += d;
      process.stdout.write(`\r  ${Math.round(at)} / ${Math.round(end)} s`);
    }
  }
  await show('rack', 'bass1');
  await page.waitForTimeout(start + end * 1000 - Date.now());
  await cdp.send('Page.stopScreencast');
  await page.close();
  process.stdout.write('\n');

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  return { start, end, frames };
}

// Frames from bar 1 on (each held until the next), with the audio, to MP4.
function encode({ start, end, frames }) {
  let first = frames.findIndex((f) => f.t > start) - 1;
  if (first < 0) first = 0;
  const lines = ['ffconcat version 1.0'];
  for (let i = first; i < frames.length; i++) {
    // The first frame is held from bar 1, so the picture can't start late.
    const from = i === first ? start : frames[i].t;
    const to = i + 1 < frames.length ? frames[i + 1].t : from + 1000 / 30;
    lines.push(`file '${resolve(frames[i].file)}'`, `duration ${((to - from) / 1000).toFixed(6)}`);
  }
  writeFileSync(`${WORK}/frames.ffconcat`, `${lines.join('\n')}\n`);
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error', '-stats',
      '-f', 'concat', '-safe', '0', '-i', `${WORK}/frames.ffconcat`,
      // The offline render starts START_DELAY in, like live playback.
      '-ss', String(START_DELAY), '-i', `${WORK}/audio.wav`,
      '-map', '0:v', '-map', '1:a',
      '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation',
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
      '-t', String(end), '-movflags', '+faststart', OUT,
    ],
    { stdio: 'inherit' },
  );
}

try {
  console.log(`${song}\n1/3 rendering the sound…`);
  const info = await renderAudio();
  console.log(`  ${info.bars} bars at ${info.tempo} BPM, ${(info.length / 4 / info.rate).toFixed(1)} s`);
  console.log('2/3 recording the picture (real time)…');
  const rec = await recordFrames();
  console.log(`  ${rec.frames.length} frames`);
  console.log('3/3 encoding…');
  encode(rec);
  if (!KEEP) rmSync(FRAMES, { recursive: true, force: true });
  console.log(OUT);
} finally {
  await browser.close();
  await server.close();
}
