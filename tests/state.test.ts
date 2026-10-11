import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoConfig } from '../src/defaults.ts';
import { createAppState, dispatchAction, elapse } from '../src/app/state.ts';
import { projectFrames } from '../src/engine/index.ts';

test('elapsed chunks produce identical playback events, phase, and gate state', () => {
  const initial = dispatchAction(createAppState(makeDemoConfig()),{type:'transport',command:'toggle-play'});
  const single = elapse(initial,10_000);
  let chunks = initial;
  for (let count=0;count<1000;count++) chunks = elapse(chunks,10);
  assert.deepEqual(chunks,single);
  assert.equal(single.history.length,20);
  assert.deepEqual(single.history.filter(frame => frame.sequencerAdvanced[0]).slice(0,8).map(frame => frame.pulse),[2,3,4,6,8,9,10,12]);
});
test('live edits stay queued until the next boundary and preserve recorded history', () => {
  let state = dispatchAction(createAppState(makeDemoConfig()),{type:'transport',command:'toggle-play'});
  state = elapse(state,1500);
  const recorded = structuredClone(state.history);
  const positions = [...state.runtime.sequencerPositions];
  state = dispatchAction(state,{type:'set-rhythm',index:0,value:5});
  state = dispatchAction(state,{type:'set-tempo',value:240});
  assert.equal(state.config.rhythmDivisions[0],2);
  assert.equal(state.pendingConfig?.rhythmDivisions[0],5);
  assert.deepEqual(state.runtime.sequencerPositions,positions);
  state = elapse(state,499);
  assert.equal(state.pendingConfig?.tempoBpm,240);
  state = elapse(state,1);
  assert.equal(state.pendingConfig,null);
  assert.equal(state.config.rhythmDivisions[0],5);
  assert.equal(state.runtime.nextClockAtMs,2250);
  assert.deepEqual(state.history.slice(0,3),recorded);
  assert.equal(state.history[3].effectiveDivisions[0],5);
});
test('gate-driven stops between ticks and stopped edits apply immediately', () => {
  const config = makeDemoConfig(); config.connections = [{id:'gate',from:'clock-out',to:'play-in'}];
  let state = dispatchAction(createAppState(config),{type:'transport',command:'toggle-play'});
  state = elapse(state,749); assert.equal(state.runtime.running,true);
  state = elapse(state,1); assert.equal(state.runtime.running,false);
  assert.equal(state.history.length,1);
  state = dispatchAction(state,{type:'set-tempo',value:80});
  assert.equal(state.pendingConfig,null); assert.equal(state.config.tempoBpm,80);
});
test('history caps at 4096 while projection and RESET preserve recorded events', () => {
  const config = makeDemoConfig(); config.tempoBpm = 3000;
  let state = dispatchAction(createAppState(config),{type:'transport',command:'toggle-play'});
  state = elapse(state,90_000);
  assert.equal(state.runtime.pulse,4500);
  assert.equal(state.history.length,4096);
  assert.equal(state.history[0].pulse,405);
  const recorded = structuredClone(state.history);
  projectFrames(config,state.runtime,96);
  assert.deepEqual(state.history,recorded);
  state = dispatchAction(state,{type:'transport',command:'reset'});
  assert.equal(state.runtime.pulse,4500);
  assert.deepEqual(state.runtime.sequencerPositions,[0,0]);
  assert.deepEqual(state.history,recorded);
});
test('loading a configuration resets playback without importing transient state', () => {
  let state = dispatchAction(createAppState(makeDemoConfig()),{type:'transport',command:'toggle-play'});
  state = elapse(state,2000);
  state = dispatchAction(state,{type:'replace-config',config:makeDemoConfig()});
  assert.equal(state.runtime.running,false);
  assert.equal(state.runtime.pulse,0); assert.equal(state.history.length,0);
});
