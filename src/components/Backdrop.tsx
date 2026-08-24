import { useMemo } from "react";

interface Packet {
  top: number;
  size: number;
  dur: number;
  delay: number;
  opacity: number;
  color: string;
}

const COLORS = [
  "rgba(60, 224, 255, 0.9)",
  "rgba(255, 178, 36, 0.85)",
  "rgba(70, 229, 131, 0.8)",
  "rgba(60, 224, 255, 0.6)",
];

/** Fixed layered backdrop: grid, scanlines, drifting packets, vignette. */
export default function Backdrop() {
  const packets = useMemo<Packet[]>(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        top: 4 + ((i * 61) % 92),
        size: 2 + ((i * 7) % 3),
        dur: 11 + ((i * 13) % 14),
        delay: -((i * 37) % 20),
        opacity: 0.25 + ((i * 17) % 40) / 100,
        color: COLORS[i % COLORS.length],
      })),
    []
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-grid" />
      {packets.map((p, i) => (
        <span
          key={i}
          className="packet"
          style={{
            top: `${p.top}%`,
            left: 0,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            ["--pd" as string]: `${p.dur}s`,
            ["--pw" as string]: `${p.delay}s`,
            ["--po" as string]: p.opacity,
          }}
        />
      ))}
      <div className="absolute inset-0 scanlines" />
      <div className="absolute inset-0 vignette" />
    </div>
  );
}
