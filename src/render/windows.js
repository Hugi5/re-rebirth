import { drawAbout } from './about.js';
import { drawAutomation } from './automation.js';
import { drawLibrary } from './library.js';

// Windows are drawn after a view's devices so their hit regions take every click while open.
export function drawWindows(ctx, w, h, state, app) {
  if (state.ui.automation) drawAutomation(ctx, w, h, state, app);
  if (state.ui.library) drawLibrary(ctx, w, h, state, app);
  if (state.ui.about) drawAbout(ctx, w, h, state, app);
}
