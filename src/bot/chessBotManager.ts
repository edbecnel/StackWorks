import type { GameController, HistoryChangeReason } from "../controller/gameController.ts";
import { checkCurrentPlayerLost } from "../game/gameOver.ts";
import { createPrng } from "../shared/prng.ts";
import type { Player } from "../types.ts";
import type { Move } from "../game/moveTypes.ts";
import type { BotTier } from "./presets.ts";
import { BOT_PRESETS } from "./presets.ts";
import { adaptAfterGame, normalizeAdaptState, type AdaptState } from "./adaptive.ts";
import { gameStateToFen } from "./fen.ts";
import { uciToLegalMove } from "./chessMoveMap.ts";
import type { UciEngine, EvalScore } from "./uciEngine.ts";
import { StockfishUciEngine } from "./stockfishEngine.ts";
import { HttpUciEngine } from "./httpEngine.ts";
import { pickFallbackMoveChess } from "./chessFallback.ts";
import { applySignedInNameToLocalBotSelects } from "../ui/bot/localBotSelectIdentity.ts";
import { syncPlayerBotSelector } from "../ui/bot/playerBotSelector";

export type { EvalScore };

export type BotSideSetting = "human" | BotTier;

type BotSettings = {
  white: BotSideSetting;
  black: BotSideSetting;
  delayMs: number;
  paused: boolean;
};

const LS_KEYS = {
  white: "lasca.chessbot.white",
  black: "lasca.chessbot.black",
  delay: "lasca.chessbot.delayMs",
  paused: "lasca.chessbot.paused",
  adaptPrefix: "lasca.chessbot.adapt.",
} as const;

const DEFAULT_DELAY_MS = 1000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseDelayMs(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 5000);
}

function isRecoverableStockfishFailureMessage(msg: string): boolean {
  return (
    msg.includes("Stockfish timeout: uciok") ||
    msg.includes("Stockfish timeout: readyok") ||
    msg.includes("Stockfish timeout: bestmove") ||
    msg.includes("Stockfish worker failed:")
  );
}

function parseSideSetting(v: string | null): BotSideSetting {
  if (v === "strong") return "advanced";
  if (v === "beginner" || v === "intermediate" || v === "advanced" || v === "master" || v === "human") return v;
  return "human";
}

function safeBool(raw: string | null, fallback: boolean): boolean {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

function tierForPlayer(settings: BotSettings, p: Player): BotTier | null {
  const v = p === "W" ? settings.white : settings.black;
  return v === "human" ? null : v;
}

function isHumanForPlayer(settings: BotSettings, p: Player): boolean {
  return (p === "W" ? settings.white : settings.black) === "human";
}

function other(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function plyCountFromController(controller: GameController): number {
  try {
    const h = controller.getHistory();
    return Math.max(0, h.length - 1);
  } catch {
    return 0;
  }
}

function fullmoveFromPly(ply: number): number {
  return Math.floor(ply / 2) + 1;
}

function normalizeEvalScoreToWhitePerspective(score: EvalScore, fen: string): EvalScore {
  const toMoveToken = String(fen.split(/\s+/, 3)[1] ?? "w").toLowerCase();
  const isWhiteToMove = toMoveToken !== "b";
  if ("mate" in score) return { mate: isWhiteToMove ? score.mate : -score.mate };
  return { cp: isWhiteToMove ? score.cp : -score.cp };
}

function normalizeBaseUrl(raw: string): string {
  const value = String(raw || "").trim();
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function canUseSameOriginStockfish(): boolean {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return Boolean(host && host !== "localhost" && host !== "127.0.0.1");
}

function resolveDefaultStockfishServerUrl(): string | null {
  const env = (import.meta as any).env ?? {};
  const explicit = typeof env.VITE_STOCKFISH_SERVER_URL === "string" ? normalizeBaseUrl(env.VITE_STOCKFISH_SERVER_URL) : "";
  if (explicit) return explicit;

  const mainServer = typeof env.VITE_SERVER_URL === "string" ? normalizeBaseUrl(env.VITE_SERVER_URL) : "";
  if (mainServer) return `${mainServer}/api/stockfish`;

  if (canUseSameOriginStockfish()) {
    return `${normalizeBaseUrl(window.location.origin)}/api/stockfish`;
  }

  return null;
}

export class ChessBotManager {
  private controller: GameController;
  private engineFactory: () => UciEngine;
  private engine: UciEngine | null = null;
  private readonly skipAutoPauseAtStart: boolean;

  private engineReady = false;
  private allowFallbackDuringWarmup = false;
  private readonly serverEngineUrl: string | null;

  private settings: BotSettings;

  private elWhite: HTMLSelectElement | null = null;
  private elBlack: HTMLSelectElement | null = null;
  private elDelay: HTMLInputElement | null = null;
  private elDelayReset: HTMLButtonElement | null = null;
  private elDelayLabel: HTMLElement | null = null;
  private elPause: HTMLButtonElement | null = null;
  private elReset: HTMLButtonElement | null = null;
  private elStatus: HTMLElement | null = null;

  private busy = false;
  private requestId = 1;

  private analysisOverridePrev: { white: BotSideSetting; black: BotSideSetting; paused: boolean } | null = null;

  private prewarmStarted = false;
  private warmupToastStartMs: number | null = null;
  private readonly browserWarmupToastEscalateMs = 5000;
  private readonly serverWarmupToastEscalateMs = 65_000;
  private warmupEscalationTimer: number | null = null;
  private warmupToastShown = false;
  private warmupToastShownError = false;
  // On some mobile devices, first-time WASM compile can exceed 2 minutes.
  // We warm up in the background with a long timeout, but we keep per-move
  // engine attempts short so the bot still plays (with a fallback) immediately.
  private initTimeoutMs = 300_000;
  private initRetryCount = 0;
  private initRetryTimer: number | null = null;
  private engineBackoffUntilMs = 0;
  private engineFailureCount = 0;

  // --- Engine evaluation (eval bar) -------------------------------------------
  /** Last score Stockfish produced for the current position (side-to-move perspective). */
  private lastEvalScore: EvalScore | null = null;
  /** FEN the lastEvalScore was computed for. */
  private lastEvalFen: string | null = null;
  /** Whether an evaluation request is currently in-flight. */
  private evalRunning = false;
  /** Whether a new eval is needed but was deferred because the bot was busy. */
  private evalDeferredWhileBusy = false;
  /** Debounce timer for scheduleEval(). */
  private evalDebounceTimer: number | null = null;
  /** Listeners notified whenever the eval result changes. */
  private evalListeners: Array<(score: EvalScore | null, pending: boolean) => void> = [];
  /** Cached engine evaluations keyed by FEN, normalized to White perspective. */
  private evalCache: Map<string, EvalScore> = new Map();
  // ---------------------------------------------------------------------------

  private engineLabel(): string {
    return this.serverEngineUrl ? "Stockfish server" : "Stockfish";
  }

  private warmupEscalateMs(): number {
    return this.serverEngineUrl ? this.serverWarmupToastEscalateMs : this.browserWarmupToastEscalateMs;
  }

  // ── Public evaluation API ──────────────────────────────────────────────────

  /** True once Stockfish has finished initialising and is ready to evaluate. */
  isEngineReady(): boolean {
    return this.engineReady;
  }

  /** Register a listener that is called whenever the eval score or pending state changes. */
  addEvalChangeListener(cb: (score: EvalScore | null, pending: boolean) => void): void {
    this.evalListeners.push(cb);
  }

  /** Remove a previously registered eval listener. */
  removeEvalChangeListener(cb: (score: EvalScore | null, pending: boolean) => void): void {
    const idx = this.evalListeners.indexOf(cb);
    if (idx >= 0) this.evalListeners.splice(idx, 1);
  }

  getCachedEvalForFen(fen: string): EvalScore | null {
    return this.evalCache.get(fen) ?? null;
  }

  setCachedEvalForFen(fen: string, score: EvalScore): void {
    const normalized = "mate" in score ? { mate: score.mate } : { cp: score.cp };
    this.evalCache.set(fen, normalized);

    let currentFen: string | null = null;
    try {
      currentFen = gameStateToFen(this.controller.getState());
    } catch {
      currentFen = null;
    }

    if (this.lastEvalFen === fen || currentFen === fen) {
      this.lastEvalScore = normalized;
      this.lastEvalFen = fen;
      this.evalDeferredWhileBusy = false;
      this.notifyEvalListeners();
    }
  }

  async evaluateFen(fen: string, opts?: { movetimeMs?: number; timeoutMs?: number }): Promise<EvalScore | null> {
    const cached = this.evalCache.get(fen);
    if (cached) return cached;

    this.prewarmEngine({ showToast: false, serverFastFailToast: false });
    if (!this.engineReady || this.busy || this.evalRunning) return null;

    const engine = this.ensureEngine();
    if (!engine.evaluate) return null;

    try {
      const score = await engine.evaluate(fen, {
        movetimeMs: opts?.movetimeMs ?? 120,
        timeoutMs: opts?.timeoutMs ?? 3000,
      });
      if (!score) return null;
      const normalized = normalizeEvalScoreToWhitePerspective(score, fen);
      this.evalCache.set(fen, normalized);
      return normalized;
    } catch {
      return null;
    }
  }

  /**
   * Start the engine (if not already warming up) and schedule a position eval.
   * Call this when the user activates the engine eval display mode.
   */
  activateForEvaluation(): void {
    this.prewarmEngine({ showToast: false, serverFastFailToast: false });
    this.scheduleEval();
  }

  private hasResolvedEvalForCurrentPosition(): boolean {
    if (!this.lastEvalScore || !this.lastEvalFen) return false;
    try {
      return gameStateToFen(this.controller.getState()) === this.lastEvalFen;
    } catch {
      return false;
    }
  }

  /** Schedule a debounced eval for the current position. */
  scheduleEval(): void {
    if (this.evalRunning) {
      this.evalDeferredWhileBusy = true;
      this.notifyEvalListeners();
      return;
    }

    if (this.evalDebounceTimer !== null) {
      window.clearTimeout(this.evalDebounceTimer);
    }
    this.evalDebounceTimer = window.setTimeout(() => {
      this.evalDebounceTimer = null;
      void this.runEval();
    }, 60);
  }

  private notifyEvalListeners(): void {
    const pending = this.evalRunning || this.evalDeferredWhileBusy || (!this.engineReady && !this.hasResolvedEvalForCurrentPosition());
    for (const cb of this.evalListeners) {
      try { cb(this.lastEvalScore, pending); } catch { /* ignore */ }
    }
  }

  private async runEval(): Promise<void> {
    if (this.evalRunning) {
      this.evalDeferredWhileBusy = true;
      this.notifyEvalListeners();
      return;
    }

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "chess") {
      this.lastEvalScore = null;
      this.lastEvalFen = null;
      this.notifyEvalListeners();
      return;
    }

    let fen: string;
    try {
      fen = gameStateToFen(state);
    } catch {
      this.notifyEvalListeners();
      return;
    }

    // Skip if position hasn't changed.
    if (fen === this.lastEvalFen && this.lastEvalScore !== null) {
      this.notifyEvalListeners();
      return;
    }

    const cached = this.evalCache.get(fen) ?? null;
    if (cached !== null) {
      this.lastEvalScore = cached;
      this.lastEvalFen = fen;
      this.evalDeferredWhileBusy = false;
      this.notifyEvalListeners();
      return;
    }

    if (!this.engineReady) {
      // Engine not ready yet; mark deferred so we retry after prewarm finishes.
      this.evalDeferredWhileBusy = true;
      this.notifyEvalListeners();
      return;
    }

    if (this.busy) {
      // Bot is thinking; defer until maybeMove() finally block.
      this.evalDeferredWhileBusy = true;
      this.notifyEvalListeners();
      return;
    }

    const engine = this.ensureEngine();
    if (!engine.evaluate) {
      this.notifyEvalListeners();
      return;
    }

    this.evalRunning = true;
    this.evalDeferredWhileBusy = false;
    this.notifyEvalListeners(); // signal pending = true

    try {
      const score = await engine.evaluate(fen, { movetimeMs: 250, timeoutMs: 5000 });
      if (score !== null) {
        // Normalize to White-perspective before storing so the panel never
        // needs to know what toMove was at eval time (avoids sign-flip after undo).
        const toMove = state.toMove;
        this.lastEvalScore = "mate" in score
          ? { mate: toMove === "W" ? score.mate : -score.mate }
          : { cp:   toMove === "W" ? score.cp   : -score.cp   };
        this.lastEvalFen = fen;
        this.evalCache.set(fen, this.lastEvalScore);
      } else {
        // Engine returned no score (may be starting up or busy); keep last score.
        // eslint-disable-next-line no-console
        console.warn("[chessbot] eval returned null for", fen.slice(0, 40));
      }
    } catch (err) {
      // Keep last score on error; log so issues are visible in the console.
      // eslint-disable-next-line no-console
      console.warn("[chessbot] eval error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (isRecoverableStockfishFailureMessage(msg)) {
        this.showWarmupToast(true);
      }
    } finally {
      this.evalRunning = false;
      if (this.evalDeferredWhileBusy) {
        this.notifyEvalListeners();
        this.scheduleEval();
        return;
      }
      this.notifyEvalListeners();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  private static readonly PAUSED_TURN_TOAST_KEY = "chessbot_paused_turn";
  private static readonly WARMUP_TOAST_KEY = "chessbot_warmup";
  private toastSyncTimer: number | null = null;

  // When we auto-pause on initial load/new-game (to prevent surprise bot moves),
  // and the human makes the first move, the subsequent bot-to-move position does
  // not need a sticky "tap to resume" hint.
  private autoPausedAtStart = false;
  // When we pause due to explicit history navigation (Undo/Redo/Jump), we also
  // want to avoid sticky resume prompts once the human resumes live play.
  private autoPausedFromHistoryNav = false;
  private autoResumeAfterHistoryNav = false;
  // After loading a save, the restored history may include future/redo states
  // (i.e. currentIndex < last). In that case we still want the sticky
  // "tap to resume" toast to appear if it's bot-to-move.
  private allowPausedTurnToastWhileViewingPast = false;
  private lastAutoPausedHumanFirstTurnToastSig: string | null = null;
  private autoResumeAfterTurnToastTimer: number | null = null;
  private autoResumeAfterTurnToastSig: string | null = null;

  constructor(controller: GameController, opts?: { engineFactory?: () => UciEngine; skipAutoPauseAtStart?: boolean }) {
    this.controller = controller;
    this.serverEngineUrl = resolveDefaultStockfishServerUrl();
    this.skipAutoPauseAtStart = Boolean(opts?.skipAutoPauseAtStart);

    this.engineFactory =
      opts?.engineFactory ??
      (() => (this.serverEngineUrl ? new HttpUciEngine(this.serverEngineUrl) : new StockfishUciEngine()));

    this.settings = this.loadSettings();

    this.controller.addHistoryChangeCallback((reason) => this.onHistoryChanged(reason));
  }

  setAnalysisModeActive(enabled: boolean): void {
    const next = Boolean(enabled);

    if (next) {
      if (this.analysisOverridePrev) return;
      this.analysisOverridePrev = {
        white: this.settings.white,
        black: this.settings.black,
        paused: this.settings.paused,
      };

      // Cancel any in-flight engine/bot work so we don't apply a stale bot move
      // into the analysis sandbox.
      if (this.busy) {
        this.requestId++;
        this.busy = false;
      }

      this.settings.white = "human";
      this.settings.black = "human";
      try {
        localStorage.setItem(LS_KEYS.white, this.settings.white);
        localStorage.setItem(LS_KEYS.black, this.settings.black);
      } catch {
        // ignore
      }

      this.refreshUI();
      this.updateInputForCurrentTurn();
      return;
    }

    if (!this.analysisOverridePrev) return;
    const prev = this.analysisOverridePrev;
    this.analysisOverridePrev = null;
    this.settings.white = prev.white;
    this.settings.black = prev.black;
    this.settings.paused = prev.paused;
    try {
      localStorage.setItem(LS_KEYS.white, this.settings.white);
      localStorage.setItem(LS_KEYS.black, this.settings.black);
      localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
    } catch {
      // ignore
    }

    this.refreshUI();
    this.updateInputForCurrentTurn();
    this.kick();
  }

  bind(): void {
    this.elWhite = document.getElementById("botWhiteSelect") as HTMLSelectElement | null;
    this.elBlack = document.getElementById("botBlackSelect") as HTMLSelectElement | null;
    this.elDelay = document.getElementById("botDelay") as HTMLInputElement | null;
    this.elDelayReset = document.getElementById("botDelayReset") as HTMLButtonElement | null;
    this.elDelayLabel = document.getElementById("botDelayLabel");
    this.elPause = document.getElementById("botPauseBtn") as HTMLButtonElement | null;
    this.elReset = document.getElementById("botResetLearningBtn") as HTMLButtonElement | null;
    this.elStatus = document.getElementById("botStatus");

    void applySignedInNameToLocalBotSelects([this.elWhite, this.elBlack]);

    if (this.settings.white !== "human" || this.settings.black !== "human") {
      // Only auto-pause if the bot moves first. If the human moves first, don't
      // pause — the bot will play immediately on its turn without any toast
      // (mirrors Columns Chess behavior).
      const startState = this.controller.getState();
      const botMovesFirst = tierForPlayer(this.settings, startState.toMove) !== null;
      const shouldPause = !this.skipAutoPauseAtStart && botMovesFirst;
      this.settings.paused = shouldPause;
      this.autoPausedAtStart = shouldPause;
      try {
        localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
      } catch {
        // ignore
      }

      // Warm up the engine immediately so the first bot move doesn't pay the full
      // WASM fetch/compile cost on-demand.
      // Important: do this silently. We only show the Stockfish toast when/if a bot
      // is actually trying to move and the engine isn't ready yet.
      // Exception: if a Stockfish *server* is configured and unreachable, we still
      // want immediate feedback (otherwise it looks like a silent failure).
      this.prewarmEngine({ showToast: false, serverFastFailToast: true });
    }

    this.installBoardClickToPauseBotVsBot();

    if (this.elWhite) {
      this.elWhite.value = this.settings.white;
      this.elWhite.addEventListener("change", () => {
        this.settings.white = parseSideSetting(this.elWhite!.value);
        localStorage.setItem(LS_KEYS.white, this.settings.white);
        if (this.settings.white !== "human" || this.settings.black !== "human") {
          this.prewarmEngine();
        }
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elBlack) {
      this.elBlack.value = this.settings.black;
      this.elBlack.addEventListener("change", () => {
        this.settings.black = parseSideSetting(this.elBlack!.value);
        localStorage.setItem(LS_KEYS.black, this.settings.black);
        if (this.settings.white !== "human" || this.settings.black !== "human") {
          this.prewarmEngine();
        }
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elDelay) {
      this.elDelay.value = String(this.settings.delayMs);
      this.elDelay.addEventListener("input", () => {
        const v = parseDelayMs(this.elDelay!.value || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
        this.settings.delayMs = v;
        try {
          localStorage.setItem(LS_KEYS.delay, String(this.settings.delayMs));
        } catch {
          // ignore
        }
        this.refreshUI();
      });
    }

    if (this.elDelayReset) {
      this.elDelayReset.addEventListener("click", () => {
        this.settings.delayMs = DEFAULT_DELAY_MS;
        try {
          localStorage.setItem(LS_KEYS.delay, String(this.settings.delayMs));
        } catch {
          // ignore
        }
        this.refreshUI();
      });
    }

    if (this.elPause) {
      this.elPause.addEventListener("click", () => {
        // User-initiated pause/resume: clear auto-start behavior.
        this.autoPausedAtStart = false;
        this.autoPausedFromHistoryNav = false;
        this.lastAutoPausedHumanFirstTurnToastSig = null;

        this.setPaused(!this.settings.paused);
        this.refreshUI();
        if (!this.settings.paused) this.kick();
        this.schedulePausedTurnToastSync();
      });
    }

    if (this.elReset) {
      this.elReset.addEventListener("click", () => {
        const ok = confirm("Reset bot learning for all tiers?");
        if (!ok) return;
        this.resetLearning();
        this.refreshUI();
      });
    }

    this.refreshUI();
    this.kick();
  }

  private resetEngine(): void {
    try {
      this.engine?.terminate?.();
    } catch {
      // ignore
    }
    this.engine = null;
    this.engineReady = false;
  }

  private recoverEngineForRetry(): void {
    this.resetEngine();
    this.prewarmStarted = false;
    this.engineReady = false;
    this.evalDeferredWhileBusy = false;
    if (this.warmupEscalationTimer !== null) {
      window.clearTimeout(this.warmupEscalationTimer);
      this.warmupEscalationTimer = null;
    }
    this.warmupToastStartMs = null;
    this.notifyEvalListeners();
  }

  private prewarmEngine(opts?: { showToast?: boolean; serverFastFailToast?: boolean }): void {
    const showToast = opts?.showToast ?? true;
    const serverFastFailToast = opts?.serverFastFailToast ?? false;

    // If we've already started warming the engine, we may still want to surface
    // the toast later when the engine is actually needed.
    if (this.prewarmStarted) {
      if (showToast && !this.engineReady) this.showWarmupToast(false);
      return;
    }

    this.prewarmStarted = true;

    // Track warmup start time even if we don't show the toast yet.
    // This ensures we still escalate after 5s once we *do* show it.
    if (this.warmupToastStartMs === null) this.warmupToastStartMs = Date.now();

    // If warmup is silent (common on initial load), we still want a single
    // escalation to the actionable error toast after a short budget.
    if (this.warmupEscalationTimer === null) {
      const escalateMs = this.warmupEscalateMs();
      this.warmupEscalationTimer = window.setTimeout(() => {
        this.warmupEscalationTimer = null;
        if (!this.engineReady) this.showWarmupToast(true);
      }, escalateMs);
    }

    // For a configured Stockfish server, if it's down/unreachable we want an immediate
    // sticky toast (otherwise the bot looks like it just silently doesn't work).
    // We do a fast /health probe first; if it fails, show the server error toast.
    if (this.serverEngineUrl && serverFastFailToast) {
      const fastProbeTimeoutMs = 900;
      (async () => {
        try {
          const engine = this.ensureEngine();
          await engine.init({ timeoutMs: fastProbeTimeoutMs });
          // Don't set engineReady here; the main warmup below will do it.
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Immediate, actionable message.
          if (!this.engineReady && !msg.includes("Timeout: health")) this.showWarmupToast(true);
        }
      })();
    }

    // Optionally show the toast now.
    // For server-backed Stockfish, give the server a short window to respond before
    // switching to the actionable "server not available" toast.
    if (showToast) this.showWarmupToast(false);

    const serverWarmupBudgetMs = this.serverWarmupToastEscalateMs;
    const warmupStartMs = Date.now();
    let serverErrorToastTimer: number | null = null;

    if (this.serverEngineUrl) {
      serverErrorToastTimer = window.setTimeout(() => {
        // If we're still not ready after the budget, show the server-unavailable hint.
        if (!this.engineReady) this.showWarmupToast(true);
      }, serverWarmupBudgetMs);
    }

    // Fire and forget.
    (async () => {
      try {
        const engine = this.ensureEngine();
        // Allow a short fixed budget for server response before showing the error toast.
        const timeoutMs = this.serverEngineUrl ? serverWarmupBudgetMs : this.initTimeoutMs;
        await engine.init({ timeoutMs });
        this.engineBackoffUntilMs = 0;
        this.engineFailureCount = 0;
        this.engineReady = true;

        if (this.warmupEscalationTimer !== null) {
          window.clearTimeout(this.warmupEscalationTimer);
          this.warmupEscalationTimer = null;
        }

        if (serverErrorToastTimer) {
          window.clearTimeout(serverErrorToastTimer);
          serverErrorToastTimer = null;
        }
        this.warmupToastShown = false;
        this.warmupToastShownError = false;
        this.clearWarmupToast();
        // If we are paused, keep UX paused; just update status.
        this.refreshUI();

        // Notify eval listeners that the engine is now ready.
        this.notifyEvalListeners();

        // If the bot is active, try again now that the engine is ready.
        if (!this.settings.paused) this.kick();
        // If an eval was scheduled before the engine was ready, run it now.
        if (this.evalDeferredWhileBusy || this.evalDebounceTimer !== null) {
          void this.runEval();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[chessbot] engine prewarm failed", err);

        if (serverErrorToastTimer) {
          window.clearTimeout(serverErrorToastTimer);
          serverErrorToastTimer = null;
        }

        // Keep the warmup toast visible during the initial server budget; then show the
        // actionable error toast (tap-to-fallback) at most 5s after warmup started.
        if (this.serverEngineUrl) {
          const elapsed = Date.now() - warmupStartMs;
          const remaining = Math.max(0, serverWarmupBudgetMs - elapsed);
          window.setTimeout(() => this.showWarmupToast(true), remaining);
          return;
        }

        // Non-server: show the error immediately.
        this.showWarmupToast(true);
      }
    })();
  }

  private showWarmupToast(isError = false): void {
    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) return;

    // Avoid re-showing the same toast on every bot turn. We show it once,
    // and only allow a non-error -> error escalation.
    if (this.warmupToastShown) {
      if (this.warmupToastShownError) return;
      if (!isError) return;
    }

    // Never let the non-error Stockfish toast stick around indefinitely.
    // After the current warmup budget, escalate to the actionable error toast.
    const now = Date.now();
    if (this.warmupToastStartMs === null) this.warmupToastStartMs = now;
    if (!isError && now - this.warmupToastStartMs >= this.warmupEscalateMs()) {
      isError = true;
    }

    const engineLabel = this.engineLabel();
    const engineWarmupLabel = this.serverEngineUrl ? engineLabel : `${engineLabel} (in-browser)`;

    const lanHint = (() => {
      if (!this.serverEngineUrl) return "";
      let serverHost = "";
      try {
        serverHost = new URL(this.serverEngineUrl).hostname;
      } catch {
        return "";
      }
      const pageHost = String(window.location.hostname || "").toLowerCase();
      const pageIsLocal = pageHost === "localhost" || pageHost === "127.0.0.1";
      const serverIsLoopback = serverHost === "localhost" || serverHost === "127.0.0.1";

      if (!pageIsLocal && serverIsLoopback) {
        return " (LAN: set server URL to your PC IP)";
      }
      return "";
    })();

    const msg = (() => {
      if (isError && this.serverEngineUrl) {
        return "Stockfish server not available. Tap to allow fallback moves.";
      }
      if (isError) {
        return `${engineLabel} failed to start (yet)${lanHint}. Tap to allow fallback moves.`;
      }
      // Avoid the old "Warming up Stockfish" wording entirely.
      return `${engineWarmupLabel} is starting… first load can take a while${lanHint}. Tap to allow fallback moves.`;
    })();

    if (isError) {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
    }

    this.controller.setStickyToastAction(ChessBotManager.WARMUP_TOAST_KEY, () => {
      this.allowFallbackDuringWarmup = true;
      this.controller.clearStickyToast(ChessBotManager.WARMUP_TOAST_KEY);
      this.kick();
    });
    this.controller.showStickyToast(ChessBotManager.WARMUP_TOAST_KEY, msg, { force: true });

    this.warmupToastShown = true;
    if (isError) this.warmupToastShownError = true;
  }

  private clearWarmupToast(): void {
    this.warmupToastStartMs = null;
    this.controller.setStickyToastAction(ChessBotManager.WARMUP_TOAST_KEY, null);
    this.controller.clearStickyToast(ChessBotManager.WARMUP_TOAST_KEY);
  }

  private async playFallbackMove(): Promise<void> {
    const state = this.controller.getState();
    const legal = this.controller.getLegalMovesForTurn();
    if (!legal.length) return;

    if (state.meta?.rulesetId === "chess") {
      const tier = tierForPlayer(this.settings, state.toMove) ?? "beginner";
      const smart = pickFallbackMoveChess(state, {
        tier,
        seed: `chessbot_fallback_smart_${Date.now()}_${state.toMove}`,
        legalMoves: legal,
      });
      if (smart) {
        await this.controller.playMove(smart);
        return;
      }
    }

    const rng = createPrng("chessbot_fallback_" + String(Date.now()));
    await this.controller.playMove(legal[rng.int(0, legal.length)]);
  }

  private loadSettings(): BotSettings {
    try {
      const white = parseSideSetting(localStorage.getItem(LS_KEYS.white));
      const black = parseSideSetting(localStorage.getItem(LS_KEYS.black));
      const paused = safeBool(localStorage.getItem(LS_KEYS.paused), false);
      const delayMs = parseDelayMs(localStorage.getItem(LS_KEYS.delay) || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
      return { white, black, delayMs, paused };
    } catch {
      return { white: "human", black: "human", delayMs: DEFAULT_DELAY_MS, paused: false };
    }
  }

  private ensureEngine(): UciEngine {
    if (!this.engine) {
      this.engine = this.engineFactory();
    }
    return this.engine;
  }

  private setStatus(text: string): void {
    if (this.elStatus) this.elStatus.textContent = text;
  }

  private refreshUI(): void {
    if (this.elWhite) this.elWhite.value = this.settings.white;
    if (this.elBlack) this.elBlack.value = this.settings.black;
    syncPlayerBotSelector("botWhiteSelect");
    syncPlayerBotSelector("botBlackSelect");
    if (this.elDelay) this.elDelay.value = String(this.settings.delayMs);
    if (this.elDelayLabel) this.elDelayLabel.textContent = `${this.settings.delayMs} ms`;
    if (this.elDelayReset) this.elDelayReset.title = `Reset to default speed (${DEFAULT_DELAY_MS} ms)`;

    const analysisDisabled = Boolean(this.analysisOverridePrev);
    if (this.elWhite) this.elWhite.disabled = analysisDisabled;
    if (this.elBlack) this.elBlack.disabled = analysisDisabled;
    if (this.elDelay) this.elDelay.disabled = analysisDisabled;
    if (this.elDelayReset) this.elDelayReset.disabled = analysisDisabled;
    if (this.elReset) this.elReset.disabled = analysisDisabled;
    if (analysisDisabled) {
      if (this.elPause) this.elPause.disabled = true;
      this.setStatus("Analysis mode (bot disabled)");
      return;
    }

    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (this.elPause) {
      this.elPause.disabled = !anyBot || this.controller.isOver();
      this.elPause.textContent = this.settings.paused ? "Resume bot" : "Pause bot";
    }

    if (!anyBot) {
      this.setStatus("Bot off");
      return;
    }

    if (this.controller.isOver()) {
      this.setStatus("Game over");
      return;
    }

    const sideSummary = `W:${this.settings.white} B:${this.settings.black}`;
    let turnSummary = "";
    try {
      const state = this.controller.getState();
      if (state.meta?.rulesetId === "chess") {
        const toMove: Player = state.toMove;
        const tier = tierForPlayer(this.settings, toMove);
        turnSummary = ` | toMove:${toMove}${tier ? ` (bot:${tier})` : " (human)"}`;
      }
    } catch {
      // ignore
    }

    const mode = this.settings.paused ? "paused" : "active";

    const engine = this.serverEngineUrl ? "server" : "browser";
    const readiness = this.engineReady ? "ready" : "warming";
    this.setStatus(`Bot ${mode} (${sideSummary})${turnSummary} | engine:${engine} (${readiness})`);
  }

  private installBoardClickToPauseBotVsBot(): void {
    if (typeof document === "undefined") return;

    const elBoard = document.getElementById("boardWrap") as HTMLElement | null;
    if (!elBoard) return;

    // While bot-vs-bot is running, a board click should pause the bots (same as pressing Pause Bot).
    // This is intentionally limited to bot-vs-bot so it doesn't interfere with normal piece selection.
    elBoard.addEventListener(
      "click",
      (ev) => {
        if (this.settings.paused) return;
        if (this.settings.white === "human" || this.settings.black === "human") return;
        if (this.controller.isOver()) return;

        const state = this.controller.getState();
        if (state.meta?.rulesetId !== "chess") return;

        this.setPaused(true);
        this.refreshUI();
        this.schedulePausedTurnToastSync();

        ev.preventDefault();
        ev.stopPropagation();
      },
      { capture: true }
    );
  }

  private isPausedBotTurn(): boolean {
    if (!this.settings.paused) return false;
    if (this.controller.isOver()) return false;
    const state = this.controller.getState();
    const rulesetId = state.meta?.rulesetId;
    if (rulesetId !== "chess") return false;
    const tier = tierForPlayer(this.settings, state.toMove);
    return tier !== null;
  }

  private resumeBotFromPause(): void {
    this.settings.paused = false;
    this.autoPausedAtStart = false;
    this.autoPausedFromHistoryNav = false;
    this.autoResumeAfterHistoryNav = false;
    this.allowPausedTurnToastWhileViewingPast = false;
    this.lastAutoPausedHumanFirstTurnToastSig = null;
    if (this.autoResumeAfterTurnToastTimer) {
      window.clearTimeout(this.autoResumeAfterTurnToastTimer);
      this.autoResumeAfterTurnToastTimer = null;
    }
    this.autoResumeAfterTurnToastSig = null;
    try {
      localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
    } catch {
      // ignore
    }
    this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
    this.refreshUI();
    this.schedulePausedTurnToastSync();
    this.prewarmEngine();
    this.kick();
  }

  private isAtNewGame(): boolean {
    try {
      const h = this.controller.getHistory();
      return Array.isArray(h) && h.length === 1;
    } catch {
      return false;
    }
  }

  private schedulePausedTurnToastSync(): void {
    // Defer so we don't get overwritten by the controller's timed turn-change toast.
    if (this.toastSyncTimer) return;
    this.toastSyncTimer = window.setTimeout(() => {
      this.toastSyncTimer = null;
      this.syncPausedTurnToastNow();
    }, 0);
  }

  private isViewingPastInHistory(): boolean {
    try {
      const h = this.controller.getHistory();
      if (!Array.isArray(h) || h.length <= 1) return false;
      const cur = h.find((e) => (e as any)?.isCurrent) as any;
      const idx = typeof cur?.index === "number" ? cur.index : h.length - 1;
      return idx < h.length - 1;
    } catch {
      return false;
    }
  }

  private syncPausedTurnToastNow(): void {
    if (this.warmupToastShownError && !this.engineReady) {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    if (this.isViewingPastInHistory() && !this.allowPausedTurnToastWhileViewingPast) {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }
    if (this.controller.isOver()) {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "chess") {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    const toMove: Player = state.toMove;
    const tier = tierForPlayer(this.settings, toMove);
    const isBotTurn = tier !== null;

    if (this.settings.paused && isBotTurn) {
      try {
        const ply = plyCountFromController(this.controller);
        const otherIsHuman = isHumanForPlayer(this.settings, other(toMove));

        // Case A: auto-paused at start, human moved first.
        // Don't nag with a sticky resume hint; show a normal toast and auto-resume.
        const shouldAutoResumeFromStart = this.autoPausedAtStart && ply > 0 && otherIsHuman;
        if (shouldAutoResumeFromStart) {
          this.controller.setInputEnabled(false);
          this.controller.setStickyToastAction(ChessBotManager.PAUSED_TURN_TOAST_KEY, null);
          this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);

          const sideLabel = toMove === "B" ? "Black" : "White";
          const sig = `${ply}:${toMove}`;
          if (sig !== this.lastAutoPausedHumanFirstTurnToastSig) {
            this.lastAutoPausedHumanFirstTurnToastSig = sig;
            this.controller.toast(`${sideLabel} to Play`, 1400);
          }

          // After the toast disappears, automatically resume the bot.
          // Guard against stale timers if the user navigates history or changes settings.
          if (!this.autoResumeAfterTurnToastTimer || this.autoResumeAfterTurnToastSig !== sig) {
            if (this.autoResumeAfterTurnToastTimer) {
              window.clearTimeout(this.autoResumeAfterTurnToastTimer);
              this.autoResumeAfterTurnToastTimer = null;
            }
            this.autoResumeAfterTurnToastSig = sig;
            this.autoResumeAfterTurnToastTimer = window.setTimeout(() => {
              this.autoResumeAfterTurnToastTimer = null;

              if (!this.settings.paused) return;
              if (!this.autoPausedAtStart) return;
              if (this.controller.isOver()) return;

              try {
                const stateNow = this.controller.getState();
                if (stateNow.meta?.rulesetId !== "chess") return;
                const toMoveNow: Player = stateNow.toMove;
                const tierNow = tierForPlayer(this.settings, toMoveNow);
                if (tierNow === null) return;

                const plyNow = plyCountFromController(this.controller);
                const sigNow = `${plyNow}:${toMoveNow}`;
                if (sigNow !== this.autoResumeAfterTurnToastSig) return;
              } catch {
                return;
              }

              this.resumeBotFromPause();
            }, 1400);
          }
          return;
        }

        // Case B: paused due to history navigation.
        // Never show the sticky resume bot toast while in this mode.
        // Only auto-resume after the user makes a move (armed via onHistoryChanged("move")).
        if (this.autoPausedFromHistoryNav) {
          this.controller.setInputEnabled(false);
          this.controller.setStickyToastAction(ChessBotManager.PAUSED_TURN_TOAST_KEY, null);
          this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);

          const sideLabel = toMove === "B" ? "Black" : "White";
          const sig = `${ply}:${toMove}`;
          if (sig !== this.lastAutoPausedHumanFirstTurnToastSig) {
            this.lastAutoPausedHumanFirstTurnToastSig = sig;
            this.controller.toast(`${sideLabel} to Play`, 1400);
          }

          if (this.autoResumeAfterHistoryNav && otherIsHuman) {
            if (!this.autoResumeAfterTurnToastTimer || this.autoResumeAfterTurnToastSig !== sig) {
              if (this.autoResumeAfterTurnToastTimer) {
                window.clearTimeout(this.autoResumeAfterTurnToastTimer);
                this.autoResumeAfterTurnToastTimer = null;
              }
              this.autoResumeAfterTurnToastSig = sig;
              this.autoResumeAfterTurnToastTimer = window.setTimeout(() => {
                this.autoResumeAfterTurnToastTimer = null;

                if (!this.settings.paused) return;
                if (!this.autoPausedFromHistoryNav) return;
                if (!this.autoResumeAfterHistoryNav) return;
                if (this.controller.isOver()) return;

                try {
                  const stateNow = this.controller.getState();
                  if (stateNow.meta?.rulesetId !== "chess") return;
                  const toMoveNow: Player = stateNow.toMove;
                  const tierNow = tierForPlayer(this.settings, toMoveNow);
                  if (tierNow === null) return;

                  const plyNow = plyCountFromController(this.controller);
                  const sigNow = `${plyNow}:${toMoveNow}`;
                  if (sigNow !== this.autoResumeAfterTurnToastSig) return;
                } catch {
                  return;
                }

                this.resumeBotFromPause();
              }, 1400);
            }
          }

          return;
        }
      } catch {
        // ignore
      }

      this.controller.setInputEnabled(false);
      const sideLabel = toMove === "B" ? "Black" : "White";
      const msg = `${sideLabel} to Play. Tap here or press spacebar to resume bot`;
      this.controller.setStickyToastAction(ChessBotManager.PAUSED_TURN_TOAST_KEY, () => this.resumeBotFromPause());
      this.controller.showStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY, msg, { force: true });
      return;
    }

    this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
  }

  private kick(): void {
    // Defer so we don't fight with UI updates / controller toasts.
    window.setTimeout(() => void this.maybeMove(), 0);
    this.schedulePausedTurnToastSync();
  }

  private setPaused(paused: boolean): void {
    if (this.settings.paused === paused) return;
    this.settings.paused = paused;
    if (!paused) {
      this.autoPausedAtStart = false;
      this.autoPausedFromHistoryNav = false;
      this.autoResumeAfterHistoryNav = false;
      this.lastAutoPausedHumanFirstTurnToastSig = null;
    }
    if (paused) {
      this.lastAutoPausedHumanFirstTurnToastSig = null;
    }
    if (this.autoResumeAfterTurnToastTimer) {
      window.clearTimeout(this.autoResumeAfterTurnToastTimer);
      this.autoResumeAfterTurnToastTimer = null;
    }
    this.autoResumeAfterTurnToastSig = null;
    try {
      localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
    } catch {
      // ignore
    }
  }

  private updateInputForCurrentTurn(): void {
    if (this.controller.isOver()) {
      this.controller.setInputEnabled(true);
      return;
    }

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "chess") {
      this.controller.setInputEnabled(true);
      return;
    }

    const tier = tierForPlayer(this.settings, state.toMove);
    const isBotTurn = tier !== null;
    // If it's a bot turn and we're paused, input stays locked (toast handles).
    if (isBotTurn) {
      this.controller.setInputEnabled(false);
      return;
    }
    // Human turn.
    this.controller.setInputEnabled(true);
  }

  private onUndoRedoJump(reason: HistoryChangeReason): void {
    // Cancel any in-flight bot computation so we don't apply a stale move after
    // navigation, and so Resume can kick immediately.
    // We can't reliably abort an engine.bestMove() call, but we can invalidate
    // its result and clear the busy flag.
    if (this.busy) {
      this.requestId++;
      this.busy = false;
    }

    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) {
      this.refreshUI();
      this.updateInputForCurrentTurn();
      this.scheduleEval();
      return;
    }

    // Undo/Redo/Jump are explicit user navigation: pause any bot turn so it
    // doesn't immediately replay moves from the navigated position.
    try {
      const state = this.controller.getState();
      if (state.meta?.rulesetId === "chess") {
        const tier = tierForPlayer(this.settings, state.toMove);
        const isBotTurn = tier !== null;
        if (isBotTurn) {
          this.setPaused(true);
          this.autoPausedFromHistoryNav = true;
          this.autoResumeAfterHistoryNav = false;
          this.allowPausedTurnToastWhileViewingPast = false;
        }
      }
    } catch {
      // ignore
    }

    this.refreshUI();
    this.updateInputForCurrentTurn();

    if (reason === "jump" && this.isViewingPastInHistory()) {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      this.scheduleEval();
      return;
    }

    this.schedulePausedTurnToastSync();
    this.scheduleEval();
  }

  private onLoadGame(): void {
    // Loading a save is an explicit user navigation event.
    // Cancel any in-flight bot computation so it doesn't immediately play from
    // the newly loaded position.
    if (this.busy) {
      this.requestId++;
      this.busy = false;
    }

    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) {
      this.refreshUI();
      this.updateInputForCurrentTurn();
      return;
    }

    // If the loaded position is bot-to-move, pause and show the sticky
    // "tap to resume" toast. This prevents the bot from auto-playing a move
    // immediately after loading.
    try {
      const state = this.controller.getState();
      if (state.meta?.rulesetId === "chess") {
        const tier = tierForPlayer(this.settings, state.toMove);
        const isBotTurn = tier !== null;
        if (isBotTurn) {
          this.setPaused(true);
          this.autoPausedAtStart = false;
          this.autoPausedFromHistoryNav = false;
          this.autoResumeAfterHistoryNav = false;
          this.lastAutoPausedHumanFirstTurnToastSig = null;
          this.allowPausedTurnToastWhileViewingPast = true;
        } else {
          this.allowPausedTurnToastWhileViewingPast = false;
        }
      }
    } catch {
      // ignore
    }

    this.refreshUI();
    this.updateInputForCurrentTurn();
    // Show immediately so loadGame's turn-change toast can be suppressed.
    this.syncPausedTurnToastNow();
    this.schedulePausedTurnToastSync();
  }

  private onHistoryChanged(reason: HistoryChangeReason): void {
    if (reason === "gameOver") {
      this.onGameOver();
      return;
    }

    if (reason === "undo" || reason === "redo" || reason === "jump") {
      this.onUndoRedoJump(reason);
      return;
    }

    if (reason === "loadGame") {
      this.onLoadGame();
      // Still kick() to refresh status, keep warmup going, and ensure toasts
      // are synchronized. maybeMove() will no-op while paused.
      this.kick();
      return;
    }

    // For non-load navigation, never keep the "allow while viewing past" override.
    this.allowPausedTurnToastWhileViewingPast = false;

    // Any other history change invalidates pending auto-resume timers.
    if (this.autoResumeAfterTurnToastTimer) {
      window.clearTimeout(this.autoResumeAfterTurnToastTimer);
      this.autoResumeAfterTurnToastTimer = null;
    }
    this.autoResumeAfterTurnToastSig = null;

    // After the user resumes live play by making a move, if we were paused due
    // to history navigation and the resulting position is bot-to-move, show a
    // normal turn toast and auto-resume.
    if (reason === "move" && this.autoPausedFromHistoryNav && this.settings.paused) {
      try {
        const state = this.controller.getState();
        if (state.meta?.rulesetId === "chess") {
          const tier = tierForPlayer(this.settings, state.toMove);
          const isBotTurn = tier !== null;
          if (isBotTurn) {
            this.autoResumeAfterHistoryNav = true;
            this.schedulePausedTurnToastSync();
          }
        }
      } catch {
        // ignore
      }
    }

    // Auto-pause on a new game/restart only if the bot moves first.
    // If the human moves first, let the bot play immediately on its turn.
    if (this.isAtNewGame() && (this.settings.white !== "human" || this.settings.black !== "human")) {
      const newGameState = this.controller.getState();
      const botMovesFirst = tierForPlayer(this.settings, newGameState.toMove) !== null;
      this.settings.paused = botMovesFirst;
      this.autoPausedAtStart = botMovesFirst;
      this.autoPausedFromHistoryNav = false;
      this.autoResumeAfterHistoryNav = false;
      this.allowPausedTurnToastWhileViewingPast = false;
      this.lastAutoPausedHumanFirstTurnToastSig = null;
      try {
        localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
      } catch {
        // ignore
      }

      // Refresh immediately so a previously-disabled Resume button from a
      // finished game becomes usable again before any deferred bot work runs.
      this.refreshUI();
      this.updateInputForCurrentTurn();
      this.syncPausedTurnToastNow();
    }

    this.refreshUI();
    this.updateInputForCurrentTurn();

    // Any position change can affect whether it's a bot turn.
    this.kick();
    this.scheduleEval();
  }

  private onGameOver(): void {
    try {
      this.maybeAdaptAfterGameOver();
    } finally {
      this.controller.setInputEnabled(true);
      this.setStatus("Game over");
      this.refreshUI();
    }
  }

  private loadAdaptState(tier: BotTier): AdaptState {
    try {
      const raw = localStorage.getItem(`${LS_KEYS.adaptPrefix}${tier}`);
      if (!raw) return normalizeAdaptState(null);
      const parsed = JSON.parse(raw);
      return normalizeAdaptState(parsed);
    } catch {
      return normalizeAdaptState(null);
    }
  }

  private saveAdaptState(tier: BotTier, s: AdaptState): void {
    try {
      localStorage.setItem(`${LS_KEYS.adaptPrefix}${tier}`, JSON.stringify(s));
    } catch {
      // ignore
    }
  }

  private resetLearning(): void {
    for (const tier of ["beginner", "intermediate", "advanced", "master"] as const) {
      this.saveAdaptState(tier, normalizeAdaptState(null));
    }
  }

  private maybeAdaptAfterGameOver(): void {
    const plyCount = plyCountFromController(this.controller);
    if (plyCount < 24) return;

    // Only adapt for human-vs-bot (exactly one human).
    const wHuman = this.settings.white === "human";
    const bHuman = this.settings.black === "human";
    if (wHuman === bHuman) return;

    const human: Player = wHuman ? "W" : "B";
    const bot: Player = other(human);
    const tier = tierForPlayer(this.settings, bot);
    if (!tier) return;

    const result = checkCurrentPlayerLost(this.controller.getState());
    const winner = result.winner;

    const score: 0 | 0.5 | 1 = winner === null ? 0.5 : winner === human ? 1 : 0;

    const prev = this.loadAdaptState(tier);
    const next = adaptAfterGame({ tier, prev, score });
    this.saveAdaptState(tier, next);
  }

  private async maybeMove(): Promise<void> {
    if (this.busy) return;
    if (this.controller.isOver()) return;

    // Online safety: only the client that controls the active seat may submit.
    if (
      this.controller.getDriverMode() === "online" &&
      typeof this.controller.canLocalMachineActOnTurn === "function" &&
      !this.controller.canLocalMachineActOnTurn()
    ) {
      return;
    }

    const state = this.controller.getState();
    const rulesetId = state.meta?.rulesetId;
    if (rulesetId !== "chess") return;

    const toMove: Player = state.toMove;
    const tier = tierForPlayer(this.settings, toMove);
    if (!tier) {
      // Human to move.
      this.controller.setInputEnabled(true);
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    if (this.settings.paused) {
      // Bot is to move, but paused.
      // Lock input immediately so the human can't play for the bot while paused
      // (the sticky toast is synced async and could otherwise lag a frame).
      this.controller.setInputEnabled(false);
      this.setStatus(`Bot paused — tap to resume (${this.engineLabel()})`);
      this.schedulePausedTurnToastSync();
      return;
    }

    // Ensure our paused-turn toast is not left hanging.
    this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);

    // Always keep a background warmup going while bots are enabled.
    this.prewarmEngine();

    // If the engine isn't ready yet, prefer waiting (real Stockfish) over playing
    // random fallback moves — unless the user explicitly allows fallback.
    if (!this.engineReady && !this.allowFallbackDuringWarmup) {
      this.controller.setInputEnabled(false);
      this.setStatus(`Bot warming up… (${this.engineLabel()})`);
      this.showWarmupToast(false);
      // We'll retry when warmup completes (prewarmEngine kicks), but also poll lightly.
      window.setTimeout(() => void this.maybeMove(), 1000);
      return;
    }

    this.busy = true;
    const myRequestId = this.requestId++;

    // Disable input while bot is deciding (unless it becomes human turn later).
    this.controller.setInputEnabled(false);

    try {
      const presets = BOT_PRESETS[tier];
      const defaultSub = 4;
      const sub = isHumanForPlayer(this.settings, other(toMove)) ? this.loadAdaptState(tier).applied : defaultSub;
      const subIdx = Math.max(0, Math.min(presets.length - 1, Math.round(sub)));
      const preset = presets[subIdx];

      const fen = gameStateToFen(state);

      // If Stockfish is struggling to boot (common on slow/mobile), don't freeze the game.
      // Use a fallback move immediately, and keep warming the engine in the background.
      const shouldSkipEngine = Date.now() < this.engineBackoffUntilMs;
      let pickedMove: Move | null = null;

      if (!shouldSkipEngine) {
        const engine = this.ensureEngine();
        const engineTimeoutMs = Math.min(8000, Math.max(2500, Math.round(preset.movetimeMs) + 2000));

        this.setStatus(`Bot thinking… (${this.engineLabel()})`);

        const uci = await engine.bestMove({
          fen,
          movetimeMs: preset.movetimeMs,
          skill: preset.skill,
          // Keep per-move attempts short; background prewarm uses a longer timeout.
          timeoutMs: engineTimeoutMs,
        });

        if (myRequestId !== this.requestId - 1) return;
        pickedMove = uciToLegalMove(state, uci);
      }

      if (pickedMove) {
        if (this.settings.delayMs > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, this.settings.delayMs));
        }

        if (this.settings.paused) {
          this.setStatus(`Bot paused — tap to resume (${this.engineLabel()})`);
          this.schedulePausedTurnToastSync();
          return;
        }

        await this.controller.playMove(pickedMove);
      } else {
        this.setStatus(`Bot (fallback) — ${this.engineLabel()} still loading...`);
        if (this.settings.delayMs > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, this.settings.delayMs));
        }

        if (this.settings.paused) {
          this.setStatus(`Bot paused — tap to resume (${this.engineLabel()})`);
          this.schedulePausedTurnToastSync();
          return;
        }
        await this.playFallbackMove();
      }

      // After move, decide whether input should be enabled.
      const nextToMove = this.controller.getState().toMove;
      const nextTier = tierForPlayer(this.settings, nextToMove);
      this.controller.setInputEnabled(nextTier === null);

      this.setStatus(`Bot ready (${this.engineLabel()})`);

      // Continue if next side is also a bot.
      if (nextTier !== null) this.kick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[chessbot] move failed", err);

      const msg = err instanceof Error ? err.message : String(err);

      // If Stockfish is just still coming up, retry a few times before giving up.
      // (Some environments take a long time to fetch/compile WASM on first run.)
      const isRecoverableEngineFailure = isRecoverableStockfishFailureMessage(msg);

      if (isRecoverableEngineFailure && myRequestId === this.requestId - 1) {
        // Don't stall gameplay on engine init. Play a fallback move immediately.
        // Back off engine attempts for a bit to avoid repeated multi-second stalls.
        this.engineFailureCount++;
        const backoffMs = Math.min(90_000, 5_000 * this.engineFailureCount);
        this.engineBackoffUntilMs = Date.now() + backoffMs;
        this.recoverEngineForRetry();
        this.showWarmupToast(true);

        this.setStatus(`Bot (fallback) — ${this.engineLabel()} still loading...`);
        try {
          if (this.settings.delayMs > 0) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, this.settings.delayMs));
          }

          if (this.settings.paused) {
            this.setStatus(`Bot paused — tap to resume (${this.engineLabel()})`);
            this.schedulePausedTurnToastSync();
            return;
          }
          await this.playFallbackMove();
        } catch {
          // If even fallback fails, unlock input.
          this.controller.setInputEnabled(true);
          this.setStatus(`Bot error: ${msg}`);
          return;
        }

  // Keep warming Stockfish in the background after a crash/timeout so a
  // later move can attempt to recover automatically.
        this.prewarmEngine();

        // After move, decide whether input should be enabled.
        const nextToMove = this.controller.getState().toMove;
        const nextTier = tierForPlayer(this.settings, nextToMove);
        this.controller.setInputEnabled(nextTier === null);

        // Continue if next side is also a bot.
        if (nextTier !== null) this.kick();
        return;
      }

      // Non-init failure: let the player continue manually.
      this.controller.setInputEnabled(true);
      this.setStatus(`Bot error: ${msg}`);
    } finally {
      this.busy = false;
      // If an eval was deferred while the bot was busy, run it now.
      if (this.evalDeferredWhileBusy) {
        this.evalDeferredWhileBusy = false;
        void this.runEval();
      }
    }
  }
}
