/* ─────────────────────────────────────────────────────────────
   PULSE/10 benchmark engine
   Live probes against the Cloudflare speed endpoints:
     download → streaming fetch reader   (real byte-by-byte throughput)
     upload   → XMLHttpRequest           (real upload.onprogress events)
     ping     → 5× zero-byte round trips (warm-up sample discarded)
   If the endpoint is unreachable the engine degrades to a clearly
   flagged simulation model so the console never dead-ends.
   ───────────────────────────────────────────────────────────── */

export type Phase = "idle" | "ping" | "download" | "upload" | "done" | "stopped";
export type Mode = "idle" | "live" | "sim";
export type Tone = "info" | "ok" | "warn" | "err" | "dim";

export interface LogLine {
  id: number;
  time: string;
  text: string;
  tone: Tone;
}

export interface RoundResult {
  round: number;
  ping: number;      // ms (best of samples)
  jitter: number;    // ms (mean |Δ| between samples)
  download: number;  // Mbps
  upload: number;    // Mbps
  bytesDown: number;
  bytesUp: number;
  durationMs: number;
  simulated: boolean;
  ts: number;
}

export interface BenchmarkHandlers {
  phase(p: Phase, round: number): void;
  live(mbps: number, frac: number): void;
  round(r: RoundResult): void;
  log(text: string, tone?: Tone): void;
  mode(m: Mode): void;
  done(results: RoundResult[], aborted: boolean): void;
}

const CF_DOWN = "https://speed.cloudflare.com/__down";
const CF_UP = "https://speed.cloudflare.com/__up";

const domAbort = () => new DOMException("Aborted", "AbortError");
const isAbort = (e: unknown) =>
  e instanceof DOMException && e.name === "AbortError";
const pad2 = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(domAbort());
    const onAbort = () => {
      clearTimeout(timer);
      reject(domAbort());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function timedFetch(
  url: string,
  outer: AbortSignal,
  timeoutMs: number,
  init?: RequestInit
): Promise<Response> {
  const ctl = new AbortController();
  const relay = () => ctl.abort();
  outer.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: ctl.signal, ...init });
  } catch {
    throw outer.aborted ? domAbort() : new Error("probe timeout");
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", relay);
  }
}

/* ---------------- ping ---------------- */
async function measurePing(signal: AbortSignal): Promise<{ ping: number; jitter: number }> {
  const times: number[] = [];
  for (let s = 0; s < 5; s++) {
    const t0 = performance.now();
    await timedFetch(`${CF_DOWN}?bytes=0&r=${Math.random()}`, signal, 3500);
    times.push(performance.now() - t0);
  }
  const warm = times.slice(1).sort((a, b) => a - b); // drop TLS warm-up
  const ping = warm[0];
  let j = 0;
  for (let k = 1; k < warm.length; k++) j += Math.abs(warm[k] - warm[k - 1]);
  return { ping, jitter: j / (warm.length - 1) };
}

/* ---------------- download (streaming) ---------------- */
async function measureDownload(
  size: number,
  maxMs: number,
  signal: AbortSignal,
  onSample: (mbps: number, frac: number) => void
): Promise<{ mbps: number; bytes: number; ms: number }> {
  const res = await timedFetch(`${CF_DOWN}?bytes=${size}&r=${Math.random()}`, signal, 6000);
  if (!res.ok || !res.body) throw new Error(`download http ${res.status}`);
  const reader = res.body.getReader();
  const t0 = performance.now();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      const el = Math.max((performance.now() - t0) / 1000, 0.05);
      onSample((received * 8) / 1e6 / el, clamp(received / size, 0, 1));
      if (performance.now() - t0 > maxMs) break;
    }
  } catch (e) {
    if (signal.aborted) throw domAbort();
    if (received < 200_000) throw e; // barely started → treat as failure
  } finally {
    reader.cancel().catch(() => undefined);
  }
  const ms = performance.now() - t0;
  if (received < 200_000) throw new Error("download starved");
  return { mbps: (received * 8) / 1e6 / (ms / 1000), bytes: received, ms };
}

/* ---------------- upload (XHR progress) ---------------- */
const payloadCache = new Map<number, Uint8Array>();
function getPayload(size: number): Uint8Array {
  let p = payloadCache.get(size);
  if (!p) {
    p = new Uint8Array(size);
    for (let off = 0; off < size; off += 65536) {
      const chunk = new Uint8Array(Math.min(65536, size - off));
      crypto.getRandomValues(chunk);
      p.set(chunk, off);
    }
    payloadCache.set(size, p);
  }
  return p;
}

function measureUpload(
  size: number,
  maxMs: number,
  signal: AbortSignal,
  onSample: (mbps: number, frac: number) => void
): Promise<{ mbps: number; bytes: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const t0 = performance.now();
    let settled = false;
    let maxLoaded = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onOuterAbort);
      fn();
    };
    const onOuterAbort = () =>
      finish(() => {
        xhr.abort();
        reject(domAbort());
      });
    const timer = setTimeout(() => {
      const el = Math.max((performance.now() - t0) / 1000, 0.05);
      finish(() => {
        xhr.abort();
        resolve({ mbps: (maxLoaded * 8) / 1e6 / el, bytes: maxLoaded, ms: el * 1000 });
      });
    }, maxMs);

    signal.addEventListener("abort", onOuterAbort, { once: true });
    xhr.open("POST", CF_UP);
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.loaded > maxLoaded) maxLoaded = e.loaded;
      const el = (performance.now() - t0) / 1000;
      if (el > 0.08)
        onSample((maxLoaded * 8) / 1e6 / el, e.total ? clamp(maxLoaded / e.total, 0, 1) : 0);
    };
    xhr.onload = () => {
      const el = Math.max((performance.now() - t0) / 1000, 0.05);
      const sent = maxLoaded || size;
      finish(() => {
        if (xhr.status >= 200 && xhr.status < 300)
          resolve({ mbps: (sent * 8) / 1e6 / el, bytes: sent, ms: el * 1000 });
        else reject(new Error(`upload http ${xhr.status}`));
      });
    };
    xhr.onerror = () => finish(() => reject(new Error("upload network error")));
    xhr.onabort = () => undefined;
    xhr.send(getPayload(size).buffer as ArrayBuffer);
  });
}

/* ---------------- simulation fallback ---------------- */
interface SimProfile {
  dl(round: number): number;
  ul(round: number): number;
  ping(): number;
}
function makeSimProfile(seed?: RoundResult): SimProfile {
  const base = seed ? seed.download : 110 + Math.random() * 260;
  const ulRatio = seed ? clamp(seed.upload / Math.max(seed.download, 1), 0.1, 0.95) : 0.3 + Math.random() * 0.22;
  const pingBase = seed ? seed.ping : 8 + Math.random() * 16;
  return {
    dl: (i) =>
      clamp(base * (0.86 + Math.sin(i / 2.1) * 0.07 + (Math.random() * 0.16 - 0.08)), 4, 2000),
    ul: (i) =>
      clamp(base * ulRatio * (0.85 + Math.cos(i / 1.7) * 0.06 + Math.random() * 0.18), 1, 1200),
    ping: () => clamp(pingBase * (0.9 + Math.random() * 0.3), 2, 220),
  };
}

async function simRamp(
  target: number,
  ms: number,
  signal: AbortSignal,
  onSample: (mbps: number, frac: number) => void
): Promise<void> {
  const steps = Math.max(6, Math.round(ms / 90));
  for (let s = 1; s <= steps; s++) {
    await sleep(ms / steps, signal);
    const prog = s / steps;
    const val = target * (0.35 + 0.65 * prog) * (0.94 + Math.random() * 0.12);
    onSample(prog >= 1 ? target : val, prog);
  }
}

/* ---------------- main loop ---------------- */
export async function runBenchmark(
  totalRounds: number,
  h: BenchmarkHandlers,
  signal: AbortSignal
): Promise<void> {
  const results: RoundResult[] = [];
  let mode: Mode = "live";
  let profile: SimProfile | null = null;
  let downBytes = 16_000_000; // adaptive probe sizes
  let upBytes = 8_000_000;
  let lastEmit = 0;

  const emit = (mbps: number, frac: number) => {
    const now = performance.now();
    if (now - lastEmit > 90 || frac >= 1) {
      lastEmit = now;
      h.live(mbps, frac);
    }
  };
  const enterSim = (why: string) => {
    if (mode === "sim") return;
    mode = "sim";
    const seed = results[results.length - 1];
    profile = makeSimProfile(seed);
    h.mode("sim");
    h.log(why + " → simulation model engaged", "warn");
  };

  h.mode("live");
  h.log("benchmark armed · 10 rounds · target speed.cloudflare.com", "dim");
  h.log("probes: streaming GET __down · XHR POST __up · 5× ping", "dim");

  try {
    for (let i = 1; i <= totalRounds; i++) {
      const roundStart = performance.now();
      let simulated = false;

      /* ping */
      h.phase("ping", i);
      let ping = 0;
      let jitter = 0;
      if (mode === "live") {
        try {
          const p = await measurePing(signal);
          ping = p.ping;
          jitter = p.jitter;
          h.log(`rnd ${pad2(i)} · ping ${ping.toFixed(1)} ms · jitter ${jitter.toFixed(1)} ms`, "info");
        } catch (e) {
          if (isAbort(e)) throw e;
          enterSim("ping probe unreachable");
          ping = profile!.ping();
          jitter = ping * (0.05 + Math.random() * 0.1);
          h.log(`rnd ${pad2(i)} · ping ${ping.toFixed(1)} ms [sim]`, "dim");
        }
      } else {
        await sleep(260, signal);
        ping = profile!.ping();
        jitter = ping * (0.05 + Math.random() * 0.12);
        h.log(`rnd ${pad2(i)} · ping ${ping.toFixed(1)} ms · jitter ${jitter.toFixed(1)} ms [sim]`, "dim");
      }

      /* download */
      h.phase("download", i);
      emit(0, 0);
      let dl = 0;
      let bD = 0;
      if (mode === "live") {
        try {
          const m = await measureDownload(downBytes, 8000, signal, emit);
          dl = m.mbps;
          bD = m.bytes;
          if (m.ms < 2200) downBytes = Math.min(64_000_000, downBytes * 2);
          else if (m.ms > 6600) downBytes = Math.max(2_000_000, Math.round(downBytes / 2));
        } catch (e) {
          if (isAbort(e)) throw e;
          enterSim("download probe failed");
          simulated = true;
          dl = profile!.dl(i);
          bD = (dl / 8) * 1e6 * 1.1;
          await simRamp(dl, 1000, signal, emit);
        }
      } else {
        simulated = true;
        dl = profile!.dl(i);
        bD = (dl / 8) * 1e6 * 1.1;
        await simRamp(dl, 1000, signal, emit);
      }

      /* upload */
      h.phase("upload", i);
      emit(0, 0);
      let ul = 0;
      let bU = 0;
      if (mode === "live") {
        try {
          const m = await measureUpload(upBytes, 8000, signal, emit);
          ul = m.mbps;
          bU = m.bytes;
          if (m.ms < 2200) upBytes = Math.min(24_000_000, upBytes * 2);
          else if (m.ms > 6600) upBytes = Math.max(1_000_000, Math.round(upBytes / 2));
        } catch (e) {
          if (isAbort(e)) throw e;
          enterSim("upload probe failed");
          simulated = true;
          ul = profile!.ul(i);
          bU = (ul / 8) * 1e6 * 0.9;
          await simRamp(ul, 900, signal, emit);
        }
      } else {
        simulated = true;
        ul = profile!.ul(i);
        bU = (ul / 8) * 1e6 * 0.9;
        await simRamp(ul, 900, signal, emit);
      }

      const r: RoundResult = {
        round: i,
        ping,
        jitter,
        download: dl,
        upload: ul,
        bytesDown: bD,
        bytesUp: bU,
        durationMs: performance.now() - roundStart,
        simulated,
        ts: Date.now(),
      };
      results.push(r);
      h.round(r);
      h.log(
        `rnd ${pad2(i)} ✓ down ${dl.toFixed(1)} Mbps · up ${ul.toFixed(1)} Mbps · ${((performance.now() - roundStart) / 1000).toFixed(1)}s${simulated ? " [sim]" : ""}`,
        simulated ? "warn" : "ok"
      );
      if (i < totalRounds) await sleep(320, signal);
    }

    h.phase("done", totalRounds);
    h.log(`benchmark complete · ${results.length}/${totalRounds} rounds banked`, "ok");
    h.done(results, false);
  } catch (e) {
    if (isAbort(e)) {
      h.phase("stopped", results.length);
      h.log(`operator abort · ${results.length} round(s) banked`, "err");
    } else {
      h.phase("stopped", results.length);
      h.log(`engine fault: ${(e as Error).message}`, "err");
    }
    h.done(results, true);
  }
}
