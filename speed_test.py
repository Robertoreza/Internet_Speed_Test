#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PULSE/10 — desktop internet speed benchmark.

Runs 10 full speedtest rounds (ping -> download -> upload) against the
best Ookla server, shows a live status/progress bar while the rounds
run, and finishes with a matplotlib graph of the download/upload
speeds plus full statistics.

Usage:
    pip install -r requirements.txt
    python speed_test.py
"""

import json
import queue
import socket
import statistics
import threading
import time
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, ttk

try:
    import speedtest
except ImportError:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: speedtest-cli\n"
        "Run:  pip install -r requirements.txt"
    )

import matplotlib

matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

# ---------------------------------------------------------------- palette
BG = "#0b1424"
PANEL = "#101d33"
LINE = "#24365a"
TEXT = "#dbe8ff"
DIM = "#6f83a8"
CYAN = "#3ce0ff"
AMBER = "#ffb224"
GREEN = "#46e583"
RED = "#ff5c6c"

TOTAL_ROUNDS = 10
MONO = ("Menlo", 10)
MONO_S = ("Menlo", 8)
MONO_XL = ("Menlo", 40, "bold")

PHASES = ("ping", "download", "upload")
PHASE_LABEL = {"ping": "Pinging", "download": "Downloading", "upload": "Uploading"}


def tcp_ping(host: str, samples: int = 5):
    """Mean/jitter of TCP connect times to the chosen test server (ms)."""
    hostname, _, port = host.rpartition(":")
    hostname = hostname or host
    port = int(port or 80)
    times = []
    for _ in range(samples):
        t0 = time.perf_counter()
        with socket.create_connection((hostname, port), timeout=3):
            pass
        times.append((time.perf_counter() - t0) * 1000.0)
    mean = statistics.fmean(times)
    jitter = statistics.pstdev(times) if len(times) > 1 else 0.0
    return mean, jitter


class GraphPanel:
    """Embedded matplotlib chart: download vs upload per round (+ping)."""

    def __init__(self, parent):
        self.fig = Figure(figsize=(6.6, 3.4), dpi=100)
        self.fig.patch.set_facecolor(BG)
        self.ax = self.fig.add_subplot(111)
        self._style_axes()
        self.canvas = FigureCanvasTkAgg(self.fig, master=parent)
        self.canvas.get_tk_widget().configure(background=BG, highlightthickness=0)
        self.canvas.draw()

    def _style_axes(self):
        ax = self.ax
        ax.set_facecolor(PANEL)
        ax.set_xlim(0.3, TOTAL_ROUNDS + 0.7)
        ax.set_ylim(bottom=0)
        ax.set_xticks(range(1, TOTAL_ROUNDS + 1))
        ax.set_ylabel("Mbps", color=DIM, fontsize=8)
        ax.set_xlabel("round", color=DIM, fontsize=8)
        ax.tick_params(colors=DIM, labelsize=8)
        for spine in ax.spines.values():
            spine.set_edgecolor(LINE)
        ax.grid(axis="y", color=LINE, alpha=0.45, linewidth=0.6)

    def update(self, rounds):
        ax = self.ax
        ax.clear()
        self._style_axes()
        ok = [r for r in rounds if r.get("download") is not None]
        if not ok:
            ax.text(
                5.5, ax.get_ylim()[1] / 2, "AWAITING TELEMETRY",
                ha="center", va="center", color=DIM, fontsize=10, family="monospace",
            )
            self.canvas.draw()
            return

        xs = [r["round"] for r in ok]
        dls = [r["download"] for r in ok]
        uls = [r["upload"] for r in ok]
        pings = [r["ping"] for r in ok]

        w = 0.36
        ax.bar([x - w / 2 for x in xs], dls, w, color=CYAN, label="download", zorder=3)
        ax.bar([x + w / 2 for x in xs], uls, w, color=AMBER, label="upload", zorder=3)

        top = max(dls + uls) * 1.25 or 1
        ax.set_ylim(0, top)
        ax.axhline(statistics.fmean(dls), color=CYAN, lw=0.8, ls="--", alpha=0.6)
        ax.axhline(statistics.fmean(uls), color=AMBER, lw=0.8, ls="--", alpha=0.6)

        ax2 = ax.twinx()
        ax2.plot(xs, pings, color=GREEN, marker="o", ms=3.5, lw=1.2, label="ping")
        ax2.set_ylabel("ms", color=GREEN, fontsize=8)
        ax2.tick_params(colors=GREEN, labelsize=7)
        for spine in ax2.spines.values():
            spine.set_edgecolor(LINE)

        lines, labels = ax.get_legend_handles_labels()
        l2, lab2 = ax2.get_legend_handles_labels()
        ax.legend(lines + l2, labels + lab2, loc="upper left", fontsize=7,
                  facecolor=PANEL, edgecolor=LINE, labelcolor=TEXT)
        self.canvas.draw()


class PulseApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("PULSE/10 — Internet Speed Benchmark")
        self.root.configure(background=BG)
        self.root.geometry("1060x640")
        self.root.minsize(960, 580)

        self.msgs: "queue.Queue" = queue.Queue()
        self.stop_event = threading.Event()
        self.running = False
        self.rounds = []
        self.chips = []

        self._build_ui()
        self.root.after(120, self._drain)

    # ------------------------------------------------------------- UI
    def _build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL, relief="solid", borderwidth=1)
        style.configure("TLabel", background=BG, foreground=TEXT, font=MONO)
        style.configure("Dim.TLabel", background=BG, foreground=DIM, font=MONO_S)
        style.configure("Panel.TLabel", background=PANEL, foreground=TEXT, font=MONO)
        style.configure("Bar.Horizontal.TProgressbar",
                        troughcolor=PANEL, background=CYAN, borderwidth=0, thickness=14)
        style.configure("Sub.Horizontal.TProgressbar",
                        troughcolor=PANEL, background=GREEN, borderwidth=0, thickness=5)
        style.map("Bar.Horizontal.TProgressbar", background=[("active", CYAN)])
        style.configure("Treeview", background=PANEL, fieldbackground=PANEL,
                        foreground=TEXT, rowheight=22, borderwidth=0, font=MONO_S)
        style.configure("Treeview.Heading", background=BG, foreground=DIM,
                        font=MONO_S, relief="flat")
        style.map("Treeview", background=[("selected", LINE)])

        # ---- header
        header = ttk.Frame(self.root)
        header.pack(fill="x", padx=18, pady=(14, 6))
        ttk.Label(header, text="PULSE/10", font=("Menlo", 20, "bold"),
                  foreground=CYAN).pack(side="left")
        ttk.Label(header, text="10-ROUND BENCHMARK · OOKLA ENGINE",
                  style="Dim.TLabel").pack(side="left", padx=(14, 0), pady=(10, 0))
        self.status_pill = tk.Label(header, text=" STANDBY ", font=MONO_S, fg=GREEN,
                                    bg=BG, highlightbackground=GREEN, highlightthickness=1)
        self.status_pill.pack(side="right", pady=(6, 0))

        body = ttk.Frame(self.root)
        body.pack(fill="both", expand=True, padx=18, pady=6)
        body.columnconfigure(0, weight=2)
        body.columnconfigure(1, weight=3)
        body.rowconfigure(0, weight=1)

        # ---- left column
        left = ttk.Frame(body)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))

        gauge = tk.Frame(left, background=PANEL, highlightbackground=LINE,
                         highlightthickness=1)
        gauge.pack(fill="x")
        self.phase_label = tk.Label(gauge, text="STANDBY", font=MONO, fg=DIM, bg=PANEL,
                                    anchor="w")
        self.phase_label.pack(fill="x", padx=14, pady=(12, 0))
        self.readout = tk.Label(gauge, text="0.0", font=MONO_XL, fg=TEXT, bg=PANEL)
        self.readout.pack()
        self.readout_unit = tk.Label(gauge, text="Mbps  ·  current phase", font=MONO_S,
                                     fg=DIM, bg=PANEL)
        self.readout_unit.pack(pady=(0, 4))
        self.subbar = ttk.Progressbar(gauge, mode="indeterminate",
                                      style="Sub.Horizontal.TProgressbar")
        self.subbar.pack(fill="x", padx=14, pady=(0, 14))

        ttk.Label(left, text="OVERALL PROGRESS", style="Dim.TLabel").pack(anchor="w",
                                                                           pady=(12, 4))
        self.bar = ttk.Progressbar(left, mode="determinate", maximum=100,
                                   style="Bar.Horizontal.TProgressbar")
        self.bar.pack(fill="x")
        self.bar_label = ttk.Label(left, text="0 / 10 rounds · 0%", style="Dim.TLabel")
        self.bar_label.pack(anchor="e", pady=(4, 0))

        # round chips
        chip_row = tk.Frame(left, background=BG)
        chip_row.pack(fill="x", pady=(14, 0))
        for i in range(1, TOTAL_ROUNDS + 1):
            chip = tk.Label(chip_row, text=f"{i:02d}", font=MONO_S, fg=DIM, bg=PANEL,
                            width=4, relief="solid", borderwidth=1,
                            highlightbackground=LINE, highlightthickness=1)
            chip.pack(side="left", expand=True, fill="x", padx=(0, 4))
            self.chips.append(chip)

        # controls
        controls = ttk.Frame(left)
        controls.pack(fill="x", pady=(16, 0))
        self.start_btn = tk.Button(controls, text="RUN 10 ROUNDS", font=MONO, fg=BG,
                                   bg=CYAN, activebackground=GREEN, activeforeground=BG,
                                   relief="flat", cursor="hand2", command=self.start)
        self.start_btn.pack(side="left", ipadx=14, ipady=6)
        self.stop_btn = tk.Button(controls, text="STOP", font=MONO, fg=RED, bg=PANEL,
                                  activebackground=RED, activeforeground=BG,
                                  relief="solid", borderwidth=1, state="disabled",
                                  cursor="hand2", command=self.stop)
        self.stop_btn.pack(side="left", padx=(10, 0), ipadx=14, ipady=6)
        self.export_btn = tk.Button(controls, text="EXPORT JSON", font=MONO, fg=DIM,
                                    bg=PANEL, activebackground=LINE, relief="solid",
                                    borderwidth=1, cursor="hand2", command=self.export)
        self.export_btn.pack(side="right", ipadx=10, ipady=6)

        self.log_box = tk.Text(left, height=7, bg=PANEL, fg=DIM, font=MONO_S,
                               relief="solid", borderwidth=1, state="disabled",
                               insertbackground=CYAN, highlightthickness=0)
        self.log_box.pack(fill="both", expand=True, pady=(14, 0))

        # ---- right column: graph + table
        right = ttk.Frame(body)
        right.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        self.graph = GraphPanel(right)
        self.graph.canvas.get_tk_widget().pack(fill="both", expand=True)

        table = ttk.Frame(right)
        table.pack(fill="both", expand=True, pady=(12, 0))
        cols = ("round", "ping", "jitter", "download", "upload", "status")
        self.tree = ttk.Treeview(table, columns=cols, show="headings", height=6)
        for col, txt, w, anchor in (
            ("round", "ROUND", 60, "center"), ("ping", "PING ms", 90, "e"),
            ("jitter", "JITTER", 90, "e"), ("download", "DL Mbps", 100, "e"),
            ("upload", "UL Mbps", 100, "e"), ("status", "STATUS", 120, "w"),
        ):
            self.tree.heading(col, text=txt)
            self.tree.column(col, width=w, anchor=anchor)
        self.tree.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(table, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")

        # ---- stats footer
        self.stats_label = tk.Label(self.root, text="", font=MONO_S, fg=DIM, bg=PANEL,
                                    anchor="w", padx=14, pady=8,
                                    highlightbackground=LINE, highlightthickness=1)
        self.stats_label.pack(fill="x", padx=18, pady=(8, 14))
        self.log("engine ready — speedtest-cli bound to Ookla network")

    # ----------------------------------------------------------- actions
    def start(self):
        if self.running:
            return
        self.running = True
        self.stop_event.clear()
        self.rounds = []
        for item in self.tree.get_children():
            self.tree.delete(item)
        for chip in self.chips:
            chip.configure(fg=DIM, bg=PANEL, highlightbackground=LINE)
        self.bar["value"] = 0
        self.bar_label.configure(text="0 / 10 rounds · 0%")
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.pill("RUNNING", CYAN)
        self.phase_label.configure(text="selecting best server…", fg=TEXT)
        self.subbar.start(12)
        self.log("session started — 10 rounds queued")
        threading.Thread(target=self.worker, daemon=True).start()

    def stop(self):
        self.stop_event.set()
        self.log("stop requested — finishing current phase")
        self.stop_btn.configure(state="disabled")

    def export(self):
        if not self.rounds:
            messagebox.showinfo("Nothing to export", "Run the benchmark first.")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            initialfile=f"pulse10-{datetime.now():%Y%m%d-%H%M%S}.json",
            filetypes=[("JSON", "*.json")],
        )
        if not path:
            return
        with open(path, "w") as f:
            json.dump({"tool": "PULSE/10", "captured_at": datetime.now().isoformat(),
                       "rounds": self.rounds, "summary": self._summary()}, f, indent=2)
        self.log(f"report exported -> {path}")

    # ------------------------------------------------------------ worker
    def worker(self):
        try:
            st = speedtest.Speedtest()
            st.get_best_server()
            server = st.results.server
            self.msgs.put(("log", f"server: {server.get('sponsor')} — {server.get('name')}"))
            fallback_ping = float(st.results.ping or 0.0)

            for rnd in range(1, TOTAL_ROUNDS + 1):
                if self._aborted():
                    break
                self.msgs.put(("chip", (rnd, "active")))
                self.msgs.put(("phase", f"Round {rnd:02d}/{TOTAL_ROUNDS} · Pinging"))
                self.msgs.put(("bar", (rnd - 1) / TOTAL_ROUNDS))

                ping = jitter = None
                try:
                    ping, jitter = tcp_ping(server["host"])
                except OSError:
                    ping, jitter = fallback_ping, 0.0

                if self._aborted():
                    break
                self.msgs.put(("phase", f"Round {rnd:02d}/{TOTAL_ROUNDS} · Downloading"))
                self.msgs.put(("bar", (rnd - 1 + 0.10) / TOTAL_ROUNDS))
                dl = st.download() / 1e6
                self.msgs.put(("gauge", dl))

                if self._aborted():
                    break
                self.msgs.put(("phase", f"Round {rnd:02d}/{TOTAL_ROUNDS} · Uploading"))
                self.msgs.put(("bar", (rnd - 1 + 0.55) / TOTAL_ROUNDS))
                ul = st.upload(pre_allocate=False) / 1e6
                self.msgs.put(("gauge", ul))

                rec = {"round": rnd, "ping": round(ping, 1), "jitter": round(jitter, 2),
                       "download": round(dl, 2), "upload": round(ul, 2), "status": "ok"}
                self.msgs.put(("round", rec))
                time.sleep(0.35)

            self.msgs.put(("done", None))
        except Exception as exc:  # noqa: BLE001
            self.msgs.put(("log", f"error: {exc}"))
            self.msgs.put(("done", None))

    def _aborted(self):
        return self.stop_event.is_set()

    # ------------------------------------------------------------ UI pump
    def _drain(self):
        try:
            while True:
                kind, payload = self.msgs.get_nowait()
                self._handle(kind, payload)
        except queue.Empty:
            pass
        self.root.after(120, self._drain)

    def _handle(self, kind, payload):
        if kind == "log":
            self.log(payload)
        elif kind == "phase":
            self.phase_label.configure(text=payload, fg=TEXT)
        elif kind == "gauge":
            self.readout.configure(text=f"{payload:.1f}")
        elif kind == "bar":
            pct = payload * 100
            self.bar["value"] = pct
            done = len([r for r in self.rounds])
            self.bar_label.configure(text=f"{done} / {TOTAL_ROUNDS} rounds · {pct:.0f}%")
        elif kind == "chip":
            rnd, state = payload
            chip = self.chips[rnd - 1]
            if state == "active":
                chip.configure(fg=BG, bg=CYAN, highlightbackground=CYAN)
            else:
                chip.configure(fg=GREEN, bg=PANEL, highlightbackground=GREEN)
        elif kind == "round":
            self.rounds.append(payload)
            self.tree.insert("", "end", values=(
                f"{payload['round']:02d}", f"{payload['ping']:.1f}",
                f"{payload['jitter']:.2f}", f"{payload['download']:.1f}",
                f"{payload['upload']:.1f}", payload["status"],
            ))
            self.tree.yview_moveto(1.0)
            self.msgs.put(("chip", (payload["round"], "done")))
            self.log(f"round {payload['round']:02d}: ↓ {payload['download']:.1f}  "
                     f"↑ {payload['upload']:.1f} Mbps · ping {payload['ping']:.0f} ms")
            self.graph.update(self.rounds)
        elif kind == "done":
            self._finish()

    def _finish(self):
        self.subbar.stop()
        self.running = False
        self.start_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")
        n = len(self.rounds)
        if n == 0:
            self.pill("NO DATA", RED)
            self.phase_label.configure(text="no rounds completed", fg=RED)
            self.log("session ended with no completed rounds")
            return
        aborted = self.stop_event.is_set() or n < TOTAL_ROUNDS
        self.pill("ABORTED" if aborted else "COMPLETE", AMBER if aborted else GREEN)
        self.phase_label.configure(
            text=f"{'aborted after' if aborted else 'completed'} {n}/{TOTAL_ROUNDS} rounds",
            fg=AMBER if aborted else GREEN,
        )
        self.bar["value"] = n / TOTAL_ROUNDS * 100
        self.bar_label.configure(text=f"{n} / {TOTAL_ROUNDS} rounds · {n * 10:.0f}%")
        s = self._summary()
        self.stats_label.configure(
            text=(f" DL avg {s['download']['mean']:.1f} (best {s['download']['max']:.1f}) · "
                  f"UL avg {s['upload']['mean']:.1f} (best {s['upload']['max']:.1f}) · "
                  f"ping {s['ping']['mean']:.0f} ms · jitter {s['jitter']['mean']:.2f} ms")
        )
        self.log(f"session finished — {n} rounds banked")

    def _summary(self):
        def stat(key):
            vals = [r[key] for r in self.rounds if r.get(key) is not None]
            if not vals:
                return {"mean": 0, "max": 0, "min": 0}
            return {"mean": statistics.fmean(vals), "max": max(vals), "min": min(vals)}
        return {"download": stat("download"), "upload": stat("upload"),
                "ping": stat("ping"), "jitter": stat("jitter")}

    # ------------------------------------------------------------ helpers
    def pill(self, text, color):
        self.status_pill.configure(text=f" {text} ", fg=color,
                                   highlightbackground=color)

    def log(self, msg):
        stamp = datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{stamp}] {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def mainloop(self):
        self.root.mainloop()


if __name__ == "__main__":
    PulseApp().mainloop()
