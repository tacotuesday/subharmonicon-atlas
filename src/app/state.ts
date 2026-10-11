import type { InstrumentAction, InstrumentConfig, RuntimeState, SimulationFrame } from '../contracts.ts';
import { advanceClock, advanceTime, applyTransport, createRuntime } from '../engine/index.ts';
import { editConfig } from './config.ts';

export interface AppState { config:InstrumentConfig; pendingConfig:InstrumentConfig | null; runtime:RuntimeState; history:SimulationFrame[]; notice:string }
export function createAppState(config: InstrumentConfig, notice = ''): AppState {
  return {config,pendingConfig:null,runtime:createRuntime(config),history:[],notice};
}
export function dispatchAction(state: AppState, action: InstrumentAction): AppState {
  try {
    if (action.type === 'replace-config') return createAppState(action.config,'Patch loaded. Playback starts paused.');
    if (action.type === 'transport') {
      const runtime = applyTransport(state.config,state.runtime,action.command);
      if (!runtime.running && state.pendingConfig) return {...state,config:state.pendingConfig,pendingConfig:null,runtime};
      return {...state,runtime};
    }
    const config = editConfig(state.pendingConfig ?? state.config,action);
    return state.runtime.running ? {...state,pendingConfig:config,notice:''} : {...state,config,pendingConfig:null,notice:''};
  } catch (error) { return {...state,notice:error instanceof Error ? error.message : 'That change could not be applied.'}; }
}
export function elapse(state: AppState, elapsedMs: number): AppState {
  if ((!state.runtime.running && !state.runtime.pendingEdges.length) || elapsedMs <= 0) return state;
  let config = state.config, pendingConfig = state.pendingConfig;
  let runtime = state.runtime;
  const target = runtime.timeMs + elapsedMs;
  const added:SimulationFrame[] = [];
  let safety = 0;
  while (runtime.running && runtime.nextClockAtMs <= target && safety++ < 5000) {
    runtime = advanceTime(config,runtime,runtime.nextClockAtMs);
    if (!runtime.running) break;
    if (pendingConfig) { config = pendingConfig; pendingConfig = null; }
    const result = advanceClock(config,runtime);
    if (result.runtime.pulse > runtime.pulse) added.push({...result.frame,preview:false});
    runtime = result.runtime;
  }
  if (safety >= 5000) {
    if (runtime.running) runtime = applyTransport(config,runtime,'toggle-play');
    return {...state,config,pendingConfig,runtime,history:[...state.history,...added].slice(-4096),notice:'Playback paused after a long browser interruption.'};
  }
  runtime = advanceTime(config,runtime,target);
  if (!runtime.running && pendingConfig) { config = pendingConfig; pendingConfig = null; }
  return {...state,config,pendingConfig,runtime,history:added.length ? [...state.history,...added].slice(-4096) : state.history};
}
