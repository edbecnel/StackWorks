import type { GameController, HistoryChangeReason } from "../controller/gameController.ts";
import type { Move } from "../game/moveTypes.ts";
import type { Player } from "../types.ts";
import { createPrng } from "../shared/prng.ts";
import { BOT_PRESETS, type BotTier } from "./presets.ts";
import { pickFallbackMoveColumnsChess } from "./columnsChessFallback.ts";
import { gameStateToFen } from "./fen.ts";
import { uciToLegalMove } from "./chessMoveMap.ts";
import type { EvalScore, UciEngine } from "./uciEngine.ts";
import { StockfishUciEngine } from "./stockfishEngine.ts";
import { HttpUciEngine } from "./httpEngine.ts";
import { applySignedInNameToLocalBotSelects } from "../ui/bot/localBotSelectIdentity.ts";
import { syncPlayerBotSelector } from "../ui/bot/playerBotSelector";

export type ColumnsBotSideSetting = "human" | BotTier;

type BotSettings = {
  white: ColumnsBotSideSetting;
  black: ColumnsBotSideSetting;
  delayMs: number;
  paused: boolean;
};

const LS_KEYS = {
  white: "lasca.columnsChessBot.white",
  black: "lasca.columnsChessBot.black",
  delay: "lasca.columnsChessBot.delayMs",
  paused: "lasca.columnsChessBot.paused",
} as const;

const DEFAULT_DELAY_MS = 1000;
const DEFAULT_PRESET_INDEX = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseDelayMs(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 5000);
}

function parseSide(v: string | null): ColumnsBotSideSetting {
  if (v === "bot") return "intermediate";
  if (v === "strong") return "advanced";
  if (v === "beginner" || v === "intermediate" || v === "advanced" || v === "master") return v;
  return "human";
}

function safeBool(raw: string | null, fallback: boolean): boolean {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

function botEnabledFor(settings: BotSettings, p: Player): boolean {
  return (p === "W" ? settings.white : settings.black) !== "human";
}

function tierForPlayer(settings: BotSettings, p: Player): BotTier | null {
  const value = p === "W" ? settings.white : settings.black;
  return value === "human" ? null : value;
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

export class ColumnsChessBotManager {
  private controller: GameController;
  private engineFactory: () => UciEngine;
  private engine: UciEngine | null = null;
  private engineReady = false;
  private prewarmStarted = false;
  private engineRetryNotBeforeMs = 0;
  private readonly serverEngineUrl: string | null;
  private settings: BotSettings;

  private lastBoardTapAtMs: number = 0;

  private elWhite: HTMLSelectElement | null = null;
  private elBlack: HTMLSelectElement | null = null;
  private elDelay: HTMLInputElement | null = null;
  private elDelayReset: HTMLButtonElement | null = null;
  private elDelayLabel: HTMLElement | null = null;
  private elPause: HTMLButtonElement | null = null;
  private elReset: HTMLButtonElement | null = null;
  private elStatus: HTMLElement | null = null;

  private flashStatusTimer: number | null = null;

  private busy = false;
  private requestId = 1;
  private toastSyncTimer: number | null = null;
  private lastHistoryReason: HistoryChangeReason | undefined;

  private lastEvalScore: EvalScore | null = null;
  private lastEvalFen: string | null = null;
  private evalRunning = false;
  private evalDeferredWhileBusy = false;
  private evalDebounceTimer: number | null = null;
  private evalListeners: Array<(score: EvalScore | null, pending: boolean) => void> = [];
  private evalCache: Map<string, EvalScore> = new Map();

  private analysisOverridePrev: { white: ColumnsBotSideSetting; black: ColumnsBotSideSetting; paused: boolean } | null =
    null;

  private autoPausedAtStart = false;

  private static readonly PAUSED_TURN_TOAST_KEY = "columnsbot_paused_turn";

  constructor(controller: GameController, opts?: { engineFactory?: () => UciEngine }) {
    this.controller = controller;
    this.serverEngineUrl = resolveDefaultStockfishServerUrl();
    this.engineFactory =
      opts?.engineFactory ??
      (() => (this.serverEngineUrl ? new HttpUciEngine(this.serverEngineUrl) : new StockfishUciEngine()));
    this.settings = this.loadSettings();

    this.controller.setStickyToastAction(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY, () => {
      if (this.isPausedBotTurn()) this.resume();
    });

    this.controller.addHistoryChangeCallback((reason) => this.onHistoryChanged(reason));
  }

  isEngineReady(): boolean {
    return this.engineReady;
  }

  addEvalChangeListener(cb: (score: EvalScore | null, pending: boolean) => void): void {
    this.evalListeners.push(cb);
  }

  removeEvalChangeListener(cb: (score: EvalScore | null, pending: boolean) => void): void {
    const idx = this.evalListeners.indexOf(cb);
    if (idx >= 0) this.evalListeners.splice(idx, 1);
  }

  getCachedEvalForFen(fen: string): EvalScore | null {
    return this.evalCache.get(fen) ?? null;
  }

  activateForEvaluation(): void {
    this.prewarmEngine();
    this.scheduleEval();
  }

  async evaluateFen(fen: string, opts?: { movetimeMs?: number; timeoutMs?: number }): Promise<EvalScore | null> {
    const cached = this.evalCache.get(fen);
    if (cached) return cached;

    this.prewarmEngine();
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

  setAnalysisModeActive(enabled: boolean): void {
    const next = Boolean(enabled);

    if (next) {
      if (this.analysisOverridePrev) return;
      this.analysisOverridePrev = {
        white: this.settings.white,
        black: this.settings.black,
        paused: this.settings.paused,
      };

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

    this.applyStartupPausePolicy();

    this.installBoardClickToPauseBotVsBot();

    if (this.elWhite) {
      this.elWhite.value = this.settings.white;
      this.elWhite.addEventListener("change", () => {
        this.settings.white = parseSide(this.elWhite!.value);
        try {
          localStorage.setItem(LS_KEYS.white, this.settings.white);
        } catch {
          // ignore
        }
        if (this.settings.white !== "human" || this.settings.black !== "human") this.prewarmEngine();
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elBlack) {
      this.elBlack.value = this.settings.black;
      this.elBlack.addEventListener("change", () => {
        this.settings.black = parseSide(this.elBlack!.value);
        try {
          localStorage.setItem(LS_KEYS.black, this.settings.black);
        } catch {
          // ignore
        }
        if (this.settings.white !== "human" || this.settings.black !== "human") this.prewarmEngine();
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elDelay) {
      this.elDelay.value = String(this.settings.delayMs);
      this.elDelay.addEventListener("input", () => {
        this.settings.delayMs = parseDelayMs(this.elDelay!.value || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
        if (this.elDelayLabel) this.elDelayLabel.textContent = `${this.settings.delayMs} ms`;
      });
      this.elDelay.addEventListener("change", () => {
        try {
          localStorage.setItem(LS_KEYS.delay, String(this.settings.delayMs));
        } catch {
          // ignore
        }
      });
    }

    if (this.elDelayReset) {
      this.elDelayReset.addEventListener("click", () => {
        this.settings.delayMs = DEFAULT_DELAY_MS;
        if (this.elDelay) this.elDelay.value = String(DEFAULT_DELAY_MS);
        if (this.elDelayLabel) this.elDelayLabel.textContent = `${DEFAULT_DELAY_MS} ms`;
        try {
          localStorage.setItem(LS_KEYS.delay, String(DEFAULT_DELAY_MS));
        } catch {
          // ignore
        }
      });
    }

    if (this.elPause) {
      this.elPause.addEventListener("click", () => {
        if (this.settings.paused) this.resume();
        else this.pause();
      });
    }

    if (this.elReset) {
      this.elReset.addEventListener("click", () => {
        // Columns Chess bot currently has no adaptive learning state.
        // Keep the control for UI parity with Classic Chess.
        this.flashStatus("No learning to reset (Columns Chess)");
      });
    }

    this.refreshUI();
    this.schedulePausedTurnToastSync();
    this.kick();
  }

  private installBoardClickToPauseBotVsBot(): void {
    if (typeof document === "undefined") return;

    const elBoard = document.getElementById("boardWrap") as HTMLElement | null;
    if (!elBoard) return;

    const onTap = (ev: Event) => {
      // On many devices, a single tap produces both pointerdown and click.
      // Avoid handling both.
      const now = Date.now();
      if (ev.type === "click" && now - this.lastBoardTapAtMs < 350) {
        return;
      }

      // Only pause via board-tap while bot-vs-bot is actively running.
      // Resume must happen via the sticky toast (same as other variants).
      if (this.settings.paused) return;
      if (this.settings.white === "human" || this.settings.black === "human") return;
      if (this.controller.isOver()) return;

      const state = this.controller.getState();
      if (state.meta?.rulesetId !== "columns_chess") return;

      ev.preventDefault();
      ev.stopPropagation();
      this.lastBoardTapAtMs = now;
      this.pause();
    };

    elBoard.addEventListener("pointerdown", onTap, { capture: true });
    elBoard.addEventListener("click", onTap, { capture: true });
  }

  private ensureEngine(): UciEngine {
    if (!this.engine) this.engine = this.engineFactory();
    return this.engine;
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

  private prewarmEngine(): void {
    if (this.engineReady || this.prewarmStarted) return;
    if (Date.now() < this.engineRetryNotBeforeMs) return;

    this.prewarmStarted = true;
    void (async () => {
      try {
        const engine = this.ensureEngine();
        await engine.init({ timeoutMs: this.serverEngineUrl ? 5000 : 120000 });
        this.engineReady = true;
        this.prewarmStarted = false;
        this.engineRetryNotBeforeMs = 0;
        this.notifyEvalListeners();
        if (this.evalDeferredWhileBusy || this.evalDebounceTimer !== null) {
          void this.runEval();
        }
      } catch {
        this.prewarmStarted = false;
        this.engineRetryNotBeforeMs = Date.now() + 5000;
        this.resetEngine();
        this.notifyEvalListeners();
      }
    })();
  }

  private loadSettings(): BotSettings {
    try {
      const white = parseSide(localStorage.getItem(LS_KEYS.white));
      const black = parseSide(localStorage.getItem(LS_KEYS.black));
      const paused = safeBool(localStorage.getItem(LS_KEYS.paused), false);
      const delayMs = parseDelayMs(localStorage.getItem(LS_KEYS.delay) || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
      return { white, black, delayMs, paused };
    } catch {
      return { white: "human", black: "human", delayMs: DEFAULT_DELAY_MS, paused: false };
    }
  }

  private setStatus(text: string): void {
    if (this.elStatus) this.elStatus.textContent = text;
  }

  private isAtNewGame(): boolean {
    try {
      const history = this.controller.getHistory ? this.controller.getHistory() : null;
      return !Array.isArray(history) || history.length <= 1;
    } catch {
      return true;
    }
  }

  private applyStartupPausePolicy(): void {
    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) {
      this.autoPausedAtStart = false;
      return;
    }

    this.prewarmEngine();

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "columns_chess") {
      this.autoPausedAtStart = false;
      return;
    }

    if (!this.isAtNewGame()) {
      this.autoPausedAtStart = false;
      return;
    }

    const shouldPauseForOpening = botEnabledFor(this.settings, state.toMove);
    this.settings.paused = shouldPauseForOpening;
    this.autoPausedAtStart = shouldPauseForOpening;
    try {
      localStorage.setItem(LS_KEYS.paused, shouldPauseForOpening ? "true" : "false");
    } catch {
      // ignore
    }
    if (!shouldPauseForOpening) {
      this.controller.clearStickyToast(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY);
    }
  }

  private hasResolvedEvalForCurrentPosition(): boolean {
    if (!this.lastEvalScore || !this.lastEvalFen) return false;
    try {
      return gameStateToFen(this.controller.getState()) === this.lastEvalFen;
    } catch {
      return false;
    }
  }

  private notifyEvalListeners(): void {
    const pending = this.evalRunning || this.evalDeferredWhileBusy || (!this.engineReady && !this.hasResolvedEvalForCurrentPosition());
    for (const cb of this.evalListeners) {
      try {
        cb(this.lastEvalScore, pending);
      } catch {
        // ignore
      }
    }
  }

  private scheduleEval(): void {
    if (this.evalRunning) {
      this.evalDeferredWhileBusy = true;
      this.notifyEvalListeners();
      return;
    }

    if (this.evalDebounceTimer !== null) window.clearTimeout(this.evalDebounceTimer);
    this.evalDebounceTimer = window.setTimeout(() => {
      this.evalDebounceTimer = null;
      void this.runEval();
    }, 60);
  }

  private async runEval(): Promise<void> {
    if (this.evalRunning) {
      this.evalDeferredWhileBusy = true;
      this.notifyEvalListeners();
      return;
    }

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "columns_chess") {
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

    this.prewarmEngine();
    if (!this.engineReady || this.busy) {
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
    this.notifyEvalListeners();

    try {
      const score = await engine.evaluate(fen, { movetimeMs: 250, timeoutMs: 5000 });
      if (score !== null) {
        const normalized = normalizeEvalScoreToWhitePerspective(score, fen);
        this.lastEvalScore = normalized;
        this.lastEvalFen = fen;
        this.evalCache.set(fen, normalized);
      }
    } catch {
      // Keep the last stable score.
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

  private flashStatus(text: string, ms: number = 2000): void {
    this.setStatus(text);
    if (this.flashStatusTimer) window.clearTimeout(this.flashStatusTimer);
    this.flashStatusTimer = window.setTimeout(() => {
      this.flashStatusTimer = null;
      this.refreshUI();
    }, ms);
  }

  private refreshUI(): void {
    if (this.elWhite) this.elWhite.value = this.settings.white;
    if (this.elBlack) this.elBlack.value = this.settings.black;
    syncPlayerBotSelector("botWhiteSelect");
    syncPlayerBotSelector("botBlackSelect");
    if (this.elDelay) this.elDelay.value = String(this.settings.delayMs);
    if (this.elDelayLabel) this.elDelayLabel.textContent = `${this.settings.delayMs} ms`;

    const analysisDisabled = Boolean(this.analysisOverridePrev);
    if (this.elWhite) this.elWhite.disabled = analysisDisabled;
    if (this.elBlack) this.elBlack.disabled = analysisDisabled;
    if (this.elDelay) this.elDelay.disabled = analysisDisabled;
    if (this.elDelayReset) this.elDelayReset.disabled = analysisDisabled;
    if (this.elReset) this.elReset.disabled = analysisDisabled;
    if (analysisDisabled) {
      if (this.elPause) this.elPause.disabled = true;
      this.setStatus("Analysis mode (bot disabled)");
      this.controller.setInputEnabled(true);
      return;
    }

    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (this.elPause) {
      this.elPause.disabled = !anyBot || this.controller.isOver();
      this.elPause.textContent = this.settings.paused ? "Resume bot" : "Pause bot";
    }

    if (this.elReset) {
      this.elReset.disabled = !anyBot;
    }

    if (!anyBot) {
      this.setStatus("Bot off");
      this.controller.setInputEnabled(true);
      return;
    }

    if (this.controller.isOver()) {
      this.setStatus("Game over");
      this.controller.setInputEnabled(true);
      return;
    }

    let turnSummary = "";
    try {
      const s = this.controller.getState();
      if (s.meta?.rulesetId === "columns_chess") {
        const side = s.toMove === "W" ? "White" : "Black";
        turnSummary = ` | toMove:${side}${botEnabledFor(this.settings, s.toMove) ? " (bot)" : " (human)"}`;
      }
    } catch {
      // ignore
    }

    const mode = this.settings.paused ? "paused" : "active";
  const assistMode = this.engineReady ? "ready" : this.prewarmStarted ? "warming" : "idle";
  this.setStatus(`Bot ${mode} (W:${this.settings.white} B:${this.settings.black})${turnSummary} | assist:${assistMode}`);

    // Input lock: if it's a bot-controlled side to move, lock input even while paused.
    // Resume happens via bot controls / sticky toast.
    try {
      const s = this.controller.getState();
      if (s.meta?.rulesetId === "columns_chess") {
        const isBotTurn = botEnabledFor(this.settings, s.toMove);
        this.controller.setInputEnabled(!isBotTurn);
      } else {
        this.controller.setInputEnabled(true);
      }
    } catch {
      // ignore
    }
  }

  private pause(): void {
    this.settings.paused = true;
    this.autoPausedAtStart = false;
    try {
      localStorage.setItem(LS_KEYS.paused, "true");
    } catch {
      // ignore
    }
    this.refreshUI();
    this.schedulePausedTurnToastSync();
  }

  private resume(): void {
    this.settings.paused = false;
    this.autoPausedAtStart = false;
    try {
      localStorage.setItem(LS_KEYS.paused, "false");
    } catch {
      // ignore
    }
    this.controller.clearStickyToast(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY);
    this.refreshUI();
    this.schedulePausedTurnToastSync();
    this.kick();
  }

  private isPausedBotTurn(): boolean {
    if (!this.settings.paused) return false;
    if (this.controller.isOver()) return false;
    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "columns_chess") return false;
    return botEnabledFor(this.settings, state.toMove);
  }

  private isViewingPastInHistory(): boolean {
    try {
      const h = this.controller.getHistory ? this.controller.getHistory() : null;
      if (!Array.isArray(h) || h.length <= 1) return false;
      const cur = h.find((e) => (e as any)?.isCurrent) as any;
      const idx = typeof cur?.index === "number" ? cur.index : h.length - 1;
      return idx < h.length - 1;
    } catch {
      return false;
    }
  }

  private syncPausedTurnToastNow(): void {
    if (this.lastHistoryReason === "jump" && this.isViewingPastInHistory()) {
      this.controller.clearStickyToast(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    if (!this.isPausedBotTurn()) {
      this.controller.clearStickyToast(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    const state = this.controller.getState();
    const side = state.toMove === "W" ? "White" : "Black";
    this.controller.showStickyToast(
      ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY,
      `${side}'s turn. Tap here or press spacebar to resume bot`,
      { force: true }
    );
  }

  private schedulePausedTurnToastSync(): void {
    if (this.toastSyncTimer) return;
    this.toastSyncTimer = window.setTimeout(() => {
      this.toastSyncTimer = null;
      this.syncPausedTurnToastNow();
    }, 0);
  }

  private async playOneMove(requestId: number): Promise<void> {
    if (this.controller.isOver()) return;
    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "columns_chess") return;
    if (this.settings.paused) return;
    if (!botEnabledFor(this.settings, state.toMove)) return;

    const legal = this.controller.getLegalMovesForTurn();
    if (!legal.length) return;

    const tier = tierForPlayer(this.settings, state.toMove) ?? "intermediate";
    const preset = BOT_PRESETS[tier][Math.min(DEFAULT_PRESET_INDEX, BOT_PRESETS[tier].length - 1)] ?? BOT_PRESETS[tier][BOT_PRESETS[tier].length - 1]!;
    let stockfishMove: Move | null = null;

    this.prewarmEngine();
    if (this.engineReady) {
      try {
        const fen = gameStateToFen(state);
        const engine = this.ensureEngine();
        const uci = await engine.bestMove({
          fen,
          movetimeMs: preset.movetimeMs,
          skill: preset.skill,
          timeoutMs: Math.min(8000, Math.max(2500, Math.round(preset.movetimeMs) + 2000)),
        });
        if (requestId !== this.requestId) return;
        stockfishMove = uciToLegalMove(state, uci);
      } catch {
        this.prewarmStarted = false;
        this.engineRetryNotBeforeMs = Date.now() + 5000;
        this.resetEngine();
        this.prewarmEngine();
      }
    }

    const m = pickFallbackMoveColumnsChess(state, {
      tier,
      seed: `columnsbot_${Date.now()}_${state.toMove}`,
      legalMoves: legal,
      preferredMove: stockfishMove,
    });

    const chosen = m ?? stockfishMove ?? (() => {
      const rng = createPrng(`columnsbot_rand_${Date.now()}_${state.toMove}`);
      return legal[rng.int(0, legal.length)];
    })();

    if (this.settings.delayMs > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, this.settings.delayMs));
    }

    if (requestId !== this.requestId) return;
    if (this.controller.isOver()) return;
    if (this.settings.paused) return;

    await this.controller.playMove(chosen);
  }

  private kick(): void {
    if (this.busy) return;
    if (this.controller.isOver()) return;

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "columns_chess") return;

    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) return;

    if (this.settings.paused) {
      this.schedulePausedTurnToastSync();
      return;
    }

    if (!botEnabledFor(this.settings, state.toMove)) return;

    const req = ++this.requestId;
    this.busy = true;
    void (async () => {
      try {
        await this.playOneMove(req);
      } finally {
        this.busy = false;
        this.schedulePausedTurnToastSync();
        this.refreshUI();
        // If it is still bot's turn (e.g. illegal/no-op), try again.
        if (req === this.requestId) this.kick();
      }
    })();
  }

  private onHistoryChanged(reason: HistoryChangeReason): void {
    this.lastHistoryReason = reason;
    if (reason === "newGame") {
      this.applyStartupPausePolicy();
    }
    this.schedulePausedTurnToastSync();
    if (this.evalListeners.length > 0) this.scheduleEval();
    this.refreshUI();
    this.kick();
  }
}
