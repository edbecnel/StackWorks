import type { GameController, HistoryChangeReason } from "../controller/gameController.ts";
import type { Player } from "../types.ts";
import { createPrng } from "../shared/prng.ts";
import { pickFallbackMoveColumnsChess } from "./columnsChessFallback.ts";

export type ColumnsBotSideSetting = "human" | "bot";

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseDelayMs(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 5000);
}

function parseSide(v: string | null): ColumnsBotSideSetting {
  return v === "bot" ? "bot" : "human";
}

function safeBool(raw: string | null, fallback: boolean): boolean {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

function botEnabledFor(settings: BotSettings, p: Player): boolean {
  return (p === "W" ? settings.white : settings.black) === "bot";
}

export class ColumnsChessBotManager {
  private controller: GameController;
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

  private analysisOverridePrev: { white: ColumnsBotSideSetting; black: ColumnsBotSideSetting; paused: boolean } | null =
    null;

  private static readonly PAUSED_TURN_TOAST_KEY = "columnsbot_paused_turn";

  constructor(controller: GameController) {
    this.controller = controller;
    this.settings = this.loadSettings();

    this.controller.setStickyToastAction(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY, () => {
      if (this.isPausedBotTurn()) this.resume();
    });

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

    // Prevent surprise moves immediately on load.
    if (this.settings.white !== "human" || this.settings.black !== "human") {
      this.settings.paused = true;
      try {
        localStorage.setItem(LS_KEYS.paused, "true");
      } catch {
        // ignore
      }
    }

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
    this.setStatus(`Bot ${mode} (W:${this.settings.white} B:${this.settings.black})${turnSummary}`);

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

  private syncPausedTurnToastNow(): void {
    if (!this.isPausedBotTurn()) {
      this.controller.clearStickyToast(ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    const state = this.controller.getState();
    const side = state.toMove === "W" ? "White" : "Black";
    this.controller.showStickyToast(
      ColumnsChessBotManager.PAUSED_TURN_TOAST_KEY,
      `${side}'s turn. Tap here to resume bot`,
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

    const m = pickFallbackMoveColumnsChess(state, {
      seed: `columnsbot_${Date.now()}_${state.toMove}`,
      legalMoves: legal,
    });

    const chosen = m ?? (() => {
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

  private onHistoryChanged(_reason: HistoryChangeReason): void {
    this.schedulePausedTurnToastSync();
    this.refreshUI();
    this.kick();
  }
}
