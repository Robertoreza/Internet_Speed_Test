import type { Phase } from "../lib/speedtest";

const TICKS = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
const CX = 160;
const CY = 150;
const R = 118;
const START = -120;
const SWEEP = 240;

const pt = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
};

function valueToAngle(v: number): number {
  if (v <= 0) return START;
  for (let i = 0; i < TICKS.length - 1; i++) {
    if (v <= TICKS[i + 1]) {
      const f = (v - TICKS[i]) / (TICKS[i + 1] - TICKS[i]);
      return START + ((i + f) / (TICKS.length - 1)) * SWEEP;
    }
  }
  return START + SWEEP;
}

function arcPath(r: number): string {
  const a = pt(r, START);
  const b = pt(r, START + SWEEP);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const PHASE_META: Record<Phase, { label: string; color: string }> = {
  idle: { label: "STANDBY", color: "var(--color-muted)" },
  ping: { label: "PING", color: "var(--color-ok)" },
  download: { label: "DOWNLOAD", color: "var(--color-dl)" },
  upload: { label: "UPLOAD", color: "var(--color-ul)" },
  done: { label: "COMPLETE", color: "var(--color-ok)" },
  stopped: { label: "ABORTED", color: "var(--color-bad)" },
};

interface Props {
  value: number;
  frac: number;
  phase: Phase;
  running: boolean;
  ping: number | null;
  jitter: number | null;
  round: number;
  total: number;
}

export default function Gauge({ value, frac, phase, running, ping, jitter, round, total }: Props) {
  const angle = valueToAngle(value);
  const pct = ((angle - START) / SWEEP) * 100;
  const meta = PHASE_META[phase];
  const display = value >= 100 ? value.toFixed(0) : value.toFixed(1);

  return (
    <div>
      <div className="relative">
        <svg viewBox="0 0 320 236" className="block w-full">
          <defs>
            <linearGradient id="gaugeGrad" gradientUnits="userSpaceOnUse" x1="42" y1="150" x2="278" y2="150">
              <stop offset="0" stopColor="#2be4b0" />
              <stop offset="0.45" stopColor="#3ce0ff" />
              <stop offset="0.8" stopColor="#ffb224" />
              <stop offset="1" stopColor="#ff5c6c" />
            </linearGradient>
          </defs>

          {/* tick marks + labels */}
          {TICKS.map((t, i) => {
            const deg = START + (SWEEP * i) / (TICKS.length - 1);
            const o = pt(108, deg);
            const n = pt(98, deg);
            const l = pt(84, deg);
            return (
              <g key={t}>
                <line x1={o.x} y1={o.y} x2={n.x} y2={n.y} stroke="#334770" strokeWidth="2" />
                <text
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#6f83a8"
                  fontSize="9.5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {t >= 1000 ? "1G" : t}
                </text>
              </g>
            );
          })}

          {/* track + live arc */}
          <path d={arcPath(R)} fill="none" stroke="#152238" strokeWidth="11" strokeLinecap="round" />
          <path
            d={arcPath(R)}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="11"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - pct}
            className="arc-spring"
            style={{ filter: "drop-shadow(0 0 7px rgba(60,224,255,0.4))" }}
          />

          {/* needle */}
          <g
            className="needle-spring"
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: "160px 150px" }}
          >
            <path d="M 157.2 150 L 160 66 L 162.8 150 Z" fill="#dbe8ff" opacity="0.92" />
          </g>
          <circle cx={CX} cy={CY} r="8" fill="#0c1626" stroke="#334770" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="3" fill={meta.color} style={{ transition: "fill .3s" }} />
        </svg>

        {/* digital readout */}
        <div className="pointer-events-none absolute inset-x-0 top-[37%] flex flex-col items-center">
          <div
            className="font-mono text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-6xl"
            style={{ color: value > 0 ? "#dbe8ff" : "#48597c", transition: "color .3s" }}
          >
            {display}
          </div>
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.42em] text-muted">MBPS</div>
          <div
            className="mt-3 inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.22em]"
            style={{ color: meta.color, borderColor: meta.color, background: "rgba(6,11,21,0.6)" }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${running ? "dot-live" : ""}`}
              style={{ background: meta.color }}
            />
            {meta.label}
          </div>
          <div className="mt-2.5 h-1 w-28 overflow-hidden rounded-full bg-line/70">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(frac * 100)}%`,
                background: meta.color,
                transition: "width 120ms linear, background .3s",
              }}
            />
          </div>
        </div>
      </div>

      {/* sub-readouts */}
      <div className="mt-1 grid grid-cols-3 divide-x divide-line border-t border-line font-mono">
        {[
          { k: "PING", v: ping === null ? "——" : `${ping.toFixed(0)} ms`, c: "text-ok" },
          { k: "JITTER", v: jitter === null ? "——" : `${jitter.toFixed(1)} ms`, c: "text-teal" },
          { k: "ROUND", v: `${String(round).padStart(2, "0")}/${total}`, c: "text-dl" },
        ].map((s) => (
          <div key={s.k} className="px-3 py-3 text-center">
            <div className="text-[9px] tracking-[0.3em] text-dim">{s.k}</div>
            <div className={`mt-1 text-sm font-medium tabular-nums ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
