import './style.css';
import { AudioEngine } from './audio/engine.js';
import { loadDemo } from './demo.js';
import { addedMessage, closeLibrary, openLibrary, SEARCH_PLACEHOLDER } from './render/library.js';
import { Rack } from './render/rack.js';
import { viewClass, viewKey } from './render/views.js';
import { Clock } from './sequencer/clock.js';
import { Files } from './song/files.js';
import { collectDropped, Library } from './song/library.js';
import { State } from './state.js';
import { hits } from './ui/hits.js';
import { canvasInput } from './ui/canvas-input.js';
import { attachPointer } from './ui/pointer.js';
import { loadPrefs, savePrefs } from './ui/prefs.js';
import { stepKey } from './ui/step-keys.js';

const canvas = document.getElementById('rack');
const ctx = canvas.getContext('2d');
const state = new State();
const engine = new AudioEngine(state);
const clock = new Clock(state, engine);
const library = new Library(() => requestRender());
// Every song that's opened or dropped ends up in the library too.
const remember = async (file) => {
  const { ids } = await library.add([file]);
  return ids[0];
};
const files = new Files(state, {
  beforeLoad: () => clock.t.playing && clock.stop(),
  onLoaded: (_, file) => {
    notify(state.info.title || state.info.file || 'Loaded');
    library.current = null;
    if (file) remember(file).then((id) => (library.current = id));
    requestRender();
  },
  onError: (err, file) => {
    console.error(err);
    // The song display fits ~50 characters: show the reason, not the file name.
    notify(`Can't open: ${err.message}`);
    if (file instanceof Blob) remember(file);
  },
});
const app = { clock, engine, files, library, notify, toggleFullscreen };
// Controls register their parameter defaults here, so build the whole rack
// before loading, whatever stage is shown.
let view = new Rack(state, app);
let viewScale = 1;
let chromeScale = 1;

if (!files.restore()) loadDemo(state);
loadPrefs(state.ui);

let frame = 0;

const search = canvasInput(canvas, {
  placeholder: SEARCH_PLACEHOLDER,
  onInput: (value) => {
    if (!state.ui.library) return;
    Object.assign(state.ui.library, { query: value, y: 0 });
    requestRender();
  },
});

function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function notify(message) {
  state.notice = { text: message.toUpperCase(), until: performance.now() + 4000 };
  setTimeout(requestRender, 4100);
  requestRender();
}

function render() {
  frame = 0;
  // A stage or SHOW change: lay out again (resize renders).
  if (viewKey(state) !== view.key) return resize();
  // Draw in design units; the transform handles window scale + HiDPI. One exact
  // scale for both axes (not canvas size / view size, which carries rounding),
  // so the stage bar lands on the same pixels whichever devices are below it.
  const dpr = window.devicePixelRatio || 1;
  const s = viewScale * dpr;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  hits.clear();
  // Chrome gets its own exact scale too (view scale x k would differ in the
  // last bits per stage, and with it the anti-aliasing).
  view.draw(ctx, { chromeScale: (view.k === view.chromeScale ? chromeScale : viewScale * view.k) * dpr });
  const lib = state.ui.library;
  search.place(lib?.search ?? null, view.width, lib?.query ?? '');
}

// Pushes knob changes to the audio graph and pulls playhead/meter updates back.
function animate() {
  engine.sync();
  const moved = clock.update();
  const metered = engine.updateMeters();
  if (moved || metered) requestRender();
  requestAnimationFrame(animate);
}

// Fill the window: one uniform scale (fit the tighter dimension, never below
// the view's minScale, 1:1 for the rack), and the view is rebuilt wider or
// taller to use the rest, up to its stretch limit. Smaller windows scroll,
// like the original rack did.
// A view's chrome (the stage bar, `chrome` units tall above the devices) is
// scaled to fit the view's `reference` layout (chrome included), so it keeps
// one size on screen while the devices under it change; the devices fit the
// room left under it.
function resize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const View = viewClass(state);
  const { min, stretch, chrome = 0, chromeW = 0, minScale = 1, reference = { w: min.w, h: min.h + chrome } } = View.size(state);
  const chromeFit = Math.max(minScale, Math.min(W / reference.w, H / reference.h));
  const free = H - chrome * chromeFit;
  const scale = Math.max(minScale, Math.min(W / min.w, free / min.h));
  const k = chromeFit / scale;
  // Never narrower than the chrome needs at its scale, even past the stretch limit.
  const floorW = Math.max(min.w, chromeW * k);
  // Fractional on purpose: a view that fills the window then measures exactly
  // W x H CSS pixels, whatever its scale.
  const width = Math.min(Math.max(min.w * stretch.w, floorW), Math.max(floorW, W / scale));
  const height = Math.min(min.h * stretch.h, Math.max(min.h, free / scale)) + chrome * k;
  const stale = width !== view.width || height !== view.height || viewKey(state) !== view.key || (chrome && k !== view.chromeScale);
  if (stale) view = new View(state, app, width, height, k);
  viewScale = scale;
  chromeScale = chromeFit;
  // The epsilon keeps float error (1439.9999) from losing a pixel.
  const cssW = Math.floor(view.width * scale + 1e-6);
  const cssH = Math.floor(view.height * scale + 1e-6);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  render();
}

// Moving the window to a display with a different pixel ratio doesn't fire resize.
function watchPixelRatio() {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
    'change',
    () => {
      resize();
      watchPixelRatio();
    },
    { once: true },
  );
}

window.addEventListener('keydown', (e) => {
  // Typing in the search field: Escape clears it first, other keys are just text.
  if (e.target === search.input) {
    if (e.code !== 'Escape') return;
    if (search.input.value) {
      e.preventDefault();
      search.input.value = '';
      search.input.dispatchEvent(new Event('input'));
      return;
    }
  }
  if (e.code === 'Escape' && (state.ui.about || state.ui.library || state.ui.automation)) {
    if (state.ui.about) state.ui.about = false;
    else if (state.ui.library) closeLibrary(state);
    else state.ui.automation = null;
    requestRender();
    return;
  }
  // Only reaches us in full screen when Escape is locked (see toggleFullscreen).
  if (e.code === 'Escape' && isFullscreen()) {
    toggleFullscreen();
    return;
  }
  if (stepKey(e, state, engine)) {
    e.preventDefault();
    requestRender();
    files.autosave();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
    toggleFullscreen();
    return;
  }
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  clock.toggle();
  requestRender();
});

const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

// Safari before 16.4 only has the prefixed API; iPhone has none for pages.
// Chromium can lock Escape in full screen, so it closes our windows first and
// leaves full screen only from the rack (holding Escape still always exits).
// Elsewhere Escape leaves full screen straight away, as the browser decides.
function toggleFullscreen() {
  const root = document.documentElement;
  if (isFullscreen()) {
    (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
    return;
  }
  const entered = (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root);
  Promise.resolve(entered)
    .then(() => navigator.keyboard?.lock?.(['Escape']))
    .catch(() => { });
}

// Every user edit goes through the pointer; autosave is debounced.
// A click on the rack (say, a song in the library) leaves the search field, so
// Space plays again.
canvas.addEventListener('pointerdown', () => search.input.blur());
attachPointer(canvas, () => {
  requestRender();
  files.autosave();
  savePrefs(state.ui);
});
// Drop anywhere: one song file opens it; several files or folders go to the library.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const { files: dropped, folders } = await collectDropped(e.dataTransfer);
  if (!dropped.length) return notify(folders ? 'No songs in the dropped folder' : 'Nothing to open');
  if (!folders && dropped.length === 1) return files.open(dropped[0]);
  openLibrary(state);
  notify(addedMessage(await library.add(dropped)));
});
// iOS only lets audio start inside a completed tap, and our buttons act on
// pointerdown; resume a suspended engine when the finger lifts.
canvas.addEventListener('pointerup', () => {
  if (engine.ctx?.state === 'suspended') engine.ctx.resume();
});
window.addEventListener('resize', resize);
watchPixelRatio();
resize();
animate();
