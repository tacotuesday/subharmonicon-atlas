import type { InstrumentAction, InstrumentConfig, JackId } from '../contracts.ts';
import { validateConnection } from '../jacks.ts';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const modes = ['off', '12-et', '8-et', '12-ji', '8-ji'] as const;
export function editConfig(config: InstrumentConfig, action: InstrumentAction): InstrumentConfig {
  const next = structuredClone(config);
  const index = (value: number, count: number) => Number.isInteger(value) && value >= 0 && value < count;
  const number = (value: number) => Number.isFinite(value);
  switch (action.type) {
    case 'set-name': next.name = action.value.slice(0, 80); break;
    case 'set-tempo': if (number(action.value)) next.tempoBpm = clamp(action.value, 20, 3000); break;
    case 'set-rhythm': if (index(action.index,4) && number(action.value)) next.rhythmDivisions[action.index] = clamp(Math.round(action.value),1,16); break;
    case 'toggle-rhythm-assignment': if (index(action.rhythm,4) && index(action.sequencer,2)) next.rhythmAssignments[action.rhythm][action.sequencer] = !next.rhythmAssignments[action.rhythm][action.sequencer]; break;
    case 'set-osc-frequency': if (index(action.oscillator,2) && number(action.value)) next.oscillatorFrequencies[action.oscillator] = clamp(action.value,261.6255653005986,4186.009044809578); break;
    case 'set-sub-division': if (index(action.oscillator,2) && index(action.sub,2) && number(action.value)) next.subDivisions[action.oscillator][action.sub] = clamp(Math.round(action.value),1,16); break;
    case 'set-step': if (index(action.sequencer,2) && index(action.step,4) && number(action.value)) next.sequencerSteps[action.sequencer][action.step] = clamp(action.value,-1,1); break;
    case 'toggle-seq-assignment': if (index(action.sequencer,2) && index(action.target,3)) next.sequencerAssignments[action.sequencer][action.target] = !next.sequencerAssignments[action.sequencer][action.target]; break;
    case 'cycle-quantize': next.quantize = modes[(modes.indexOf(next.quantize)+1)%modes.length]; break;
    case 'cycle-octave': next.octaveRange = next.octaveRange === 1 ? 2 : next.octaveRange === 2 ? 5 : 1; break;
    case 'set-eg-mode': next.egMode = action.value; break;
    case 'connect': {
      const verdict = validateConnection(action.from,action.to);
      if (!verdict.valid) throw new Error(verdict.reason);
      next.connections = next.connections.filter(c => c.from !== action.from && c.to !== action.to);
      next.connections.push({id:`${action.from}:${action.to}`,from:action.from,to:action.to});
      break;
    }
    case 'disconnect': next.connections = next.connections.filter(c => c.id !== action.id); break;
    case 'replace-config': return structuredClone(action.config);
    case 'transport': return config;
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function requireNumber(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error('Patch contains a value outside the instrument’s supported range.');
  return value;
}
function requireArray(value: unknown, length: number): unknown[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error('Patch has missing or malformed instrument settings.');
  return value;
}
function requireBoolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Patch assignments must be true or false.'); return value; }

export function validateConfig(value: unknown): InstrumentConfig {
  if (!isRecord(value) || value.version !== 1) throw new Error('This patch format is not supported. Expected version 1.');
  if (typeof value.name !== 'string' || value.name.length > 80) throw new Error('Patch names must be at most 80 characters.');
  if (!modes.includes(value.quantize as typeof modes[number])) throw new Error('Unknown quantization mode.');
  if (![1,2,5].includes(value.octaveRange as number) || !['on','off','held'].includes(value.egMode as string)) throw new Error('Unknown octave range or envelope mode.');
  const rhythmDivisions = requireArray(value.rhythmDivisions,4).map(v => requireNumber(v,1,16,true));
  const rhythmAssignments = requireArray(value.rhythmAssignments,4).map(v => requireArray(v,2).map(requireBoolean));
  const oscillatorFrequencies = requireArray(value.oscillatorFrequencies,2).map(v => requireNumber(v,261.6255653005986,4186.009044809578));
  const subDivisions = requireArray(value.subDivisions,2).map(v => requireArray(v,2).map(n => requireNumber(n,1,16,true)));
  const sequencerSteps = requireArray(value.sequencerSteps,2).map(v => requireArray(v,4).map(n => requireNumber(n,-1,1)));
  const sequencerAssignments = requireArray(value.sequencerAssignments,2).map(v => requireArray(v,3).map(requireBoolean));
  if (!Array.isArray(value.connections) || value.connections.length > 16) throw new Error('Patch cable list is malformed.');
  const usedSources = new Set<string>(), usedTargets = new Set<string>(), ids = new Set<string>();
  const connections = value.connections.map(connection => {
    if (!isRecord(connection) || typeof connection.id !== 'string' || connection.id.length > 100 || typeof connection.from !== 'string' || typeof connection.to !== 'string') throw new Error('A patch cable is malformed.');
    const from = connection.from as JackId, to = connection.to as JackId;
    const verdict = validateConnection(from,to);
    if (!verdict.valid) throw new Error(verdict.reason);
    if (usedSources.has(from) || usedTargets.has(to) || ids.has(connection.id)) throw new Error('Each jack accepts one cable. Patch contains duplicate connections.');
    usedSources.add(from); usedTargets.add(to); ids.add(connection.id);
    return {id:connection.id,from,to};
  });
  return {
    version:1,name:value.name,tempoBpm:requireNumber(value.tempoBpm,20,3000),
    rhythmDivisions:rhythmDivisions as InstrumentConfig['rhythmDivisions'], rhythmAssignments:rhythmAssignments as InstrumentConfig['rhythmAssignments'],
    oscillatorFrequencies:oscillatorFrequencies as InstrumentConfig['oscillatorFrequencies'], subDivisions:subDivisions as InstrumentConfig['subDivisions'],
    sequencerSteps:sequencerSteps as InstrumentConfig['sequencerSteps'], sequencerAssignments:sequencerAssignments as InstrumentConfig['sequencerAssignments'],
    quantize:value.quantize as InstrumentConfig['quantize'],octaveRange:value.octaveRange as InstrumentConfig['octaveRange'],egMode:value.egMode as InstrumentConfig['egMode'],connections,
  };
}
