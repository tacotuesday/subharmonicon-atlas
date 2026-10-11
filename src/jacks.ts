import type { JackId, JackSpec, PanelSpec } from './contracts.ts';

const rows: [JackId, string, 'input' | 'output', 'cv' | 'gate' | 'inactive'][] = [
  ['vco1-in','VCO 1','input','cv'], ['vco1-sub-in','VCO 1 SUB','input','cv'], ['vco1-pwm-in','VCO 1 PWM','input','inactive'], ['vca-out','VCA','output','inactive'],
  ['vco1-out','VCO 1','output','inactive'], ['vco1-sub1-out','VCO 1 SUB 1','output','inactive'], ['vco1-sub2-out','VCO 1 SUB 2','output','inactive'], ['vca-in','VCA','input','inactive'],
  ['vco2-in','VCO 2','input','cv'], ['vco2-sub-in','VCO 2 SUB','input','cv'], ['vco2-pwm-in','VCO 2 PWM','input','inactive'], ['vca-eg-out','VCA EG','output','inactive'],
  ['vco2-out','VCO 2','output','inactive'], ['vco2-sub1-out','VCO 2 SUB 1','output','inactive'], ['vco2-sub2-out','VCO 2 SUB 2','output','inactive'], ['cutoff-in','CUTOFF','input','inactive'],
  ['play-in','PLAY','input','gate'], ['reset-in','RESET','input','gate'], ['trigger-in','TRIGGER','input','gate'], ['vcf-eg-out','VCF EG','output','inactive'],
  ['rhythm1-in','RHYTHM 1','input','cv'], ['rhythm2-in','RHYTHM 2','input','cv'], ['rhythm3-in','RHYTHM 3','input','cv'], ['rhythm4-in','RHYTHM 4','input','cv'],
  ['seq1-out','SEQ 1','output','cv'], ['seq1-clk-out','SEQ 1 CLK','output','gate'], ['seq2-out','SEQ 2','output','cv'], ['seq2-clk-out','SEQ 2 CLK','output','gate'],
  ['midi-in','MIDI IN','input','inactive'], ['clock-in','CLOCK','input','inactive'], ['clock-out','CLOCK','output','gate'], ['trigger-out','TRIGGER','output','gate'],
];
export const JACKS: JackSpec[] = rows.map(([id,label,direction,signal],index) => ({ id,label,direction,signal,enabled:signal !== 'inactive',x:1093 + (index % 4)*44,y:74 + Math.floor(index/4)*53 }));
export const PANEL_SPEC: PanelSpec = { width: 1280, height: 530, jacks: JACKS };
export function validateConnection(from: JackId, to: JackId): { valid: boolean; reason?: string } {
  const source = JACKS.find(j => j.id === from), target = JACKS.find(j => j.id === to);
  if (!source || !target) return { valid:false,reason:'Unknown patch point.' };
  if (!source.enabled || !target.enabled) return { valid:false,reason:'This patch point is outside the visual control model.' };
  if (source.direction !== 'output' || target.direction !== 'input') return { valid:false,reason:'Connect an output to an input.' };
  if (source.signal !== target.signal) return { valid:false,reason:'Connect sequencer CV to pitch/divider inputs, or clock/trigger outputs to gate inputs.' };
  if (from === 'trigger-out' && to === 'trigger-in') return { valid:false,reason:'Direct TRIGGER feedback is not supported.' };
  return { valid:true };
}
