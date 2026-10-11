export type Pair<T> = [T, T];
export type Triple<T> = [T, T, T];
export type Quad<T> = [T, T, T, T];
export type QuantizeMode = 'off' | '12-et' | '8-et' | '12-ji' | '8-ji';
export type EgMode = 'on' | 'off' | 'held';
export type VoiceId = 'vco1' | 'vco1sub1' | 'vco1sub2' | 'vco2' | 'vco2sub1' | 'vco2sub2';
export type JackId =
  | 'vco1-in' | 'vco1-sub-in' | 'vco1-pwm-in' | 'vca-out'
  | 'vco1-out' | 'vco1-sub1-out' | 'vco1-sub2-out' | 'vca-in'
  | 'vco2-in' | 'vco2-sub-in' | 'vco2-pwm-in' | 'vca-eg-out'
  | 'vco2-out' | 'vco2-sub1-out' | 'vco2-sub2-out' | 'cutoff-in'
  | 'play-in' | 'reset-in' | 'trigger-in' | 'vcf-eg-out'
  | 'rhythm1-in' | 'rhythm2-in' | 'rhythm3-in' | 'rhythm4-in'
  | 'seq1-out' | 'seq1-clk-out' | 'seq2-out' | 'seq2-clk-out'
  | 'midi-in' | 'clock-in' | 'clock-out' | 'trigger-out';
export interface PatchConnection { id: string; from: JackId; to: JackId }
export interface InstrumentConfig {
  version: 1; name: string; tempoBpm: number;
  rhythmDivisions: Quad<number>;
  rhythmAssignments: Quad<Pair<boolean>>;
  oscillatorFrequencies: Pair<number>;
  subDivisions: Pair<Pair<number>>;
  sequencerSteps: Pair<Quad<number>>;
  sequencerAssignments: Pair<Triple<boolean>>;
  quantize: QuantizeMode; octaveRange: 1 | 2 | 5; egMode: EgMode;
  connections: PatchConnection[];
}
export interface GateEdge { atMs: number; source: JackId; high: boolean }
export interface RuntimeState {
  pulse: number; timeMs: number; nextClockAtMs: number; running: boolean;
  rhythmCounters: Quad<number>; sequencerPositions: Pair<number>;
  resetHeld: boolean; manualResetHeld: boolean; triggerHeld: boolean;
  gateLevels: Partial<Record<JackId, boolean>>;
  sourceGateLevels: Partial<Record<JackId, boolean>>;
  pendingEdges: GateEdge[];
  lastFrequencies: number[];
}
export interface VoiceFrame {
  id: VoiceId; label: string; frequency: number; note: string; cents: number;
  division: number; parentId: VoiceId | null; sequencer: 0 | 1;
  updated: boolean; pitchChanged: boolean; contributors: number[]; valueSources: string[];
}
export interface SimulationFrame {
  pulse: number; timeMs: number; rhythmPulses: Quad<boolean>; effectiveDivisions: Quad<number>;
  rhythmContributors: Pair<number[]>; sequencerAdvanced: Pair<boolean>;
  sequencerPositions: Pair<number>; voices: VoiceFrame[];
  trigger: boolean; triggerSources: string[]; reset: boolean; preview?: boolean;
}
export interface RepeatInfo { variable: boolean; rhythmPulses: number | null; sequencePulses: number | null }
export type TransportCommand = 'toggle-play' | 'reset' | 'next' | 'trigger' | 'reset-hold-start' | 'reset-hold-end' | 'trigger-hold-start' | 'trigger-hold-end';
export type InstrumentAction =
  | { type: 'set-name'; value: string }
  | { type: 'set-tempo'; value: number }
  | { type: 'set-rhythm'; index: number; value: number }
  | { type: 'toggle-rhythm-assignment'; rhythm: number; sequencer: number }
  | { type: 'set-osc-frequency'; oscillator: number; value: number }
  | { type: 'set-sub-division'; oscillator: number; sub: number; value: number }
  | { type: 'set-step'; sequencer: number; step: number; value: number }
  | { type: 'toggle-seq-assignment'; sequencer: number; target: number }
  | { type: 'cycle-quantize' } | { type: 'cycle-octave' }
  | { type: 'set-eg-mode'; value: EgMode }
  | { type: 'transport'; command: TransportCommand }
  | { type: 'connect'; from: JackId; to: JackId }
  | { type: 'disconnect'; id: string }
  | { type: 'replace-config'; config: InstrumentConfig };
export interface JackSpec {
  id: JackId; label: string; direction: 'input' | 'output';
  signal: 'cv' | 'gate' | 'inactive'; enabled: boolean; x: number; y: number;
}
export interface PanelSpec { width: number; height: number; jacks: JackSpec[] }
export interface InstrumentPanelProps {
  config: InstrumentConfig; runtime: RuntimeState; voices: VoiceFrame[];
  dispatch: (action: InstrumentAction) => void; pending: boolean;
}
export interface TimelineProps {
  config: InstrumentConfig; frames: SimulationFrame[]; voices: VoiceFrame[];
  cursorPulse: number; windowStart: number; windowSize: number; follow: boolean;
  repeat: RepeatInfo; running: boolean;
  onWindowSizeChange: (size: number) => void; onNavigate: (direction: -1 | 1) => void;
  onFollowChange: (follow: boolean) => void;
}
