// Sample-backed TR-909 voices. The manifest is generated from the authorized
// TR-909 library in public/samples/tr909. The synthesized voices remain the
// fallback until the library has loaded (and if a file fails to decode).

const T60 = 1 / 6.9;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const levelCurve = (x) => x * x * 1.3;

const PARAMS = {
  bd: ['tune', 'attack', 'decay'],
  sd: ['tune', 'tone', 'snappy'],
  lt: ['tune', 'decay'],
  mt: ['tune', 'decay'],
  ht: ['tune', 'decay'],
  ch: ['decay'],
  oh: ['accent'],
  cr: ['tune'],
  rd: ['tune'],
};

const KNOBS = {
  bd: { tune: 'tune', attack: 'attack', decay: 'decay' },
  sd: { tune: 'tune', tone: 'tone', snappy: 'snappy' },
  lt: { tune: 'tune', decay: 'decay' },
  mt: { tune: 'tune', decay: 'decay' },
  ht: { tune: 'tune', decay: 'decay' },
  ch: { decay: 'chDecay' },
  oh: { accent: null },
  cr: { tune: 'crTune' },
  rd: { tune: 'rdTune' },
};

// Per-instrument gain compensation measured against the supplied sample library.
// The source 909 kick, toms and cymbals have substantially lower raw sample peaks
// than the 808 pack, so trims are compensated per voice rather than turning up
// the entire 909 bus (which would make the snare and closed hat too loud).
const LEVELS = {
  bd: ['level', 2.4], sd: ['level', 1.05],
  lt: ['level', 1.8], mt: ['level', 2.0], ht: ['level', 2.3],
  rs: ['level', 1.1], cp: ['level', 6.5],
  ch: ['level', 1.05], oh: ['level', 1.2],
  cr: ['crLevel', 2.0], rd: ['rdLevel', 3.5],
};

function targetValue(track, param, v, P) {
  if (track === 'oh' && param === 'accent') {
    // Accent samples are provided for the open hat; choose the closest accent
    // timbre while the channel gain continues to express the actual hit level.
    return clamp(50 + (v.acc - 1) * 10, 0, 100);
  }
  const knob = KNOBS[track]?.[param] ?? param;
  if (!knob) return 50;
  return clamp(P(knob), 0, 1) * 100;
}

function selectSample(track, v, P, candidates) {
  const params = PARAMS[track] ?? [];
  if (!candidates?.length) return null;
  if (params.length === 0) return candidates[Math.floor(Math.random() * candidates.length)];
  let best = null;
  let bestScore = Infinity;
  for (const item of candidates) {
    let score = 0;
    for (const param of params) {
      const desired = targetValue(track, param, v, P);
      const actual = item.params[param] ?? 50;
      const delta = (desired - actual) / 100;
      // Kick/snare pitch and envelope dimensions are equally important. A mild
      // weighting keeps tuning from jumping around when another knob is moved.
      const weight = param === 'tune' ? 1.2 : 1;
      score += delta * delta * weight;
    }
    if (score < bestScore) { best = item; bestScore = score; }
  }
  return best;
}

function levelKnob(track, P) {
  const [knob, trim] = LEVELS[track] ?? ['level', 1];
  return levelCurve(clamp(P(knob))) * trim;
}

export async function load909Samples(ctx) {
  const base = `${import.meta.env.BASE_URL}samples/tr909/`;
  const response = await fetch(`${base}manifest.json`);
  if (!response.ok) throw new Error(`TR-909 sample manifest unavailable (${response.status})`);
  const manifest = await response.json();
  const grouped = new Map();
  for (const entry of manifest.samples) {
    if (!grouped.has(entry.track)) grouped.set(entry.track, []);
    grouped.get(entry.track).push(entry);
  }

function stripGhostHits(buffer, track) {
  if (!['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp'].includes(track)) return;
  const sampleRate = buffer.sampleRate;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const len = data.length;
    let peak = 0, peakIdx = 0;
    const peakSearchLen = Math.min(len, Math.floor(sampleRate * 0.1));
    for (let i = 0; i < peakSearchLen; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) { peak = a; peakIdx = i; }
    }
    const windowLen = Math.floor(sampleRate * 0.02);
    const minDecayTime = Math.floor(sampleRate * 0.15);
    const silenceThreshold = 0.0015;
    let cutoff = len;
    for (let i = peakIdx + minDecayTime; i < len - windowLen; i += windowLen) {
      let maxInWin = 0;
      for (let j = 0; j < windowLen; j++) {
        const a = Math.abs(data[i + j]);
        if (a > maxInWin) maxInWin = a;
      }
      if (maxInWin < silenceThreshold) {
        cutoff = i + windowLen;
        break;
      }
    }
    if (cutoff < len) {
      const fadeLen = Math.min(Math.floor(sampleRate * 0.005), len - cutoff);
      for (let i = 0; i < fadeLen; i++) {
        data[cutoff + i] *= (1 - i / fadeLen);
      }
      for (let i = cutoff + fadeLen; i < len; i++) {
        data[i] = 0;
      }
    }
  }
}

  // Decode with bounded concurrency to avoid creating hundreds of simultaneous
  // fetch/decode jobs on startup. Keep decoded buffers shared between hits.
  const queue = [...manifest.samples];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      try {
        const file = await fetch(`${base}${entry.url}`);
        if (!file.ok) throw new Error(`HTTP ${file.status}`);
        const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
        stripGhostHits(decoded, entry.track);
        entry.buffer = decoded;
      } catch (error) {
        console.warn(`TR-909 sample unavailable: ${entry.url}`, error);
      }
    }
  });
  await Promise.all(workers);
  const samples = new Map();
  for (const [track, items] of grouped) samples.set(track, items.filter((item) => item.buffer));

  return {
    count: [...samples.values()].reduce((n, items) => n + items.length, 0),
    play(track, v, P) {
      const candidates = samples.get(track);
      if (!candidates?.length) return false;
      const item = selectSample(track, v, P, candidates);
      if (!item?.buffer) return false;

      // Real TR-909 voice circuits are monophonic per drum:
      // hitting a voice repeatedly chokes the prior hit smoothly to prevent overlapping tail clash.
      if (v.kit[track]) {
        try {
          v.kit[track].gain.setValueAtTime(1, v.t);
          v.kit[track].gain.setTargetAtTime(0, v.t, 0.003);
        } catch {}
      }

      const source = ctx.createBufferSource();
      source.buffer = item.buffer;
      // The recorded grid is discrete; a small rate correction softens the
      // steps between neighboring tune settings without replacing the sampled
      // tone with a synthetic oscillator.
      const tuneKnob = KNOBS[track]?.tune;
      if (tuneKnob && item.params.tune != null) {
        const target = clamp(P(tuneKnob)) * 100;
        const span = track === 'bd' ? 1.0 : track === 'sd' ? 0.7 : 0.5;
        source.playbackRate.setValueAtTime(2 ** (((target - item.params.tune) / 100) * span), v.t);
      }

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(Math.max(0, levelKnob(track, P) * v.acc), v.t);
      if (track === 'oh') {
        const decay = 0.12 + clamp(P('ohDecay')) * 0.72;
        amp.gain.setTargetAtTime(0, v.t + 0.006, Math.max(0.003, decay * T60));
      }

      // A separate gate preserves the 909 open/closed-hat choke behavior and voice choking.
      const gate = ctx.createGain();
      gate.gain.setValueAtTime(1, v.t);
      amp.connect(gate).connect(v.out);
      v.kit[track] = gate;

      if (track === 'ch' && v.kit.openHat) {
        v.kit.openHat.gain.setValueAtTime(1, v.t);
        v.kit.openHat.gain.setTargetAtTime(0, v.t, 0.004);
      }
      if (track === 'oh') v.kit.openHat = gate;

      source.connect(amp);
      source.start(v.t);
      v.end = v.t + item.buffer.duration / Math.max(0.01, source.playbackRate.value);
      v.last = source;
      return true;
    },
  };
}
