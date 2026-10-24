// Preferences and UI state that outlive a song: stage, focus views, master view,
// drum grid modes, keyboard octave, arrange brushes, and rack play modes.
const KEY = 're-rebirth.ui';
const FIELDS = [
  'stage',
  'show',
  'recMode',
  'masterView',
  'grid',
  'octave',
  'picker',
  'brush',
  'rackMode',
  'arrange',
];

export function loadPrefs(ui) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const f of FIELDS) {
      if (saved[f] === undefined) continue;
      if (f === 'grid' && typeof saved.grid === 'object' && saved.grid !== null) {
        ui.grid = { ...ui.grid, ...saved.grid };
      } else if (f === 'brush' && typeof saved.brush === 'object' && saved.brush !== null) {
        ui.brush = { ...ui.brush, ...saved.brush };
      } else if (f === 'arrange' && typeof saved.arrange === 'object' && saved.arrange !== null) {
        ui.arrange = { ...saved.arrange };
      } else {
        ui[f] = saved[f];
      }
    }
  } catch {
    // Private mode or a corrupt entry: keep the defaults.
  }
}

let saved = '';

// Cheap to call on every change: writes only when something differs.
export function savePrefs(ui) {
  try {
    const data = Object.fromEntries(
      FIELDS.map((f) => [f, ui[f]])
    );
    const json = JSON.stringify(data);
    if (json === saved) return;
    saved = json;
    localStorage.setItem(KEY, json);
  } catch {
    // Storage full or unavailable: preferences just don't persist.
  }
}

