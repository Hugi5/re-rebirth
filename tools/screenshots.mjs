#!/usr/bin/env node
// README screenshots of every stage: TGV's KiloMix '98 playing, shot in a
// laptop-sized window. Drives the app through its ?tools hook (state + app),
// so no click positions to keep in sync with the layout.
//
//   node tools/screenshots.mjs [--size 1440x900] [--scale 1] [--out docs/screenshots]
//
// Uses the locally installed Chrome (override with CHROME=/path/to/chrome).
import { mkdirSync, statSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [W, H] = opt('--size', '1440x900').split('x').map(Number);
const SCALE = Number(opt('--scale', 1));
const OUT = opt('--out', 'docs/screenshots');
const BAR = 97; // a busy part of the song

// A fake MIDI controller, so the MIDI window has a device to show.
function fakeMidi() {
  const input = { name: 'Minilab3 MIDI', state: 'connected', onmidimessage: null };
  navigator.requestMIDIAccess = async () => ({ inputs: new Map([['minilab', input]]), onstatechange: null });
}

mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(fakeMidi);
  await page.goto(`${server.resolvedUrls.local[0]}?reset&tools`);
  await page.waitForFunction(() => window.reRebirth);
  // Runs `fn(state, app, arg)` in the page and redraws.
  const app = (fn, arg) =>
    page.evaluate(
      ([src, arg]) => {
        const { state, app } = window.reRebirth;
        const out = new Function('state', 'app', 'arg', `return (${src})(state, app, arg);`)(state, app, arg);
        app.redraw();
        return out;
      },
      [fn.toString(), arg],
    );
  const shot = async (name, wait = 1500) => {
    await page.mouse.move(W - 2, H - 2);
    await page.waitForTimeout(wait);
    const path = `${OUT}/${name}.png`;
    await page.screenshot({ path });
    console.log(`${path}  ${Math.round(statSync(path).size / 1024)} KB`);
  };

  await app(async (state, app) => {
    await app.files.openUrl('/songs/tgv-kilomix-98.rbs', "TGV's KiloMix '98.rbs");
  });
  await page.waitForTimeout(800);
  await app((state, app, bar) => {
    app.clock.seekTo(bar);
    app.clock.play();
  }, BAR);
  await shot('rack', 6000);

  await app((state) => Object.assign(state.ui, { stage: 'patterns', show: 'bass1' }));
  await shot('patterns');
  await app((state) => (state.ui.show = 'r909'));
  await shot('patterns-drums');
  await app((state) => Object.assign(state.ui, { show: 'bass2', picker: true }));
  await shot('pattern-picker');
  await app((state) => Object.assign(state.ui, { picker: false, help: true, show: 'bass1' }));
  await shot('keys', 600);

  // ARRANGE: about 48 bars around the playhead.
  await app((state, app, bar) => {
    Object.assign(state.ui, { help: false, stage: 'arrange', show: 'bass1' });
    state.ui.arrange = { from: (bar - 9) * 32, span: 48 * 32 };
  }, BAR);
  await shot('arrange');

  // AUTOMATE: a four-bar loop here, playing round.
  await app((state, app, bar) => {
    Object.assign(state.ui, { stage: 'automate', show: 'bass1' });
    Object.assign(state.song, { loopStart: (bar - 1) * 32, loopEnd: (bar + 3) * 32 });
    state.transport.loop = true;
  }, BAR);
  await shot('automate', 2500);

  await app((state) => Object.assign(state.ui, { stage: 'mix' }));
  await shot('mix', 2500);

  // The controller setup, a few steps in.
  await app(async (state, app) => {
    await app.midi.connect({ quiet: true });
    app.midi.startSetup();
    const w = state.ui.midiWindow;
    for (let i = 0; i < 5; i++) w.draft.knobs[i] = `0:${100 + i}`;
    w.step = 5;
  });
  await shot('midi-setup', 600);

  await app((state, app) => {
    state.ui.midiWindow = null;
    state.ui.stage = 'rack';
    app.clock.stop();
  });
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
} finally {
  await browser.close();
  await server.close();
}
