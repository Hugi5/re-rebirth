// View preferences that outlive a song: stage, what PATTERNS shows, zoom.
const KEY = 're-rebirth.ui';
const FIELDS = ['stage', 'show', 'zoom'];

export function loadPrefs(ui) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    for (const f of FIELDS) if (saved[f] !== undefined) ui[f] = saved[f];
  } catch {
    // Private mode or a corrupt entry: keep the defaults.
  }
}

export function savePrefs(ui) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, ui[f]]))));
  } catch {
    // Storage full or unavailable: preferences just don't persist.
  }
}
