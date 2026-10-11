import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoConfig } from '../src/defaults.ts';
import { advanceClock, advanceTime, applyTransport, createRuntime, getRepeatInfo, getVoices, projectFrames } from '../src/engine/index.ts';
import type { InstrumentConfig, RuntimeState, SimulationFrame } from '../src/contracts.ts';

const C4 = 261.6255653005986;
function near(actual: number, expected: number, tolerance = 1e-8): void { assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`); }
function base(): InstrumentConfig {
  const config = makeDemoConfig();
  config.quantize = 'off'; config.oscillatorFrequencies = [C4, C4];
  config.sequencerSteps = [[0, 0, 0, 0], [0, 0, 0, 0]];
  return config;
}
function play(config: InstrumentConfig): RuntimeState { return applyTransport(config, createRuntime(config), 'toggle-play'); }
function run(config: InstrumentConfig, count: number, initial = play(config)): { frames: SimulationFrame[]; runtime: RuntimeState } {
  let runtime = initial; const frames: SimulationFrame[] = [];
  for (let index = 0; index < count; index++) { const result = advanceClock(config, runtime); runtime = result.runtime; frames.push(result.frame); }
  return { frames, runtime };
}

test('÷2 and ÷3 reproduce the reference union, coalescing simultaneous advances', () => {
  const config = base(), { frames } = run(config, 12);
  assert.deepEqual(frames.filter(frame => frame.sequencerAdvanced[0]).map(frame => frame.pulse), [2, 3, 4, 6, 8, 9, 10, 12]);
  assert.deepEqual(frames[5].rhythmContributors[0], [1, 2]);
  assert.deepEqual(frames[11].rhythmContributors[0], [1, 2]);
  assert.equal(frames[5].sequencerPositions[0], 0);
  assert.equal(frames[11].sequencerPositions[0], 0);
  assert.deepEqual(frames.filter(frame => frame.rhythmPulses[0]).map(frame => frame.pulse), [2, 4, 6, 8, 10, 12]);
  assert.deepEqual(frames.filter(frame => frame.rhythmPulses[1]).map(frame => frame.pulse), [3, 6, 9, 12]);
});

test('division endpoints, multi assignments, and unassigned sequencers', () => {
  const config = base(); config.rhythmDivisions = [1, 16, 7, 9];
  config.rhythmAssignments = [[true, false], [true, false], [false, false], [false, false]];
  const { frames, runtime } = run(config, 16);
  assert.ok(frames.every(frame => frame.rhythmPulses[0]));
  assert.equal(frames.filter(frame => frame.rhythmPulses[1]).length, 1);
  assert.equal(frames[15].rhythmPulses[1], true);
  assert.deepEqual(runtime.sequencerPositions, [0, 0]);
  assert.ok(frames.every(frame => !frame.sequencerAdvanced[1]));
});

test('suboscillators inherit their parent pitch while SUB assignment changes integer division', () => {
  const config = base(); config.rhythmDivisions[0] = 1;
  config.sequencerSteps[0] = [0, 1, 0, -1]; config.subDivisions[0] = [4, 8];
  const { frame } = advanceClock(config, play(config));
  near(frame.voices[0].frequency, C4 * 2);
  near(frame.voices[1].frequency, C4 * 2 / 4);
  near(frame.voices[2].frequency, C4 * 2 / 8);
  assert.ok(frame.voices.slice(0, 3).every(voice => voice.updated));
  config.sequencerAssignments[0] = [false, true, false];
  const changed = advanceClock(config, play(config)).frame;
  near(changed.voices[0].frequency, C4);
  assert.equal(changed.voices[1].division, 3);
  near(changed.voices[1].frequency, C4 / 3);
  assert.equal(changed.voices[2].division, 8);
});

test('patch CV sums with internal pitch, and VCO 1 CV normals to VCO 2 until patched', () => {
  const config = base(); config.sequencerSteps = [[0.5, 0, 0, 0], [0.25, 0, 0, 0]];
  config.connections = [{ id: 'first', from: 'seq1-out', to: 'vco1-in' }];
  let voices = getVoices(config, createRuntime(config));
  near(voices[0].frequency, C4 * 2 ** 1);
  near(voices[3].frequency, C4 * 2 ** 0.75);
  assert.ok(voices[3].valueSources.some(source => source.includes('normalled')));
  config.connections.push({ id: 'second', from: 'seq2-out', to: 'vco2-in' });
  voices = getVoices(config, createRuntime(config));
  near(voices[3].frequency, C4 * 2 ** 0.5);
  assert.ok(voices[3].valueSources.every(source => !source.includes('normalled')));
});

test('cross-patched sequencer advances mark all dependent voices, including unchanged notes', () => {
  const config = base(); config.rhythmAssignments = [[true, false], [false, false], [false, false], [false, false]];
  config.sequencerAssignments = [[false, false, false], [false, false, false]];
  config.connections = [{ id: 'first', from: 'seq1-out', to: 'vco1-in' }];
  const frame = run(config, 2).frames[1];
  assert.ok(frame.voices.every(voice => voice.updated));
  assert.ok(frame.voices.every(voice => !voice.pitchChanged));
  assert.ok(frame.voices.every(voice => JSON.stringify(voice.contributors) === '[1]'));
});

test('divider CV is bounded, affects both subs, and uses prior-step values for rhythm feedback', () => {
  const config = base(); config.octaveRange = 5; config.sequencerSteps[0] = [1, -1, 0, 0];
  config.subDivisions[0] = [2, 14];
  config.connections = [{ id: 'sub', from: 'seq1-out', to: 'vco1-sub-in' }, { id: 'rhythm', from: 'seq2-out', to: 'rhythm1-in' }];
  let voices = getVoices(config, createRuntime(config));
  assert.equal(voices[1].division, 1); assert.equal(voices[2].division, 7);
  const negative = createRuntime(config); negative.sequencerPositions[0] = 1;
  voices = getVoices(config, negative);
  assert.equal(voices[1].division, 10); assert.equal(voices[2].division, 16);
  config.connections = [{ id: 'feedback', from: 'seq1-out', to: 'rhythm1-in' }];
  config.rhythmDivisions[0] = 9; config.rhythmAssignments = [[true, false], [false, false], [false, false], [false, false]];
  const { frames } = run(config, 3);
  assert.equal(frames[0].effectiveDivisions[0], 2);
  assert.equal(frames[1].effectiveDivisions[0], 2);
  assert.equal(frames[1].sequencerPositions[0], 1);
  assert.equal(frames[2].effectiveDivisions[0], 16);
});

test('octave ranges and all quantization modes produce the expected CV/pitch', () => {
  const config = base(); config.sequencerSteps[0][0] = 0.5; config.octaveRange = 2;
  near(getVoices(config, createRuntime(config))[0].frequency, C4 * 2);
  config.octaveRange = 1; config.sequencerSteps[0][0] = 4 / 12;
  config.quantize = '12-et'; near(getVoices(config, createRuntime(config))[0].frequency, C4 * 2 ** (4 / 12));
  config.quantize = '12-ji'; near(getVoices(config, createRuntime(config))[0].frequency, C4 * 5 / 4);
  config.quantize = '8-ji'; near(getVoices(config, createRuntime(config))[0].frequency, C4 * 5 / 4);
  config.quantize = '8-et'; config.sequencerSteps[0][0] = 1 / 12;
  near(getVoices(config, createRuntime(config))[0].frequency, C4 * 2 ** (2 / 12));
  config.quantize = '12-ji'; config.sequencerSteps[0][0] = -5 / 12;
  near(getVoices(config, createRuntime(config))[0].frequency, C4 * 3 / 4);
  config.quantize = 'off'; config.sequencerSteps[0][0] = 0.021;
  near(getVoices(config, createRuntime(config))[0].frequency, C4 * 2 ** 0.021);
});

test('reset preserves absolute history/time, holds steps, allows NEXT, and releases normally', () => {
  const config = base(); let runtime = run(config, 5).runtime;
  const reset = applyTransport(config, runtime, 'reset');
  assert.equal(reset.pulse, 5); assert.equal(reset.timeMs, runtime.timeMs);
  assert.equal(reset.nextClockAtMs, runtime.nextClockAtMs); assert.equal(reset.running, true);
  assert.deepEqual(reset.sourceGateLevels, runtime.sourceGateLevels);
  assert.deepEqual(reset.sequencerPositions, [0, 0]); assert.deepEqual(reset.rhythmCounters, [0, 0, 0, 0]);
  runtime = applyTransport(config, reset, 'reset-hold-start');
  const held = run(config, 2, runtime);
  assert.deepEqual(held.runtime.sequencerPositions, [0, 0]);
  assert.equal(held.frames[1].trigger, true); assert.equal(held.frames[1].sequencerAdvanced[0], false);
  runtime = applyTransport(config, held.runtime, 'next');
  assert.deepEqual(runtime.sequencerPositions, [1, 1]);
  assert.equal(runtime.sourceGateLevels['trigger-out'], true);
  runtime = applyTransport(config, runtime, 'reset-hold-end');
  assert.equal(runtime.resetHeld, false);
  assert.deepEqual(advanceClock(config, runtime).runtime.sequencerPositions, [2, 2]);
});

test('NEXT advances assigned sequencers only and does not trigger envelopes ordinarily', () => {
  const config = base(); config.rhythmAssignments = [[true, false], [false, false], [false, false], [false, false]];
  const runtime = applyTransport(config, createRuntime(config), 'next');
  assert.deepEqual(runtime.sequencerPositions, [1, 0]);
  assert.equal(runtime.sourceGateLevels['trigger-out'], undefined);
  assert.equal(runtime.running, false);
});

test('EG off suppresses sequence triggers, preserves manual/external triggers; held suppresses all requests', () => {
  const config = base(); config.rhythmDivisions[0] = 1; config.egMode = 'off';
  assert.equal(advanceClock(config, play(config)).frame.trigger, false);
  assert.equal(applyTransport(config, createRuntime(config), 'trigger').sourceGateLevels['trigger-out'], true);
  config.connections = [{ id: 'external', from: 'seq1-clk-out', to: 'trigger-in' }];
  assert.equal(advanceClock(config, play(config)).frame.trigger, true);
  config.egMode = 'held';
  assert.equal(advanceClock(config, play(config)).frame.trigger, false);
  assert.equal(applyTransport(config, createRuntime(config), 'trigger').sourceGateLevels['trigger-out'], undefined);
});

test('shared trigger is one 1 ms pulse, clock is 50% duty, and gate time never moves the clock deadline', () => {
  const config = base(), result = run(config, 6);
  assert.deepEqual(result.frames[5].triggerSources, ['SEQ 1', 'SEQ 2']);
  const deadline = result.runtime.nextClockAtMs, now = result.runtime.timeMs;
  let runtime = advanceTime(config, result.runtime, now + 1);
  assert.equal(runtime.sourceGateLevels['trigger-out'], false);
  assert.equal(runtime.sourceGateLevels['seq1-clk-out'], false);
  assert.equal(runtime.sourceGateLevels['clock-out'], true);
  assert.equal(runtime.nextClockAtMs, deadline);
  runtime = advanceTime(config, runtime, now + 250);
  assert.equal(runtime.sourceGateLevels['clock-out'], false); assert.equal(runtime.nextClockAtMs, deadline);
});

test('PLAY gate falling edge stops between clock boundaries; preview stops with it', () => {
  const config = base(); config.connections = [{ id: 'play', from: 'clock-out', to: 'play-in' }];
  const first = advanceClock(config, play(config)); assert.equal(first.runtime.pulse, 1);
  const stopped = advanceTime(config, first.runtime, 750);
  assert.equal(stopped.running, false); assert.equal(stopped.nextClockAtMs, 1000);
  assert.equal(advanceClock(config, stopped).runtime.pulse, 1);
  assert.equal(projectFrames(config, createRuntime(config), 12).length, 1);
});

test('RESET gate wins simultaneous advancement and holds until its falling edge', () => {
  const config = base(); config.rhythmDivisions[0] = 1;
  config.connections = [{ id: 'reset', from: 'seq1-clk-out', to: 'reset-in' }];
  const first = advanceClock(config, play(config));
  assert.equal(first.frame.reset, true); assert.equal(first.frame.trigger, true);
  assert.equal(first.frame.sequencerAdvanced[0], false); assert.equal(first.runtime.resetHeld, true);
  assert.deepEqual(first.runtime.rhythmCounters, [0, 0, 0, 0]);
  assert.deepEqual(first.runtime.sequencerPositions, [0, 0]);
  const manuallyHeld = applyTransport(config, first.runtime, 'reset-hold-start');
  assert.equal(applyTransport(config, manuallyHeld, 'reset-hold-end').resetHeld, true);
  assert.equal(advanceTime(config, first.runtime, 501).resetHeld, false);
  config.connections = [{ id: 'reset-trigger', from: 'trigger-out', to: 'reset-in' }];
  const viaTrigger = advanceClock(config, play(config));
  assert.equal(viaTrigger.frame.reset, true); assert.equal(viaTrigger.frame.sequencerAdvanced[0], false);
  config.connections = [{ id: 'manual-reset', from: 'seq1-clk-out', to: 'reset-in' }];
  const manual = applyTransport(config, createRuntime(config), 'next');
  assert.deepEqual(manual.sequencerPositions, [0, 0]);
});

test('live division and tempo changes retain counter phase and sequence progression', () => {
  const config = base(); config.rhythmAssignments = [[true, false], [false, false], [false, false], [false, false]];
  config.rhythmDivisions[0] = 4; let runtime = run(config, 2).runtime;
  const history = JSON.stringify(runtime); config.rhythmDivisions[0] = 3; config.tempoBpm = 60;
  const changed = advanceClock(config, runtime); runtime = changed.runtime;
  assert.equal(changed.frame.rhythmPulses[0], true); assert.equal(runtime.sequencerPositions[0], 1);
  assert.equal(runtime.pulse, 3); assert.equal(runtime.nextClockAtMs, 2500);
  assert.equal(JSON.parse(history).rhythmCounters[0], 2);
});

test('simulation and projection are immutable and preview reflects the current phase', () => {
  const config = base(), initial = play(config), before = JSON.stringify(initial), configBefore = JSON.stringify(config);
  const first = advanceClock(config, initial);
  assert.equal(JSON.stringify(initial), before); assert.equal(JSON.stringify(config), configBefore);
  const snapshot = JSON.stringify(first.runtime), projected = projectFrames(config, first.runtime, 12);
  assert.equal(JSON.stringify(first.runtime), snapshot); assert.equal(JSON.stringify(config), configBefore);
  assert.ok(projected.every(frame => frame.preview)); assert.equal(projected[0].pulse, 2);
  assert.equal(projected[0].rhythmPulses[0], true);
  const paused = createRuntime(config); assert.equal(projectFrames(config, paused, 1)[0].pulse, 1); assert.equal(paused.running, false);
});

test('repeat info separates rhythm and 4-step sequence cycles and excludes unused rhythms', () => {
  const config = base(); assert.deepEqual(getRepeatInfo(config), { variable: false, rhythmPulses: 6, sequencePulses: 12 });
  config.rhythmAssignments = [[true, false], [false, false], [false, false], [false, false]];
  assert.deepEqual(getRepeatInfo(config), { variable: false, rhythmPulses: 2, sequencePulses: 8 });
  config.connections = [{ id: 'unused', from: 'seq1-out', to: 'rhythm4-in' }];
  assert.equal(getRepeatInfo(config).variable, false);
  config.connections.push({ id: 'dynamic', from: 'seq2-out', to: 'rhythm1-in' });
  assert.deepEqual(getRepeatInfo(config), { variable: true, rhythmPulses: null, sequencePulses: null });
  config.connections = [{ id: 'gate', from: 'clock-out', to: 'reset-in' }];
  assert.deepEqual(getRepeatInfo(config), { variable: false, rhythmPulses: 2, sequencePulses: null });
});
