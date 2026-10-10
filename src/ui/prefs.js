// Preferences that outlive a song: stage, what the focus stages show, record mode.
const KEY = 're-rebirth.ui';
const FIELDS = ['stage', 'show', 'recMode'];

export function loadPrefs(ui) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    for (const f of FIELDS) if (saved[f] !== undefined) ui[f] = saved[f];
  } catch {
    // Private mode or a corrupt entry: keep the defaults.
  }
}

let saved = '';

// Cheap to call on every change: writes only when something differs.
export function savePrefs(ui) {
  const json = JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, ui[f]])));
  if (json === saved) return;
  saved = json;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // Storage full or unavailable: preferences just don't persist.
  }
}
