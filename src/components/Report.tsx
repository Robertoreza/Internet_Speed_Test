import type { RoundResult } from "../lib/speedtest";
import { fmt1, fmtBytes, fmtDuration, grade, sessionStats } from "../lib/stats";

function Tile({
  label,
  value,
  unit,
  accent,
  bar,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  bar?: number; // 0–100 optional consistency bar
}) {
  return (
    <div className="group border border-line bg-panel/60 px-3.5 py-3 transition-colors duration-200 hover:border-edge hover:bg-raise/50">
      <div className="font-mono text-[9px] tracking-[0.28em] text-dim">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="font-mono text-xl font-semibold tabular-nums leading-none transition-transform duration-200 group-hover:-translate-y-0.5"
          style={{ color: accent ?? "#dbe8ff" }}
        >
          {value}
        </span>
        {unit && <span className="font-mono text-[10px] text-muted">{unit}</span>}
      </div>
      {bar !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line/60">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(bar)}%`,
              background: accent ?? "#3ce0ff",
              transition: "width 800ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
      )}
    </div>
  );
}

const THRESHOLDS = [
  { label: "HD STREAM", v: 25 },
  { label: "POWER USE", v: 100 },
  { label: "FIBER", v: 300 },
];

export default function Report({ results, aborted }: { results: RoundResult[]; aborted: boolean }) {
  const s = sessionStats(results);
  const v = grade(s.dl.mean, s.dl.consistency);
  const simCount = results.filter((r) => r.simulated).length;
  const scaleMax = 400;

  const exportJson = () => {
    const payload = {
      tool: "PULSE/10",
      capturedAt: new Date().toISOString(),
      rounds: results,
      summary: {
        downloadMbps: { ...s.dl },
        uploadMbps: { ...s.ul },
        pingMs: { ...s.ping },
        jitterMs: { ...s.jitter },
        bytesDown: s.bytesDown,
        bytesUp: s.bytesUp,
        durationMs: s.durationMs,
        simulatedRounds: simCount,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pulse10-benchmark.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* verdict row */}
      <div className="flex flex-col gap-5 border-b border-line pb-5 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center border-2 font-display text-6xl font-bold"
            style={{ color: v.hue, borderColor: v.hue, textShadow: `0 0 24px ${v.hue}`, background: "rgba(6,11,21,0.5)" }}
          >
            {v.letter}
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] text-dim">
              LINK VERDICT · {results.length}/10 ROUNDS{aborted ? " · ABORTED" : ""}
            </div>
            <div className="mt-1 font-display text-2xl font-bold tracking-wide" style={{ color: v.hue }}>
              {v.label}
            </div>
            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{v.blurb}</p>
          </div>
        </div>

        {/* threshold scale */}
        <div className="min-w-0 flex-1 md:ml-6">
          <div className="mb-1.5 flex justify-between font-mono text-[9px] tracking-[0.22em] text-dim">
            <span>WHERE AVG DOWNLOAD LANDS</span>
            <span className="text-fog tabular-nums">{fmt1(s.dl.mean)} Mbps</span>
          </div>
          <div className="relative h-2 rounded-full bg-line/50">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.min(100, (s.dl.mean / scaleMax) * 100)}%`,
                background: `linear-gradient(90deg, #2be4b0, ${v.hue})`,
                transition: "width 900ms cubic-bezier(0.16,1,0.3,1)",
              }}
            />
            {THRESHOLDS.map((t) => (
              <span
                key={t.v}
                className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-edge"
                style={{ left: `${(t.v / scaleMax) * 100}%` }}
              />
            ))}
          </div>
          <div className="relative mt-1 h-4">
            {THRESHOLDS.map((t) => (
              <span
                key={t.v}
                className="absolute -translate-x-1/2 font-mono text-[8.5px] tracking-[0.14em] text-dim"
                style={{ left: `${(t.v / scaleMax) * 100}%` }}
              >
                {t.label} · {t.v}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={exportJson}
          className="shrink-0 cursor-pointer border border-edge px-4 py-2.5 font-mono text-[10px] tracking-[0.24em] text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-dl hover:text-dl"
        >
          ⇩ EXPORT JSON
        </button>
      </div>

      {/* stat tiles */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="DL AVG" value={fmt1(s.dl.mean)} unit="Mbps" accent="#3ce0ff" bar={s.dl.consistency} />
        <Tile label="DL BEST" value={fmt1(s.dl.max)} unit="Mbps" accent="#3ce0ff" />
        <Tile label="DL MIN" value={fmt1(s.dl.min)} unit="Mbps" />
        <Tile label="DL MEDIAN" value={fmt1(s.dl.median)} unit="Mbps" />
        <Tile label="DL σ DEV" value={fmt1(s.dl.std)} unit="Mbps" />
        <Tile label="DL STEADY" value={`${s.dl.consistency.toFixed(0)}%`} accent="#2be4b0" />

        <Tile label="UL AVG" value={fmt1(s.ul.mean)} unit="Mbps" accent="#ffb224" bar={s.ul.consistency} />
        <Tile label="UL BEST" value={fmt1(s.ul.max)} unit="Mbps" accent="#ffb224" />
        <Tile label="UL MIN" value={fmt1(s.ul.min)} unit="Mbps" />
        <Tile label="UL MEDIAN" value={fmt1(s.ul.median)} unit="Mbps" />
        <Tile label="UL σ DEV" value={fmt1(s.ul.std)} unit="Mbps" />
        <Tile label="UL STEADY" value={`${s.ul.consistency.toFixed(0)}%`} accent="#2be4b0" />

        <Tile label="PING AVG" value={fmt1(s.ping.mean)} unit="ms" accent="#46e583" />
        <Tile label="JITTER AVG" value={fmt1(s.jitter.mean)} unit="ms" accent="#46e583" />
        <Tile label="DATA DOWN" value={fmtBytes(s.bytesDown)} />
        <Tile label="DATA UP" value={fmtBytes(s.bytesUp)} />
        <Tile label="DURATION" value={fmtDuration(s.durationMs)} />
        <Tile
          label="PROBES"
          value={`${results.length - simCount}/${results.length}`}
          unit={simCount > 0 ? "sim" : "live"}
          accent={simCount > 0 ? "#ffb224" : "#46e583"}
        />
      </div>
    </div>
  );
}
