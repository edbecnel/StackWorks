import type { UciEngine, UciBestMoveArgs, EvalScore } from "./uciEngine.ts";

// NOTE:
// Stockfish is loaded as a classic Worker + WASM. In Vite dev, URLs resolved
// directly from node_modules can end up as `/@fs/D:/...` which is fragile in
// some browser/Worker/WASM combinations.
//
// We instead copy the Stockfish artifacts into `public/vendor/stockfish/` at
// install time and load them from stable, base-aware URLs.

const STOCKFISH_PUBLIC_DIR = "vendor/stockfish";

type StockfishArtifact = {
  key: "lite-single" | "asm";
  workerFile: string;
  wasmFile?: string;
  label: string;
};

const STOCKFISH_LITE_SINGLE: StockfishArtifact = {
  key: "lite-single",
  workerFile: "stockfish-17.1-lite-single-03e3232.js",
  wasmFile: "stockfish-17.1-lite-single-03e3232.wasm",
  label: "Stockfish WASM",
};

const STOCKFISH_ASM: StockfishArtifact = {
  key: "asm",
  workerFile: "stockfish-17.1-asm-341ff22.js",
  label: "Stockfish asm.js",
};

type StockfishEngine = {
  postMessage(command: string): void;
  onmessage: ((ev: unknown) => void) | null;
  terminate?: () => void;
  onerror?: ((ev: unknown) => void) | null;
  onmessageerror?: ((ev: unknown) => void) | null;
};

function prefersAsmStockfish(): boolean {
  if (typeof location !== "undefined") {
    const host = String(location.hostname || "").toLowerCase();
    if (host === "stackworks.games" || host === "www.stackworks.games") {
      return true;
    }
  }
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function fallbackArtifactFor(current: StockfishArtifact): StockfishArtifact | null {
  return current.key === STOCKFISH_LITE_SINGLE.key ? STOCKFISH_ASM : null;
}

function formatArtifactUrls(workerUrl: string, wasmUrl: string | null): string {
  return wasmUrl ? ` workerUrl=${workerUrl} wasmUrl=${wasmUrl}` : ` workerUrl=${workerUrl}`;
}

function createStockfishWorker(artifact: StockfishArtifact): {
  engine: StockfishEngine;
  workerUrl: string;
  wasmUrl: string | null;
  cleanup?: () => void;
} {
  if (typeof Worker === "undefined") {
    throw new Error("Stockfish requires Web Worker support in this environment");
  }

  // IMPORTANT: Make URLs absolute. Also make them base-aware (prod uses a repo-scoped BASE_URL on GitHub Pages).
  const base = import.meta.env?.BASE_URL ?? "/";
  const workerRel = `${base}${STOCKFISH_PUBLIC_DIR}/${artifact.workerFile}`;
  const wasmRel = artifact.wasmFile ? `${base}${STOCKFISH_PUBLIC_DIR}/${artifact.wasmFile}` : null;

  const workerAbs = new URL(workerRel, window.location.href).toString();
  const wasmAbs = wasmRel ? new URL(wasmRel, window.location.href).toString() : null;

  const worker = new Worker(workerAbs, { type: "classic", name: "stockfish" });
  return { engine: worker as unknown as StockfishEngine, workerUrl: workerAbs, wasmUrl: wasmAbs };
}

type UciLine = string;

function normalizeLines(ev: unknown): string[] {
  const raw =
    typeof ev === "string"
      ? ev
      : typeof (ev as any)?.data === "string"
        ? ((ev as any).data as string)
        : null;

  if (!raw) return [];
  // Some Stockfish worker builds emit multiple lines in one message.
  // Split and drop empty lines so waitForLine sees exact tokens like `uciok`.
  return raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0 || !Number.isFinite(ms)) return p;
  return new Promise<T>((resolve, reject) => {
    const tid = window.setTimeout(() => reject(new Error(`Stockfish timeout: ${label}`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(tid);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(tid);
        reject(err);
      },
    );
  });
}

function retryKickUntil<T>(args: {
  action: () => void;
  until: Promise<T>;
  timeoutMs: number;
  label: string;
  kickEveryMs?: number;
}): Promise<T> {
  const kickEveryMs = Math.max(50, Math.round(args.kickEveryMs ?? 400));

  // Some Stockfish worker builds install `onmessage` only after WASM has loaded.
  // If we `postMessage()` before that, commands can be dropped. Periodically re-send
  // the command until we see the expected response.
  args.action();
  const tid = window.setInterval(() => {
    try {
      args.action();
    } catch {
      // ignore
    }
  }, kickEveryMs);

  return withTimeout(args.until, args.timeoutMs, args.label).finally(() => {
    window.clearInterval(tid);
  });
}

export class StockfishUciEngine implements UciEngine {
  private engine!: StockfishEngine;
  private workerUrl = "";
  private wasmUrl: string | null = null;
  private cleanup: (() => void) | null = null;
  private artifact: StockfishArtifact;
  private lines: UciLine[] = [];
  private waiters: Array<{ pred: (line: string) => boolean; resolve: (line: string) => void }> = [];
  /** Persistent line observers used by evaluate(). Return true to auto-remove. */
  private lineObservers: Array<(line: string) => boolean> = [];
  private isReady = false;
  private initPromise: Promise<void> | null = null;
  private currentSkill: number | null = null;
  private lastWorkerError: string | null = null;
  private readonly lastOutput: string[] = [];

  constructor() {
    this.artifact = prefersAsmStockfish() ? STOCKFISH_ASM : STOCKFISH_LITE_SINGLE;
    this.bootWorker(this.artifact);
  }

  terminate(): void {
    this.disposeCurrentWorker();
  }

  private bootWorker(artifact: StockfishArtifact): void {
    const created = createStockfishWorker(artifact);
    this.artifact = artifact;
    this.engine = created.engine;
    this.workerUrl = created.workerUrl;
    this.wasmUrl = created.wasmUrl;
    this.cleanup = created.cleanup ?? null;
    this.lines = [];
    this.waiters = [];
    this.lineObservers = [];
    this.isReady = false;
    this.initPromise = null;
    this.currentSkill = null;
    this.lastWorkerError = null;
    this.lastOutput.length = 0;

    if (import.meta.env?.DEV) {
      void fetch(this.workerUrl, { method: "GET" })
        .then(async (r) => {
          const ct = r.headers.get("content-type") ?? "";
          if (!r.ok || !ct.includes("javascript")) {
            const peek = await r.text().then((t) => t.slice(0, 80)).catch(() => "");
            console.warn("[stockfish] worker served unexpected response", {
              status: r.status,
              contentType: ct,
              url: this.workerUrl,
              peek,
              artifact: this.artifact.label,
            });
          }
        })
        .catch((e) => console.warn("[stockfish] worker fetch failed", e));

      if (this.wasmUrl) {
        void fetch(this.wasmUrl, { method: "GET" })
          .then(async (r) => {
            const ct = r.headers.get("content-type") ?? "";
            if (!r.ok || !(ct.includes("application/wasm") || ct.includes("wasm"))) {
              const peek = await r.text().then((t) => t.slice(0, 80)).catch(() => "");
              console.warn("[stockfish] wasm served unexpected response", {
                status: r.status,
                contentType: ct,
                url: this.wasmUrl,
                peek,
                artifact: this.artifact.label,
              });
            }
          })
          .catch((e) => console.warn("[stockfish] wasm fetch failed", e));
      }
    }

    this.engine.onerror = (ev: any) => {
      const msg = String(ev?.message ?? ev?.error?.message ?? ev?.type ?? "worker error");
      this.lastWorkerError = `${msg} (${this.artifact.label}; workerUrl=${this.workerUrl})`;
      this.isReady = false;
      this.initPromise = null;
      console.error("[stockfish] worker error", ev);
    };
    this.engine.onmessageerror = (ev: any) => {
      const msg = String(ev?.message ?? ev?.type ?? "worker message error");
      this.lastWorkerError = `${msg} (${this.artifact.label}; workerUrl=${this.workerUrl})`;
      this.isReady = false;
      this.initPromise = null;
      console.error("[stockfish] worker messageerror", ev);
    };

    this.engine.onmessage = (ev: any) => {
      const lines = normalizeLines(ev);
      if (!lines.length) return;

      for (const line of lines) {
        this.lastOutput.push(line);
        if (this.lastOutput.length > 50) this.lastOutput.splice(0, this.lastOutput.length - 50);

        for (let i = 0; i < this.waiters.length; i++) {
          const w = this.waiters[i];
          if (w && w.pred(line)) {
            this.waiters.splice(i, 1);
            w.resolve(line);
            continue;
          }
        }

        for (let i = this.lineObservers.length - 1; i >= 0; i--) {
          const obs = this.lineObservers[i];
          if (obs && obs(line)) {
            this.lineObservers.splice(i, 1);
          }
        }

        this.lines.push(line);
      }
    };

    try {
      this.send("__sf_ping");
    } catch {
      // ignore
    }
  }

  private disposeCurrentWorker(): void {
    try {
      this.engine?.terminate?.();
    } catch {
      // ignore
    }
    try {
      this.cleanup?.();
    } catch {
      // ignore
    }
    this.cleanup = null;
  }

  private switchToFallbackArtifact(reason: string): boolean {
    const fallback = fallbackArtifactFor(this.artifact);
    if (!fallback) return false;
    console.warn(`[stockfish] switching from ${this.artifact.label} to ${fallback.label}: ${reason}`);
    this.disposeCurrentWorker();
    this.bootWorker(fallback);
    return true;
  }

  private getOrStartInitPromise(): Promise<void> {
    if (this.isReady) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    // Start a single long-running init attempt. Individual callers may impose
    // shorter timeouts while waiting, but we avoid repeatedly restarting init.
    const hardTimeoutMs = 10 * 60_000;
    this.initPromise = this.initInternal({ timeoutMs: hardTimeoutMs }).catch((e) => {
      // Allow retry after a real failure.
      this.initPromise = null;
      throw e;
    });
    return this.initPromise;
  }

  private send(cmd: string): void {
    this.engine.postMessage(cmd);
  }

  private waitForLine(pred: (line: string) => boolean): Promise<string> {
    // First check buffered lines.
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (pred(line)) {
        this.lines.splice(i, 1);
        return Promise.resolve(line);
      }
    }

    return new Promise<string>((resolve) => {
      this.waiters.push({ pred, resolve });
    });
  }

  private async initInternal(opts?: { timeoutMs?: number }): Promise<void> {
    if (this.isReady) return;

    if (this.lastWorkerError) {
      if (this.switchToFallbackArtifact(this.lastWorkerError)) {
        return this.initInternal(opts);
      }
      throw new Error(`Stockfish worker failed: ${this.lastWorkerError}`);
    }

    // Initial WASM fetch/compile can take a long time on some machines.
    const timeoutMs = opts?.timeoutMs ?? 120000;

    try {
      await retryKickUntil({
        action: () => this.send("uci"),
        until: this.waitForLine((l) => l.trim() === "uciok"),
        timeoutMs,
        label: "uciok",
      });
    } catch {
      if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
        return this.initInternal(opts);
      }
      const tail = this.lastOutput.slice(-10).join(" | ");
      const extra = this.lastWorkerError
        ? ` workerError=${this.lastWorkerError}`
        : `${formatArtifactUrls(this.workerUrl, this.wasmUrl)} tail=${tail || "<no output>"}`;
      throw new Error(`Stockfish timeout: uciok (${extra})`);
    }

    try {
      await retryKickUntil({
        action: () => this.send("isready"),
        until: this.waitForLine((l) => l.trim() === "readyok"),
        timeoutMs,
        label: "readyok",
      });
    } catch {
      if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
        return this.initInternal(opts);
      }
      const tail = this.lastOutput.slice(-10).join(" | ");
      const extra = this.lastWorkerError
        ? ` workerError=${this.lastWorkerError}`
        : `${formatArtifactUrls(this.workerUrl, this.wasmUrl)} tail=${tail || "<no output>"}`;
      throw new Error(`Stockfish timeout: readyok (${extra})`);
    }

    this.isReady = true;
  }

  async init(opts?: { timeoutMs?: number }): Promise<void> {
    if (this.isReady) return;
    const waitTimeoutMs = opts?.timeoutMs ?? 120000;
    try {
      await withTimeout(this.getOrStartInitPromise(), waitTimeoutMs, "init");
    } catch {
      // Preserve the existing error surface (tail/urls) for debugging.
      const tail = this.lastOutput.slice(-10).join(" | ");
      const extra = this.lastWorkerError
        ? ` workerError=${this.lastWorkerError}`
        : `${formatArtifactUrls(this.workerUrl, this.wasmUrl)} tail=${tail || "<no output>"}`;
      throw new Error(`Stockfish timeout: uciok (${extra})`);
    }
  }

  async setSkillLevel(skill: number, opts?: { timeoutMs?: number }): Promise<void> {
    const s = Math.max(0, Math.min(20, Math.round(skill)));
    if (this.currentSkill === s && this.isReady) return;

    if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
      return this.setSkillLevel(skill, opts);
    }

    if (!this.isReady) await this.init({ timeoutMs: opts?.timeoutMs });

    this.send(`setoption name Skill Level value ${s}`);

    // Sync: Stockfish doesn't ack setoption, so we use isready.
    const timeoutMs = opts?.timeoutMs ?? 120000;
    await retryKickUntil({
      action: () => this.send("isready"),
      until: this.waitForLine((l) => l.trim() === "readyok"),
      timeoutMs,
      label: "readyok after setoption",
    }).catch((err) => {
      if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
        return this.setSkillLevel(skill, opts);
      }
      throw err;
    });

    this.currentSkill = s;
  }

  async bestMove(args: UciBestMoveArgs): Promise<string> {
    const movetimeMs = Math.max(10, Math.round(args.movetimeMs));
    const timeoutMs = args.timeoutMs ?? Math.max(2000, movetimeMs * 20);

    if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
      return this.bestMove(args);
    }

    if (args.skill !== undefined) {
      await this.setSkillLevel(args.skill, { timeoutMs });
    } else {
      await this.init({ timeoutMs });
    }

    // Clear any buffered bestmove from previous searches.
    this.lines = this.lines.filter((l) => !l.startsWith("bestmove "));

    this.send(`position fen ${args.fen}`);
    this.send(`go movetime ${movetimeMs}`);

    const line = await withTimeout(this.waitForLine((l) => l.startsWith("bestmove ")), timeoutMs, "bestmove").catch((err) => {
      if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
        return this.bestMove(args);
      }
      if (this.lastWorkerError) {
        throw new Error(`Stockfish worker failed: ${this.lastWorkerError}`);
      }
      throw err;
    });
    const parts = line.trim().split(/\s+/);
    const move = parts[1];
    if (!move || move === "(none)") {
      throw new Error("Stockfish returned no bestmove");
    }
    return move;
  }

  async evaluate(fen: string, opts?: { movetimeMs?: number; timeoutMs?: number }): Promise<EvalScore | null> {
    const movetimeMs = Math.max(10, Math.round(opts?.movetimeMs ?? 200));
    const timeoutMs = opts?.timeoutMs ?? Math.max(3000, movetimeMs * 15);

    if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
      return this.evaluate(fen, opts);
    }

    await this.init({ timeoutMs });

    // Clear stale lines from previous engine activity.
    this.lines = this.lines.filter(
      (l) => !l.startsWith("bestmove ") && !(l.startsWith("info ") && l.includes(" score "))
    );

    // Register the observer BEFORE sending go so no lines can be missed.
    let lastScore: EvalScore | null = null;
    const scorePattern = /\bscore\s+(cp\s+(-?\d+)|mate\s+(-?\d+))/;

    const promise = new Promise<EvalScore | null>((resolve) => {
      const obs = (line: string): boolean => {
        if (line.startsWith("info ")) {
          const m = scorePattern.exec(line);
          if (m) {
            if (m[2] !== undefined) lastScore = { cp: parseInt(m[2], 10) };
            else if (m[3] !== undefined) lastScore = { mate: parseInt(m[3], 10) };
          }
          return false; // Keep observing
        }
        if (line.startsWith("bestmove ")) {
          resolve(lastScore);
          return true; // Remove this observer
        }
        return false;
      };
      this.lineObservers.push(obs);
    });

    this.send(`position fen ${fen}`);
    this.send(`go movetime ${movetimeMs}`);

    return withTimeout(promise, timeoutMs, "evaluate").catch(() => {
      if (this.lastWorkerError && this.switchToFallbackArtifact(this.lastWorkerError)) {
        return this.evaluate(fen, opts);
      }
      return lastScore;
    });
  }
}
