import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { InstrumentPanelProps, JackId, JackSpec, TransportCommand } from '../contracts.ts';
import { PANEL_SPEC, validateConnection } from '../jacks.ts';
import { knobAngle, knobTicks } from './knobScales.ts';
import type { KnobScale } from './knobScales.ts';
import './InstrumentPanel.css';
import { WaveformSwitch } from './WaveformSwitch.tsx';

const COLORS = ['#ed8d67', '#75c5c1', '#c8ac70', '#b89ed7', '#d7dbbd'];
const QUANTIZE_NAMES = { off: 'OFF', '12-et': '12-ET', '8-et': '8-ET', '12-ji': '12-JI', '8-ji': '8-JI' };
const OSC_MIN = 262;
const OSC_MAX = 4186;
const at = (x: number, y: number): CSSProperties => ({ left: x, top: y });
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

interface KnobProps {
  id: string; label: string; value: number; min: number; max: number;
  x: number; y: number; size?: number; step?: number; reverse?: boolean;
  logarithmic?: boolean; disabled?: boolean; unit?: string;
  scale: KnobScale;
  accessibleLabel?: string; quiet?: boolean;
  format?: (n: number) => string; onChange?: (value: number) => void;
}

function Knob({ id, label, value, min, max, x, y, size = 55, step = 1, reverse = false, logarithmic = false, disabled = false, unit, scale, accessibleLabel = label, quiet = false, format = n => `${n}`, onChange }: KnobProps) {
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState('');
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ y: number; normalized: number } | null>(null);
  const toNorm = (n: number) => logarithmic ? Math.log(n / min) / Math.log(max / min) : (n - min) / (max - min);
  const fromNorm = (n: number) => logarithmic ? min * (max / min) ** n : min + n * (max - min);
  const normalized = toNorm(value);
  const angle = knobAngle(normalized, scale, reverse);
  const send = (n: number) => {
    const precise = logarithmic ? n : Math.round(n / step) * step;
    onChange?.(clamp(precise, min, max));
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const amount = (event.shiftKey ? 0.1 : 1) * step;
    if (event.key === 'Home') send(min);
    else if (event.key === 'End') send(max);
    else if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) {
      const direction = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1;
      if (logarithmic) send(fromNorm(clamp(normalized + direction * (event.shiftKey ? 0.001 : 0.01), 0, 1)));
      else send(value + direction * amount * (reverse ? -1 : 1));
    } else if (event.key === 'Enter') { setEntry(String(Number(value.toFixed(4)))); setEditing(true); }
    else return;
    event.preventDefault();
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    drag.current = { y: event.clientY, normalized };
    setActive(true);
    event.preventDefault();
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const sensitivity = event.shiftKey ? 900 : 180;
    const next = clamp(drag.current.normalized + ((drag.current.y - event.clientY) / sensitivity) * (reverse ? -1 : 1), 0, 1);
    send(fromNorm(next));
  };
  const finish = () => { drag.current = null; setActive(false); };
  const saveEntry = () => {
    const n = Number(entry);
    if (entry.trim() === '' || !Number.isFinite(n) || n < min || n > max) { setError(`Enter a value from ${min.toFixed(2)} to ${max.toFixed(2)}.`); return; }
    send(n); setEditing(false); setError('');
  };
  return <div data-knob-id={id} className={`knob-control ${disabled ? 'knob-control-inactive' : ''} ${active || editing ? 'knob-control-active' : ''} ${quiet ? 'knob-control-quiet' : ''}`} style={{ ...at(x - size / 2, y - size / 2), width: size, height: size }}>
    <span className="knob-label" id={`${id}-label`}>{label}</span>
    <svg className="knob-ticks" data-scale={scale} viewBox="0 0 100 100" aria-hidden="true">
      {knobTicks(scale).map(({ angle: tickAngle, major }, index) => {
        const radians = (tickAngle - 90) * Math.PI / 180;
        const inner = major ? 40 : 45;
        return <line key={index} className={major ? 'knob-tick-major' : 'knob-tick-minor'} data-tick-angle={tickAngle} x1={50 + Math.cos(radians) * inner} y1={50 + Math.sin(radians) * inner} x2={50 + Math.cos(radians) * 49} y2={50 + Math.sin(radians) * 49} />;
      })}
    </svg>
    <div className="knob-face" role="slider" tabIndex={disabled ? -1 : 0} aria-label={accessibleLabel} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${format(value)}${unit ? ` ${unit}` : ''}`} aria-disabled={disabled} title={disabled ? 'Timbre control — not modeled' : `${accessibleLabel}: ${format(value)}${unit ? ` ${unit}` : ''}. Drag vertically; Shift for fine control. Enter to type a value.`} onKeyDown={key} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} style={{ '--knob-angle': `${angle}deg` } as CSSProperties}>
      <span className="knob-rim"><span className="knob-core"><span className="knob-indicator" /></span></span>
    </div>
    {disabled ? <span className="knob-value knob-value-inactive">VISUAL ONLY</span> : <button className="knob-value" type="button" aria-label={`Enter ${accessibleLabel} value`} onClick={() => { setEntry(String(Number(value.toFixed(4)))); setError(''); setEditing(!editing); }}>{format(value)}{unit && <span className="knob-unit"> {unit}</span>}</button>}
    {editing && <form className="knob-entry" style={{ left: clamp(x, 138, PANEL_SPEC.width - 138) - x + size / 2, ...(y > 330 ? { top: 'auto', bottom: 'calc(100% + 22px)' } : {}) }} onSubmit={event => { event.preventDefault(); saveEntry(); }}>
      <label htmlFor={`${id}-entry`}>{label}</label>
      <div className="knob-entry-line"><input id={`${id}-entry`} type="number" min={min} max={max} step={logarithmic ? 'any' : step} value={entry} onChange={event => setEntry(event.target.value)} autoFocus onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} /><button type="submit">Set</button><button type="button" aria-label="Cancel value entry" onClick={() => setEditing(false)}>×</button></div>
      {error && <span className="knob-entry-error" role="alert">{error}</span>}
    </form>}
  </div>;
}

interface PanelButtonProps { x: number; y: number; children: string; label: string; onClick: () => void; lit?: boolean; width?: number; className?: string; title?: string }
function PanelButton({ x, y, children, label, onClick, lit = false, width = 38, className = '', title }: PanelButtonProps) {
  return <button className={`panel-button ${lit ? 'panel-button-lit' : ''} ${className}`} style={{ ...at(x, y), width }} type="button" aria-label={label} aria-pressed={lit} title={title ?? label} onClick={onClick}>{children}</button>;
}

function HoldButton({ x, y, label, width = 38, lit, command, dispatch }: { x: number; y: number; label: 'RESET' | 'TRIGGER'; width?: number; lit?: boolean; command: 'reset' | 'trigger'; dispatch: InstrumentPanelProps['dispatch'] }) {
  const held = useRef(false);
  const send = (next: TransportCommand) => dispatch({ type: 'transport', command: next });
  const release = () => { if (held.current) { held.current = false; send(`${command}-hold-end`); } };
  useEffect(() => () => { if (held.current) dispatch({ type: 'transport', command: `${command}-hold-end` }); }, [command, dispatch]);
  return <button type="button" className={`panel-button ${lit ? 'panel-button-lit' : ''}`} style={{ ...at(x, y), width }} aria-label={label === 'RESET' ? 'Reset sequencers; hold to keep Step 1' : 'Trigger envelopes; hold to sustain trigger gate'} aria-pressed={!!lit} title={label === 'RESET' ? 'Reset to Step 1. Hold to keep the sequencers reset.' : 'Trigger the shared envelope gate. Hold for a sustained gate.'} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); held.current = true; send(`${command}-hold-start`); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onClick={event => { if (event.detail === 0) send(command); }}>{label}</button>;
}

function jackDescription(jack: JackSpec) {
  return `${jack.label} ${jack.direction}${jack.enabled ? `, ${jack.signal === 'cv' ? 'control voltage' : 'gate'}` : ', not modeled'}`;
}

export function InstrumentPanel({ config, runtime, dispatch, pending }: InstrumentPanelProps) {
  const board = useRef<HTMLDivElement>(null);
  const [patchSource, setPatchSource] = useState<JackId | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedCable, setSelectedCable] = useState<string | null>(null);
  const [patchMessage, setPatchMessage] = useState('Choose an output, then an input. Dragging works too.');
  const cableDrag = useRef<{ source: JackId; x: number; y: number; moved: boolean } | null>(null);
  const egTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const egLongPress = useRef(false);
  useEffect(() => () => { if (egTimer.current) clearTimeout(egTimer.current); }, []);
  useEffect(() => { if (selectedCable && !config.connections.some(connection => connection.id === selectedCable)) setSelectedCable(null); }, [config.connections, selectedCable]);
  const patch = (from: JackId, to: JackId) => {
    const validation = validateConnection(from, to);
    if (validation.valid) {
      dispatch({ type: 'connect', from, to });
      setPatchSource(null);
      const source = PANEL_SPEC.jacks.find(jack => jack.id === from)!;
      const target = PANEL_SPEC.jacks.find(jack => jack.id === to)!;
      setPatchMessage(`${source.label} output connected to ${target.label} input. Existing cables at either jack are replaced.`);
    } else setPatchMessage(validation.reason ?? 'That connection is not supported.');
  };
  const localPoint = (event: PointerEvent) => {
    const rect = board.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * PANEL_SPEC.width / rect.width, y: (event.clientY - rect.top) * PANEL_SPEC.height / rect.height };
  };
  const startCable = (event: PointerEvent<HTMLButtonElement>, jack: JackSpec) => {
    if (event.button !== 0 || jack.direction !== 'output' || !jack.enabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    cableDrag.current = { source: jack.id, ...point, moved: false };
    setPatchSource(jack.id);
    setSelectedCable(null);
    setPatchMessage(`${jack.label} output selected. Choose a supported ${jack.signal === 'cv' ? 'pitch or rhythm' : 'gate'} input; Escape cancels.`);
  };
  const moveCable = (event: PointerEvent<HTMLDivElement>) => {
    if (!cableDrag.current) return;
    const point = localPoint(event);
    if (Math.hypot(point.x - cableDrag.current.x, point.y - cableDrag.current.y) > 5) cableDrag.current.moved = true;
    if (cableDrag.current.moved) setDragPoint(point);
  };
  const finishCable = (event: PointerEvent<HTMLDivElement>) => {
    if (!cableDrag.current) return;
    const { source, moved } = cableDrag.current;
    if (moved) {
      const point = localPoint(event);
      const target = PANEL_SPEC.jacks.find(jack => Math.hypot(jack.x - point.x, jack.y - point.y) < 21);
      if (target) patch(source, target.id);
      else setPatchMessage('Cable not connected. Choose a supported input, or press Escape to cancel.');
    }
    cableDrag.current = null;
    setDragPoint(null);
  };
  const cancelCable = () => { cableDrag.current = null; setDragPoint(null); };
  const selectJack = (jack: JackSpec) => {
    if (jack.direction === 'output') { setPatchSource(jack.id); setSelectedCable(null); setPatchMessage(`${jack.label} output selected. Choose an input.`); }
    else if (patchSource) patch(patchSource, jack.id);
    else setPatchMessage('Choose an output first, then this input.');
  };
  const removeCable = (id: string) => { dispatch({ type: 'disconnect', id }); setSelectedCable(null); setPatchMessage('Cable removed.'); };
  const curve = (from: { x: number; y: number }, to: { x: number; y: number }, index = 0) => {
    const bend = 72 + index % 3 * 22;
    return `M ${from.x} ${from.y} C ${from.x - bend} ${from.y + 45}, ${to.x - bend} ${to.y - 45}, ${to.x} ${to.y}`;
  };
  const sourceJack = PANEL_SPEC.jacks.find(jack => jack.id === patchSource);
  const stopEgTimer = () => { if (egTimer.current) { clearTimeout(egTimer.current); egTimer.current = null; } };
  return <section className="instrument-section" aria-label="Virtual Subharmonicon instrument">
    <div className="instrument-caption"><span className="instrument-caption-label">CONTROL SURFACE</span><span className="instrument-caption-hint">Drag knobs ↕ · click a value to type · patch output → input</span>{pending && <span className="instrument-pending" role="status">Changes on next clock</span>}</div>
    <div className="instrument-scroll" tabIndex={0} aria-label="Instrument panel; scroll horizontally on smaller screens">
      <div ref={board} className="instrument-panel" style={{ width: PANEL_SPEC.width, height: PANEL_SPEC.height }} onPointerMove={moveCable} onPointerUp={finishCable} onPointerCancel={cancelCable} onKeyDown={event => { if (event.key === 'Escape') { setPatchSource(null); setDragPoint(null); cableDrag.current = null; setPatchMessage('Patching canceled.'); } if (event.key === 'Delete' && selectedCable && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); removeCable(selectedCable); } }}>
        <div className="panel-wood panel-wood-left" aria-hidden="true" /><div className="panel-wood panel-wood-right" aria-hidden="true" />
        <div className="panel-section panel-sequencers" style={{ ...at(25, 23), width: 283, height: 197 }}><span className="panel-section-title">SEQUENCER 1</span><span className="panel-subsection-title" style={at(100, 98)}>SEQUENCER 2</span></div>
        <div className="panel-section" style={{ ...at(25, 237), width: 283, height: 155 }}><span className="panel-section-title">POLYRHYTHM</span></div>
        <div className="panel-section" style={{ ...at(25, 392), width: 283, height: 97 }} />
        <div className="panel-section" style={{ ...at(317, 23), width: 528, height: 242 }}><span className="panel-section-title">OSCILLATORS</span><span className="panel-number" style={at(15, 8)}>1</span><span className="panel-number" style={at(490, 8)}>2</span></div>
        <div className="panel-section" style={{ ...at(317, 273), width: 528, height: 216 }} />
        <div className="panel-section panel-timbre-section" style={{ ...at(854, 23), width: 204, height: 242 }} />
        <div className="panel-section" style={{ ...at(854, 273), width: 204, height: 216 }} />
        <div className="panel-section panel-patchbay-frame" style={{ ...at(1067, 23), width: 190, height: 466 }}><span className="panel-section-title">IN / OUT</span></div>

        {[0, 1].map(sequencer => [0, 1, 2, 3].map(step => <div key={`${sequencer}-${step}`}>
          <Knob id={`seq-${sequencer}-step-${step}`} label={`STEP ${step + 1}`} scale="sequencer" accessibleLabel={`Sequencer ${sequencer + 1} Step ${step + 1}`} quiet value={config.sequencerSteps[sequencer][step]} min={-1} max={1} step={0.01} x={61 + step * 70} y={sequencer === 0 ? 75 : 179} size={43} format={n => `${n > 0 ? '+' : ''}${n.toFixed(2)}`} onChange={value => dispatch({ type: 'set-step', sequencer, step, value })} />
          <span className={`panel-led ${runtime.sequencerPositions[sequencer] === step ? 'panel-led-on' : ''}`} style={at(56 + step * 70, sequencer === 0 ? 109 : 213)} aria-label={`Sequencer ${sequencer + 1} Step ${step + 1}${runtime.sequencerPositions[sequencer] === step ? ', current step' : ''}`} />
        </div>))}
        {[0, 1, 2, 3].map(rhythm => <div key={rhythm}>
          <Knob id={`rhythm-${rhythm}`} label={`RHYTHM ${rhythm + 1}`} scale="division" value={config.rhythmDivisions[rhythm]} min={1} max={16} reverse x={61 + rhythm * 70} y={296} size={44} format={n => `÷${n}`} onChange={value => dispatch({ type: 'set-rhythm', index: rhythm, value })} />
          {[0, 1].map(sequencer => <PanelButton key={sequencer} x={40 + rhythm * 70} y={336 + sequencer * 31} width={42} label={`Assign Rhythm ${rhythm + 1} to Sequencer ${sequencer + 1}`} lit={config.rhythmAssignments[rhythm][sequencer]} onClick={() => dispatch({ type: 'toggle-rhythm-assignment', rhythm, sequencer })}>{`SEQ ${sequencer + 1}`}</PanelButton>)}
        </div>)}
        <Knob id="tempo" label="TEMPO" scale="frequency" value={config.tempoBpm} min={20} max={3000} logarithmic x={79} y={458} size={73} format={n => String(Math.round(n))} unit="BPM" onChange={value => dispatch({ type: 'set-tempo', value: Math.round(value) })} />
        <HoldButton x={145} y={410} label="RESET" command="reset" lit={runtime.resetHeld} dispatch={dispatch} />
        <button className={`panel-button ${config.egMode !== 'off' ? 'panel-button-lit' : ''}`} style={{ ...at(193, 410), width: 38 }} type="button" aria-label={`Envelope gate ${config.egMode}; hold or press H for held mode`} aria-pressed={config.egMode !== 'off'} title={`EG ${config.egMode.toUpperCase()}. Click for on/off; hold or press H for held gate.`} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); stopEgTimer(); egLongPress.current = false; egTimer.current = setTimeout(() => { egLongPress.current = true; dispatch({ type: 'set-eg-mode', value: 'held' }); }, 550); }} onPointerUp={stopEgTimer} onPointerCancel={stopEgTimer} onLostPointerCapture={stopEgTimer} onClick={() => { if (!egLongPress.current) dispatch({ type: 'set-eg-mode', value: config.egMode === 'on' ? 'off' : 'on' }); egLongPress.current = false; }} onKeyDown={event => { if (event.key.toLowerCase() === 'h') { event.preventDefault(); dispatch({ type: 'set-eg-mode', value: 'held' }); } }}>EG<span className="panel-button-mode">{config.egMode === 'held' ? 'HOLD' : ''}</span></button>
        <PanelButton x={241} y={410} label="Advance to next sequencer step" onClick={() => dispatch({ type: 'transport', command: 'next' })}>NEXT</PanelButton>
        <PanelButton x={145} y={452} width={64} label={runtime.running ? 'Stop sequencers' : 'Play sequencers'} lit={runtime.running} onClick={() => dispatch({ type: 'transport', command: 'toggle-play' })}>PLAY</PanelButton>
        <HoldButton x={221} y={452} width={58} label="TRIGGER" command="trigger" lit={runtime.triggerHeld} dispatch={dispatch} />

        {[0, 1].map(oscillator => <div key={oscillator}>
          <Knob id={`vco-${oscillator}`} label={`VCO ${oscillator + 1} FREQ`} scale="frequency" value={clamp(config.oscillatorFrequencies[oscillator], OSC_MIN, OSC_MAX)} min={OSC_MIN} max={OSC_MAX} x={oscillator === 0 ? 448 : 713} y={112} size={88} format={n => Math.round(n).toLocaleString('en-US')} unit="Hz" onChange={value => dispatch({ type: 'set-osc-frequency', oscillator, value })} />
          <WaveformSwitch oscillator={oscillator} />
          {[0, 1].map(sub => <Knob key={sub} id={`vco-${oscillator}-sub-${sub}`} label={`SUB ${sub + 1} FREQ`} scale="division" accessibleLabel={`VCO ${oscillator + 1} Sub ${sub + 1} division`} value={config.subDivisions[oscillator][sub]} min={1} max={16} reverse x={(oscillator === 0 ? 389 : 653) + sub * 119} y={216} size={65} format={n => `÷${n}`} onChange={value => dispatch({ type: 'set-sub-division', oscillator, sub, value })} />)}
          <span className="panel-assign-title" style={at(oscillator === 0 ? 405 : 670, 286)}>SEQ {oscillator + 1} ASSIGN</span>
          {[0, 1, 2].map(target => <PanelButton key={target} x={(oscillator === 0 ? 355 : 620) + target * 65} y={305} width={45} label={`Assign Sequencer ${oscillator + 1} to ${target === 0 ? `Oscillator ${oscillator + 1}` : `Oscillator ${oscillator + 1} Sub ${target}`}`} lit={config.sequencerAssignments[oscillator][target]} onClick={() => dispatch({ type: 'toggle-seq-assignment', sequencer: oscillator, target })}>{target === 0 ? `OSC ${oscillator + 1}` : `SUB ${target}`}</PanelButton>)}
          <Knob id={`vco-${oscillator}-level`} label={`VCO ${oscillator + 1} LEVEL`} scale="dense" value={0.62} min={0} max={1} x={oscillator === 0 ? 448 : 713} y={389} size={64} disabled />
          {[0, 1].map(sub => <Knob key={sub} id={`vco-${oscillator}-sub-${sub}-level`} label={`SUB ${sub + 1} LEVEL`} scale="dense" value={0.45} min={0} max={1} x={(oscillator === 0 ? 389 : 653) + sub * 119} y={482} size={61} disabled />)}
        </div>)}
        <div className="panel-octave" style={at(565, 82)}>{[5, 2, 1].map(range => <span key={range}><i className={`panel-led ${config.octaveRange === range ? 'panel-led-on' : ''}`} />±{range}</span>)}</div>
        <PanelButton x={563} y={159} width={43} label={`Sequencer octave range ±${config.octaveRange}; click to change`} onClick={() => dispatch({ type: 'cycle-octave' })}>SEQ OCT</PanelButton>
        <div className="panel-quantize" style={at(565, 291)}>{(['12-et', '8-et', '12-ji', '8-ji'] as const).map(mode => <span key={mode}><i className={`panel-led ${config.quantize === mode ? 'panel-led-on' : ''}`} />{QUANTIZE_NAMES[mode]}</span>)}</div>
        <PanelButton x={560} y={397} width={48} label={`Quantization ${QUANTIZE_NAMES[config.quantize]}; click to change`} title={`Quantization ${QUANTIZE_NAMES[config.quantize]}. Cycles off, 12-tone equal, 8-tone equal, 12-tone just, 8-tone just.`} onClick={() => dispatch({ type: 'cycle-quantize' })}>QUANTIZE</PanelButton>
        <span className="panel-quantize-current" style={at(557, 430)}>{config.quantize === 'off' ? 'OFF' : QUANTIZE_NAMES[config.quantize]}</span>

        <Knob id="cutoff" label="CUTOFF" scale="dense" value={0.57} min={0} max={1} x={904} y={95} size={77} disabled />
        <Knob id="volume" label="VOLUME" scale="dense" value={0.68} min={0} max={1} x={1008} y={95} size={77} disabled />
        <Knob id="resonance" label="RESONANCE" scale="dense" value={0.22} min={0} max={1} x={904} y={213} size={77} disabled />
        <Knob id="vcf-eg-amt" label="VCF EG AMT" scale="dense" value={0.6} min={0} max={1} x={1008} y={213} size={77} disabled />
        {[['VCF ATTACK', 'vcf-attack', 904, 338, 0.14], ['VCF DECAY', 'vcf-decay', 1008, 338, 0.6], ['VCA ATTACK', 'vca-attack', 904, 460, 0.16], ['VCA DECAY', 'vca-decay', 1008, 460, 0.6]].map(([label, id, x, y, value]) => <Knob key={id} id={String(id)} label={String(label)} scale="frequency" value={Number(value)} min={0} max={1} x={Number(x)} y={Number(y)} size={82} disabled />)}

        <svg className="panel-cables" viewBox={`0 0 ${PANEL_SPEC.width} ${PANEL_SPEC.height}`} aria-label="Patch cables">
          {config.connections.map((connection, index) => {
            const from = PANEL_SPEC.jacks.find(jack => jack.id === connection.from)!;
            const to = PANEL_SPEC.jacks.find(jack => jack.id === connection.to)!;
            const path = curve(from, to, index);
            return <g key={connection.id} className={`panel-cable ${selectedCable === connection.id ? 'panel-cable-selected' : ''}`}>
              <path className="panel-cable-shadow" d={path} />
              <path className="panel-cable-line" d={path} stroke={COLORS[index % COLORS.length]} />
              <path className="panel-cable-hit" d={path} role="button" tabIndex={0} aria-label={`Select cable ${from.label} output to ${to.label} input; Delete removes it`} onClick={() => { setSelectedCable(connection.id); setPatchSource(null); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCable(connection.id); setPatchSource(null); } if (event.key === 'Delete' || event.key === 'Backspace') { event.stopPropagation(); event.preventDefault(); removeCable(connection.id); } }} />
            </g>;
          })}
          {sourceJack && dragPoint && <path className="panel-cable-preview" d={curve(sourceJack, dragPoint)} />}
        </svg>
        {PANEL_SPEC.jacks.map(jack => {
          const cableIndex = config.connections.findIndex(connection => connection.from === jack.id || connection.to === jack.id);
          const connected = cableIndex >= 0;
          return <div key={jack.id} className={`panel-jack-group ${jack.direction === 'output' ? 'panel-jack-output' : ''} ${!jack.enabled ? 'panel-jack-inactive' : ''}`} style={at(jack.x - 18, jack.y - 17)}>
            <span className="panel-jack-label">{jack.label}</span>
            <button type="button" className={`panel-jack ${patchSource === jack.id ? 'panel-jack-selected' : ''} ${connected ? 'panel-jack-connected' : ''}`} aria-label={jackDescription(jack)} aria-disabled={!jack.enabled} disabled={!jack.enabled} title={jack.enabled ? `${jackDescription(jack)}${connected ? ', connected; a new cable replaces this connection' : ''}` : `${jack.label}: ${jack.id === 'clock-in' ? 'External clock input — not modeled' : jack.id === 'midi-in' ? 'MIDI input — not modeled' : 'Audio / timbre connection — not modeled'}`} onPointerDown={event => startCable(event, jack)} onClick={event => { if (jack.direction === 'input' || event.detail === 0) selectJack(jack); }} style={{ '--cable-color': connected ? COLORS[cableIndex % COLORS.length] : undefined } as CSSProperties}><span className="panel-jack-nut"><span className="panel-jack-hole" /></span>{connected && <span className="panel-jack-plug" />}</button>
          </div>;
        })}
        <span className="panel-brand" aria-hidden="true">SUBHARMONICON</span>
        <span className="panel-screw" style={at(23, 9)} aria-hidden="true" /><span className="panel-screw" style={at(1250, 9)} aria-hidden="true" /><span className="panel-screw" style={at(23, PANEL_SPEC.height - 13)} aria-hidden="true" /><span className="panel-screw" style={at(1250, PANEL_SPEC.height - 13)} aria-hidden="true" />
      </div>
    </div>
    <div className="instrument-patch-strip"><span className="instrument-patch-message" role="status" aria-live="polite">{patchMessage}</span>{patchSource && <button type="button" className="instrument-strip-button" onClick={() => { setPatchSource(null); setPatchMessage('Patching canceled.'); }}>Cancel patch</button>}{selectedCable && <button type="button" className="instrument-strip-button" onClick={() => removeCable(selectedCable)}>Remove selected cable</button>}<span className="instrument-visual-only">Sound controls are visual only</span></div>
    {config.connections.length > 0 && <details className="instrument-cable-list"><summary>{config.connections.length} patch cable{config.connections.length === 1 ? '' : 's'}</summary><ul>{config.connections.map((connection, index) => <li key={connection.id}><span className="instrument-cable-dot" style={{ background: COLORS[index % COLORS.length] }} /><span>{PANEL_SPEC.jacks.find(jack => jack.id === connection.from)?.label} out → {PANEL_SPEC.jacks.find(jack => jack.id === connection.to)?.label} in</span><button type="button" className="instrument-strip-button" aria-label={`Remove cable ${PANEL_SPEC.jacks.find(jack => jack.id === connection.from)?.label} output to ${PANEL_SPEC.jacks.find(jack => jack.id === connection.to)?.label} input`} onClick={() => removeCable(connection.id)}>Remove</button></li>)}</ul></details>}
  </section>;
}
