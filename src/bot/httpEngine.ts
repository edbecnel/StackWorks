import type { UciBestMoveArgs, UciEngine, EvalScore } from "./uciEngine.ts";

function withAbortTimeout<T>(args: {
  p: Promise<T>;
  ms: number;
  label: string;
  ctrl: AbortController;
}): Promise<T> {
  const { p, ms, label, ctrl } = args;
  if (!ms || !Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const tid = window.setTimeout(() => {
      try {
        ctrl.abort();
      } catch {
        // ignore
      }
      reject(new Error(`Timeout: ${label}`));
    }, ms);
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

function normalizeBaseUrl(raw: string): string {
  const s = String(raw || "").trim();
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isLikelyStockfishTransportFailure(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  return (
    msg.includes("Timeout: bestmove") ||
    msg.includes("Timeout: evaluate") ||
    msg.includes("bad response") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Load failed") ||
    msg.includes("network error") ||
    msg.includes("HTTP 5") ||
    m === "timeout" ||
    m.includes("no bestmove") ||
    m.includes("engine exited") ||
    m.includes("engine stopped")
  );
}

export class HttpUciEngine implements UciEngine {
  private baseUrl: string;
  private skill: number | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  /** Ask the game server to kill and restart the Stockfish child process. */
  private async requestServerRestart(timeoutMs = 8000): Promise<void> {
    const ctrl = new AbortController();
    const p = fetch(`${this.baseUrl}/restart`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          const json = (await r.json().catch(() => null)) as any;
          const errMsg = json?.error ? String(json.error) : `HTTP ${r.status}`;
          throw new Error(errMsg);
        }
      })
      .finally(() => {
        try {
          ctrl.abort();
        } catch {
          // ignore
        }
      });
    await withAbortTimeout({ p, ms: timeoutMs, label: "restart", ctrl });
  }

  async init(opts?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 2000;
    const ctrl = new AbortController();
    const p = fetch(`${this.baseUrl}/health`, { method: "GET", signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as any;
        if (!json || json.ok !== true) throw new Error("health check failed");
      })
      .finally(() => {
        // Ensure we never keep sockets alive longer than needed.
        try {
          ctrl.abort();
        } catch {
          // ignore
        }
      });

    await withAbortTimeout({ p, ms: timeoutMs, label: "health", ctrl });
  }

  async setSkillLevel(skill: number): Promise<void> {
    const s = Math.max(0, Math.min(20, Math.round(skill)));
    this.skill = s;
  }

  async bestMove(args: UciBestMoveArgs): Promise<string> {
    const timeoutMs = args.timeoutMs ?? Math.max(2500, Math.round(args.movetimeMs) * 20);

    const doFetch = async (): Promise<string> => {
      const ctrl = new AbortController();
      const p = fetch(`${this.baseUrl}/bestmove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fen: args.fen,
          movetimeMs: args.movetimeMs,
          skill: args.skill ?? this.skill ?? undefined,
          timeoutMs,
        }),
        signal: ctrl.signal,
      })
        .then(async (r) => {
          const json = (await r.json().catch(() => null)) as any;
          if (!r.ok) {
            const msg = json?.error ? String(json.error) : `HTTP ${r.status}`;
            throw new Error(msg);
          }
          if (!json || json.ok !== true || typeof json.uci !== "string") {
            throw new Error("bad response");
          }
          return json.uci as string;
        })
        .finally(() => {
          try {
            ctrl.abort();
          } catch {
            // ignore
          }
        });

      return withAbortTimeout({ p, ms: timeoutMs + 500, label: "bestmove", ctrl });
    };

    try {
      return await doFetch();
    } catch (e) {
      if (!isLikelyStockfishTransportFailure(e)) throw e;
      try {
        await this.requestServerRestart();
        await sleepMs(400);
      } catch {
        // Still try one more bestmove; server may have recovered anyway.
      }
      return await doFetch();
    }
  }

  async evaluate(fen: string, opts?: { movetimeMs?: number; timeoutMs?: number }): Promise<EvalScore | null> {
    const movetimeMs = opts?.movetimeMs ?? 200;
    const timeoutMs = opts?.timeoutMs ?? Math.max(3000, movetimeMs * 15);

    const doFetch = async (): Promise<EvalScore | null> => {
      const ctrl = new AbortController();
      const p = fetch(`${this.baseUrl}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fen, movetimeMs, timeoutMs }),
        signal: ctrl.signal,
      })
        .then(async (r) => {
          const json = (await r.json().catch(() => null)) as any;
          if (!r.ok || !json?.ok) return null;
          if (typeof json.cp === "number") return { cp: json.cp } as EvalScore;
          if (typeof json.mate === "number") return { mate: json.mate } as EvalScore;
          return null;
        })
        .finally(() => {
          try {
            ctrl.abort();
          } catch {
            /* ignore */
          }
        });
      return withAbortTimeout({ p, ms: timeoutMs + 400, label: "evaluate", ctrl });
    };

    try {
      return await doFetch();
    } catch (e) {
      if (!isLikelyStockfishTransportFailure(e)) return null;
      try {
        await this.requestServerRestart();
        await sleepMs(400);
        return await doFetch();
      } catch {
        return null;
      }
    }
  }
}
