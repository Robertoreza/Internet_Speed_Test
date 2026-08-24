import type { Phase, RoundResult } from "../lib/speedtest";

interface Props {
  results: RoundResult[];
  currentRound: number; // 1-indexed while running, 0 before start
  phase: Phase;
  running: boolean;
  liveFrac: number;
  total: number;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "ARMED",
  ping: "PINGING",
  download: "DOWNLOADING",
  upload: "UPLOADING",
  done: "COMPLETE",
  stopped: "ABORTED",
};

export default function RoundTracker({ results, currentRound, phase, running, liveFrac, total }: Props) {
  const completed = results.length;
  const overall = Math.min(100, ((completed + (running ? liveFrac * 0.92 : 0)) / total) * 100);

  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const r = results[i];
          const active = running && n === currentRound;
          const title = r
            ? `Round ${n} — ↓ ${r.download.toFixed(1)} / ↑ ${r.upload.toFixed(1)} Mbps · ping ${r.ping.toFixed(0)} ms${r.simulated ? " · simulated" : ""}`
            : active
              ? `Round ${n} — ${PHASE_LABEL[phase].toLowerCase()}…`
              : `Round ${n} — pending`;

          return (
            <div
              key={n}
              title={title}
              className={`relative flex h-[3.6rem] cursor-default flex-col items-center justify-center overflow-hidden border font-mono transition-all duration-200 hover:-translate-y-0.5 ${
                r
                  ? r.simulated
                    ? "border-ul/40 bg-ul/5"
                    : "border-teal/35 bg-teal/5 hover:border-teal/70"
                  : active
                    ? "border-dl bg-dl/10"
                    : "border-line/70 bg-deep/40 hover:border-edge"
              }`}
            >
              {active && <div className="stripes-live absolute inset-0 opacity-20" />}
              <span
                className={`text-[9px] tracking-[0.2em] ${
                  r ? "text-muted" : active ? "text-dl" : "text-dim"
                }`}
              >
                {String(n).padStart(2, "0")}
              </span>
              {r ? (
                <span className="mt-0.5 text-[11px] font-medium tabular-nums leading-tight">
                  <span className="text-dl">{r.download >= 100 ? r.download.toFixed(0) : r.download.toFixed(1)}</span>
                  <span className="text-dim"> / </span>
                  <span className="text-ul">{r.upload >= 100 ? r.upload.toFixed(0) : r.upload.toFixed(1)}</span>
                </span>
              ) : active ? (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-dl dot-live" />
              ) : (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-line" />
              )}
              {active && (
                <span
                  className="absolute bottom-0 left-0 h-0.5 bg-dl"
                  style={{ width: `${Math.round(liveFrac * 100)}%`, transition: "width 120ms linear" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* overall progress */}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-line/60 bg-deep">
          <div
            className="relative h-full rounded-full"
            style={{
              width: `${overall}%`,
              background: "linear-gradient(90deg, #2be4b0, #3ce0ff)",
              transition: "width 300ms ease",
              boxShadow: "0 0 10px rgba(60,224,255,0.45)",
            }}
          >
            {running && <div className="stripes-live absolute inset-0 opacity-60" />}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-muted">
          <span className={running ? "text-dl" : "text-fog"}>
            {running && currentRound > 0 ? `R${String(currentRound).padStart(2, "0")}` : `${completed}/${total}`}
          </span>{" "}
          · {Math.round(overall)}%
        </div>
      </div>
      <div className="mt-1.5 font-mono text-[10px] tracking-[0.24em] text-dim">
        {running ? PHASE_LABEL[phase] : phase === "done" ? "ALL ROUNDS BANKED" : phase === "stopped" ? "SESSION ABORTED" : "AWAITING START"}
      </div>
    </div>
  );
}
