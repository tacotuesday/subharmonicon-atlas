import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoConfig } from '../src/defaults.ts';
import { editConfig, validateConfig } from '../src/app/config.ts';
import { decodePatch, encodePatch, loadInitialPatch, parsePatch, savePatch, serializePatch, shareUrl, STORAGE_KEY } from '../src/app/persistence.ts';

test('JSON and unicode share links round trip configuration without runtime', () => {
  const config = makeDemoConfig(); config.name = '÷2 × ÷3 — 音';
  config.connections = [{id:'cross',from:'seq1-out',to:'vco2-in'}];
  assert.deepEqual(parsePatch(serializePatch(config)),config);
  assert.deepEqual(decodePatch(encodePatch(config)),config);
  const url = shareUrl(config,'https://example.org/repository/?test=1#old');
  assert.equal(new URL(url).pathname,'/repository/');
  assert.deepEqual(decodePatch(new URL(url).hash.slice(7)),config);
  assert.equal('runtime' in parsePatch(serializePatch(config)),false);
});
test('initial load prioritizes share then local then demo, retaining local on bad link', () => {
  const local = makeDemoConfig(); local.tempoBpm = 97;
  const shared = makeDemoConfig(); shared.tempoBpm = 144;
  const storage = {getItem:() => JSON.stringify(local),setItem:() => {}};
  assert.equal(loadInitialPatch(`#patch=${encodePatch(shared)}`,storage).config.tempoBpm,144);
  assert.equal(loadInitialPatch('#patch=bad!',storage).config.tempoBpm,97);
  assert.equal(loadInitialPatch('',storage).config.tempoBpm,97);
  assert.deepEqual(loadInitialPatch('').config,makeDemoConfig());
});
test('storage failures preserve app use and imports reject invalid values and routes', () => {
  const storage = {getItem:() => {throw new Error('denied');},setItem:() => {throw new Error('quota');}};
  assert.deepEqual(loadInitialPatch('',storage).config,makeDemoConfig());
  assert.equal(savePatch(makeDemoConfig(),storage),false);
  for (const value of [NaN,Infinity,0,17,2.5]) {
    const config = makeDemoConfig(); config.rhythmDivisions[0] = value;
    assert.throws(() => validateConfig(config));
  }
  const config = makeDemoConfig();
  config.connections = [{id:'feedback',from:'trigger-out',to:'trigger-in'}];
  assert.throws(() => validateConfig(config),/feedback/);
  assert.throws(() => parsePatch('{'),/JSON/);
  assert.throws(() => parsePatch('{"version":2}'),/version/);
  assert.throws(() => decodePatch('!'));
});
test('connecting replaces occupied jacks and leaves input config immutable', () => {
  const config = makeDemoConfig();
  const first = editConfig(config,{type:'connect',from:'seq1-out',to:'vco2-in'});
  const second = editConfig(first,{type:'connect',from:'seq1-out',to:'rhythm1-in'});
  assert.equal(config.connections.length,0);
  assert.equal(first.connections[0].to,'vco2-in');
  assert.equal(second.connections.length,1);
  assert.equal(second.connections[0].to,'rhythm1-in');
  assert.throws(() => editConfig(second,{type:'connect',from:'clock-out',to:'vco1-in'}));
});
test('serialization strips unexpected state instead of trusting imported properties', () => {
  const value = {...makeDemoConfig(),runtime:{running:true},untrusted:'discard'};
  assert.equal('runtime' in validateConfig(value),false);
  let key = '';
  assert.equal(savePatch(makeDemoConfig(),{getItem:() => null,setItem:(k) => {key=k;}}),true);
  assert.equal(key,STORAGE_KEY);
});
