import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 8799);
const HOST = process.env.HOST ?? "127.0.0.1";

// We intentionally run the exact Stockfish.js build that the client uses.
// The stockfish npm package's declared "main" currently points to a file that
// is not present, so we spawn the known-good build directly.
const ENGINE_JS = process.env.STOCKFISH_ENGINE_JS
  ? path.resolve(process.env.STOCKFISH_ENGINE_JS)
  : path.resolve(
      REPO_ROOT,
      "node_modules",
      "stockfish",
      "src",
      "stockfish-17.1-lite-single-03e3232.js"
    );

function nowMs() {
  return Date.now();
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  });
  res.end(body);
}

function sendText(res, status, text) {
  const body = Buffer.from(String(text));
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": String(body.length),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error("request too large"));
        try {
          req.destroy();
        } catch {}
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", (e) => reject(e));
  });
}

class StockfishCli {
  constructor(engineJsPath) {
    this.engineJsPath = engineJsPath;
    this.proc = null;
    this.lines = [];
    this.waiters = [];
    this.ready = false;
    this.initPromise = null;
    this.queue = Promise.resolve();
    this.currentSkill = null;
    this.lastActivityAtMs = 0;
  }

  start() {
    if (this.proc) return;

    const p = spawn(process.execPath, [this.engineJsPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk) => this.#onStdout(chunk));
    p.stderr.setEncoding("utf8");
    p.stderr.on("data", (chunk) => {
      // keep stderr available for debugging
      const s = String(chunk || "").trim();
      if (s) console.warn("[stockfish-server] stderr:", s);
    });

    p.on("exit", (code, signal) => {
      console.warn("[stockfish-server] engine exited", { code, signal });
      this.proc = null;
      this.ready = false;
      this.initPromise = null;
      this.lines = [];
      // NOTE: queue continues, but future requests will restart.
    });

    this.proc = p;
  }

  stop() {
    const p = this.proc;
    this.proc = null;
    this.ready = false;
    this.initPromise = null;
    this.lines = [];

    try {
      if (p && !p.killed) p.kill();
    } catch {}
  }

  #onStdout(chunk) {
    this.lastActivityAtMs = nowMs();
    const raw = String(chunk);
    const parts = raw.split(/\r?\n/g);
    for (const line0 of parts) {
      const line = line0.trim();
      if (!line) continue;

      // Drain waiters first.
      for (let i = 0; i < this.waiters.length; i++) {
        const w = this.waiters[i];
        if (w && w.pred(line)) {
          this.waiters.splice(i, 1);
          w.resolve(line);
          i--;
        }
      }

      this.lines.push(line);
      if (this.lines.length > 500) this.lines.splice(0, this.lines.length - 500);
    }
  }

  send(cmd) {
    this.start();
    if (!this.proc || !this.proc.stdin) throw new Error("engine not running");
    this.lastActivityAtMs = nowMs();
    this.proc.stdin.write(String(cmd).trim() + "\n");
  }

  waitForLine(pred, timeoutMs) {
    // check buffered
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (pred(line)) {
        this.lines.splice(i, 1);
        return Promise.resolve(line);
      }
    }

    return new Promise((resolve, reject) => {
      const tid = setTimeout(() => {
        reject(new Error("timeout"));
      }, Math.max(0, timeoutMs));

      this.waiters.push({
        pred,
        resolve: (line) => {
          clearTimeout(tid);
          resolve(line);
        },
      });
    });
  }

  getOrStartInit() {
    if (this.ready) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.send("uci");
      await this.waitForLine((l) => l === "uciok", 60_000);
      this.send("isready");
      await this.waitForLine((l) => l === "readyok", 60_000);
      this.ready = true;
    })().catch((e) => {
      this.ready = false;
      this.initPromise = null;
      throw e;
    });

    return this.initPromise;
  }

  async setSkillLevel(skill) {
    const s = Math.max(0, Math.min(20, Math.round(Number(skill))));
    if (this.currentSkill === s && this.ready) return;

    await this.getOrStartInit();
    this.send(`setoption name Skill Level value ${s}`);
    this.send("isready");
    await this.waitForLine((l) => l === "readyok", 30_000);
    this.currentSkill = s;
  }

  async bestMove({ fen, movetimeMs, skill, timeoutMs }) {
    const t = Math.max(10, Math.round(Number(movetimeMs)));
    const timeout = Math.max(2_000, Math.round(Number(timeoutMs ?? t * 20)));

    await this.getOrStartInit();
    if (skill !== undefined && skill !== null) {
      await this.setSkillLevel(skill);
    }

    // serialize bestMove calls
    const job = async () => {
      // clear buffered bestmove
      this.lines = this.lines.filter((l) => !l.startsWith("bestmove "));
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${t}`);
      const line = await this.waitForLine((l) => l.startsWith("bestmove "), timeout);
      const parts = line.trim().split(/\s+/);
      const move = parts[1];
      if (!move || move === "(none)") throw new Error("no bestmove");
      return move;
    };

    // Small queue to avoid interleaving.
    const p = (this.queue = this.queue.then(job, job));
    return p;
  }

  async evaluate({ fen, movetimeMs, timeoutMs }) {
    const t = Math.max(10, Math.round(Number(movetimeMs)));
    const timeout = Math.max(3_000, Math.round(Number(timeoutMs ?? t * 15)));

    await this.getOrStartInit();

    const job = async () => {
      // Clear stale scored info and bestmove lines before sending a new search.
      this.lines = this.lines.filter(
        (l) => !l.startsWith("bestmove ") && !(l.startsWith("info ") && l.includes(" score "))
      );

      this.send(`position fen ${fen}`);
      this.send(`go movetime ${t}`);

      // Wait for the search to complete (bestmove signals end of search).
      await this.waitForLine((l) => l.startsWith("bestmove "), timeout);

      // Scan buffered lines for the last info line with a score.
      let lastScore = null;
      const scorePattern = /\bscore\s+(cp\s+(-?\d+)|mate\s+(-?\d+))/;
      for (const l of this.lines) {
        if (l.startsWith("info ")) {
          const m = scorePattern.exec(l);
          if (m) {
            if (m[2] !== undefined) lastScore = { cp: parseInt(m[2], 10) };
            else if (m[3] !== undefined) lastScore = { mate: parseInt(m[3], 10) };
          }
        }
      }

      return lastScore;
    };

    const p = (this.queue = this.queue.then(job, job));
    return p;
  }
}

const engine = new StockfishCli(ENGINE_JS);

const server = http.createServer(async (req, res) => {
  const startedAt = nowMs();
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const up = Boolean(engine.proc);
      console.log(`[stockfish-server] GET /health ${req.socket.remoteAddress ?? "?"}`);
      sendJson(res, 200, {
        ok: true,
        engine: "stockfish-js",
        mode: "node-stdio",
        ready: engine.ready,
        running: up,
        engineJs: engine.engineJsPath,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/bestmove") {
      const body = await readJsonBody(req);
      const fen = body && typeof body.fen === "string" ? body.fen : null;
      const movetimeMs = body && typeof body.movetimeMs === "number" ? body.movetimeMs : null;
      const skill = body && typeof body.skill === "number" ? body.skill : undefined;
      const timeoutMs = body && typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;

      if (!fen || !movetimeMs) {
        sendJson(res, 400, { ok: false, error: "missing fen or movetimeMs" });
        return;
      }

      console.log(
        `[stockfish-server] POST /bestmove ${req.socket.remoteAddress ?? "?"} movetimeMs=${movetimeMs} skill=${skill ?? "-"}`,
      );

      try {
        const uci = await engine.bestMove({ fen, movetimeMs, skill, timeoutMs });
        const tookMs = nowMs() - startedAt;
        console.log(`[stockfish-server] bestmove=${uci} tookMs=${tookMs}`);
        sendJson(res, 200, { ok: true, uci });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const tookMs = nowMs() - startedAt;
        console.warn(`[stockfish-server] bestmove failed tookMs=${tookMs}: ${msg}`);
        sendJson(res, 500, { ok: false, error: msg });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/evaluate") {
      const body = await readJsonBody(req);
      const fen = body && typeof body.fen === "string" ? body.fen : null;
      const movetimeMs = body && typeof body.movetimeMs === "number" ? body.movetimeMs : 200;
      const timeoutMs = body && typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;

      if (!fen) {
        sendJson(res, 400, { ok: false, error: "missing fen" });
        return;
      }

      console.log(
        `[stockfish-server] POST /evaluate ${req.socket.remoteAddress ?? "?"} movetimeMs=${movetimeMs}`,
      );

      try {
        const score = await engine.evaluate({ fen, movetimeMs, timeoutMs });
        const tookMs = nowMs() - startedAt;
        if (score === null) {
          console.warn(`[stockfish-server] evaluate returned null tookMs=${tookMs}`);
          sendJson(res, 200, { ok: false, error: "no score" });
        } else {
          const desc = "cp" in score ? `cp=${score.cp}` : `mate=${score.mate}`;
          console.log(`[stockfish-server] evaluate ${desc} tookMs=${tookMs}`);
          sendJson(res, 200, { ok: true, ...score });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const tookMs = nowMs() - startedAt;
        console.warn(`[stockfish-server] evaluate failed tookMs=${tookMs}: ${msg}`);
        sendJson(res, 500, { ok: false, error: msg });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/restart") {
      engine.stop();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendText(res, 404, "not found");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { ok: false, error: msg });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[stockfish-server] listening on http://${HOST}:${PORT}`);
  console.log(`[stockfish-server] engine: ${ENGINE_JS}`);
});

process.on("SIGINT", () => {
  try {
    engine.stop();
  } catch {}
  process.exit(0);
});
