import { useEffect, useRef } from "react";
import type { LogLine, Tone } from "../lib/speedtest";

const TONE_CLASS: Record<Tone, string> = {
  info: "text-fog/85",
  ok: "text-ok",
  warn: "text-ul",
  err: "text-bad",
  dim: "text-dim",
};

export default function Terminal({ logs }: { logs: LogLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      className="term-scroll h-44 overflow-y-auto bg-[#050a13]/70 px-3.5 py-3 font-mono text-[11px] leading-[1.75] lg:h-[13.5rem]"
    >
      {logs.map((l) => (
        <div key={l.id} className="whitespace-pre-wrap break-words">
          <span className="text-dim">[{l.time}]</span>{" "}
          <span className={TONE_CLASS[l.tone]}>{l.text}</span>
        </div>
      ))}
      <div className="mt-0.5 text-dl">
        ▸ <span className="cursor-blink text-fog/80">▊</span>
      </div>
    </div>
  );
}
