import './Orb.css';

export type OrbState = 'idle' | 'listening' | 'speaking';

export function Orb({ state = 'idle', label }: { state?: OrbState; label?: string }) {
  return <div className="orb" data-state={state} role="img" aria-label={label ?? `Harness orb, ${state}`}>
    <div className="orb-glow" aria-hidden="true" />
    <div className="orb-core" aria-hidden="true" />
    <svg aria-hidden="true" viewBox="0 0 200 200" fill="none">
      <g className="orb-rings">
        <circle className="orb-ring" cx="100" cy="100" r="92" opacity="0.25" />
        <circle className="orb-ring orb-ring--rotating" cx="100" cy="100" r="76" opacity="0.4" strokeDasharray="24 8 4 8" />
        <circle className="orb-ring" cx="100" cy="100" r="60" opacity="0.55" strokeDasharray="1 7" />
        <circle className="orb-ring orb-ring--inner" cx="100" cy="100" r="44" opacity="0.75" />
        <circle className="orb-ring orb-ring--inner" cx="100" cy="100" r="28" />
      </g>
      <circle className="orb-ripple" cx="100" cy="100" r="28" />
      <circle className="orb-ripple orb-ripple--delayed" cx="100" cy="100" r="28" />
      <circle className="orb-dot" cx="100" cy="100" r="3" />
    </svg>
  </div>;
}
