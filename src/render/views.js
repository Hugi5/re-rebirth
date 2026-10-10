// A view lays out devices for one stage at a given size in design units.
// Each view class has static size(state) -> { min, stretch } and key(state),
// which changes whenever the view has to be rebuilt (not only resized).
import { PatternsView } from './patterns-view.js';
import { Rack } from './rack.js';

const VIEWS = { rack: Rack, patterns: PatternsView };

export const viewClass = (state) => VIEWS[state.ui.stage] ?? Rack;
export const viewKey = (state) => viewClass(state).key(state);
export const zoomOf = (state) => state.ui.zoom?.[state.ui.stage] ?? 1;
// Anything that changes the canvas size or the devices on it.
export const layoutKey = (state) => `${viewKey(state)}@${zoomOf(state)}`;
