import type { InstrumentConfig } from './contracts.ts';

export function makeDemoConfig(): InstrumentConfig {
  return {
    version: 1, name: 'Two meets three', tempoBpm: 120,
    rhythmDivisions: [2, 3, 4, 5], rhythmAssignments: [[true, false], [true, true], [false, false], [false, false]],
    oscillatorFrequencies: [261.6255653005986, 391.99543598174927], subDivisions: [[2, 3], [3, 4]],
    sequencerSteps: [[0, 7 / 12, 1, 5 / 12], [0, -5 / 12, 2 / 12, -2 / 12]],
    sequencerAssignments: [[true, false, false], [true, false, false]],
    quantize: '12-et', octaveRange: 1, egMode: 'on', connections: [],
  };
}
