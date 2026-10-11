// A view lays out devices for one stage at a given size in design units.
// Each view class has static size(state) -> { min, stretch } and key(state),
// which changes whenever the view has to be rebuilt (not only resized).
import { ArrangeView, AutomateView, MixView, PatternsView } from './focus-view.js';
import { Rack } from './rack.js';

const VIEWS = { rack: Rack, patterns: PatternsView, arrange: ArrangeView, automate: AutomateView, mix: MixView };

export const viewClass = (state) => VIEWS[state.ui.stage] ?? Rack;
export const viewKey = (state) => viewClass(state).key(state);
