import type { RoundResult } from "./speedtest";

export interface Stats {
  mean: number;
  min: number;
  max: number;
  median: number;
  std: number;
  /** 0–100, higher = steadier link (100 − coefficient of variation) */
  consistency: number;
}

export function computeStats(values: number[]): Stats {
  if (values.length === 0)
    return { mean: 0, min: 0, max: 0, median: 0, std: 0, consistency: 0 };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const consistency = mean > 0 ? Math.max(0, Math.min(100, 100 - (std / mean) * 100)) : 0;
  return { mean, min: sorted[0], max: sorted[n - 1], median, std, consistency };
}

export interface Verdict {
  letter: string;
  label: string;
  blurb: string;
  hue: string; // tailwind-style color var
}

export function grade(avgDl: number, consistency: number): Verdict {
  const plus = consistency >= 92 ? "+" : "";
  if (avgDl >= 300)
    return {
      letter: `S${plus}`,
      label: "MULTIGIG CAPABLE",
      blurb: "Headroom for 4K on every screen, cloud gaming and heavy uploads at once.",
      hue: "var(--color-dl)",
    };
  if (avgDl >= 150)
    return {
      letter: `A${plus}`,
      label: "FIBER GRADE",
      blurb: "Comfortably above the pack — simultaneous streaming, calls and downloads.",
      hue: "var(--color-teal)",
    };
  if (avgDl >= 75)
    return {
      letter: `B${plus}`,
      label: "SOLID STREAM",
      blurb: "Smooth 4K streaming and fast downloads; occasional contention only.",
      hue: "var(--color-ok)",
    };
  if (avgDl >= 25)
    return {
      letter: `C${plus}`,
      label: "EVERYDAY READY",
      blurb: "HD streaming and browsing are fine; large files will take a while.",
      hue: "var(--color-ul)",
    };
  return {
    letter: `D${plus}`,
    label: "CONSTRAINED LINK",
    blurb: "Usable for basics — expect buffering and slow transfers under load.",
    hue: "var(--color-bad)",
  };
}

export const fmt1 = (v: number) => v.toFixed(1);
export const fmt0 = (v: number) => Math.round(v).toString();

export function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${Math.round(bytes)} B`;
}

export function fmtDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s - m * 60).toFixed(0)}s`;
}

export function sessionStats(results: RoundResult[]) {
  const dl = computeStats(results.map((r) => r.download));
  const ul = computeStats(results.map((r) => r.upload));
  const ping = computeStats(results.map((r) => r.ping));
  const jitter = computeStats(results.map((r) => r.jitter));
  const bytesDown = results.reduce((a, r) => a + r.bytesDown, 0);
  const bytesUp = results.reduce((a, r) => a + r.bytesUp, 0);
  const durationMs = results.reduce((a, r) => a + r.durationMs, 0);
  return { dl, ul, ping, jitter, bytesDown, bytesUp, durationMs };
}
