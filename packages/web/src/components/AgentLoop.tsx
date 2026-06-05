import { theme } from "../theme";

/** Subtle "agent loop" signature: a thin ring, three pulsing nodes, one slow tracer. */
export function AgentLoop() {
  const angles = [-90, 30, 150];
  const center = 110;
  const radius = 66;

  return (
    <svg viewBox="0 0 220 220" style={{ width: "100%", height: "100%" }} aria-hidden>
      <style>{`
        @keyframes loop-spin { to { transform: rotate(360deg); } }
        @keyframes loop-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.55; }
        }
      `}</style>

      <circle cx={center} cy={center} r={radius} fill="none" stroke={theme.line} strokeWidth={1} />

      <g style={{ transformOrigin: "center", animation: "loop-spin 16s linear infinite" }}>
        <circle cx={center + radius} cy={center} r={3.5} fill={theme.accent} />
      </g>

      {angles.map((angle, i) => {
        const x = center + radius * Math.cos((angle * Math.PI) / 180);
        const y = center + radius * Math.sin((angle * Math.PI) / 180);
        return (
          <circle
            key={angle}
            cx={x}
            cy={y}
            r={3}
            fill={theme.muted}
            style={{ animation: `loop-pulse 4s ease-in-out ${i * 0.9}s infinite` }}
          />
        );
      })}

      <text
        x={center}
        y={center + 4}
        textAnchor="middle"
        style={{ fontFamily: theme.mono, fontSize: 9.5, fill: theme.muted, letterSpacing: 2 }}
      >
        agent loop
      </text>
    </svg>
  );
}
