// Sample-backed TR-808 voices. The synthesized voices remain the fallback if
// the sample manifest or individual files cannot be loaded.
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const levelCurve = (x) => x * x * 1.3;

const ALTS = {
  lt: 'lc',
  mt: 'mc',
  ht: 'hc',
  rs: 'cl',
  cp: 'ma',
};

const PARAMS = {
  bd: ['tone', 'decay'], sd: ['tone', 'snappy'],
  lt: ['tune'], mt: ['tune'], ht: ['tune'],
  lc: ['tune'], mc: ['tune'], hc: ['tune'],
  cy: ['tone', 'decay'], oh: ['decay'],
};
const KNOBS = {
  bd: { tone: 'tone', decay: 'decay' }, sd: { tone: 'tone', snappy: 'snappy' },
  lt: { tune: 'tuning' }, mt: { tune: 'tuning' }, ht: { tune: 'tuning' },
  lc: { tune: 'tuning' }, mc: { tune: 'tuning' }, hc: { tune: 'tuning' },
  cy: { tone: 'tone', decay: 'decay' }, oh: { decay: 'decay' },
};
const TRIM = {
  bd: 0.8, sd: 0.85,
  lt: 1.1, mt: 1.1, ht: 1.1,
  lc: 1.1, mc: 1.1, hc: 1.1,
  rs: 0.9, cl: 0.9,
  cp: 0.9, ma: 0.9,
  cb: 0.9, cy: 0.75, ch: 1.1, oh: 0.9,
};

function desired(track, param, P) {
  const knob = KNOBS[track]?.[param];
  if (knob) {
    const val = P(knob) ?? P(param);
    if (val != null) return clamp(val) * 100;
  }
  return 50;
}
function selectSample(track, P, v, candidates) {
  if (!candidates?.length) return null;
  if (['rs', 'cp', 'cb', 'ch', 'cl', 'ma'].includes(track)) {
    // Shot-numbered files represent captured hit/accent variations. Select
    // near the current accent and add a little deterministic spread per hit.
    const max = Math.max(...candidates.map((x) => x.params.shot ?? 0));
    const target = clamp((v.acc - 1) / 0.5) * max;
    return candidates.reduce((best, item) =>
      Math.abs((item.params.shot ?? 0) - target) < Math.abs((best.params.shot ?? 0) - target) ? item : best
    );
  }
  const params = PARAMS[track] ?? [];
  if (!params.length) return candidates[0];
  return candidates.reduce((best, item) => {
    const score = params.reduce((sum, param) => {
      const d = (desired(track, param, P) - (item.params[param] ?? 50)) / 100;
      return sum + d * d * (param === 'tone' || param === 'tune' ? 1.2 : 1);
    }, 0);
    const bestScore = params.reduce((sum, param) => {
      const d = (desired(track, param, P) - (best.params[param] ?? 50)) / 100;
      return sum + d * d * (param === 'tone' || param === 'tune' ? 1.2 : 1);
    }, 0);
    return score < bestScore ? item : best;
  });
}
export async function load808Samples(ctx) {
  const base = `${import.meta.env.BASE_URL}samples/tr808/`;
  const response = await fetch(`${base}manifest.json`);
  if (!response.ok) throw new Error(`TR-808 sample manifest unavailable (${response.status})`);
  const manifest = await response.json();
  const grouped = new Map();
  for (const entry of manifest.samples) {
    if (!grouped.has(entry.track)) grouped.set(entry.track, []);
    grouped.get(entry.track).push(entry);
  }
  const queue = [...manifest.samples];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      try {
        const file = await fetch(`${base}${entry.url}`);
        if (!file.ok) throw new Error(`HTTP ${file.status}`);
        entry.buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      } catch (error) {
        console.warn(`TR-808 sample unavailable: ${entry.url}`, error);
      }
    }
  });
  await Promise.all(workers);
  const samples = new Map();
  for (const [track, items] of grouped) samples.set(track, items.filter((item) => item.buffer));
  return {
    count: [...samples.values()].reduce((n, items) => n + items.length, 0),
    play(track, v, P) {
      const isAlt = P('alt') >= 0.5;
      const soundTrack = isAlt && ALTS[track] ? ALTS[track] : track;
      const candidates = samples.get(soundTrack);
      if (!candidates?.length) return false;
      const item = selectSample(soundTrack, P, v, candidates);
      if (!item?.buffer) return false;
      const source = ctx.createBufferSource();
      source.buffer = item.buffer;
      const tuneKey = KNOBS[soundTrack]?.tone ?? KNOBS[soundTrack]?.tune;
      const knobVal = tuneKey ? (P(tuneKey) ?? P('tune') ?? P('tuning')) : null;
      if (knobVal != null && item.params.tone != null) {
        const target = clamp(knobVal) * 100;
        source.playbackRate.setValueAtTime(2 ** (((target - item.params.tone) / 100) * 0.7), v.t);
      } else if (knobVal != null && item.params.tune != null) {
        const target = clamp(knobVal) * 100;
        source.playbackRate.setValueAtTime(2 ** (((target - item.params.tune) / 100) * 0.7), v.t);
      }
      const amp = ctx.createGain();
      const trim = TRIM[soundTrack] ?? 1;
      amp.gain.setValueAtTime(Math.max(0, levelCurve(clamp(P('level'))) * trim * v.acc), v.t);
      if (soundTrack === 'oh') {
        const decay = 0.12 + clamp(P('decay')) * 0.72;
        amp.gain.setTargetAtTime(0, v.t + 0.006, Math.max(0.003, decay / 6.9));
      }
      // Monophonic per-voice behavior: cleanly choke the previous hit's tail
      if (v.kit[track]) {
        try {
          v.kit[track].gain.setValueAtTime(1, v.t);
          v.kit[track].gain.setTargetAtTime(0, v.t, 0.003);
        } catch {}
      }

      const gate = ctx.createGain();
      gate.gain.setValueAtTime(1, v.t);
      amp.connect(gate).connect(v.out);
      v.kit[track] = gate;

      if (soundTrack === 'ch' && v.kit.openHat) {
        v.kit.openHat.gain.setValueAtTime(1, v.t);
        v.kit.openHat.gain.setTargetAtTime(0, v.t, 0.004);
      }
      if (soundTrack === 'oh') v.kit.openHat = gate;
      source.connect(amp);
      source.start(v.t);
      v.end = v.t + item.buffer.duration / Math.max(0.01, source.playbackRate.value);
      v.last = source;
      return true;
    },
  };
}
