// Mixer channels: [device id, panel label]. Shared by the renderer and the audio graph.
export const CHANNELS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];

const LABELS = CHANNELS.map(([, label]) => label);

// Heard: machine on, channel not muted, and soloed if any channel is.
export const audibleChannel = (state, id, anySolo = CHANNELS.some(([c]) => state.on01(`mixer.${c}.solo`))) =>
  state.on01(`${id}.on`) && !state.on01(`mixer.${id}.mute`) && (!anySolo || state.on01(`mixer.${id}.solo`));

// Routing choices for the single-instance effects, stored as choice params.
export const COMP_TARGETS = ['MASTER', ...LABELS];
export const PCF_TARGETS = ['OFF', ...LABELS];
