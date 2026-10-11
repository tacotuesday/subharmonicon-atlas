import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InstrumentAction, InstrumentConfig } from './contracts.ts';
import { makeDemoConfig } from './defaults.ts';
import { getRepeatInfo, getVoices, projectFrames } from './engine/index.ts';
import { InstrumentPanel } from './panel/InstrumentPanel.tsx';
import { Timeline } from './timeline/Timeline.tsx';
import { createAppState, dispatchAction, elapse } from './app/state.ts';
import type { AppState } from './app/state.ts';
import { loadInitialPatch, parsePatch, savePatch, serializePatch, shareUrl } from './app/persistence.ts';

function storage() { try { return window.localStorage; } catch { return undefined; } }
function initialState() { const loaded = loadInitialPatch(window.location.hash,storage()); return createAppState(loaded.config,loaded.message); }

export default function App() {
  const [state,setState] = useState(initialState);
  const controller = useRef<AppState>(state);
  const [windowSize,setWindowSize] = useState(16);
  const [manualStart,setManualStart] = useState(1);
  const [follow,setFollow] = useState(true);
  const [storageFailed,setStorageFailed] = useState(false);
  const [link,setLink] = useState('');
  const [copyMessage,setCopyMessage] = useState('');
  const [exportText,setExportText] = useState('');
  const [exportMessage,setExportMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const exportDialog = useRef<HTMLDialogElement>(null);
  const exportInput = useRef<HTMLTextAreaElement>(null);
  const commit = useCallback((next:AppState) => { controller.current = next; setState(next); },[]);
  const dispatch = useCallback((action:InstrumentAction) => {
    commit(dispatchAction(controller.current,action));
    if (action.type === 'replace-config') { setFollow(true); setManualStart(1); }
  },[commit]);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const animate = (now:number) => {
      const previous = controller.current;
      const next = elapse(previous,now-last);
      last = now;
      controller.current = next;
      const before = previous.runtime, after = next.runtime;
      if (next.history !== previous.history || next.config !== previous.config || before.running !== after.running || before.resetHeld !== after.resetHeld || before.triggerHeld !== after.triggerHeld || JSON.stringify(before.sourceGateLevels) !== JSON.stringify(after.sourceGateLevels)) setState(next);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    const pauseWhenHidden = () => {
      if (document.hidden && controller.current.runtime.running) {
        const next = dispatchAction(controller.current,{type:'transport',command:'toggle-play'});
        commit({...next,notice:'Playback paused while this tab was hidden.'});
      }
      last = performance.now();
    };
    document.addEventListener('visibilitychange',pauseWhenHidden);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange',pauseWhenHidden); };
  },[commit]);

  const displayConfig = state.pendingConfig ?? state.config;
  useEffect(() => { setStorageFailed(!savePatch(displayConfig,storage())); },[displayConfig]);
  useEffect(() => {
    const loadHash = () => {
      if (!window.location.hash.startsWith('#patch=')) return;
      try {
        const loaded = loadInitialPatch(window.location.hash);
        if (loaded.message.startsWith('Shared patch loaded')) dispatch({type:'replace-config',config:loaded.config});
        else commit({...controller.current,notice:loaded.message});
      } catch (error) { commit({...controller.current,notice:error instanceof Error ? error.message : 'Invalid share link.'}); }
    };
    window.addEventListener('hashchange',loadHash);
    return () => window.removeEventListener('hashchange',loadHash);
  },[dispatch,commit]);

  const cursorPulse = state.runtime.pulse;
  const earliest = state.history[0]?.pulse ?? 1;
  const windowStart = follow ? Math.floor(Math.max(0,cursorPulse-1)/windowSize)*windowSize+1 : manualStart;
  const frames = useMemo(() => {
    const count = Math.min(192,Math.max(0,windowStart+windowSize-1-state.runtime.pulse));
    return [...state.history,...projectFrames(displayConfig,state.runtime,count)];
  },[displayConfig,state.runtime,state.history,windowStart,windowSize]);
  const voices = useMemo(() => getVoices(state.config,state.runtime),[state.config,state.runtime]);
  const repeat = useMemo(() => getRepeatInfo(displayConfig),[displayConfig]);

  const loadConfig = (config:InstrumentConfig) => dispatch({type:'replace-config',config});
  const downloadPatch = () => {
    const blob = new Blob([serializePatch(displayConfig)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${displayConfig.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'subharmonicon-patch'}.json`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const exportPatch = () => {
    setExportText(serializePatch(displayConfig)); setExportMessage('');
    exportDialog.current?.showModal();
  };
  const copyPatch = async () => {
    try { await navigator.clipboard.writeText(exportText); setExportMessage('Patch JSON copied.'); }
    catch { exportInput.current?.focus(); exportInput.current?.select(); setExportMessage('Select and copy the patch above.'); }
  };
  const sharePatch = () => {
    setLink(shareUrl(displayConfig,window.location.href)); setCopyMessage('');
    dialog.current?.showModal();
    requestAnimationFrame(() => {linkInput.current?.focus();linkInput.current?.select();});
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setCopyMessage('Link copied.'); }
    catch { linkInput.current?.focus(); linkInput.current?.select(); setCopyMessage('Select and copy the link above.'); }
  };

  return <main className="app-shell">
    <header className="app-header">
      <div><p className="eyebrow">A STUDY IN RHYTHM & HARMONY</p><h1>Subharmonicon <span>Explorer</span></h1></div>
      <div className="header-aside"><span className="visual-badge"><i /> VISUAL ONLY</span><a href="#model-notes">About the model <span aria-hidden="true">↘</span></a></div>
    </header>

    <section className="patch-toolbar" aria-label="Patch management">
      <div className="patch-name"><label htmlFor="patch-name">CURRENT PATCH</label><input id="patch-name" value={displayConfig.name} maxLength={80} onChange={event => dispatch({type:'set-name',value:event.target.value})} /></div>
      <div className="patch-actions">
        <button onClick={() => loadConfig(makeDemoConfig())}>Load demo</button>
        <button onClick={() => fileInput.current?.click()}>Import</button>
        <button onClick={exportPatch}>Export</button>
        <button className="share-button" onClick={sharePatch}>Share patch <span aria-hidden="true">↗</span></button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        try { if (file.size > 64_000) throw new Error('Patch file is too large. Choose a Subharmonicon patch JSON file.'); loadConfig(parsePatch(await file.text())); }
        catch (error) { commit({...controller.current,notice:error instanceof Error ? error.message : 'The patch could not be imported.'}); }
      }} />
    </section>

    <InstrumentPanel config={displayConfig} runtime={state.runtime} voices={voices} dispatch={dispatch} pending={state.pendingConfig !== null} />

    <div className="session-strip">
      <span className="session-state"><i className={state.runtime.running ? 'is-playing' : ''} />{state.runtime.running ? 'Playing' : 'Paused'}<span className="session-separator">/</span>Pulse {cursorPulse.toLocaleString()}</span>
      <span role="status" aria-live="polite">{state.pendingConfig ? 'Changes queued for the next clock pulse.' : state.notice || (storageFailed ? 'Local saving is unavailable. Export or share to keep this patch.' : 'Patch saved in this browser.')}</span>
    </div>

    <Timeline config={displayConfig} frames={frames} voices={voices} cursorPulse={cursorPulse} windowStart={windowStart} windowSize={windowSize} follow={follow} repeat={repeat} running={state.runtime.running}
      onWindowSizeChange={size => {setWindowSize(size);setManualStart(Math.max(earliest,Math.floor((windowStart-1)/size)*size+1));}}
      onNavigate={direction => {setFollow(false);setManualStart(Math.min(Math.floor((cursorPulse+95)/windowSize)*windowSize+1,Math.max(earliest,windowStart+direction*windowSize)));}}
      onFollowChange={value => {setFollow(value);if(!value) setManualStart(windowStart);}} />

    <section className="model-notes" id="model-notes">
      <div className="notes-intro"><p className="eyebrow">THE INSTRUMENT, MADE VISIBLE</p><h2>Six voices.<br />Two sequences.<br /><em>One shared trigger.</em></h2><p>The rhythm lanes show when a voice’s pitch is updated. The small trigger markers show requests to the shared envelopes, so a note can be triggered even when its pitch stays the same.</p></div>
      <div className="notes-body">
        <details><summary>How to explore</summary><p>Start with PLAY on the panel. Turn a knob by dragging up or down; use Shift for fine adjustment, arrow keys, or the value editor for precision. The rhythm and suboscillator knobs reach ÷1 at their clockwise end.</p><p>Connect an enabled output to an enabled input by dragging, or click an output followed by its destination. Select a cable to remove it. Edits enter at the next clock pulse while playing; RESET returns both sequences to Step 1 and resets rhythm phase without erasing history.</p><p>Expand the rhythm breakdown to see individual divisions and combined sequencer clocks. Coincident rhythms count as one advancement. Future cells are projections; recorded cells preserve the settings used at that moment.</p></details>
        <details><summary>What this model includes</summary><p>Four divided clocks, two four-step sequences, six pitches, sequencer destinations, parent/suboscillator relationships, summed pitch CV, and the VCO 1-to-VCO 2 normalled pitch connection. Sequencer CV can control pitch, subharmonic divisors, and rhythm divisors. Clock and trigger outputs can control PLAY, RESET, and TRIGGER.</p><p>The ordinary quantization and octave modes are included. Timbre controls, audio and envelope outputs, external clock input, MIDI, hidden settings, and audio synthesis are outside this version.</p></details>
        <details><summary>Idealizations and accuracy</summary><p>This is a musical control model, not an analog circuit simulation. Divider CV uses a documented approximation: subtract 1.5 divisions per volt from the knob setting, round to the nearest integer, and limit the result to 1–16. Rhythm modulation samples the preceding sequencer step at each clock boundary.</p><p>The internal clock has 50% duty; sequencer clocks and trigger outputs use 1 ms pulses. Trigger markers represent requests, without envelope shapes or attack-stage suppression. Pitch values are ideal frequencies; just-intonation modes use conventional five-limit ratios with C as reference.</p><p>Fixed rhythm cycles and complete sequence cycles are reported separately. Modulated dividers and gate-controlled playback can change the repeat behavior. Playback pauses when this tab is hidden.</p></details>
        <a className="manual-link" href="https://cdn.inmusicbrands.com/Moog/Subharmonicon/Subharmonicon_Manual%20AMZ.pdf" target="_blank" rel="noreferrer">Read the Moog user manual <span aria-hidden="true">↗</span></a>
      </div>
    </section>

    <footer className="app-footer"><span>SUBHARMONICON / RHYTHM & PITCH EXPLORER</span><span>An independent educational tool. Not affiliated with Moog Music.</span></footer>

    <dialog ref={dialog} className="share-dialog" aria-labelledby="share-title">
      <div className="dialog-heading"><h2 id="share-title">Share this patch</h2><button aria-label="Close share dialog" onClick={() => dialog.current?.close()}>×</button></div>
      <p>The link contains your knob settings, assignments, and cables. It opens paused at Step 1.</p>
      <label htmlFor="share-link">Patch link</label><input ref={linkInput} id="share-link" value={link} readOnly onFocus={event => event.target.select()} />
      <button className="share-button" onClick={copyLink}>Copy link</button><p className="copy-message" role="status">{copyMessage}</p>
    </dialog>
    <dialog ref={exportDialog} className="share-dialog" aria-labelledby="export-title">
      <div className="dialog-heading"><h2 id="export-title">Export this patch</h2><button aria-label="Close export dialog" onClick={() => exportDialog.current?.close()}>×</button></div>
      <p>Save a patch file, or copy its JSON to keep your settings and cables.</p>
      <label htmlFor="export-json">Patch JSON</label><textarea ref={exportInput} id="export-json" value={exportText} readOnly onFocus={event => event.target.select()} rows={8} />
      <div className="patch-actions"><button className="share-button" onClick={downloadPatch}>Download JSON</button><button onClick={copyPatch}>Copy JSON</button></div>
      <p className="copy-message" role="status">{exportMessage}</p>
    </dialog>
  </main>;
}
