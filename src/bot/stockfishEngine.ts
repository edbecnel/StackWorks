import type { UciEngine, UciBestMoveArgs, EvalScore } from "./uciEngine.ts";

// NOTE:
// Stockfish is loaded as a classic Worker + WASM. In Vite dev, URLs resolved
// directly from node_modules can end up as `/@fs/D:/...` which is fragile in
// some browser/Worker/WASM combinations.
//
// We instead copy the Stockfish artifacts into `public/vendor/stockfish/` at
// install time and load them from stable, base-aware URLs.

const STOCKFISH_PUBLIC_DIR = "vendor/stockfish";
const STOCKFISH_WORKER_FILE = "stockfish-17.1-lite-single-03e3232.js";
const STOCKFISH_WASM_FILE = "stockfish-17.1-lite-single-03e3232.wasm";

type StockfishEngine = {
  postMessage(command: string): void;
  onmessage: ((ev: unknown) => void) | null;
  terminate?: () => void;
  onerror?: ((ev: unknown) => void) | null;
  onmessageerror?: ((ev: unknown) => void) | null;
};

function createStockfishWorker(): {
  engine: StockfishEngine;
  workerUrl: string;
  wasmUrl: string;
  cleanup?: () => void;
} {
  if (typeof Worker === "undefined") {
    throw new Error("Stockfish requires Web Worker support in this environment");
  }
  // The Stockfish worker script expects the WASM URL to be provided via the location hash.
  // If omitted, it guesses by swapping `.js` -> `.wasm`, but Vite fingerprints assets,
  // so the guessed name will not match in production builds.

  // IMPORTANT: Make URLs absolute. Also make them base-aware (prod uses a repo-scoped BASE_URL on GitHub Pages).
  const base = import.meta.env?.BASE_URL ?? "/";
  const workerRel = `${base}${STOCKFISH_PUBLIC_DIR}/${STOCKFISH_WORKER_FILE}`;
  const wasmRel = `${base}${STOCKFISH_PUBLIC_DIR}/${STOCKFISH_WASM_FILE}`;

  const workerAbs = new URL(workerRel, window.location.href).toString();
  const wasmAbs = new URL(wasmRel, window.location.href).toString();

  const hash = `#${encodeURIComponent(wasmAbs)},worker`;
  const directUrl = `${workerAbs}${hash}`;

  // Use the direct URL approach so the worker has a same-origin (https://) context
  // rather than a blob: (null-origin) context. A null-origin worker fetching https://
  // resources can be silently blocked under COEP `require-corp` in some Chromium
  // versions even when Cross-Origin-Resource-Policy is set.
  //
  // The hash fragment is stripped by the browser when fetching the JS file but is
  // preserved in self.location.hash inside the worker, which is how Stockfish reads
  // the WASM URL.
  //
  // Fall back to the blob bootstrap approach if creating a direct worker fails
  // (e.g. some browsers reject hash fragments on Worker URLs).
  try {
    const worker = new Worker(directUrl, { type: "classic", name: "stockfish" });
    return { engine: worker as unknown as StockfishEngine, workerUrl: workerAbs, wasmUrl: wasmAbs };
  } catch {
    // Blob bootstrap fallback: wraps importScripts so the hash is part of the blob
    // URL itself rather than a fragment on the https:// URL.
    const bootstrapSource = `
      try {
        self.addEventListener("message", function (ev) {
          try {
            if (ev && ev.data === "__sf_ping") {
              try {
                self.postMessage(
                  "__sf_pong hash=" + String(self.location && self.location.hash)
                );
              } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }

      ${import.meta.env?.DEV ? 'try{self.postMessage("[stockfish] bootstrap loaded");}catch(e){}' : ""}
      importScripts(${JSON.stringify(workerAbs)});
    `;
    const blob = new Blob([bootstrapSource], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(`${blobUrl}${hash}`, { type: "classic", name: "stockfish" });
    return {
      engine: worker as unknown as StockfishEngine,
      workerUrl: workerAbs,
      wasmUrl: wasmAbs,
      cleanup: () => { try { URL.revokeObjectURL(blobUrl); } catch { /* ignore */ } },
    };
  }
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
  private engine: StockfishEngine;
  private readonly workerUrl: string;
  private readonly wasmUrl: string;
  private readonly cleanup: (() => void) | null;
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
    const created = createStockfishWorker();
    this.engine = created.engine;
    this.workerUrl = created.workerUrl;
    this.wasmUrl = created.wasmUrl;
    this.cleanup = created.cleanup ?? null;

    // Best-effort preflight diagnostics in dev: confirm the URLs are reachable
    // *and* are the correct content type.
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
            });
          }
        })
        .catch((e) => console.warn("[stockfish] worker fetch failed", e));

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
            });
          }
        })
        .catch((e) => console.warn("[stockfish] wasm fetch failed", e));
    }

    // Surface worker-level failures (bad URL, WASM load error, CSP, etc.).
    this.engine.onerror = (ev: any) => {
      const msg = String(ev?.message ?? ev?.error?.message ?? ev?.type ?? "worker error");
      this.lastWorkerError = `${msg} (workerUrl=${this.workerUrl})`;
      // eslint-disable-next-line no-console
      console.error("[stockfish] worker error", ev);
    };
    this.engine.onmessageerror = (ev: any) => {
      const msg = String(ev?.message ?? ev?.type ?? "worker message error");
      this.lastWorkerError = `${msg} (workerUrl=${this.workerUrl})`;
      // eslint-disable-next-line no-console
      console.error("[stockfish] worker messageerror", ev);
    };

    this.engine.onmessage = (ev: any) => {
      const lines = normalizeLines(ev);
      if (!lines.length) return;

      for (const line of lines) {
        this.lastOutput.push(line);
        if (this.lastOutput.length > 50) this.lastOutput.splice(0, this.lastOutput.length - 50);

        // Drain waiters first.
        for (let i = 0; i < this.waiters.length; i++) {
          const w = this.waiters[i];
          if (w && w.pred(line)) {
            this.waiters.splice(i, 1);
            w.resolve(line);
            // Continue processing remaining emitted lines.
            continue;
          }
        }

        // Notify line observers (used by evaluate()). Auto-remove those that return true.
        for (let i = this.lineObservers.length - 1; i >= 0; i--) {
          const obs = this.lineObservers[i];
          if (obs && obs(line)) {
            this.lineObservers.splice(i, 1);
          }
        }

        this.lines.push(line);
      }
    };

    // DEV liveness probe: if we never see even __sf_pong, the worker isn't running
    // or can't post messages back to the main thread.
    try {
      this.send("__sf_ping");
    } catch {
      // ignore
    }
  }

  terminate(): void {
    try {
      this.engine.terminate?.();
    } catch {
      // ignore
    }
    try {
      this.cleanup?.();
    } catch {
      // ignore
    }
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
      const tail = this.lastOutput.slice(-10).join(" | ");
      const extra = this.lastWorkerError
        ? ` workerError=${this.lastWorkerError}`
        : ` workerUrl=${this.workerUrl} wasmUrl=${this.wasmUrl} tail=${tail || "<no output>"}`;
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
      const tail = this.lastOutput.slice(-10).join(" | ");
      const extra = this.lastWorkerError
        ? ` workerError=${this.lastWorkerError}`
        : ` workerUrl=${this.workerUrl} wasmUrl=${this.wasmUrl} tail=${tail || "<no output>"}`;
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
        : ` workerUrl=${this.workerUrl} wasmUrl=${this.wasmUrl} tail=${tail || "<no output>"}`;
      throw new Error(`Stockfish timeout: uciok (${extra})`);
    }
  }

  async setSkillLevel(skill: number, opts?: { timeoutMs?: number }): Promise<void> {
    const s = Math.max(0, Math.min(20, Math.round(skill)));
    if (this.currentSkill === s && this.isReady) return;

    if (!this.isReady) await this.init({ timeoutMs: opts?.timeoutMs });

    this.send(`setoption name Skill Level value ${s}`);

    // Sync: Stockfish doesn't ack setoption, so we use isready.
    const timeoutMs = opts?.timeoutMs ?? 120000;
    await retryKickUntil({
      action: () => this.send("isready"),
      until: this.waitForLine((l) => l.trim() === "readyok"),
      timeoutMs,
      label: "readyok after setoption",
    });

    this.currentSkill = s;
  }

  async bestMove(args: UciBestMoveArgs): Promise<string> {
    const movetimeMs = Math.max(10, Math.round(args.movetimeMs));
    const timeoutMs = args.timeoutMs ?? Math.max(2000, movetimeMs * 20);

    if (args.skill !== undefined) {
      await this.setSkillLevel(args.skill, { timeoutMs });
    } else {
      await this.init({ timeoutMs });
    }

    // Clear any buffered bestmove from previous searches.
    this.lines = this.lines.filter((l) => !l.startsWith("bestmove "));

    this.send(`position fen ${args.fen}`);
    this.send(`go movetime ${movetimeMs}`);

    const line = await withTimeout(this.waitForLine((l) => l.startsWith("bestmove ")), timeoutMs, "bestmove");
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

    return withTimeout(promise, timeoutMs, "evaluate").catch(() => lastScore);
  }
}
