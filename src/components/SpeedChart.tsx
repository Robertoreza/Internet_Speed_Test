import { useMemo, useState } from "react";
import type { RoundResult } from "../lib/speedtest";

const W = 760;
const H = 300;
const PAD_L = 52;
const PAD_R = 48;
const PAD_T = 18;
const PAD_B = 30;
const SLOTS = 10;

interface Pt {
  x: number;
  y: number;
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function LegendChip({
  color,
  label,
  on,
  onClick,
}: {
  color: string;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-200 ${
        on ? "border-edge bg-raise text-fog hover:border-edge hover:bg-raise/70" : "border-line/60 text-dim hover:text-muted"
      }`}
      style={on ? { borderColor: color } : undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? color : "#48597c" }} />
      {label}
    </button>
  );
}

export default function SpeedChart({ results }: { results: RoundResult[] }) {
  const [showDl, setShowDl] = useState(true);
  const [showUl, setShowUl] = useState(true);
  const [showPing, setShowPing] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const slotW = innerW / (SLOTS - 1);

  const { yMax, pingMax } = useMemo(() => {
    const top = Math.max(10, ...results.map((r) => Math.max(r.download, r.upload)));
    const pTop = Math.max(20, ...results.map((r) => r.ping));
    return { yMax: niceMax(top * 1.15), pingMax: niceMax(pTop * 1.4) };
  }, [results]);

  const x = (roundIdx: number) => PAD_L + roundIdx * slotW;
  const y = (mbps: number) => PAD_T + innerH - (mbps / yMax) * innerH;
  const yP = (ms: number) => PAD_T + innerH - (ms / pingMax) * innerH;

  const dlPts = results.map((r) => ({ x: x(r.round - 1), y: y(r.download) }));
  const ulPts = results.map((r) => ({ x: x(r.round - 1), y: y(r.upload) }));
  const pingPts = results.map((r) => ({ x: x(r.round - 1), y: yP(r.ping) }));

  const baseY = PAD_T + innerH;
  const dlArea =
    dlPts.length > 1
      ? `${smoothPath(dlPts)} L ${dlPts[dlPts.length - 1].x.toFixed(2)} ${baseY} L ${dlPts[0].x.toFixed(2)} ${baseY} Z`
      : "";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (results.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((mx - PAD_L) / slotW);
    setHover(Math.max(0, Math.min(results.length - 1, idx)));
  };

  const h = hover !== null ? results[hover] : null;
  const hoverX = h ? x(h.round - 1) : 0;
  const tipLeft = h ? Math.min(86, Math.max(14, (hoverX / W) * 100)) : 0;

  const yTicks = [0, 1, 2, 3, 4, 5].map((i) => (yMax / 5) * i);
  const pingTicks = [0, pingMax / 2, pingMax];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LegendChip color="#3ce0ff" label="DOWNLOAD" on={showDl} onClick={() => setShowDl((v) => !v)} />
        <LegendChip color="#ffb224" label="UPLOAD" on={showUl} onClick={() => setShowUl((v) => !v)} />
        <LegendChip color="#46e583" label="PING" on={showPing} onClick={() => setShowPing((v) => !v)} />
        <span className="ml-auto font-mono text-[10px] tracking-[0.18em] text-dim">
          MBPS vs ROUND · hover for detail
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="dlArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(60,224,255,0.26)" />
              <stop offset="1" stopColor="rgba(60,224,255,0)" />
            </linearGradient>
          </defs>

          {/* grid + y labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(t)}
                y2={y(t)}
                stroke={i === 0 ? "#27395c" : "#16233c"}
                strokeWidth="1"
              />
              <text x={PAD_L - 8} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#6f83a8" fontFamily="IBM Plex Mono, monospace">
                {t >= 1000 ? `${t / 1000}k` : Math.round(t)}
              </text>
            </g>
          ))}
          {/* ping axis (right) */}
          {pingTicks.map((t, i) => (
            <text
              key={i}
              x={W - PAD_R + 8}
              y={yP(t) + 3}
              textAnchor="start"
              fontSize="9"
              fill="#3d6b4f"
              fontFamily="IBM Plex Mono, monospace"
            >
              {Math.round(t)}ms
            </text>
          ))}
          {/* x labels: round slots 1..10 */}
          {Array.from({ length: SLOTS }, (_, i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize="9.5"
              fill={i < results.length ? "#6f83a8" : "#38486b"}
              fontFamily="IBM Plex Mono, monospace"
            >
              {i + 1}
            </text>
          ))}

          {results.length === 0 ? (
            <g>
              <line x1={PAD_L} x2={W - PAD_R} y1={baseY - innerH / 2} y2={baseY - innerH / 2} stroke="#1c2c49" strokeDasharray="4 6" />
              <text x={W / 2} y={baseY - innerH / 2 - 10} textAnchor="middle" fontSize="11" fill="#48597c" fontFamily="IBM Plex Mono, monospace" letterSpacing="3">
                AWAITING TELEMETRY
              </text>
              <text x={W / 2} y={baseY - innerH / 2 + 12} textAnchor="middle" fontSize="9.5" fill="#38486b" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">
                run the benchmark to plot 10 rounds of throughput
              </text>
            </g>
          ) : (
            <g>
              {/* crosshair */}
              {h && (
                <line x1={hoverX} x2={hoverX} y1={PAD_T} y2={baseY} stroke="#6f83a8" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
              )}
              {/* download area + line */}
              {showDl && dlArea && (
                <path key={`a${results.length}`} d={dlArea} fill="url(#dlArea)" className="chart-area" />
              )}
              {showDl && dlPts.length > 1 && (
                <path
                  key={`d${results.length}`}
                  d={smoothPath(dlPts)}
                  fill="none"
                  stroke="#3ce0ff"
                  strokeWidth="2.4"
                  pathLength={1}
                  className="chart-draw"
                  style={{ filter: "drop-shadow(0 0 5px rgba(60,224,255,0.35))" }}
                />
              )}
              {showUl && ulPts.length > 1 && (
                <path
                  key={`u${results.length}`}
                  d={smoothPath(ulPts)}
                  fill="none"
                  stroke="#ffb224"
                  strokeWidth="2.4"
                  pathLength={1}
                  className="chart-draw"
                  style={{ filter: "drop-shadow(0 0 5px rgba(255,178,36,0.3))" }}
                />
              )}
              {showPing && pingPts.length > 1 && (
                <path
                  key={`p${results.length}`}
                  d={smoothPath(pingPts)}
                  fill="none"
                  stroke="#46e583"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  opacity="0.85"
                />
              )}
              {/* points */}
              {results.map((r, i) => {
                const hot = hover === i;
                return (
                  <g key={r.round} className="pt-pop" style={{ animationDelay: `${i * 40}ms` }}>
                    {showPing && <circle cx={x(r.round - 1)} cy={yP(r.ping)} r={hot ? 4 : 2.6} fill="#0c1626" stroke="#46e583" strokeWidth="1.4" />}
                    {showUl && <circle cx={x(r.round - 1)} cy={y(r.upload)} r={hot ? 5.5 : 3.8} fill="#0c1626" stroke="#ffb224" strokeWidth="2" />}
                    {showDl && <circle cx={x(r.round - 1)} cy={y(r.download)} r={hot ? 5.5 : 3.8} fill="#0c1626" stroke="#3ce0ff" strokeWidth="2" />}
                  </g>
                );
              })}
            </g>
          )}
        </svg>

        {/* tooltip */}
        {h && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 border border-edge bg-raise/95 px-3 py-2 font-mono text-[11px] shadow-[0_8px_28px_rgba(0,0,0,0.5)]"
            style={{ left: `${tipLeft}%` }}
          >
            <div className="mb-1 flex items-center gap-2 text-[10px] tracking-[0.2em] text-muted">
              ROUND {String(h.round).padStart(2, "0")}
              {h.simulated && <span className="border border-ul/50 px-1 text-[9px] text-ul">SIM</span>}
            </div>
            <div className="text-dl tabular-nums">↓ {h.download.toFixed(1)} Mbps</div>
            <div className="text-ul tabular-nums">↑ {h.upload.toFixed(1)} Mbps</div>
            <div className="text-ok tabular-nums">◷ {h.ping.toFixed(0)} ms · jitter {h.jitter.toFixed(1)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
