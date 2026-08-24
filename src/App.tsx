import { useCallback, useRef, useState } from "react";
import Backdrop from "./components/Backdrop";
import Gauge from "./components/Gauge";
import Report from "./components/Report";
import RoundTracker from "./components/RoundTracker";
import SpeedChart from "./components/SpeedChart";
import Terminal from "./components/Terminal";
import { useReveal } from "./hooks/useReveal";
import { runBenchmark } from "./lib/speedtest";
import type { BenchmarkHandlers, LogLine, Mode, Phase, RoundResult, Tone } from "./lib/speedtest";

const ROUNDS = 10;

const timeStr = () => new Date().toTimeString().slice(0, 8);

const bootLogs = (): LogLine[] => {
  const t = timeStr();
  return [
    { id: 1, time: t, text: "core online · pulse/10 benchmark console", tone: "dim" },
    { id: 2, time: t, text: "transport: fetch streaming ↓ · xhr upload ↑ · 5× ping probe", tone: "dim" },
    { id: 3, time: t, text: "profile: 10 rounds · adaptive probe size 2–64 MB", tone: "dim" },
    { id: 4, time: t, text: "awaiting operator — press RUN BENCHMARK to engage", tone: "info" },
  ];
};

function Panel({
  label,
  right,
  children,
  className = "",
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-line bg-panel/70 shadow-[0_10px_36px_rgba(0,0,0,0.35)] ${className}`}>
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="font-display text-[11px] font-semibold tracking-[0.3em] text-muted">{label}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 34 34" className="h-8 w-8" aria-hidden>
      <rect x="1" y="1" width="32" height="32" rx="7" fill="#0c1626" stroke="#27395c" />
      <path
        d="M6.5 21h4.4l2.8-8.5 3.9 11 2.9-6.5h7"
        fill="none"
        stroke="#3ce0ff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27.5" cy="17" r="1.6" fill="#ffb224" />
    </svg>
  );
}

export default function App() {
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentRound, setCurrentRound] = useState(0);
  const [liveMbps, setLiveMbps] = useState(0);
  const [liveFrac, setLiveFrac] = useState(0);
  const [mode, setMode] = useState<Mode>("idle");
  const [logs, setLogs] = useState<LogLine[]>(bootLogs);
  const [running, setRunning] = useState(false);
  const [aborted, setAborted] = useState(false);

  const ctlRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(100);
  const runningRef = useRef(false);

  const chartReveal = useReveal();
  const reportReveal = useReveal();

  const pushLog = useCallback((text: string, tone: Tone = "info") => {
    setLogs((prev) => [...prev.slice(-220), { id: ++logIdRef.current, time: timeStr(), text, tone }]);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    setResults([]);
    setPhase("idle");
    setCurrentRound(0);
    setLiveMbps(0);
    setLiveFrac(0);
    setMode("idle");
    setAborted(false);
    setRunning(true);
    setLogs(bootLogs());

    const ctl = new AbortController();
    ctlRef.current = ctl;

    const handlers: BenchmarkHandlers = {
      phase: (p, rnd) => {
        setPhase(p);
        setCurrentRound(rnd);
        if (p === "ping" || p === "download" || p === "upload") setLiveFrac(0);
        if (p === "download" || p === "upload") setLiveMbps(0);
      },
      live: (mbps, frac) => {
        setLiveMbps(mbps);
        setLiveFrac(frac);
      },
      round: (r) => {
        setResults((rs) => [...rs, r]);
        setLiveMbps(r.download);
        setLiveFrac(1);
      },
      log: (text, tone = "info") => pushLog(text, tone),
      mode: (m) => setMode(m),
      done: (_all, wasAborted) => setAborted(wasAborted),
    };

    pushLog("─── session start · 10 rounds ───", "dim");
    try {
      await runBenchmark(ROUNDS, handlers, ctl.signal);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [pushLog]);

  const stop = useCallback(() => {
    ctlRef.current?.abort();
  }, []);

  const last = results[results.length - 1];

  const pill = (() => {
    if (running && mode === "sim") return { text: "SIMULATION", color: "var(--color-ul)", live: true };
    if (running) return { text: "LIVE PROBE", color: "var(--color-dl)", live: true };
    if (phase === "done") return { text: "COMPLETE", color: "var(--color-ok)", live: false };
    if (phase === "stopped") return { text: "ABORTED", color: "var(--color-bad)", live: false };
    return { text: "STANDBY", color: "var(--color-muted)", live: false };
  })();

  return (
    <div className="relative min-h-screen">
      <Backdrop />

      <div className="relative z-10 mx-auto max-w-[1180px] px-4 pb-10 sm:px-6">
        {/* ── header ── */}
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line/70 py-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="font-display text-xl font-bold leading-none tracking-[0.08em]">
                PULSE<span className="text-dl">/10</span>
              </div>
              <div className="mt-1 font-mono text-[9px] tracking-[0.34em] text-dim">
                LINK BENCHMARK CONSOLE
              </div>
            </div>
          </div>

          <div
            className="ml-1 inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] tracking-[0.24em]"
            style={{ color: pill.color, borderColor: pill.color }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${pill.live ? "dot-live" : ""}`}
              style={{ background: pill.color }}
            />
            {pill.text}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {running ? (
              <button
                onClick={stop}
                className="cursor-pointer border border-bad/70 bg-bad/10 px-5 py-2.5 font-display text-xs font-semibold tracking-[0.22em] text-bad transition-all duration-200 hover:-translate-y-0.5 hover:bg-bad/20 hover:shadow-[0_6px_20px_rgba(255,92,108,0.25)]"
              >
                ■ STOP
              </button>
            ) : (
              <button
                onClick={start}
                className="group flex cursor-pointer items-center gap-2.5 border border-dl bg-dl px-5 py-2.5 font-display text-xs font-bold tracking-[0.22em] text-abyss transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(60,224,255,0.35)]"
              >
                <svg viewBox="0 0 12 14" className="h-3 w-3 fill-current transition-transform duration-200 group-hover:scale-125">
                  <path d="M1 1l10 6-10 6z" />
                </svg>
                {results.length > 0 ? "RUN AGAIN" : "RUN BENCHMARK"}
              </button>
            )}
          </div>
        </header>

        {/* ── console row ── */}
        <div className="mt-5 grid gap-4 lg:grid-cols-12">
          <Panel
            label="LIVE THROUGHPUT"
            className="lg:col-span-5"
            right={
              <span
                className="font-mono text-[9px] tracking-[0.26em]"
                style={{ color: mode === "sim" ? "var(--color-ul)" : mode === "live" ? "var(--color-dl)" : "var(--color-dim)" }}
              >
                {mode === "sim" ? "SIM MODEL" : mode === "live" ? "CF ENDPOINT" : "IDLE"}
              </span>
            }
          >
            <Gauge
              value={liveMbps}
              frac={running ? liveFrac : phase === "done" || phase === "stopped" ? 1 : 0}
              phase={phase}
              running={running}
              ping={last ? last.ping : null}
              jitter={last ? last.jitter : null}
              round={running ? Math.max(currentRound, 1) : results.length}
              total={ROUNDS}
            />
          </Panel>

          <div className="flex flex-col gap-4 lg:col-span-7">
            <Panel label={`ROUND TRACKER · ${ROUNDS} ROUNDS`}>
              <RoundTracker
                results={results}
                currentRound={currentRound}
                phase={phase}
                running={running}
                liveFrac={liveFrac}
                total={ROUNDS}
              />
            </Panel>

            <Panel
              label="EVENT LOG"
              className="flex-1"
              right={
                <span className="font-mono text-[9px] tracking-[0.26em] text-dim">
                  {logs.length} LINES
                </span>
              }
            >
              <Terminal logs={logs} />
            </Panel>
          </div>
        </div>

        {/* ── chart ── */}
        <div ref={chartReveal.ref} className={`reveal ${chartReveal.shown ? "on" : ""} mt-4`}>
          <Panel label="THROUGHPUT TELEMETRY · MBPS / ROUND">
            <SpeedChart results={results} />
          </Panel>
        </div>

        {/* ── report ── */}
        {results.length > 0 && (
          <div ref={reportReveal.ref} className={`reveal ${reportReveal.shown ? "on" : ""} mt-4`}>
            <Panel label="SESSION REPORT · AGGREGATES & VERDICT">
              <Report results={results} aborted={aborted} />
            </Panel>
          </div>
        )}

        <footer className="mt-8 flex flex-col items-center gap-1 border-t border-line/60 pt-5 text-center font-mono text-[9.5px] tracking-[0.2em] text-dim">
          <div>PULSE/10 · probes: speed.cloudflare.com __down / __up · adaptive 2–64 MB payloads</div>
          <div>results vary with congestion, Wi-Fi and server distance · simulated rounds are flagged [sim]</div>
        </footer>
      </div>
    </div>
  );
}
