import { useId } from 'react';

/** Panel artwork only: waveform selection does not affect the pitch model. */
export function WaveformSwitch({ oscillator }: { oscillator: number }) {
  const id = useId().replaceAll(':', '');
  const mirrored = oscillator === 1;
  const center = mirrored ? 20 : 48;
  const square = 'M -6 4 H -3 V -4 H 3 V 4 H 6';
  const saw = 'M -6 4 V -4 L 6 4';
  return <div className={`panel-wave ${mirrored ? 'panel-wave-right' : 'panel-wave-left'}`}
    style={{ left: mirrored ? 785 : 301, top: 57 }}
    role="img" aria-label={`VCO ${oscillator + 1} WAVE, three-position mechanical toggle. Top: square wave. Middle: suboscillator sawtooth feeding VCO square wave. Bottom: sawtooth wave. Visual only.`}
    title="Three-position waveform toggle: square, sawtooth → square, sawtooth. Timbre control — visual only.">
    <span className="panel-wave-label" style={{ left: center }}>VCO {oscillator + 1} WAVE</span>
    <svg className="panel-wave-drawing" viewBox="0 0 68 68" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-nut`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdf2" /><stop offset=".23" stopColor="#9fa39c" />
          <stop offset=".47" stopColor="#f4f1e6" /><stop offset=".63" stopColor="#616861" /><stop offset="1" stopColor="#d9ded5" />
        </linearGradient>
        <linearGradient id={`${id}-shaft`}>
          <stop stopColor="#565d58" /><stop offset=".25" stopColor="#d8ddd5" /><stop offset=".48" stopColor="#fafbf2" />
          <stop offset=".7" stopColor="#8e9790" /><stop offset="1" stopColor="#343d36" />
        </linearGradient>
        <radialGradient id={`${id}-cap`} cx="32%" cy="25%">
          <stop stopColor="#fffef3" /><stop offset=".35" stopColor="#cfd7ce" /><stop offset=".65" stopColor="#68756a" /><stop offset="1" stopColor="#1f2b23" />
        </radialGradient>
      </defs>
      <g className="panel-wave-icons">
        <path d={square} transform={`translate(${center} 7)`} data-wave-icon="square" />
        <path d={saw} transform={`translate(${center} 61)`} data-wave-icon="sawtooth" />
        {mirrored ? <g data-wave-icon="sawtooth-to-square">
          <path d={saw} transform="translate(39 35) scale(.7)" />
          <path className="panel-wave-arrow" d="M 47 32 L 51 35 L 47 38 Z" />
          <path d={square} transform="translate(60 35) scale(.7)" />
        </g> : <g data-wave-icon="sawtooth-to-square">
          <path d={square} transform="translate(7 35) scale(.7)" />
          <path className="panel-wave-arrow" d="M 19 32 L 15 35 L 19 38 Z" />
          <path d={saw} transform="translate(27 35) scale(.7)" />
        </g>}
      </g>
      <g className="panel-wave-hardware" transform={`translate(${center} 35)`}>
        <ellipse cx="1.5" cy="3" rx="13" ry="12" fill="#111713" opacity=".8" />
        <path d="M -7 -12 L 7 -12 L 14 0 L 7 12 L -7 12 L -14 0 Z" fill={`url(#${id}-nut)`} stroke="#b8bdb2" strokeWidth=".8" />
        <circle r="10" fill="#525c53" stroke="#e5e7db" strokeWidth="1.4" />
        <circle r="7.7" fill={`url(#${id}-nut)`} stroke="#242e25" strokeWidth="1" />
        <circle r="5.2" fill="#263227" stroke="#c8d0c4" strokeWidth="1.1" />
        <path d="M -3.4 1.2 L -4.2 -13.2 Q 0 -17 4.2 -13.2 L 3.4 1.2 Q 0 4.7 -3.4 1.2 Z" fill={`url(#${id}-shaft)`} stroke="#525e54" strokeWidth=".7" />
        <path d="M -2.5 -10 L -2 0" stroke="#eff1e5" strokeWidth=".7" opacity=".75" />
        <ellipse cy="-13.1" rx="4.3" ry="4.7" fill={`url(#${id}-cap)`} stroke="#858f80" strokeWidth=".7" />
        <ellipse cx="-1.2" cy="-14.7" rx="1.3" ry="1.1" fill="#fffdf0" opacity=".9" />
      </g>
    </svg>
  </div>;
}
