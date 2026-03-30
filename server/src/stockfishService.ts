import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export type StockfishEvalScore = { cp: number } | { mate: number };

const STOCKFISH_ENGINE_FILE = "stockfish-17.1-lite-single-03e3232.js";

function nowMs(): number {
  return Date.now();
}

function resolveDefaultEngineJsPath(): string {
  const require = createRequire(import.meta.url);
  const candidates: string[] = [];

  try {
    candidates.push(require.resolve(`stockfish/src/${STOCKFISH_ENGINE_FILE}`));
  } catch {
    // ignore
  }

  try {
    const pkg = require.resolve("stockfish/package.json");
    candidates.push(path.resolve(path.dirname(pkg), "src", STOCKFISH_ENGINE_FILE));
  } catch {
    // ignore
  }

  try {
    const lascaPkg = require.resolve("lasca/package.json");
    candidates.push(path.resolve(path.dirname(lascaPkg), "node_modules", "stockfish", "src", STOCKFISH_ENGINE_FILE));
  } catch {
    // ignore
  }

  candidates.push(path.resolve(process.cwd(), "node_modules", "stockfish", "src", STOCKFISH_ENGINE_FILE));

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  throw new Error("Stockfish engine JS not found on server");
}

type Waiter = {
  pred: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (err: Error) => void;
};

export class StockfishService {
  private readonly engineJsOverride: string | null;
  private resolvedEngineJsPath: string | null = null;
  private resolutionError: Error | null = null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private lines: string[] = [];
  private waiters: Waiter[] = [];
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private currentSkill: number | null = null;
  private lastActivityAtMs = 0;

  constructor(opts?: { engineJsPath?: string }) {
    this.engineJsOverride = typeof opts?.engineJsPath === "string" && opts.engineJsPath.trim()
      ? path.resolve(opts.engineJsPath)
      : null;
  }

  getHealth(): {
    ok: boolean;
    engine: string;
    mode: string;
    ready: boolean;
    running: boolean;
    engineJs: string | null;
    error?: string;
  } {
    try {
      return {
        ok: true,
        engine: "stockfish-js",
        mode: "node-stdio",
        ready: this.ready,
        running: Boolean(this.proc),
        engineJs: this.getEngineJsPath(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        engine: "stockfish-js",
        mode: "node-stdio",
        ready: false,
        running: false,
        engineJs: this.resolvedEngineJsPath,
        error: msg,
      };
    }
  }

  async init(timeoutMs = 60_000): Promise<void> {
    await this.getOrStartInit(timeoutMs);
  }

  async setSkillLevel(skill: number): Promise<void> {
    const nextSkill = Math.max(0, Math.min(20, Math.round(Number(skill))));
    if (this.currentSkill === nextSkill && this.ready) return;
    await this.getOrStartInit(60_000);
    this.send(`setoption name Skill Level value ${nextSkill}`);
    this.send("isready");
    await this.waitForLine((line) => line === "readyok", 30_000);
    this.currentSkill = nextSkill;
  }

  async bestMove(args: {
    fen: string;
    movetimeMs: number;
    skill?: number;
    timeoutMs?: number;
  }): Promise<string> {
    const run = () => this.bestMoveQueued(args);
    try {
      return await run();
    } catch (e) {
      if (!this.shouldRetryAfterEngineFailure(e)) throw e;
      console.warn("[lasca-server] stockfish bestMove failed; restarting engine and retrying once");
      await this.restart();
      return await run();
    }
  }

  private async bestMoveQueued(args: {
    fen: string;
    movetimeMs: number;
    skill?: number;
    timeoutMs?: number;
  }): Promise<string> {
    const movetimeMs = Math.max(10, Math.round(Number(args.movetimeMs)));
    const timeoutMs = Math.max(2_000, Math.round(Number(args.timeoutMs ?? movetimeMs * 20)));
    await this.getOrStartInit(60_000);
    if (args.skill !== undefined && args.skill !== null) {
      await this.setSkillLevel(args.skill);
    }

    const job = async () => {
      this.lines = this.lines.filter((line) => !line.startsWith("bestmove "));
      this.send(`position fen ${args.fen}`);
      this.send(`go movetime ${movetimeMs}`);
      const line = await this.waitForLine((value) => value.startsWith("bestmove "), timeoutMs);
      const move = line.trim().split(/\s+/)[1];
      if (!move || move === "(none)") throw new Error("no bestmove");
      return move;
    };

    const queued = this.queue.then(job, job) as Promise<string>;
    this.queue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async evaluate(args: {
    fen: string;
    movetimeMs?: number;
    timeoutMs?: number;
  }): Promise<StockfishEvalScore | null> {
    const run = () => this.evaluateQueued(args);
    try {
      return await run();
    } catch (e) {
      if (!this.shouldRetryAfterEngineFailure(e)) throw e;
      console.warn("[lasca-server] stockfish evaluate failed; restarting engine and retrying once");
      await this.restart();
      return await run();
    }
  }

  private async evaluateQueued(args: {
    fen: string;
    movetimeMs?: number;
    timeoutMs?: number;
  }): Promise<StockfishEvalScore | null> {
    const movetimeMs = Math.max(10, Math.round(Number(args.movetimeMs ?? 200)));
    const timeoutMs = Math.max(3_000, Math.round(Number(args.timeoutMs ?? movetimeMs * 15)));
    await this.getOrStartInit(60_000);

    const job = async () => {
      this.lines = this.lines.filter(
        (line) => !line.startsWith("bestmove ") && !(line.startsWith("info ") && line.includes(" score ")),
      );
      this.send(`position fen ${args.fen}`);
      this.send(`go movetime ${movetimeMs}`);
      await this.waitForLine((line) => line.startsWith("bestmove "), timeoutMs);

      let lastScore: StockfishEvalScore | null = null;
      const scorePattern = /\bscore\s+(cp\s+(-?\d+)|mate\s+(-?\d+))/;
      for (const line of this.lines) {
        if (!line.startsWith("info ")) continue;
        const match = scorePattern.exec(line);
        if (!match) continue;
        if (match[2] !== undefined) lastScore = { cp: parseInt(match[2], 10) };
        else if (match[3] !== undefined) lastScore = { mate: parseInt(match[3], 10) };
      }
      return lastScore;
    };

    const queued = this.queue.then(job, job) as Promise<StockfishEvalScore | null>;
    this.queue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async shutdown(): Promise<void> {
    this.initPromise = null;
    this.ready = false;
    this.currentSkill = null;
    this.lines = [];
    this.queue = Promise.resolve();
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new Error("engine stopped"));
    }

    const proc = this.proc;
    this.proc = null;
    if (!proc) return;

    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      try {
        proc.kill();
      } catch {
        resolve();
      }
      setTimeout(resolve, 200).unref?.();
    });
  }

  /** Kill the engine process and clear queues; next call starts fresh. */
  async restart(): Promise<void> {
    await this.shutdown();
  }

  private shouldRetryAfterEngineFailure(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("timeout") ||
      msg.includes("engine exited") ||
      msg.includes("engine stopped") ||
      msg.includes("no bestmove")
    );
  }

  private getEngineJsPath(): string {
    if (this.resolvedEngineJsPath) return this.resolvedEngineJsPath;
    if (this.resolutionError) throw this.resolutionError;
    try {
      this.resolvedEngineJsPath = this.engineJsOverride ?? resolveDefaultEngineJsPath();
      return this.resolvedEngineJsPath;
    } catch (err) {
      this.resolutionError = err instanceof Error ? err : new Error(String(err));
      throw this.resolutionError;
    }
  }

  private start(): void {
    if (this.proc) return;
    const engineJsPath = this.getEngineJsPath();
    const proc = spawn(process.execPath, [engineJsPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string | Buffer) => this.onStdout(chunk));
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string | Buffer) => {
      const line = String(chunk || "").trim();
      if (line) console.warn("[lasca-server] stockfish stderr:", line);
    });
    proc.on("exit", (code, signal) => {
      console.warn("[lasca-server] stockfish exited", { code, signal });
      this.proc = null;
      this.ready = false;
      this.initPromise = null;
      this.currentSkill = null;
      this.lines = [];
      for (const waiter of this.waiters.splice(0)) {
        waiter.reject(new Error("engine exited"));
      }
    });

    this.proc = proc;
  }

  private onStdout(chunk: string | Buffer): void {
    this.lastActivityAtMs = nowMs();
    const parts = String(chunk).split(/\r?\n/g);
    for (const rawLine of parts) {
      const line = rawLine.trim();
      if (!line) continue;

      for (let i = 0; i < this.waiters.length; i++) {
        const waiter = this.waiters[i];
        if (!waiter || !waiter.pred(line)) continue;
        this.waiters.splice(i, 1);
        waiter.resolve(line);
        i -= 1;
      }

      this.lines.push(line);
      if (this.lines.length > 500) this.lines.splice(0, this.lines.length - 500);
    }
  }

  private send(command: string): void {
    this.start();
    if (!this.proc?.stdin) throw new Error("engine not running");
    this.lastActivityAtMs = nowMs();
    this.proc.stdin.write(`${String(command).trim()}\n`);
  }

  private waitForLine(pred: (line: string) => boolean, timeoutMs: number): Promise<string> {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (!pred(line)) continue;
      this.lines.splice(i, 1);
      return Promise.resolve(line);
    }

    return new Promise<string>((resolve, reject) => {
      const waiter: Waiter = {
        pred,
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error("timeout"));
      }, Math.max(0, timeoutMs));
      this.waiters.push(waiter);
    });
  }

  private async getOrStartInit(timeoutMs: number): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.send("uci");
      await this.waitForLine((line) => line === "uciok", timeoutMs);
      this.send("isready");
      await this.waitForLine((line) => line === "readyok", timeoutMs);
      this.ready = true;
    })().catch((err) => {
      this.ready = false;
      this.initPromise = null;
      throw err;
    });

    return this.initPromise;
  }
}