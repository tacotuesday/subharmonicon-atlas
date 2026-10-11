import type {
  InstrumentConfig, JackId, Pair, Quad, RepeatInfo, RuntimeState,
  SimulationFrame, TransportCommand, VoiceFrame, VoiceId,
} from '../contracts.ts';

const MIDDLE_C = 261.6255653005986;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const JI_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
const MAJOR_INDICES = [0, 2, 4, 5, 7, 9, 11];
const GATE_INPUTS: JackId[] = ['reset-in', 'play-in', 'trigger-in'];
const CV_SOURCES: JackId[] = ['seq1-out', 'seq2-out'];
const VOICE_IDS: VoiceId[] = ['vco1', 'vco1sub1', 'vco1sub2', 'vco2', 'vco2sub1', 'vco2sub2'];

interface Events { reset: boolean; trigger: boolean; triggerSources: string[] }
interface Cv { volts: number; sequencer: 0 | 1 | null; normalled: boolean }

function freshEvents(): Events { return { reset: false, trigger: false, triggerSources: [] }; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function period(config: InstrumentConfig): number { return 60_000 / clamp(config.tempoBpm, 20, 3000); }
function divider(base: number, cv = 0): number { return clamp(Math.round(base - 1.5 * cv), 1, 16); }
function clone(runtime: RuntimeState): RuntimeState {
  return {
    ...runtime, rhythmCounters: [...runtime.rhythmCounters], sequencerPositions: [...runtime.sequencerPositions],
    gateLevels: { ...runtime.gateLevels }, sourceGateLevels: { ...runtime.sourceGateLevels },
    pendingEdges: runtime.pendingEdges.map(edge => ({ ...edge })), lastFrequencies: [...runtime.lastFrequencies],
  };
}

/** Equal-tempered and five-limit just scales repeat by octave, rooted at C. */
function quantize(octaves: number, mode: InstrumentConfig['quantize']): number {
  if (mode === 'off') return octaves;
  const chromatic = mode.endsWith('et') ? JI_RATIOS.map((_, index) => index / 12) : JI_RATIOS.map(Math.log2);
  const steps = mode.startsWith('8') ? MAJOR_INDICES.map(index => chromatic[index]) : chromatic;
  const octave = Math.floor(octaves);
  let nearest = octaves, distance = Infinity;
  for (let oct = octave - 1; oct <= octave + 1; oct++) {
    for (const step of steps) {
      const candidate = oct + step, delta = Math.abs(candidate - octaves);
      if (delta < distance - 1e-12 || (Math.abs(delta - distance) < 1e-12 && candidate > nearest)) {
        nearest = candidate; distance = delta;
      }
    }
  }
  return nearest;
}

function sequencerCv(config: InstrumentConfig, runtime: RuntimeState, sequencer: 0 | 1): number {
  const raw = clamp(config.sequencerSteps[sequencer][runtime.sequencerPositions[sequencer]], -1, 1) * config.octaveRange;
  return clamp(quantize(raw, config.quantize), -5, 5);
}

function inputCv(config: InstrumentConfig, runtime: RuntimeState, input: JackId): Cv {
  const cable = config.connections.find(connection => connection.to === input);
  if (!cable && input === 'vco2-in') {
    const normal = inputCv(config, runtime, 'vco1-in');
    return { ...normal, normalled: normal.sequencer !== null };
  }
  const index = cable ? CV_SOURCES.indexOf(cable.from) : -1;
  const sequencer = index === 0 || index === 1 ? index : null;
  return { volts: sequencer === null ? 0 : sequencerCv(config, runtime, sequencer), sequencer, normalled: false };
}

function noteFor(frequency: number): { note: string; cents: number } {
  const midi = 69 + 12 * Math.log2(frequency / 440), nearest = Math.round(midi);
  return {
    note: `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`,
    cents: Math.round((midi - nearest) * 1000) / 10,
  };
}

function voicesWithDependencies(config: InstrumentConfig, runtime: RuntimeState): { voices: VoiceFrame[]; dependencies: Set<number>[] } {
  const voices: VoiceFrame[] = [], dependencies: Set<number>[] = [];
  for (const oscillator of [0, 1] as const) {
    const name = `VCO ${oscillator + 1}`, base = config.oscillatorFrequencies[oscillator];
    const ownCv = sequencerCv(config, runtime, oscillator), assigned = config.sequencerAssignments[oscillator];
    const frequencyCv = inputCv(config, runtime, oscillator === 0 ? 'vco1-in' : 'vco2-in');
    const subCv = inputCv(config, runtime, oscillator === 0 ? 'vco1-sub-in' : 'vco2-sub-in');
    // The internal oscillator control is limited to approximately 10 kHz. Patched CV is additive after it.
    const internal = MIDDLE_C * 2 ** quantize(Math.log2(base / MIDDLE_C) + (assigned[0] ? ownCv : 0), config.quantize);
    const parentFrequency = Math.min(10_000, internal) * 2 ** frequencyCv.volts;
    const parentDeps = new Set<number>(), parentSources: string[] = [];
    if (assigned[0]) { parentDeps.add(oscillator); parentSources.push(`SEQ ${oscillator + 1} → OSC ${oscillator + 1}`); }
    if (frequencyCv.sequencer !== null) {
      parentDeps.add(frequencyCv.sequencer);
      parentSources.push(`SEQ ${frequencyCv.sequencer + 1} → ${name} CV${frequencyCv.normalled ? ' (normalled from VCO 1)' : ''}`);
    }
    for (const sub of [0, 1, 2] as const) {
      const deps = new Set(parentDeps), sources = [...parentSources];
      let division = 1;
      if (sub > 0) {
        const mod = (assigned[sub] ? ownCv : 0) + subCv.volts;
        division = divider(config.subDivisions[oscillator][sub - 1], mod);
        if (assigned[sub]) { deps.add(oscillator); sources.push(`SEQ ${oscillator + 1} → SUB ${sub} divisor`); }
        if (subCv.sequencer !== null) { deps.add(subCv.sequencer); sources.push(`SEQ ${subCv.sequencer + 1} → ${name} SUB CV`); }
        sources.push(`${name} ÷${division}`);
      }
      const frequency = parentFrequency / division, index = voices.length;
      const pitchChanged = runtime.lastFrequencies[index] !== undefined && Math.abs(frequency - runtime.lastFrequencies[index]) > Math.max(1e-8, frequency * 1e-10);
      voices.push({
        id: VOICE_IDS[index], label: sub === 0 ? name : `${name} · SUB ${sub}`,
        frequency, ...noteFor(frequency), division,
        parentId: sub === 0 ? null : VOICE_IDS[oscillator * 3], sequencer: oscillator,
        updated: pitchChanged, pitchChanged, contributors: [], valueSources: sources.length ? sources : [`${name} FREQ knob`],
      });
      dependencies.push(deps);
    }
  }
  return { voices, dependencies };
}

export function getVoices(config: InstrumentConfig, runtime: RuntimeState): VoiceFrame[] {
  return voicesWithDependencies(config, runtime).voices;
}

export function createRuntime(config: InstrumentConfig): RuntimeState {
  const runtime: RuntimeState = {
    pulse: 0, timeMs: 0, nextClockAtMs: period(config), running: false,
    rhythmCounters: [0, 0, 0, 0], sequencerPositions: [0, 0],
    resetHeld: false, manualResetHeld: false, triggerHeld: false,
    gateLevels: {}, sourceGateLevels: {}, pendingEdges: [], lastFrequencies: [],
  };
  runtime.lastFrequencies = getVoices(config, runtime).map(voice => voice.frequency);
  return runtime;
}

function resetState(runtime: RuntimeState): void {
  runtime.rhythmCounters = [0, 0, 0, 0]; runtime.sequencerPositions = [0, 0];
}

function stopClock(config: InstrumentConfig, runtime: RuntimeState, events: Events): void {
  runtime.running = false;
  runtime.pendingEdges = runtime.pendingEdges.filter(edge => edge.source !== 'clock-out');
  if (runtime.sourceGateLevels['clock-out']) setSource(config, runtime, 'clock-out', false, events);
}

function triggerRequest(config: InstrumentConfig, runtime: RuntimeState, events: Events, source: string): void {
  if (config.egMode === 'held') return;
  events.trigger = true;
  if (!events.triggerSources.includes(source)) events.triggerSources.push(source);
  pulseSource(config, runtime, 'trigger-out', 1, events);
}

function syncGateInputs(config: InstrumentConfig, runtime: RuntimeState, events: Events): void {
  // Reset is routed first so that even a same-time clock/trigger cannot advance past it.
  for (const target of GATE_INPUTS) {
    const cable = config.connections.find(connection => connection.to === target);
    const nextHigh = cable ? !!runtime.sourceGateLevels[cable.from] : false;
    const wasHigh = !!runtime.gateLevels[target];
    if (nextHigh === wasHigh) continue;
    runtime.gateLevels[target] = nextHigh;
    if (target === 'reset-in') {
      runtime.resetHeld = runtime.manualResetHeld || nextHigh;
      if (nextHigh) { resetState(runtime); events.reset = true; }
    } else if (target === 'play-in') {
      if (nextHigh) {
        if (!runtime.running) runtime.nextClockAtMs = runtime.timeMs + period(config);
        runtime.running = true;
      } else stopClock(config, runtime, events);
    } else if (nextHigh) triggerRequest(config, runtime, events, `${cable?.from === 'clock-out' ? 'CLOCK' : cable?.from === 'seq1-clk-out' ? 'SEQ 1 CLK' : 'SEQ 2 CLK'} → TRIGGER`);
  }
}

function setSource(config: InstrumentConfig, runtime: RuntimeState, source: JackId, high: boolean, events: Events): void {
  if (!!runtime.sourceGateLevels[source] === high) return;
  runtime.sourceGateLevels[source] = high;
  syncGateInputs(config, runtime, events);
}

function pulseSource(config: InstrumentConfig, runtime: RuntimeState, source: JackId, width: number, events: Events): void {
  runtime.pendingEdges = runtime.pendingEdges.filter(edge => edge.source !== source);
  // Schedule before routing: a routed PLAY falling edge may deliberately cancel the clock pulse.
  runtime.pendingEdges.push({ source, high: false, atMs: runtime.timeMs + width });
  setSource(config, runtime, source, true, events);
}

function processUntil(config: InstrumentConfig, runtime: RuntimeState, toMs: number, events: Events): void {
  syncGateInputs(config, runtime, events);
  const end = Math.max(runtime.timeMs, toMs);
  while (true) {
    runtime.pendingEdges.sort((a, b) => a.atMs - b.atMs);
    const first = runtime.pendingEdges[0];
    if (!first || first.atMs > end) break;
    const atMs = Math.max(runtime.timeMs, first.atMs);
    const simultaneous = runtime.pendingEdges.filter(edge => edge.atMs <= atMs);
    runtime.pendingEdges = runtime.pendingEdges.filter(edge => edge.atMs > atMs);
    runtime.timeMs = atMs;
    // Set simultaneous source levels together, then resolve reset/play/trigger priorities.
    for (const edge of simultaneous) runtime.sourceGateLevels[edge.source] = edge.high;
    syncGateInputs(config, runtime, events);
  }
  runtime.timeMs = end;
}

/** Process output gate edges only; the caller advances clock boundaries separately. */
export function advanceTime(config: InstrumentConfig, incoming: RuntimeState, toMs: number): RuntimeState {
  const runtime = clone(incoming);
  processUntil(config, runtime, toMs, freshEvents());
  return runtime;
}

function effectiveDivisions(config: InstrumentConfig, runtime: RuntimeState): Quad<number> {
  return config.rhythmDivisions.map((base, index) => divider(base, inputCv(config, runtime, `rhythm${index + 1}-in` as JackId).volts)) as Quad<number>;
}

function frameFor(config: InstrumentConfig, runtime: RuntimeState, rhythms: Quad<boolean>, divisions: Quad<number>, advanced: Pair<boolean>, events: Events): SimulationFrame {
  const contributors: Pair<number[]> = [[], []];
  for (const sequencer of [0, 1] as const) {
    rhythms.forEach((active, index) => { if (active && config.rhythmAssignments[index][sequencer]) contributors[sequencer].push(index + 1); });
  }
  const { voices, dependencies } = voicesWithDependencies(config, runtime);
  voices.forEach((voice, index) => {
    const deps = dependencies[index];
    voice.updated = voice.pitchChanged || [...deps].some(sequencer => advanced[sequencer] || events.reset);
    voice.contributors = [...new Set([...deps].flatMap(sequencer => contributors[sequencer]))].sort((a, b) => a - b);
  });
  return {
    pulse: runtime.pulse, timeMs: runtime.timeMs, rhythmPulses: rhythms, effectiveDivisions: divisions,
    rhythmContributors: contributors, sequencerAdvanced: advanced, sequencerPositions: [...runtime.sequencerPositions],
    voices, trigger: events.trigger, triggerSources: events.triggerSources, reset: events.reset,
  };
}

export function advanceClock(config: InstrumentConfig, incoming: RuntimeState): { runtime: RuntimeState; frame: SimulationFrame } {
  const runtime = clone(incoming), pendingEvents = freshEvents();
  const deadline = Math.max(runtime.timeMs, runtime.nextClockAtMs);
  processUntil(config, runtime, deadline, pendingEvents);
  const divisions = effectiveDivisions(config, runtime);
  if (!runtime.running) {
    return { runtime, frame: frameFor(config, runtime, [false, false, false, false], divisions, [false, false], pendingEvents) };
  }
  // CV is sampled before this boundary's sequencer advancement, preventing an algebraic feedback loop.
  const counters = runtime.rhythmCounters.map((counter, index) => (counter + 1) % divisions[index]) as Quad<number>;
  const rhythms = counters.map(counter => counter === 0) as Quad<boolean>;
  const requested: Pair<boolean> = [0, 1].map(sequencer => rhythms.some((active, index) => active && config.rhythmAssignments[index][sequencer])) as Pair<boolean>;
  const events = freshEvents();
  runtime.pulse += 1;
  runtime.rhythmCounters = counters;
  pulseSource(config, runtime, 'clock-out', period(config) / 2, events);
  for (const sequencer of [0, 1] as const) {
    if (requested[sequencer]) pulseSource(config, runtime, sequencer === 0 ? 'seq1-clk-out' : 'seq2-clk-out', 1, events);
  }
  if (config.egMode === 'on') {
    for (const sequencer of [0, 1] as const) if (requested[sequencer]) triggerRequest(config, runtime, events, `SEQ ${sequencer + 1}`);
  }
  const advanced: Pair<boolean> = [false, false];
  if (!runtime.resetHeld && !events.reset) {
    for (const sequencer of [0, 1] as const) if (requested[sequencer]) {
      runtime.sequencerPositions[sequencer] = (runtime.sequencerPositions[sequencer] + 1) % 4;
      advanced[sequencer] = true;
    }
  }
  const frame = frameFor(config, runtime, rhythms, divisions, advanced, events);
  runtime.lastFrequencies = frame.voices.map(voice => voice.frequency);
  runtime.nextClockAtMs = deadline + period(config);
  return { runtime, frame };
}

export function applyTransport(config: InstrumentConfig, incoming: RuntimeState, command: TransportCommand): RuntimeState {
  const runtime = clone(incoming), events = freshEvents();
  syncGateInputs(config, runtime, events);
  switch (command) {
    case 'toggle-play':
      if (runtime.running) stopClock(config, runtime, events);
      else { runtime.running = true; runtime.nextClockAtMs = runtime.timeMs + period(config); }
      break;
    case 'reset': resetState(runtime); break;
    case 'reset-hold-start': runtime.manualResetHeld = true; runtime.resetHeld = true; resetState(runtime); break;
    case 'reset-hold-end': runtime.manualResetHeld = false; runtime.resetHeld = !!runtime.gateLevels['reset-in']; break;
    case 'next': {
      const requested = [0, 1].map(sequencer => config.rhythmAssignments.some(assignment => assignment[sequencer]));
      for (const sequencer of [0, 1] as const) if (requested[sequencer]) {
        pulseSource(config, runtime, sequencer === 0 ? 'seq1-clk-out' : 'seq2-clk-out', 1, events);
        if (runtime.resetHeld && config.egMode === 'on') triggerRequest(config, runtime, events, `NEXT · SEQ ${sequencer + 1}`);
      }
      // A manual NEXT may bypass an existing hold, while a new reset edge still takes priority.
      if (!events.reset) for (const sequencer of [0, 1] as const) if (requested[sequencer]) {
        runtime.sequencerPositions[sequencer] = (runtime.sequencerPositions[sequencer] + 1) % 4;
      }
      break;
    }
    case 'trigger': triggerRequest(config, runtime, events, 'TRIGGER button'); break;
    case 'trigger-hold-start':
      runtime.triggerHeld = true; triggerRequest(config, runtime, events, 'TRIGGER button'); break;
    case 'trigger-hold-end': runtime.triggerHeld = false; break;
  }
  return runtime;
}

export function projectFrames(config: InstrumentConfig, incoming: RuntimeState, count: number): SimulationFrame[] {
  let runtime = clone(incoming);
  if (!runtime.running) { runtime.running = true; runtime.nextClockAtMs = runtime.timeMs + period(config); }
  const frames: SimulationFrame[] = [];
  for (let index = 0; index < Math.max(0, Math.floor(count)); index++) {
    const result = advanceClock(config, runtime);
    if (result.runtime.pulse === runtime.pulse) break;
    frames.push({ ...result.frame, preview: true }); runtime = result.runtime;
    if (!runtime.running) break;
  }
  return frames;
}

function gcd(a: number, b: number): number { while (b) { const rest = a % b; a = b; b = rest; } return a; }
function lcm(a: number, b: number): number { return a / gcd(a, b) * b; }
function unionCount(divisions: number[], cycle: number): number {
  let count = 0;
  for (let mask = 1; mask < 1 << divisions.length; mask++) {
    let divisor = 1, included = 0;
    for (let index = 0; index < divisions.length; index++) if (mask & 1 << index) { divisor = lcm(divisor, divisions[index]); included++; }
    count += (included % 2 ? 1 : -1) * cycle / divisor;
  }
  return count;
}

export function getRepeatInfo(config: InstrumentConfig): RepeatInfo {
  const active = config.rhythmAssignments.flatMap((assignments, index) => assignments.some(Boolean) ? [index] : []);
  const variable = active.some(index => config.connections.some(connection => connection.to === `rhythm${index + 1}-in`));
  if (variable) return { variable: true, rhythmPulses: null, sequencePulses: null };
  const rhythmPulses = active.reduce((cycle, index) => lcm(cycle, divider(config.rhythmDivisions[index])), 1);
  // Gates can reset or halt transport; the static rhythm cycle cannot imply a complete sequence cycle.
  if (config.connections.some(connection => connection.to === 'play-in' || connection.to === 'reset-in')) {
    return { variable: false, rhythmPulses, sequencePulses: null };
  }
  let sequencePulses = 1;
  for (const sequencer of [0, 1] as const) {
    const divisions = active.filter(index => config.rhythmAssignments[index][sequencer]).map(index => divider(config.rhythmDivisions[index]));
    if (!divisions.length) continue;
    const cycle = divisions.reduce(lcm, 1), advances = unionCount(divisions, cycle);
    sequencePulses = lcm(sequencePulses, cycle * 4 / gcd(advances, 4));
  }
  return { variable: false, rhythmPulses, sequencePulses };
}
