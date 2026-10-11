import { useId, useMemo, useState } from 'react';
import type { SimulationFrame, TimelineProps, VoiceFrame, VoiceId } from '../contracts.ts';
import './Timeline.css';

const VOICES: { id: VoiceId; label: string; subLabel: string; group: 1 | 2 }[] = [
  { id: 'vco1', label: 'VCO 1', subLabel: 'Fundamental', group: 1 },
  { id: 'vco1sub1', label: 'SUB 1', subLabel: 'VCO 1', group: 1 },
  { id: 'vco1sub2', label: 'SUB 2', subLabel: 'VCO 1', group: 1 },
  { id: 'vco2', label: 'VCO 2', subLabel: 'Fundamental', group: 2 },
  { id: 'vco2sub1', label: 'SUB 1', subLabel: 'VCO 2', group: 2 },
  { id: 'vco2sub2', label: 'SUB 2', subLabel: 'VCO 2', group: 2 },
];

function frequencyLabel(frequency: number): string {
  return `${frequency.toFixed(frequency < 10 ? 2 : 1)} Hz`;
}

function centsLabel(cents: number): string {
  return `${cents > 0 ? '+' : ''}${Math.round(cents)}¢`;
}

function updateLabel(voice: VoiceFrame): string {
  return voice.updated
    ? voice.pitchChanged ? 'Pitch updated' : 'Sequencer updated · same pitch'
    : 'Pitch held';
}

function frameLabel(frame: SimulationFrame): string {
  return frame.preview ? 'Projected' : 'Recorded';
}

function rhythmLabel(contributors: number[]): string {
  return contributors.length ? contributors.map((rhythm) => `Rhythm ${rhythm}`).join(' + ') : 'No rhythm pulse';
}

interface SelectedCell { pulse: number; voiceId: VoiceId }

export function Timeline({
  config, frames, voices, cursorPulse, windowStart, windowSize, follow, repeat,
  running, onWindowSizeChange, onNavigate, onFollowChange,
}: TimelineProps) {
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const id = useId();
  const frameMap = useMemo(() => new Map(frames.map((frame) => [frame.pulse, frame])), [frames]);
  const voiceMap = useMemo(() => new Map(voices.map((voice) => [voice.id, voice])), [voices]);
  const pulses = useMemo(() => Array.from({ length: windowSize }, (_, index) => windowStart + index), [windowStart, windowSize]);
  const selectedFrame = selected ? frameMap.get(selected.pulse) : undefined;
  const selectedVoice = selectedFrame?.voices.find((voice) => voice.id === selected?.voiceId);
  const selectedDefinition = VOICES.find((voice) => voice.id === selected?.voiceId);
  const firstProjected = pulses.find((pulse) => frameMap.get(pulse)?.preview);
  const gridWidth = 164 + windowSize * 66;

  const columnClass = (pulse: number) => [
    pulse === cursorPulse ? 'timeline-current' : '',
    pulse === firstProjected ? 'timeline-preview-boundary' : '',
    frameMap.get(pulse)?.preview ? 'timeline-projected' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className="timeline" aria-labelledby={`${id}-title`}>
      <div className="timeline-heading">
        <div>
          <p className="timeline-eyebrow">THE PATTERN</p>
          <h2 id={`${id}-title`}>Six voices. One clock.</h2>
          <p className="timeline-description">Follow each pitch as the rhythms move through your patch.</p>
        </div>
        <div className="timeline-clock-status" aria-live="off">
          <span className={`timeline-status-dot ${running ? 'timeline-status-running' : ''}`} />
          <span>{running ? 'Playing' : 'Paused'}<strong>{cursorPulse > 0 ? `Pulse ${cursorPulse}` : 'Ready'}</strong></span>
          <span className="timeline-tempo">{config.tempoBpm}<small>BPM</small></span>
        </div>
      </div>

      <div className="timeline-toolbar">
        <div className="timeline-window-controls">
          <span className="timeline-toolbar-label">Clock pulses</span>
          <div className="timeline-navigation" aria-label="Timeline window navigation">
            <button type="button" onClick={() => onNavigate(-1)} disabled={windowStart <= 1} aria-label="Previous timeline window">←</button>
            <span className="timeline-window-range">{windowStart}<span>—</span>{windowStart + windowSize - 1}</span>
            <button type="button" onClick={() => onNavigate(1)} aria-label="Next timeline window">→</button>
          </div>
        </div>
        <div className="timeline-view-controls">
          <label className="timeline-follow"><input type="checkbox" checked={follow} onChange={(event) => onFollowChange(event.target.checked)} />Follow playhead</label>
          <label className="timeline-span-label">Show
            <select value={windowSize} onChange={(event) => onWindowSizeChange(Number(event.target.value))} aria-label="Number of clock pulses to show">
              {[12, 16, 24, 48, 96].map((size) => <option key={size} value={size}>{size} pulses</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="timeline-scroll" tabIndex={0} role="region" aria-label="Six voice timeline; scroll horizontally for more clock pulses">
        <table className="timeline-grid" style={{ minWidth: gridWidth }} aria-describedby={`${id}-legend`}>
          <colgroup><col style={{ width: 164 }} />{pulses.map((pulse) => <col key={pulse} style={{ width: 66 }} />)}</colgroup>
          <thead><tr>
            <th scope="col" className="timeline-corner"><span>VOICE</span><small>CLOCK →</small></th>
            {pulses.map((pulse) => <th scope="col" key={pulse} className={`timeline-pulse-header ${columnClass(pulse)}`}>
              <span>{pulse}</span><small>{pulse === cursorPulse ? 'NOW' : pulse === firstProjected ? 'AHEAD' : '\u00a0'}</small>
            </th>)}
          </tr></thead>
          <tbody>{VOICES.map((definition, rowIndex) => {
            const baseline = voiceMap.get(definition.id);
            return <tr key={definition.id} className={`timeline-voice-row timeline-group-${definition.group} ${rowIndex === 3 ? 'timeline-group-start' : ''}`}>
              <th scope="row" className="timeline-lane-label">
                <span className="timeline-lane-name">{definition.label}</span>
                <span className="timeline-lane-description">{definition.subLabel}{baseline?.parentId ? ` · ÷${baseline.division}` : ''}</span>
                <span className="timeline-lane-live">{baseline?.note ?? '—'}<span>{baseline ? frequencyLabel(baseline.frequency) : ''}</span></span>
              </th>
              {pulses.map((pulse) => {
                const frame = frameMap.get(pulse);
                const voice = frame?.voices.find((value) => value.id === definition.id);
                const isSelected = selected?.pulse === pulse && selected.voiceId === definition.id;
                return <td key={pulse} className={`timeline-voice-cell ${columnClass(pulse)}`}>
                  {frame && voice ? <button
                    type="button"
                    className={`timeline-note ${voice.updated ? 'timeline-note-update' : 'timeline-note-held'} ${voice.updated && !voice.pitchChanged ? 'timeline-note-same' : ''} ${isSelected ? 'timeline-note-selected' : ''}`}
                    onClick={() => setSelected({ pulse, voiceId: definition.id })}
                    aria-pressed={isSelected}
                    aria-label={`${definition.subLabel === 'Fundamental' ? definition.label : `${definition.subLabel} ${definition.label}`}, pulse ${pulse}: ${voice.note}, ${frequencyLabel(voice.frequency)}. ${updateLabel(voice)}. ${frameLabel(frame)}.${frame.trigger ? ' Shared trigger.' : ''}`}
                  >
                    <span className="timeline-note-symbol" aria-hidden="true">{voice.updated ? voice.pitchChanged ? '◆' : '●' : '─'}</span>
                    <strong>{voice.note}</strong>
                    <span className="timeline-note-frequency">{voice.frequency.toFixed(1)}</span>
                    {frame.trigger && <span className="timeline-trigger-marker" aria-hidden="true">▲</span>}
                  </button> : <span className="timeline-empty" aria-label={`No data for pulse ${pulse}`}>—</span>}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="timeline-legend" id={`${id}-legend`}>
        <span><i className="timeline-legend-update">◆</i>Pitch update</span>
        <span><i className="timeline-legend-same">●</i>Update, same pitch</span>
        <span><i className="timeline-legend-held">─</i>Held pitch</span>
        <span><i className="timeline-legend-trigger">▲</i>Shared trigger</span>
        <span><i className="timeline-legend-projection" />Projected</span>
      </div>

      <div className={`timeline-inspector ${selectedFrame && selectedVoice ? 'timeline-inspector-active' : ''}`} aria-live="polite" aria-atomic="true">
        {selectedFrame && selectedVoice && selectedDefinition ? <>
          <div className="timeline-inspector-heading">
            <span className={`timeline-voice-badge timeline-group-${selectedDefinition.group}`}>{selectedDefinition.subLabel === 'Fundamental' ? selectedDefinition.label : `${selectedDefinition.subLabel} ${selectedDefinition.label}`}</span>
            <strong>Pulse {selectedFrame.pulse}</strong>
            <span className="timeline-inspector-origin">{frameLabel(selectedFrame)}</span>
            <button type="button" className="timeline-inspector-close" onClick={() => setSelected(null)} aria-label="Close cell details">×</button>
          </div>
          <dl className="timeline-inspector-values">
            <div><dt>Pitch</dt><dd>{selectedVoice.note} <span>{centsLabel(selectedVoice.cents)}</span></dd></div>
            <div><dt>Frequency</dt><dd>{frequencyLabel(selectedVoice.frequency)}</dd></div>
            <div><dt>Sequencer</dt><dd>{selectedVoice.sequencer + 1} <span>· Step {selectedFrame.sequencerPositions[selectedVoice.sequencer] + 1}</span></dd></div>
            <div><dt>Division</dt><dd>{selectedVoice.parentId ? `÷${selectedVoice.division}` : 'Fundamental'}</dd></div>
          </dl>
          <p className="timeline-inspector-event"><strong>{updateLabel(selectedVoice)}.</strong> {rhythmLabel(selectedVoice.contributors)}{selectedFrame.reset ? ' · Reset at this pulse' : ''}.</p>
          {selectedFrame.trigger && <p className="timeline-inspector-trigger"><span aria-hidden="true">▲</span> Shared envelope trigger: {selectedFrame.triggerSources.length ? selectedFrame.triggerSources.join(' + ') : 'trigger request'}.</p>}
          {selectedVoice.valueSources.length > 0 && <p className="timeline-inspector-routing">Pitch sources: {selectedVoice.valueSources.join(' + ')}.</p>}
        </> : <p className="timeline-inspector-placeholder"><span aria-hidden="true">↖</span> Select a cell to inspect its pitch, sequencer step, and rhythm contributions.</p>}
      </div>

      <details className="timeline-breakdown">
        <summary><span className="timeline-details-arrow" aria-hidden="true">▸</span><span>See how the rhythms combine</span><span className="timeline-details-count">4 rhythms · 2 sequencers</span></summary>
        <p className="timeline-breakdown-description">Assigned rhythm pulses combine to advance each sequencer. Simultaneous pulses count as one advancement.</p>
        <div className="timeline-scroll timeline-rhythm-scroll" tabIndex={0} role="region" aria-label="Rhythm breakdown; scroll horizontally for more clock pulses">
          <table className="timeline-grid timeline-rhythm-grid" style={{ minWidth: gridWidth }}>
            <colgroup><col style={{ width: 164 }} />{pulses.map((pulse) => <col key={pulse} style={{ width: 66 }} />)}</colgroup>
            <thead><tr><th scope="col" className="timeline-corner"><span>RHYTHM</span><small>CLOCK →</small></th>{pulses.map((pulse) => <th scope="col" key={pulse} className={`timeline-pulse-header ${columnClass(pulse)}`}>{pulse}</th>)}</tr></thead>
            <tbody>
              {config.rhythmDivisions.map((division, rhythmIndex) => <tr key={`rhythm-${rhythmIndex}`} className="timeline-rhythm-row">
                <th scope="row" className="timeline-lane-label"><span className="timeline-lane-name">Rhythm {rhythmIndex + 1}</span><span className="timeline-lane-description">÷{division}{config.connections.some((connection) => connection.to === `rhythm${rhythmIndex + 1}-in`) ? ' · modulated' : ''}</span></th>
                {pulses.map((pulse) => {
                  const frame = frameMap.get(pulse);
                  const fires = frame?.rhythmPulses[rhythmIndex];
                  return <td key={pulse} className={columnClass(pulse)}><span className={`timeline-rhythm-beat ${fires ? 'timeline-rhythm-hit' : ''}`} title={frame ? `Rhythm ${rhythmIndex + 1}, ÷${frame.effectiveDivisions[rhythmIndex]}, pulse ${pulse}: ${fires ? 'pulse' : 'rest'}` : `No data for pulse ${pulse}`}><span aria-hidden="true">{fires ? '✓' : frame ? '' : '—'}</span><span className="timeline-sr-only">{frame ? `${fires ? 'Pulse' : 'Rest'} at division ${frame.effectiveDivisions[rhythmIndex]}` : 'No data'}</span></span></td>;
                })}
              </tr>)}
              {[0, 1].map((sequencer) => <tr key={`sequence-${sequencer}`} className="timeline-combined-row">
                <th scope="row" className="timeline-lane-label"><span className="timeline-lane-name">Seq {sequencer + 1} combined</span><span className="timeline-lane-description">{config.rhythmAssignments.flatMap((assignment, index) => assignment[sequencer] ? [`R${index + 1}`] : []).join(' + ') || 'No assignments'}</span></th>
                {pulses.map((pulse) => {
                  const frame = frameMap.get(pulse);
                  const advances = frame?.sequencerAdvanced[sequencer];
                  const contributors = frame?.rhythmContributors[sequencer] ?? [];
                  return <td key={pulse} className={columnClass(pulse)}><span className={`timeline-rhythm-beat ${advances ? 'timeline-combined-hit' : ''}`} title={frame ? `${advances ? 'Advances once' : 'Holds'} · ${rhythmLabel(contributors)}` : `No data for pulse ${pulse}`}><span aria-hidden="true">{advances ? '✓' : frame ? '' : '—'}</span><span className="timeline-sr-only">{frame ? `${advances ? 'Advances once' : 'Holds'}. ${rhythmLabel(contributors)}` : 'No data'}</span>{advances && contributors.length > 1 && <span className="timeline-coincidence" aria-hidden="true">{contributors.length}</span>}</span></td>;
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="timeline-breakdown-footnote"><span className="timeline-coincidence-example">2</span> A small number marks coincident rhythms; the sequencer still advances only once.</p>
      </details>

      <div className="timeline-repeat">
        {repeat.variable ? <><span className="timeline-repeat-symbol" aria-hidden="true">↝</span><p><strong>Variable pattern</strong> CV modulation changes the divisions. Future pulses are a projection of the current patch.</p></> : <><span className="timeline-repeat-symbol" aria-hidden="true">↻</span><p><strong>Rhythm repeats every {repeat.rhythmPulses ?? '—'} pulses</strong><span>Full sequencer pattern: {repeat.sequencePulses === null ? 'gate controlled' : `${repeat.sequencePulses} pulses`}</span></p></>}
        <span className="timeline-history-note">Recorded history stays as played.</span>
      </div>
    </section>
  );
}
