import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { createStackInspector } from "../ui/stackInspector";
import {
  ensureOverlayLayer,
  clearOverlays,
  clearCheckmateBadge,
  drawSelection,
  drawSelectionChessCom,
  drawSelectionSquare,
  drawCheckmateBadge,
  drawTargets,
  drawTargetsChessCom,
  drawTargetsSquares,
  drawHighlightRing,
  drawHighlightSquare,
  drawLastMoveSquares,
  clearLastMoveSquares,
} from "../render/overlays.ts";
import {
  DEFAULT_SELECTION_STYLE,
  DEFAULT_MOVE_HINT_STYLE,
  DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE,
  type MoveHintStyle,
  type LastMoveHighlightStyle,
  type SelectionStyle,
} from "../render/highlightStyles";
import { generateLegalMoves } from "../game/movegen.ts";
import { renderGameState } from "../render/renderGameState.ts";
import { RULES } from "../game/ruleset.ts";
import { getWinner, checkCurrentPlayerLost } from "../game/gameOver.ts";
import { HistoryManager } from "../game/historyManager.ts";
import { hashGameState } from "../game/hashState.ts";
import { applyMove } from "../game/applyMove.ts";
import { isKingInCheckColumnsChess } from "../game/movegenColumnsChess.ts";
import { isKingInCheckChess } from "../game/movegenChess.ts";
import {
  adjudicateDamascaDeadPlay,
  DAMASCA_NO_PROGRESS_LIMIT_PLIES,
  DAMASCA_OFFICER_ONLY_LIMIT_PLIES,
} from "../game/damascaDeadPlay.ts";
import { animateStack, getNodeCenter, computeUnitHopPx } from "../render/animateMove.ts";
import { ensureStackCountsLayer } from "../render/stackCountsLayer.ts";
import { nodeIdToA1, nodeIdToA1View } from "../game/coordFormat.ts";
import { getDamaCaptureRemovalMode } from "../game/damaCaptureChain.ts";
import { parseNodeId } from "../game/coords.ts";
import { endTurn } from "../game/endTurn.ts";
import { ensurePreviewLayer, clearPreviewLayer } from "../render/previewLayer.ts";
import { ensureTurnIndicatorLayer, renderTurnIndicator } from "../render/turnIndicator.ts";
import {
  ensureOpponentPresenceIndicatorLayer,
  renderOpponentPresenceIndicator,
} from "../render/opponentPresenceIndicator.ts";
import type { GameDriver, HistorySnapshots } from "../driver/gameDriver.ts";
import type { OnlineGameDriver } from "../driver/gameDriver.ts";
import { LocalDriver } from "../driver/localDriver.ts";
import { deserializeWireGameState } from "../shared/wireState.ts";
import type { GetRoomWatchTokenResponse, PostRoomDebugReportResponse } from "../shared/onlineProtocol.ts";
import type { SfxManager, SfxName } from "../ui/sfx.ts";
import type { Player, PlayerIdentity, PlayerShellSnapshot, PresenceState, Stack } from "../types.ts";
import { pieceToHref } from "../pieces/pieceToHref.ts";
import { pieceTooltip } from "../pieces/pieceLabel.ts";
import { makeUseWithTitle } from "../render/svgUse.ts";
import { maybeVariantStonePieceHref } from "../render/stonePieceVariant.ts";
import { maybeVariantWoodenPieceHref } from "../render/woodenPieceVariant.ts";
import { drawMiniStackSpine } from "../render/miniSpine.ts";
import { isBoardFlipped } from "../render/boardFlip.ts";
import { getVariantById } from "../variants/variantRegistry.ts";
import { getSideLabelsForRuleset } from "../shared/sideTerminology.ts";
import { ensureCheckersUsDraw, getCheckersUsDrawStatus } from "../game/checkersUsDraw.ts";
import { getInternationalDraughtsDrawStatus } from "../game/internationalDraughtsDraw.ts";

export type HistoryChangeReason = "move" | "undo" | "redo" | "jump" | "newGame" | "loadGame" | "gameOver";

const DEFAULT_PLAYBACK_MOVE_ANIMATION_MS = 350;
const PLAYBACK_MOVE_ANIMATION_EXTRA_HOP_MS = 0;
const MAX_PLAYBACK_MOVE_ANIMATION_MS = 350;
const BOARD_DRAG_THRESHOLD_PX = 6;
const BOARD_DRAG_CLICK_SUPPRESS_MS = 300;

function normalizeOnlineResumeServerUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

function normalizeOnlineResumeRoomId(raw: string): string {
  return (raw || "").trim();
}

function clearStoredOnlineResumeRecords(serverUrl: string, roomId: string): void {
  if (typeof window === "undefined") return;

  const normalizedServerUrl = normalizeOnlineResumeServerUrl(serverUrl);
  const normalizedRoomId = normalizeOnlineResumeRoomId(roomId);
  if (!normalizedServerUrl || !normalizedRoomId) return;

  const keysToRemove = new Set<string>([
    `lasca.online.resume.${encodeURIComponent(normalizedServerUrl)}.${encodeURIComponent(normalizedRoomId)}`,
    `lasca.online.resume.${encodeURIComponent(serverUrl)}.${encodeURIComponent(roomId)}`,
    `lasca.online.resume.${encodeURIComponent(`${normalizedServerUrl}/`)}.${encodeURIComponent(normalizedRoomId)}`,
  ]);

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith("lasca.online.resume.")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object") continue;
      const recordServerUrl = normalizeOnlineResumeServerUrl(typeof parsed.serverUrl === "string" ? parsed.serverUrl : "");
      const recordRoomId = normalizeOnlineResumeRoomId(typeof parsed.roomId === "string" ? parsed.roomId : "");
      if (recordServerUrl === normalizedServerUrl && recordRoomId === normalizedRoomId) {
        keysToRemove.add(key);
      }
    }
  } catch {
    // ignore
  }

  for (const key of keysToRemove) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

type ApplyChosenMoveOptions = {
  animateLocalTravel?: boolean;
};

export class GameController {
  private svg: SVGSVGElement;
  private piecesLayer: SVGGElement;
  private inspector: ReturnType<typeof createStackInspector> | null;
  private overlayLayer: SVGGElement;
  private previewLayer: SVGGElement;
  private turnIndicatorLayer: SVGGElement;
  private opponentPresenceIndicatorLayer: SVGGElement;
  private lastOpponentDisconnectedBlockToastAt: number = 0;

  private lastMoveHighlightsEnabled: boolean = true;
  private lastMoveHighlightStyle: LastMoveHighlightStyle = DEFAULT_LAST_MOVE_HIGHLIGHT_STYLE;
  private moveHintStyle: MoveHintStyle = DEFAULT_MOVE_HINT_STYLE;
  private selectionStyle: SelectionStyle = DEFAULT_SELECTION_STYLE;
  private highlightSquaresEnabled: boolean = false;

  private didBindOpponentStatusClicks: boolean = false;
  private state: GameState;
  private selected: string | null = null;
  private currentTargets: string[] = [];
  private currentMoves: Move[] = [];
  private mandatoryCapture: boolean = false;
  private lockedCaptureFrom: string | null = null;
  private lockedCaptureDir: { dr: number; dc: number } | null = null;
  private jumpedSquares: Set<string> = new Set();
  private activeBoardPointerId: number | null = null;
  private dragSourceNodeId: string | null = null;
  private dragStartClientX: number = 0;
  private dragStartClientY: number = 0;
  private dragStartSvgX: number = 0;
  private dragStartSvgY: number = 0;
  private dragHasMoved: boolean = false;
  private dragPreviewGroup: SVGGElement | null = null;
  private dragHiddenSourceGroup: SVGGElement | null = null;
  private boardTextSelectionRestore:
    | {
        bodyUserSelect: string;
        bodyWebkitUserSelect: string;
        docUserSelect: string;
        docWebkitUserSelect: string;
      }
    | null = null;
  private suppressBoardClickUntilMs: number = 0;
  private isGameOver: boolean = false;
  private moveHintsEnabled: boolean = false;
  private animationsEnabled: boolean = true;
  private bannerTimer: number | null = null;
  private remainderTimer: number | null = null;
  private history: HistoryManager;
  private driver: GameDriver;
  private readonly shellSnapshotListeners: Array<() => void> = [];
  private readonly localShellDisplayNames: Partial<Record<Player, string>> = {};

  private drawOfferInputLockActive: boolean = false;
  private lastPromptedDrawOfferNonce: number | null = null;
  private trackedOutgoingDrawOfferNonce: number | null = null;
  private historyListeners: Array<(reason: HistoryChangeReason) => void> = [];
  private inputEnabled: boolean = true;
  private lastInputEnabled: boolean = true;
  private shellStartupPlayLockEnabled: boolean = false;

  // Analysis mode: local-only sandbox moves on the current position.
  // When enabled, moves are applied locally and never submitted to the server.
  private analysisMode: boolean = false;
  private analysisModeListeners: Array<(enabled: boolean) => void> = [];
  private analysisHistory: HistoryManager | null = null;
  private currentTurnNodes: string[] = []; // Track node IDs visited in current turn
  private currentTurnHasCapture: boolean = false; // Track if current turn includes captures
  private repetitionCounts: Map<string, number> = new Map();
  /** Timestamp (Date.now()) when the last move was committed to history, for [%emt] tracking. */
  private lastMoveCommittedAtMs: number = 0;
  private onlinePollTimer: number | null = null;
  private onlineRealtimeEnabled: boolean = false;
  private onlineTransportStatus: "connected" | "reconnecting" = "connected";
  private onlineAuthorityStatus: "fresh" | "stale" = "fresh";
  private onlineReconnectToastTimer: number | null = null;
  private onlineReconnectToastShown: boolean = false;
  private remoteOnlineApplyChain: Promise<void> = Promise.resolve();
  private deferTurnToastUntilAfterRender: boolean = false;
  private pendingDeferredTurnToast: boolean = false;
  private onlineDidShowConnectingToast: boolean = false;
  private onlineDidShowConnectedToast: boolean = false;
  private reportIssueHintShownForRoomId: string | null = null;
  private reportIssueHintLastShownAtMs: number = 0;
  private lastDeadPlayWarning: string | null = null;
  private lastGameOverToast: string | null = null;
  private lastGameOverStickyToast: string | null = null;
  private static readonly GAME_OVER_STICKY_TOAST_KEY = "game_over";
  private static readonly DRAW_OFFER_PENDING_STICKY_TOAST_KEY = "online_draw_offer_pending";
  private static readonly DRAW_OFFER_RESOLUTION_STICKY_TOAST_KEY = "online_draw_offer_resolution";
  private static readonly ONLINE_RECONNECT_TOAST_DELAY_MS = 1200;
  private lastToastToMove: GameState["toMove"] | null = null;
  private lastCheckToastSig: string | null = null;
  private lastCheckmateBadgeSignature: string | null = null;
  private toastTimer: number | null = null;
  private toastEl: HTMLDivElement | null = null;
  private coordLabelProvider: ((nodeId: string) => string | null) | null = null;

  /**
   * Page-level UI helpers sometimes need to know whether this game is online
   * (state persists server-side) vs local/offline (refresh/back loses state).
   */
  public getDriverMode(): GameDriver["mode"] {
    return this.driver.mode;
  }

  /** Set a provider function that returns a coord label (e.g. "A6" or "24") for a given nodeId.
   *  When provided, piece hover tooltips in draughts variants include the square coordinate. */
  public setCoordLabelProvider(fn: ((nodeId: string) => string | null) | null): void {
    this.coordLabelProvider = fn;
  }
  public isOnlineSpectator(): boolean {
    if (this.driver.mode !== "online") return false;
    return (this.driver as OnlineGameDriver).getPlayerId() === "spectator";
  }

  public getOnlinePublishedEvalScore(): import("../shared/onlineProtocol.ts").PublishedEvalScore | null {
    if (this.analysisMode || this.driver.mode !== "online") return null;
    return (this.driver as OnlineGameDriver).getPublishedEval()?.score ?? null;
  }

  public publishOnlineEvalScore(score: import("../shared/onlineProtocol.ts").PublishedEvalScore | null): void {
    if (!score || this.driver.mode !== "online" || this.isOnlineSpectator()) return;
    const remote = this.driver as OnlineGameDriver;
    const sig = `${hashGameState(this.state as any)}:${"cp" in score ? `cp:${score.cp}` : `mate:${score.mate}`}`;
    if (sig === this.lastPublishedOnlineEvalSignature) return;
    this.lastPublishedOnlineEvalSignature = sig;
    void remote.publishEvalRemote(score).catch(() => {
      // Ignore transient publish failures.
    });
  }
  private stickyToastKey: string | null = null;
  private stickyToastText: string | null = null;
  private stickyToastActions: Map<string, () => void> = new Map();
  private playbackToastSuppressed: boolean = false;
  private lastPublishedOnlineEvalSignature: string | null = null;

  private readonly cursorMarkedSelectableStacks: Set<string> = new Set();
  private readonly cursorMarkedTargets: Set<string> = new Set();

  private sfx: SfxManager | null = null;
  private lastPlayedMoveSfxSignature: string | null = null;
  private suppressOnlineGameplaySfxUntilTurnForColor: Player | null = null;

  private isColumnsChessRuleset(): boolean {
    return (this.state.meta?.rulesetId ?? "lasca") === "columns_chess";
  }

  private isChessLikeRuleset(): boolean {
    const r = this.state.meta?.rulesetId ?? "lasca";
    return r === "columns_chess" || r === "chess";
  }

  private isChessLikeRulesetId(rulesetId: string | null | undefined): boolean {
    const r = rulesetId ?? "lasca";
    return r === "columns_chess" || r === "chess";
  }

  private getCheckmateBadgeState(): { nodeId: string; losingColor: "W" | "B"; signature: string } | null {
    if (!this.isChessLikeRuleset()) return null;

    const terminal = checkCurrentPlayerLost(this.state);
    if (!terminal || !this.isCheckmateMessage(terminal.reason)) return null;

    const losingColor: "W" | "B" = terminal.winner === "W" ? "B" : "W";
    for (const [nodeId, stack] of this.state.board.entries()) {
      if (!Array.isArray(stack) || stack.length === 0) continue;
      const top = stack[stack.length - 1];
      if (top?.owner === losingColor && top?.rank === "K") {
        return {
          nodeId,
          losingColor,
          signature: `${hashGameState(this.state)}:${losingColor}:${nodeId}`,
        };
      }
    }

    return null;
  }

  isAnalysisMode(): boolean {
    return this.analysisMode;
  }

  addAnalysisModeChangeCallback(callback: (enabled: boolean) => void): void {
    this.analysisModeListeners.push(callback);
  }

  private fireAnalysisModeChange(enabled: boolean): void {
    for (const cb of this.analysisModeListeners) {
      try {
        cb(enabled);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[controller] analysis listener error", err);
      }
    }
  }

  setAnalysisMode(enabled: boolean): void {
    const nextEnabled = Boolean(enabled);
    if (nextEnabled === this.analysisMode) return;

    // Analysis mode is only supported for chess variants.
    // Disabling is always allowed.
    if (nextEnabled && !this.isChessLikeRuleset()) return;

    this.analysisMode = nextEnabled;

    // Analysis mode includes a sandboxed Move History timeline.
    // Clone the current driver history so Undo/Redo/Playback are local-only.
    if (this.analysisMode) {
      try {
        const snap = this.driver.exportHistorySnapshots();
        if (snap.states.length > 0 && snap.currentIndex >= 0 && snap.currentIndex < snap.states.length) {
          // Prefer the controller's current view for the current snapshot (it may
          // have transient UI hint edits like cleared last-move highlights).
          snap.states[snap.currentIndex] = this.state;
        }
        const hm = new HistoryManager();
        hm.replaceAll(snap.states, snap.notation, snap.currentIndex, snap.emtMs, snap.evals);
        this.analysisHistory = hm;
      } catch {
        this.analysisHistory = null;
      }
    } else {
      this.analysisHistory = null;
    }

    // Clear any in-progress interaction state; analysis should start clean.
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    this.currentTurnNodes = [];
    this.currentTurnHasCapture = false;
    this.clearSelection();

    if (!this.analysisMode) {
      // Leaving analysis: snap back to authoritative driver state.
      this.state = this.driver.getState();
      this.renderAuthoritative();
      this.recomputeMandatoryCapture();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
    }

    // Notify listeners after we've applied/cleared state so they can safely
    // react (e.g. temporarily disable bots while analysis is active).
    this.fireAnalysisModeChange(this.analysisMode);

    this.updatePanel();
    this.refreshSelectableCursors();

    // Switching analysis mode swaps the visible Move History source; prompt
    // listeners (move list UI, bots, etc) to refresh.
    this.fireHistoryChange("jump");
  }

  private isKingInCheckForCurrentRuleset(side: GameState["toMove"]): boolean {
    if (!this.isChessLikeRuleset()) return false;
    return this.isColumnsChessRuleset() ? isKingInCheckColumnsChess(this.state, side) : isKingInCheckChess(this.state, side);
  }

  private recomputeMandatoryCapture(constraints?: any, precomputedMoves?: Array<{ kind: string }>): void {
    // Columns Chess uses chess-like move freedom (no mandatory capture).
    if (this.isChessLikeRuleset()) {
      this.mandatoryCapture = false;
      return;
    }

    const moves = precomputedMoves ?? generateLegalMoves(this.state, constraints);
    this.mandatoryCapture = moves.some((m) => m.kind === "capture");
  }

  private lastOpponentPresent: boolean | null = null;
  private lastOpponentConnected: boolean | null = null;
  private everSawOpponentPresent: boolean = false;

  private static readonly TOAST_PREF_KEY = "lasca.opt.toasts";

  private replayEl: HTMLDivElement | null = null;
  private replaySnapshots: Array<{ stateVersion: number; ts: string; state: GameState; summary: string }> = [];
  private replayIndex: number = 0;
  private replaySavedState: { state: GameState; isGameOver: boolean } | null = null;
  private replayPlayersSummary: string | null = null;

  private debugEl: HTMLDivElement | null = null;

  public getStateForDebug(): GameState {
    return this.state;
  }

  setSfxManager(sfx: SfxManager | null): void {
    this.sfx = sfx;
  }

  private playSfx(name: SfxName): void {
    try {
      this.sfx?.play(name);
    } catch {
      // ignore
    }
  }

  private playGameplaySfx(name: Extract<SfxName, "move" | "capture" | "promote">, nextState?: GameState): void {
    if (this.driver.mode === "online" && this.suppressOnlineGameplaySfxUntilTurnForColor) {
      const effectiveState = nextState ?? this.state;
      if (effectiveState.toMove === this.suppressOnlineGameplaySfxUntilTurnForColor) {
        this.suppressOnlineGameplaySfxUntilTurnForColor = null;
      } else {
        return;
      }
    }
    this.playSfx(name);
  }

  private maybeClearOnlineResumeRecord(): void {
    if (this.driver.mode !== "online") return;
    if (!this.isGameOver && !Boolean((this.state as any)?.forcedGameOver)) return;

    const remote = this.driver as Partial<OnlineGameDriver>;
    if (typeof remote.getServerUrl !== "function" || typeof remote.getRoomId !== "function") return;
    const serverUrl = remote.getServerUrl();
    const roomId = remote.getRoomId();
    if (!serverUrl || !roomId) return;
    clearStoredOnlineResumeRecords(serverUrl, roomId);
  }

  private inferMoveSfx(prev: GameState, next: GameState): SfxName {
    // Heuristic: capture => piece count drops; promotion => officer count rises.
    let prevTotal = 0;
    let nextTotal = 0;
    let prevOfficers = 0;
    let nextOfficers = 0;

    for (const [, stack] of prev.board.entries()) {
      prevTotal += stack.length;
      for (const p of stack) if (p.rank === "O") prevOfficers += 1;
    }
    for (const [, stack] of next.board.entries()) {
      nextTotal += stack.length;
      for (const p of stack) if (p.rank === "O") nextOfficers += 1;
    }

    if (nextTotal < prevTotal) return "capture";
    if (nextOfficers > prevOfficers) return "promote";
    return "move";
  }

  private getMoveSfxSignature(prev: GameState, next: GameState): string {
    return [
      `prev:${hashGameState(prev)}`,
      `next:${hashGameState(next)}`,
      `prevForced:${String((prev as any)?.forcedGameOver?.reasonCode ?? "")}:${String((prev as any)?.forcedGameOver?.message ?? "")}`,
      `nextForced:${String((next as any)?.forcedGameOver?.reasonCode ?? "")}:${String((next as any)?.forcedGameOver?.message ?? "")}`,
    ].join("|");
  }

  private shouldPlayMoveTransitionSfx(prev: GameState, next: GameState): boolean {
    const signature = this.getMoveSfxSignature(prev, next);
    if (signature === this.lastPlayedMoveSfxSignature) return false;
    this.lastPlayedMoveSfxSignature = signature;
    return true;
  }

  private rememberMoveTransitionSfx(prev: GameState, next: GameState): void {
    this.lastPlayedMoveSfxSignature = this.getMoveSfxSignature(prev, next);
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    // Modern async clipboard API (works on https and usually localhost).
    try {
      const anyNav = typeof navigator !== "undefined" ? (navigator as any) : null;
      const clip = anyNav?.clipboard;
      if (clip && typeof clip.writeText === "function") {
        await clip.writeText(text);
        return true;
      }
    } catch {
      // fall through to legacy fallback
    }

    // Legacy fallback.
    if (typeof document === "undefined") return false;
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /** Public wrapper for page-level features (e.g., Copy FEN/PGN). */
  public async copyText(text: string): Promise<boolean> {
    return this.copyTextToClipboard(text);
  }

  /** Public wrapper for page-level features that want to respect the toast preference. */
  public toast(text: string, durationMs: number = 1400, opts?: { force?: boolean; allowDuringPlayback?: boolean }): void {
    this.showToast(text, durationMs, opts);
  }

  public setPlaybackToastSuppressed(suppressed: boolean): void {
    const next = Boolean(suppressed);
    if (this.playbackToastSuppressed === next) return;
    this.playbackToastSuppressed = next;

    if (!next) return;

    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    this.stickyToastKey = null;
    this.stickyToastText = null;

    const el = this.toastEl;
    if (el && typeof document !== "undefined" && document.body.contains(el)) {
      el.classList.remove("isVisible");
    }
  }

  private buildOnlineInviteLink(): string | null {
    if (this.driver.mode !== "online") return null;
    const remote = this.driver as OnlineGameDriver;
    const serverUrl = remote.getServerUrl();
    const roomId = remote.getRoomId();
    if (!serverUrl || !roomId) return null;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", "online");
      url.searchParams.set("server", serverUrl);
      url.searchParams.set("roomId", roomId);
      url.searchParams.set("join", "1");
      url.searchParams.delete("create");
      url.searchParams.delete("playerId");
      url.searchParams.delete("color");
      url.searchParams.delete("prefColor");
      url.searchParams.delete("visibility");
      url.searchParams.delete("watchToken");
      return url.toString();
    } catch {
      return null;
    }
  }

  private copyOnlineInviteLink(): void {
    const link = this.buildOnlineInviteLink();
    if (!link) return;
    void (async () => {
      const ok = await this.copyTextToClipboard(link);
      this.showToast(ok ? "Invite link copied" : "Clipboard copy failed", 1800);
    })();
  }

  private bindRoomIdCopyButton(): void {
    const btn = document.getElementById("copyRoomIdBtn") as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (this.driver.mode !== "online") return;
      const roomId = (this.driver as OnlineGameDriver).getRoomId();
      if (!roomId) return;
      await this.copyTextToClipboard(roomId);
    });
  }

  private bindWatchLinkCopyButton(): void {
    const btn = document.getElementById("copyWatchLinkBtn") as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (this.driver.mode !== "online") return;
      const remote = this.driver as OnlineGameDriver;

      const serverUrl = remote.getServerUrl();
      const roomId = remote.getRoomId();
      const playerId = remote.getPlayerId();
      if (!serverUrl || !roomId || !playerId || playerId === "spectator") return;

      try {
        const url = new URL(`/api/room/${encodeURIComponent(roomId)}/watchToken`, serverUrl);
        url.searchParams.set("playerId", playerId);
        const res = await fetch(url.toString());
        const data = (await res.json()) as GetRoomWatchTokenResponse;
        if (!res.ok || (data as any)?.error) {
          const msg = typeof (data as any)?.error === "string" ? (data as any).error : `HTTP ${res.status}`;
          this.showToast(`Failed to get watch link (${msg})`, 2200);
          return;
        }

        const tok = typeof (data as any)?.watchToken === "string" ? String((data as any).watchToken) : "";
        const vis = (data as any)?.visibility;
        if (vis !== "private" || !tok) {
          this.showToast("No watch link (room is public)", 1800);
          return;
        }

        // Share a direct link to the current variant page.
        const share = new URL(window.location.href);
        share.searchParams.set("mode", "online");
        share.searchParams.set("server", serverUrl);
        share.searchParams.set("roomId", roomId);
        share.searchParams.set("watchToken", tok);
        // Ensure the receiver opens as spectator.
        share.searchParams.delete("playerId");
        share.searchParams.delete("color");
        share.searchParams.delete("create");
        share.searchParams.delete("join");
        share.searchParams.delete("prefColor");
        share.searchParams.delete("visibility");

        const copiedOk = await this.copyTextToClipboard(share.toString());
        this.showToast(copiedOk ? "Copied spectate link" : "Failed to copy spectate link", 1800);
      } catch {
        this.showToast("Failed to get watch link", 1800);
      }
    });
  }

  private bindDebugCopyButton(): void {
    const btn = document.getElementById("copyDebugBtn") as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (this.driver.mode !== "online") return;
      const remote = this.driver as OnlineGameDriver;

      const serverUrl = remote.getServerUrl();
      const roomId = remote.getRoomId();
      const playerId = remote.getPlayerId();

      const debug = {
        app: { name: "lasca", version: "0.1.0" },
        whenIso: new Date().toISOString(),
        online: {
          serverUrl,
          roomId,
          playerId,
          playerColor: remote.getPlayerColor(),
          transport: this.getEffectiveOnlineTransportStatus(),
          rawTransport: this.onlineTransportStatus,
          authority: this.onlineAuthorityStatus,
          presence: remote.getPresence(),
        },
        game: {
          variantId: (this.state as any)?.meta?.variantId ?? null,
          rulesetId: (this.state as any)?.meta?.rulesetId ?? null,
          stateVersion: (this.state as any)?.stateVersion ?? null,
          toMove: this.state.toMove,
          phase: this.state.phase,
          isGameOver: this.isGameOver,
          forcedGameOver: (this.state as any)?.forcedGameOver ?? null,
        },
        ua: typeof navigator !== "undefined" ? (navigator as any).userAgent : null,
      };

      const text = JSON.stringify(debug, null, 2);

      // Always show the text box so users can manually copy/paste if clipboard fails.
      this.openDebugModal({ text, status: "Preparing debug info…" });

      const copiedOk = await this.copyTextToClipboard(text);

      // Keep the toast behavior stable: show copy outcome immediately.
      this.showToast(copiedOk ? "Copied debug info" : "Failed to copy debug info", 1600);

      // Fire-and-forget upload to server for per-room logging.
      void (async () => {
        let savedOk = false;
        let savedFileName: string | null = null;
        try {
          if (serverUrl && roomId) {
            const url = new URL(`/api/room/${encodeURIComponent(roomId)}/debug`, serverUrl);
            const res = await fetch(url.toString(), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ roomId, playerId, debug }),
            });

            const data = (await res.json()) as PostRoomDebugReportResponse;
            if (res.ok && (data as any)?.ok) {
              savedOk = true;
              savedFileName = (data as any).fileName ?? null;
            }
          }
        } catch {
          // ignore
        }

        const statusParts: string[] = [];
        statusParts.push(copiedOk ? "Copied to clipboard" : "Clipboard copy failed");
        statusParts.push(savedOk ? (savedFileName ? `Saved on server (${savedFileName})` : "Saved on server") : "Server save failed");
        this.openDebugModal({ text, status: statusParts.join(" · ") });
      })();
    });
  }

  private ensureDebugEl(): HTMLDivElement | null {
    if (typeof document === "undefined") return null;
    if (this.debugEl && document.body.contains(this.debugEl)) return this.debugEl;

    const styleId = "lasca-debug-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .lascaDebugBackdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 99999;
          display: none;
        }
        .lascaDebugBackdrop.isOpen { display: block; }
        .lascaDebugCard {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(92vw, 820px);
          max-height: min(86vh, 760px);
          overflow: hidden;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.90);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          padding: 14px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .lascaDebugTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .lascaDebugTitle { font-size: 14px; font-weight: 800; letter-spacing: 0.2px; }
        .lascaDebugStatus { font-size: 12px; opacity: 0.85; }
        .lascaDebugText {
          width: 100%;
          flex: 1;
          min-height: 220px;
          resize: none;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 10px;
          padding: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.35;
          outline: none;
          overflow: auto;
        }
        .lascaDebugActions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .lascaDebugBtn {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .lascaDebugBtn:hover { background: rgba(255,255,255,0.1); }
      `;
      document.head.appendChild(style);
    }

    const backdrop = document.createElement("div");
    backdrop.className = "lascaDebugBackdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "lascaDebugCard";

    const top = document.createElement("div");
    top.className = "lascaDebugTop";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "lascaDebugTitle";
    title.textContent = "Debug info";
    const status = document.createElement("div");
    status.className = "lascaDebugStatus";
    status.id = "lascaDebugStatus";
    status.textContent = "";
    left.appendChild(title);
    left.appendChild(status);

    const closeBtn = document.createElement("button");
    closeBtn.className = "lascaDebugBtn";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => this.closeDebugModal());

    top.appendChild(left);
    top.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.className = "lascaDebugText";
    textarea.id = "lascaDebugText";
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("wrap", "off");

    const actions = document.createElement("div");
    actions.className = "lascaDebugActions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "lascaDebugBtn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      const text = textarea.value || "";
      const ok = await this.copyTextToClipboard(text);
      this.showToast(ok ? "Copied debug info" : "Failed to copy debug info", 1600);
      if (!ok) {
        try {
          textarea.focus();
          textarea.select();
        } catch {
          // ignore
        }
      }
    });

    actions.appendChild(copyBtn);

    card.appendChild(top);
    card.appendChild(textarea);
    card.appendChild(actions);
    backdrop.appendChild(card);

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) this.closeDebugModal();
    });

    window.addEventListener("keydown", (ev) => {
      if (!this.debugEl) return;
      if (!this.debugEl.classList.contains("isOpen")) return;
      if (ev.key === "Escape") this.closeDebugModal();
    });

    document.body.appendChild(backdrop);
    this.debugEl = backdrop;
    return backdrop;
  }

  private openDebugModal(args: { text: string; status?: string }): void {
    const el = this.ensureDebugEl();
    if (!el) return;

    const ta = el.querySelector("#lascaDebugText") as HTMLTextAreaElement | null;
    const statusEl = el.querySelector("#lascaDebugStatus") as HTMLDivElement | null;
    if (ta) ta.value = args.text;
    if (statusEl) statusEl.textContent = args.status ?? "";

    el.classList.add("isOpen");
    try {
      ta?.focus();
      ta?.select();
    } catch {
      // ignore
    }
  }

  private closeDebugModal(): void {
    if (!this.debugEl) return;
    this.debugEl.classList.remove("isOpen");
  }

  private bindReplayButton(): void {
    const btn = document.getElementById("openReplayBtn") as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (this.driver.mode !== "online") return;
      if (!this.isGameOver) {
        this.showToast("Replay is available after game over", 1600);
        return;
      }
      await this.openReplayViewer();
    });
  }

  private ensureReplayEl(): HTMLDivElement | null {
    if (typeof document === "undefined") return null;
    if (this.replayEl && document.body.contains(this.replayEl)) return this.replayEl;

    const styleId = "lasca-replay-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .lascaReplayBackdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 99998;
          display: none;
        }
        .lascaReplayBackdrop.isOpen { display: block; }
        .lascaReplayCard {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(92vw, 720px);
          max-height: min(86vh, 720px);
          overflow: auto;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.86);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          padding: 14px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        .lascaReplayTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .lascaReplayTitle { font-size: 14px; font-weight: 800; letter-spacing: 0.2px; }
        .lascaReplayBtn {
          appearance: none;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .lascaReplayBtn:disabled { opacity: 0.4; cursor: not-allowed; }
        .lascaReplayBtn:hover { background: rgba(255,255,255,0.1); }
        .lascaReplayRow { display:flex; align-items:center; gap:8px; margin: 10px 0; }
        .lascaReplayMeta { color: rgba(255,255,255,0.7); font-size: 12px; }
        .lascaReplayList {
          margin-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.12);
          padding-top: 10px;
        }
        .lascaReplayItem {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
          color: rgba(255,255,255,0.88);
          padding: 6px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
      `;
      document.head.appendChild(style);
    }

    const backdrop = document.createElement("div");
    backdrop.className = "lascaReplayBackdrop";

    const card = document.createElement("div");
    card.className = "lascaReplayCard";
    card.innerHTML = `
      <div class="lascaReplayTop">
        <div class="lascaReplayTitle">Replay</div>
        <button class="lascaReplayBtn" type="button" data-action="close">Close</button>
      </div>
      <div class="lascaReplayMeta" data-el="players">—</div>
      <div class="lascaReplayMeta" data-el="summary">Loading…</div>
      <div class="lascaReplayRow">
        <button class="lascaReplayBtn" type="button" data-action="prev">Prev</button>
        <button class="lascaReplayBtn" type="button" data-action="next">Next</button>
        <span class="lascaReplayMeta" data-el="pos">—</span>
      </div>
      <div class="lascaReplayList" data-el="list"></div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) this.closeReplayViewer();
    });

    card.addEventListener("click", (ev) => {
      const el = ev.target as HTMLElement | null;
      const act = el?.getAttribute("data-action");
      if (act === "close") this.closeReplayViewer();
      if (act === "prev") this.replayStep(-1);
      if (act === "next") this.replayStep(1);
    });

    this.replayEl = backdrop;
    return backdrop;
  }

  private renderReplayUi(): void {
    const el = this.replayEl;
    if (!el) return;

    const playersEl = el.querySelector('[data-el="players"]') as HTMLElement | null;
    const summaryEl = el.querySelector('[data-el="summary"]') as HTMLElement | null;
    const posEl = el.querySelector('[data-el="pos"]') as HTMLElement | null;
    const listEl = el.querySelector('[data-el="list"]') as HTMLElement | null;
    const prevBtn = el.querySelector('[data-action="prev"]') as HTMLButtonElement | null;
    const nextBtn = el.querySelector('[data-action="next"]') as HTMLButtonElement | null;

    if (playersEl) {
      playersEl.textContent = (this.replayPlayersSummary || "").trim() || "—";
    }

    if (prevBtn) prevBtn.disabled = this.replayIndex <= 0;
    if (nextBtn) nextBtn.disabled = this.replayIndex >= this.replaySnapshots.length - 1;

    if (posEl) {
      posEl.textContent = this.replaySnapshots.length
        ? `${this.replayIndex + 1} / ${this.replaySnapshots.length}`
        : "—";
    }

    if (summaryEl) {
      if (this.replaySnapshots.length === 0) summaryEl.textContent = "No replay snapshots found.";
      else {
        const cur = this.replaySnapshots[this.replayIndex];
        summaryEl.textContent = `Showing v${cur.stateVersion} • ${cur.ts}`;
      }
    }

    if (listEl) {
      listEl.innerHTML = "";
      for (let i = 0; i < this.replaySnapshots.length; i++) {
        const s = this.replaySnapshots[i];
        const div = document.createElement("div");
        div.className = "lascaReplayItem";
        div.textContent = `${i === this.replayIndex ? ">" : " "} v${s.stateVersion} ${s.summary}`;
        listEl.appendChild(div);
      }
    }
  }

  private replayStep(delta: number): void {
    if (this.replaySnapshots.length === 0) return;
    const next = Math.max(0, Math.min(this.replaySnapshots.length - 1, this.replayIndex + delta));
    if (next === this.replayIndex) return;
    this.replayIndex = next;
    const snap = this.replaySnapshots[this.replayIndex];
    this.state = snap.state;
    this.renderAuthoritative();
    this.updatePanel();

    // If this snapshot is a forced terminal (e.g. resign), show a toast so the
    // reason is obvious while scrubbing the replay.
    const forcedMsg = (this.state as any)?.forcedGameOver?.message;
    if (typeof forcedMsg === "string" && forcedMsg.trim()) {
      this.showGameOverToast(forcedMsg);
    } else {
      // Allow terminal toasts to re-appear when stepping back/forward.
      this.resetGameOverToastDedupe();
    }
    this.renderReplayUi();
  }

  private async openReplayViewer(): Promise<void> {
    if (this.driver.mode !== "online") return;
    const remote = this.driver as OnlineGameDriver;
    const el = this.ensureReplayEl();
    if (!el) return;

    this.replaySavedState = { state: this.state, isGameOver: this.isGameOver };
    this.setInputEnabled(false);

    el.classList.add("isOpen");

    let events: any[] = [];
    try {
      const replay = await remote.fetchReplay({ limit: 5000 });
      if ((replay as any)?.error) throw new Error(String((replay as any).error));
      events = Array.isArray((replay as any)?.events) ? ((replay as any).events as any[]) : [];

      const byColor = (replay as any)?.displayNameByColor as Partial<Record<"W" | "B", string>> | undefined;
      const lightName = typeof byColor?.W === "string" ? byColor.W.trim() : "";
      const darkName = typeof byColor?.B === "string" ? byColor.B.trim() : "";
      this.replayPlayersSummary =
        lightName || darkName
          ? `Players: ${lightName ? `Light=${lightName}` : "Light=—"} • ${darkName ? `Dark=${darkName}` : "Dark=—"}`
          : null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Replay fetch failed";
      this.showToast(msg, 2000);
      this.closeReplayViewer();
      return;
    }

    const snaps: Array<{ stateVersion: number; ts: string; state: GameState; summary: string }> = [];
    for (const ev of events) {
      const w = (ev as any)?.snapshot;
      if (!w) continue;
      const st = deserializeWireGameState(w.state) as any;
      const stateVersion = Number(w.stateVersion ?? (ev as any)?.stateVersion ?? -1);
      const ts = typeof (ev as any)?.ts === "string" ? (ev as any).ts : "";
      const t = String((ev as any)?.type ?? "EVENT");
      const action = (ev as any)?.action ? ` ${String((ev as any).action)}` : "";
      const summary = `${t}${action}`;
      snaps.push({ stateVersion, ts, state: st as GameState, summary });
    }

    // Sort by stateVersion for deterministic stepping.
    snaps.sort((a, b) => a.stateVersion - b.stateVersion);

    this.replaySnapshots = snaps;
    this.replayIndex = Math.max(0, this.replaySnapshots.length - 1);

    if (this.replaySnapshots.length > 0) {
      const cur = this.replaySnapshots[this.replayIndex];
      this.state = cur.state;
      this.renderAuthoritative();
      this.updatePanel();

      // When opening the replay viewer, re-surface the terminal toast if the
      // game ended via a forced reason like resign.
      const forcedMsg = (this.state as any)?.forcedGameOver?.message;
      if (typeof forcedMsg === "string" && forcedMsg.trim()) {
        this.resetGameOverToastDedupe();
        this.showGameOverToast(forcedMsg);
      }
    }

    this.renderReplayUi();
  }

  private closeReplayViewer(): void {
    const el = this.replayEl;
    if (el) el.classList.remove("isOpen");

    const saved = this.replaySavedState;
    this.replaySavedState = null;
    this.replaySnapshots = [];
    this.replayIndex = 0;
    this.replayPlayersSummary = null;

    this.setInputEnabled(true);

    if (saved) {
      this.state = saved.state;
      this.isGameOver = saved.isGameOver;
      this.renderAuthoritative();
      this.updatePanel();
    }
  }

  private onlineHasOpponent(): boolean {
    if (this.driver.mode !== "online") return true;
    const remote = this.driver as OnlineGameDriver;
    const controlsColor = (remote as OnlineGameDriver & { controlsColor?: (color: Player) => boolean }).controlsColor;
    const selfId = remote.getPlayerId();
    const localColor = remote.getPlayerColor();
    const opponentColor = localColor === "W" ? "B" : localColor === "B" ? "W" : null;
    if (opponentColor && typeof controlsColor === "function" && controlsColor(opponentColor)) return true;
    if (!selfId || selfId === "spectator") return false;
    const presence = remote.getPresence();
    if (!presence) return false;
    const opponentId = Object.keys(presence).find((pid) => pid !== selfId) ?? null;
    return Boolean(opponentId);
  }

  private localMatchHasBotParticipant(): boolean {
    const whiteValue = (
      (document.getElementById("botWhiteSelect") as HTMLSelectElement | null)?.value ??
      (document.getElementById("aiWhiteSelect") as HTMLSelectElement | null)?.value ??
      "human"
    ).trim().toLowerCase();
    const blackValue = (
      (document.getElementById("botBlackSelect") as HTMLSelectElement | null)?.value ??
      (document.getElementById("aiBlackSelect") as HTMLSelectElement | null)?.value ??
      "human"
    ).trim().toLowerCase();
    return whiteValue !== "human" || blackValue !== "human";
  }

  private onlineMatchHasBotParticipant(): boolean {
    if (this.driver.mode !== "online") return false;
    const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
    const localColor = remote.getPlayerColor();
    const opponentColor = localColor === "W" ? "B" : localColor === "B" ? "W" : null;
    return opponentColor !== null && typeof remote.controlsColor === "function" && remote.controlsColor(opponentColor);
  }

  private drawOffersAllowed(): boolean {
    if (this.driver.mode === "online") return !this.onlineMatchHasBotParticipant();
    return !this.localMatchHasBotParticipant();
  }

  private maybeShowOnlineWaitingInviteToast(): void {
    // Only show a "room created" waiting toast before we've ever seen an opponent.
    if (this.driver.mode !== "online") {
      this.clearStickyToast("online_waiting_invite");
      return;
    }
    if (this.isGameOver) {
      this.clearStickyToast("online_waiting_invite");
      return;
    }

    const remote = this.driver as OnlineGameDriver;
    const selfId = remote.getPlayerId();
    if (!selfId || selfId === "spectator") {
      this.clearStickyToast("online_waiting_invite");
      return;
    }

    const shouldShow = !this.onlineHasOpponent() && this.everSawOpponentPresent === false;
    if (!shouldShow) {
      this.clearStickyToast("online_waiting_invite");
      return;
    }

    const key = "online_waiting_invite";

    // Don't clobber non-online sticky toasts (e.g. report issue).
    if (this.stickyToastKey && this.stickyToastKey !== key && !this.stickyToastKey.startsWith("online_")) {
      return;
    }

    this.setStickyToastAction(key, () => this.copyOnlineInviteLink());
    // Force: this is onboarding UX and should appear even if the user previously
    // disabled toasts in a different mode.
    this.showStickyToast(key, "Waiting for opponent… Tap to copy invite link", { force: true });
  }

  private isLocalPlayersTurn(): boolean {
    if (this.driver.mode !== "online") return true;
    const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
    const color = remote.getPlayerColor();
    // Per multiplayer checklist: no play allowed until both seats are filled.
    if (!this.onlineHasOpponent()) return false;
    if (typeof remote.controlsColor === "function") return remote.controlsColor(this.state.toMove as Player);
    if (!color) return false;
    return this.state.toMove === color;
  }

  private startOnlinePolling(): void {
    if (this.driver.mode !== "online") return;
    const remote = this.driver as OnlineGameDriver;
    if (this.onlinePollTimer) return;
    
    // Presence can change without a stateVersion bump.
    // Refresh panel so opponent shows Connected immediately (no click required).
    remote.onSseEvent("snapshot", (payload) => {
      if (payload?.presence || payload?.identity) this.updatePanel();
    });

    // Surface initial connection state.
    if (!this.onlineDidShowConnectingToast && !this.isGameOver) {
      this.onlineDidShowConnectingToast = true;
      this.showToast("Connecting…", 1400);
    }

    // Prefer realtime server push (WebSockets; falls back to SSE). Falls back to polling if unavailable.
    // Transport status events are emitted by the driver (WS primary).
    remote.onSseEvent("transport_status", (payload) => {
      if (this.isGameOver) return;
      const status = payload?.status === "reconnecting" ? "reconnecting" : "connected";
      if (this.onlineTransportStatus === status) return;
      let suppressTurnToast = false;
      this.onlineTransportStatus = status;
      this.updatePanel();

      if (status === "connected" && this.onlineAuthorityStatus === "fresh") {
        this.clearOnlineReconnectToastTimer();
        const didShowReconnectToast = this.onlineReconnectToastShown;
        this.onlineReconnectToastShown = false;
        this.clearStickyToast("online_reconnecting");
        if (didShowReconnectToast) {
          this.showToast("Reconnected", 1400);
          suppressTurnToast = true;
          this.lastToastToMove = null;
        }
        this.maybeShowOnlineWaitingInviteToast();
      }
      if (suppressTurnToast) return;
      this.maybeToastTurnChange();
    });

    remote.onSseEvent("authority_status", (payload) => {
      if (this.isGameOver) return;
      const status = payload?.status === "stale" ? "stale" : "fresh";
      if (this.onlineAuthorityStatus === status) return;
      const prevStatus = this.onlineAuthorityStatus;
      let suppressTurnToast = false;
      this.onlineAuthorityStatus = status;
      this.updatePanel();

      if (status === "stale") {
        this.scheduleOnlineReconnectToast();
      } else if (prevStatus === "stale") {
        this.clearOnlineReconnectToastTimer();
        const didShowReconnectToast = this.onlineReconnectToastShown;
        this.onlineReconnectToastShown = false;
        this.clearStickyToast("online_reconnecting");
        if (didShowReconnectToast) {
          this.showToast("Reconnected", 1400);
          suppressTurnToast = true;
        }
        this.lastToastToMove = null;
        this.maybeShowOnlineWaitingInviteToast();
      }

      if (suppressTurnToast) return;
      this.maybeToastTurnChange();
    });

    const startedRealtime = remote.startRealtime(() => {
      if (this.isGameOver) return;

      if (!this.onlineDidShowConnectedToast) {
        this.onlineDidShowConnectedToast = true;
        this.showToast("Connected", 1100);
      }
      this.onlineAuthorityStatus = "fresh";

      // If the user is exploring a local analysis line, don't clobber the sandbox position.
      // We'll resync when analysis is turned off.
      if (this.analysisMode) {
        const nextAuth = remote.getState();
        const forcedMsg = (nextAuth as any)?.forcedGameOver?.message as string | undefined;
        const terminal = checkCurrentPlayerLost(nextAuth);
        const isTerminal =
          Boolean(forcedMsg && String(forcedMsg).trim()) ||
          Boolean(terminal.winner) ||
          (this.isChessLikeRulesetId(nextAuth.meta?.rulesetId) && Boolean(terminal.reason));
        if (isTerminal) {
          this.setAnalysisMode(false);
        } else {
          this.updatePanel();
          this.fireHistoryChange("move");
        }
        return;
      }

      this.enqueueRemoteOnlineState(remote.getState());
    });

    if (startedRealtime) {
      this.onlineRealtimeEnabled = true;
    }

    // Keep a light polling safety net even when realtime is available.
    // This covers deployments where WS/SSE is accepted by the browser but delayed
    // or buffered by the network path.
    this.onlinePollTimer = window.setInterval(async () => {
      if (this.isGameOver) return;
      try {
        const updated = await remote.fetchLatest();
        if (!updated) return;

        if (this.analysisMode) {
          const nextAuth = remote.getState();
          const forcedMsg = (nextAuth as any)?.forcedGameOver?.message as string | undefined;
          const terminal = checkCurrentPlayerLost(nextAuth);
          const isTerminal =
            Boolean(forcedMsg && String(forcedMsg).trim()) ||
            Boolean(terminal.winner) ||
            (this.isChessLikeRulesetId(nextAuth.meta?.rulesetId) && Boolean(terminal.reason));
          if (isTerminal) {
            this.setAnalysisMode(false);
          } else {
            this.updatePanel();
            this.fireHistoryChange("move");
          }
          return;
        }

        this.enqueueRemoteOnlineState(remote.getState());
      } catch {
        // Ignore transient network errors; server is best-effort.
      }
    }, 750);
  }

  private clearOnlineReconnectToastTimer(): void {
    if (this.onlineReconnectToastTimer == null || typeof window === "undefined") return;
    window.clearTimeout(this.onlineReconnectToastTimer);
    this.onlineReconnectToastTimer = null;
  }

  private getEffectiveOnlineTransportStatus(): "connected" | "reconnecting" {
    return this.onlineAuthorityStatus === "stale" ? "reconnecting" : "connected";
  }

  private enqueueRemoteOnlineState(next: GameState): void {
    this.remoteOnlineApplyChain = this.remoteOnlineApplyChain
      .then(() => this.applyRemoteOnlineState(next))
      .catch(() => {
        // ignore remote apply errors; later authoritative updates can still recover
      });
  }

  private scheduleOnlineReconnectToast(): void {
    if (this.onlineReconnectToastShown || this.onlineReconnectToastTimer != null || typeof window === "undefined") return;
    this.onlineReconnectToastTimer = window.setTimeout(() => {
      this.onlineReconnectToastTimer = null;
      if (this.isGameOver || this.onlineAuthorityStatus !== "stale") return;

      const key = "online_reconnecting";
      if (!this.stickyToastKey || this.stickyToastKey === key || this.stickyToastKey.startsWith("online_")) {
        this.setStickyToastAction(key, null);
        this.showStickyToast(key, "Connection to server was lost — attempting to reconnect. Tap to dismiss.", {
          force: true,
        });
        this.onlineReconnectToastShown = true;
      }
      this.maybeShowReportIssueHintToast("Connection problem");
    }, GameController.ONLINE_RECONNECT_TOAST_DELAY_MS);
  }

  private isBothSidesAIFromPrefs(): boolean {
    // Observer mode heuristic: if both AI difficulty prefs are set to non-human.
    // Keep this local (no imports) to avoid cycles; just treat anything but "human" as AI.
    if (this.driver.mode === "online") return false;
    if (typeof localStorage === "undefined") return false;
    const w = localStorage.getItem("lasca.ai.white");
    const b = localStorage.getItem("lasca.ai.black");
    return Boolean(w && w !== "human" && b && b !== "human");
  }

  private readToastPref(): boolean {
    if (typeof localStorage === "undefined") return true;
    const raw = localStorage.getItem(GameController.TOAST_PREF_KEY);
    if (raw == null) return !this.isBothSidesAIFromPrefs(); // default ON, except AI-vs-AI observer mode
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return true;
  }

  private ensureToastEl(): HTMLDivElement | null {
    if (typeof document === "undefined") return null;
    const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
    const centerArea = document.getElementById("centerArea") as HTMLElement | null;
    const toastAnchor = boardWrap ?? centerArea ?? document.body;
    if (this.toastEl && document.body.contains(this.toastEl)) {
      if (this.toastEl.parentElement !== toastAnchor) {
        this.toastEl.parentElement?.removeChild(this.toastEl);
        toastAnchor.appendChild(this.toastEl);
        this.toastEl.classList.toggle("lascaToastWrap--viewport", toastAnchor === document.body);
      }
      return this.toastEl;
    }

    // Inject styles once.
    const styleId = "lasca-toast-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .lascaToastWrap {
          position: absolute;
          inset: 0;
          z-index: 99999;
          pointer-events: none;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
        }
        .lascaToastWrap--viewport {
          position: fixed;
        }
        .lascaToast {
          max-width: min(92vw, 560px);
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: rgba(255, 255, 255, 0.96);
          font-size: 16px;
          font-weight: 750;
          letter-spacing: 0.2px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
          opacity: 0;
          transform: scale(0.98);
          transition: opacity 140ms ease, transform 140ms ease;
          cursor: pointer;
          pointer-events: auto;
          user-select: none;
          -webkit-user-select: none;
        }
        .lascaToastWrap.isVisible { display: flex; }
        .lascaToastWrap.isVisible .lascaToast {
          opacity: 1;
          transform: scale(1);
        }
      `;
      document.head.appendChild(style);
    }

    const wrap = document.createElement("div");
    wrap.className = "lascaToastWrap";
  if (toastAnchor === document.body) wrap.classList.add("lascaToastWrap--viewport");
    wrap.setAttribute("aria-live", "polite");
    wrap.setAttribute("role", "status");

    const inner = document.createElement("div");
    inner.className = "lascaToast";
    inner.textContent = "";
    inner.setAttribute("role", "button");
    inner.tabIndex = 0;
    const dismiss = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();

      // If a timed toast is currently showing (possibly temporarily replacing
      // a sticky toast), clicking should dismiss the timed toast first.
      if (this.toastTimer) {
        window.clearTimeout(this.toastTimer);
        this.toastTimer = null;

        if (this.stickyToastKey && this.stickyToastText) {
          inner.textContent = this.stickyToastText;
          this.toastEl?.classList.add("isVisible");
        } else {
          this.toastEl?.classList.remove("isVisible");
        }
        return;
      }

      if (this.stickyToastKey) {
        const key = this.stickyToastKey;
        const action = this.stickyToastActions.get(key) ?? null;
        if (action) {
          try {
            action();
          } catch {
            // ignore
          }
          // If the action didn't replace/clear the sticky toast, clear it now.
          if (this.stickyToastKey === key) {
            this.clearStickyToast(key);
          }
        } else {
          this.clearStickyToast(key);
        }
        return;
      }

      // Non-sticky toast: allow click-to-dismiss.
      const el = this.toastEl;
      if (el) el.classList.remove("isVisible");
      if (this.toastTimer) window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    };
    inner.addEventListener("click", dismiss);
    inner.addEventListener("keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" || ke.key === " ") dismiss(e);
    });
    wrap.appendChild(inner);
    toastAnchor.appendChild(wrap);
    this.toastEl = wrap;
    return wrap;
  }

  private showToast(text: string, durationMs: number = 1400, opts?: { force?: boolean; allowDuringPlayback?: boolean }): void {
    if (this.playbackToastSuppressed && !opts?.allowDuringPlayback) return;
    if (!opts?.force && !this.readToastPref()) return;
    const el = this.ensureToastEl();
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;

    // If a sticky toast is active, temporarily show this toast and then
    // restore the sticky toast after the timer.

    inner.textContent = text;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);

    el.classList.add("isVisible");

    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null;

      if (this.stickyToastKey && this.stickyToastText) {
        inner.textContent = this.stickyToastText;
        el.classList.add("isVisible");
        return;
      }

      el.classList.remove("isVisible");
    }, Math.max(0, durationMs));
  }

  private isCheckmateMessage(message: string): boolean {
    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) return false;
    return /\bcheckmate\b/i.test(msg);
  }

  public showStickyToast(key: string, text: string, opts?: { force?: boolean; allowDuringPlayback?: boolean }): void {
    if (!key) return;
    if (this.playbackToastSuppressed && !opts?.allowDuringPlayback) return;
    if (!opts?.force && !this.readToastPref()) return;
    const el = this.ensureToastEl();
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;

    inner.textContent = text;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;
    el.classList.add("isVisible");
    this.stickyToastKey = key;
    this.stickyToastText = text;
  }

  public setStickyToastAction(key: string, action: (() => void) | null): void {
    if (!key) return;
    if (!action) {
      this.stickyToastActions.delete(key);
      return;
    }
    this.stickyToastActions.set(key, action);
  }

  public clearStickyToast(key: string): void {
    if (!key) return;
    if (this.stickyToastKey !== key) return;
    this.stickyToastKey = null;
    this.stickyToastText = null;

    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;

    const el = this.toastEl;
    if (el && typeof document !== "undefined" && document.body.contains(el)) {
      el.classList.remove("isVisible");
    }
  }

  private showGameOverToast(message: string): void {
    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) return;
    if (msg === this.lastGameOverToast) return;
    this.lastGameOverToast = msg;
    this.playSfx("gameOver");
    // Always show terminal-reason toasts even when toast notifications are disabled.
    // - Checkmate: important feedback for chess variants.
    // - Resign / forced endings: important context during move history playback/replay.
    const forcedCode = String((this.state as any)?.forcedGameOver?.reasonCode ?? "").toUpperCase();
    const force = this.isCheckmateMessage(msg) || forcedCode !== "";
    this.showToast(msg, 3200, { force });
  }

  private computeTerminalStatusMessage(): string {
    const forcedMsg = (this.state as any)?.forcedGameOver?.message;
    const terminal = checkCurrentPlayerLost(this.state);
    const fallback = getWinner(this.state);
    const baseMsg =
      typeof forcedMsg === "string" && forcedMsg.trim()
        ? forcedMsg.trim()
        : (terminal.reason || fallback.reason || "Game Over");

    if (this.isCheckmateMessage(baseMsg)) {
      const w = terminal.winner ?? fallback.winner;
      return w ? `Checkmate - ${this.sideLabel(w)} wins!` : "Checkmate";
    }

    return baseMsg;
  }

  private showGameOverStickyToast(message: string): void {
    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) return;

    const alreadyShowing =
      this.stickyToastKey === GameController.GAME_OVER_STICKY_TOAST_KEY && this.stickyToastText === msg;
    if (alreadyShowing && this.lastGameOverStickyToast === msg) return;

    this.lastGameOverStickyToast = msg;
    this.showStickyToast(GameController.GAME_OVER_STICKY_TOAST_KEY, msg, {
      force: true,
      allowDuringPlayback: true,
    });
  }

  private clearGameOverStickyToast(): void {
    this.lastGameOverStickyToast = null;
    this.clearStickyToast(GameController.GAME_OVER_STICKY_TOAST_KEY);
  }

  private resetGameOverToastDedupe(): void {
    // Allow terminal toasts (e.g. Checkmate/Stalemate) to re-appear when the
    // user navigates history (playback/undo/redo/jump) out of a game-over state.
    this.lastGameOverToast = null;
  }

  private readPendingDrawOffer(state: GameState | null | undefined): { offeredBy: "W" | "B"; nonce: number } | null {
    if (!state) return null;
    const rulesetId = state.meta?.rulesetId ?? "lasca";
    if (rulesetId === "checkers_us") {
      return ((state as any)?.checkersUsDraw?.pendingOffer as { offeredBy: "W" | "B"; nonce: number } | undefined) ?? null;
    }
    return ((state as any)?.pendingDrawOffer as { offeredBy: "W" | "B"; nonce: number } | undefined) ?? null;
  }

  private maybeNotifyOnlineDrawOfferResolution(prev: GameState | null | undefined, next: GameState): void {
    if (this.driver.mode !== "online") return;
    const online = this.driver as OnlineGameDriver;
    const localColor = online.getPlayerColor();
    if (localColor !== "W" && localColor !== "B") return;

    const nextOffer = this.readPendingDrawOffer(next);
    if (nextOffer?.offeredBy === localColor) {
      this.trackedOutgoingDrawOfferNonce = nextOffer.nonce;
      this.clearStickyToast(GameController.DRAW_OFFER_RESOLUTION_STICKY_TOAST_KEY);
      return;
    }

    const previousOffer = this.readPendingDrawOffer(prev);
    if (!previousOffer) return;
    if (previousOffer.offeredBy !== localColor) return;

    if (this.trackedOutgoingDrawOfferNonce == null) {
      this.trackedOutgoingDrawOfferNonce = previousOffer.nonce;
    }
    if (this.trackedOutgoingDrawOfferNonce !== previousOffer.nonce) return;
    if (nextOffer?.nonce === previousOffer.nonce) return;
    if (nextOffer) return;

    const accepted = String((next as any)?.forcedGameOver?.reasonCode ?? "").toUpperCase() === "DRAW_BY_AGREEMENT";
    this.setStickyToastAction(GameController.DRAW_OFFER_RESOLUTION_STICKY_TOAST_KEY, null);
    this.showStickyToast(
      GameController.DRAW_OFFER_RESOLUTION_STICKY_TOAST_KEY,
      accepted ? "Draw offer accepted" : "Draw offer declined",
      { force: true }
    );
    this.trackedOutgoingDrawOfferNonce = null;
  }

  private seedTrackedOutgoingDrawOfferFromState(state: GameState): void {
    if (this.driver.mode !== "online") {
      this.trackedOutgoingDrawOfferNonce = null;
      return;
    }
    const online = this.driver as OnlineGameDriver;
    const localColor = online.getPlayerColor();
    const pendingOffer = this.readPendingDrawOffer(state);
    if ((localColor !== "W" && localColor !== "B") || !pendingOffer || pendingOffer.offeredBy !== localColor) {
      this.trackedOutgoingDrawOfferNonce = null;
      return;
    }
    this.trackedOutgoingDrawOfferNonce = pendingOffer.nonce;
  }

  private async animateRemoteOnlineTransition(prev: GameState, next: GameState): Promise<void> {
    if (!this.animationsEnabled || this.driver.mode !== "online") return;

    const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
    const mover = prev.toMove;
    if (typeof remote.controlsColor === "function" && remote.controlsColor(mover)) return;

    const inferred = this.inferHistoryTransition(prev, next);
    const lm = next.ui?.lastMove;
    const from = inferred?.from ?? lm?.from ?? null;
    const to = inferred?.to ?? lm?.to ?? null;
    if (!from || !to || from === to) return;

    const movingGroup = this.piecesLayer.querySelector(`g.stack[data-node="${from}"]`) as SVGGElement | null;
    if (!movingGroup) return;

    const unitHopPx = computeUnitHopPx(this.svg, from);
    const fromPos = getNodeCenter(this.svg, from);
    const toPos = getNodeCenter(this.svg, to);
    let hops = 1;
    if (unitHopPx && unitHopPx > 0 && fromPos && toPos) {
      const dist = Math.sqrt((toPos.x - fromPos.x) ** 2 + (toPos.y - fromPos.y) ** 2);
      hops = Math.max(1, Math.round(dist / unitHopPx));
    }

    const animMs = Math.min(
      MAX_PLAYBACK_MOVE_ANIMATION_MS,
      DEFAULT_PLAYBACK_MOVE_ANIMATION_MS + PLAYBACK_MOVE_ANIMATION_EXTRA_HOP_MS * Math.max(0, hops - 1)
    );

    const countsLayer = ensureStackCountsLayer(this.svg);
    const prevTotal = Array.from(prev.board.values()).reduce((sum, stack) => sum + (stack?.length ?? 0), 0);
    const nextTotal = Array.from(next.board.values()).reduce((sum, stack) => sum + (stack?.length ?? 0), 0);
    const prevToStack = prev.board.get(to) ?? [];
    const looksLikeDirectCapture =
      nextTotal < prevTotal &&
      prevToStack.length > 0 &&
      prevToStack[prevToStack.length - 1]?.owner !== mover;

    const temporarilyHidden: Array<{ el: SVGElement; visibility: string }> = [];
    if (looksLikeDirectCapture) {
      const capturedGroup = this.piecesLayer.querySelector(`g.stack[data-node="${to}"]`) as SVGGElement | null;
      const capturedCount = countsLayer.querySelector(`g.stackCount[data-node="${to}"]`) as SVGGElement | null;
      for (const el of [capturedGroup, capturedCount]) {
        if (!el || el === movingGroup) continue;
        temporarilyHidden.push({ el, visibility: el.style.visibility });
        el.style.visibility = "hidden";
      }
    }

    const movingCount = countsLayer.querySelector(`g.stackCount[data-node="${from}"]`) as SVGGElement | null;
    try {
      await animateStack(
        this.svg,
        this.overlayLayer,
        from,
        to,
        movingGroup,
        animMs,
        movingCount ? [movingCount] : [],
        { easing: "linear", keepCloneAfter: true }
      );
    } catch (err) {
      for (const { el, visibility } of temporarilyHidden) {
        try {
          el.style.visibility = visibility;
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }

  private async applyRemoteOnlineState(next: GameState): Promise<void> {
    const previousState = this.state;
    const previousSelection = this.selected;
    const samePosition =
      hashGameState(previousState) === hashGameState(next) &&
      String((previousState as any)?.forcedGameOver?.reasonCode ?? "") ===
        String((next as any)?.forcedGameOver?.reasonCode ?? "") &&
      String((previousState as any)?.forcedGameOver?.message ?? "") ===
        String((next as any)?.forcedGameOver?.message ?? "");

    if (samePosition) {
      this.setState(next);
      this.renderAuthoritative();
      if (previousSelection && this.isOwnStack(previousSelection)) {
        this.selected = previousSelection;
        this.showSelection(previousSelection);
      }
      this.updatePanel();
      return;
    }

    // Any authoritative remote update invalidates local in-progress UI state.
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    this.currentTurnNodes = [];
    this.currentTurnHasCapture = false;
    this.clearSelection();

    try {
      await this.animateRemoteOnlineTransition(previousState, next);
    } catch (err) {
      if ((import.meta as any)?.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[controller] remote online animation failed; applying authoritative state without animation", err);
      }
    }

    this.deferTurnToastUntilAfterRender = true;
    try {
      this.setState(next);
      this.renderAuthoritative();
    } finally {
      this.deferTurnToastUntilAfterRender = false;
    }

    try {
      const kept = this.overlayLayer.querySelectorAll('[data-animating="true"]');
      for (const el of Array.from(kept)) {
        try {
          el.remove();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    this.flushDeferredTurnToast();
    this.fireHistoryChange("move");
  }

  private sideLabel(color: "W" | "B"): string {
    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    const boardSize = (this.state.meta as any)?.boardSize as number | undefined;
    const labels = getSideLabelsForRuleset(rulesetId, { boardSize });
    return color === "W" ? labels.W : labels.B;
  }

  private maybeToastTurnChange(): void {
    if (this.isGameOver) return;
    // Suppress turn toasts if the game is in a locked/startup state (e.g., before local play is started)
    if (this.shellStartupPlayLockEnabled) return;

    // If an AI/bot pause-resume sticky toast is active, don't flash a timed
    // generic turn-change toast underneath it.
    const suppressTurnToastForStickyResume =
      this.stickyToastKey === "chessbot_paused_turn" || this.stickyToastKey === "aiPausedTapResume";
    if (this.driver.mode === "online") {
      if (this.getEffectiveOnlineTransportStatus() !== "connected") return;

      // Online play: toast on side-to-move changes (and once on startup), but
      // localize the message using player color when available.
      const toMove = this.state.toMove;
      const shouldToast = this.lastToastToMove === null ? true : this.lastToastToMove !== toMove;
      this.lastToastToMove = toMove;
      const isChessLike = this.isChessLikeRuleset();
      const inCheck = isChessLike ? this.isKingInCheckForCurrentRuleset(toMove) : false;
      const checkPrefix = inCheck ? "Check! " : "";

      // Mandatory: always show "Check!" toasts, even when toast notifications are disabled.
      // Also, during Move History playback the side-to-move can repeat (e.g. jumping back
      // two plies), so dedupe on state hash, not just on toMove.
      if (inCheck) {
        const sig = `${hashGameState(this.state)}:${toMove}`;
        if (sig !== this.lastCheckToastSig) {
          this.lastCheckToastSig = sig;
          this.showToast(`${checkPrefix}${this.sideLabel(toMove)} to Play`, 1500, { force: true });
        }
        return;
      }
      this.lastCheckToastSig = null;

      if (suppressTurnToastForStickyResume) return;

      if (!shouldToast) return;
      const legal = isChessLike ? [] : this.getLegalMovesForTurn();
      const hasCapture = isChessLike ? false : legal.some((m) => m.kind === "capture");

      const localColor = (this.driver as OnlineGameDriver).getPlayerColor();
      if (localColor === "W" || localColor === "B") {
        const isLocalTurn = toMove === localColor;
        if (isLocalTurn) {
          if (isChessLike) {
            this.showToast(`${checkPrefix}${this.sideLabel(toMove)} to Play`, 1500);
          } else {
            this.showToast(hasCapture ? "Your turn — must capture" : "Your turn", 1500);
          }
          return;
        }
      }

      // If we don't know local color (spectator / reconnect edge), fall back
      // to explicit side-to-move messaging.
      this.showToast(
        isChessLike
          ? `${checkPrefix}${this.sideLabel(toMove)} to Play`
          : `${this.sideLabel(toMove)} to ${hasCapture ? "capture" : "move"}`,
        1500
      );
      return;
    }

    // Local play: toast whenever side-to-move changes (and once on startup).
    const toMove = this.state.toMove;
    const shouldToast = this.lastToastToMove === null ? true : this.lastToastToMove !== toMove;
    this.lastToastToMove = toMove;

    // Mandatory: always show "Check!" toasts, even when toast notifications are disabled.
    // During Move History playback, side-to-move can repeat across jumps.
    if (this.isChessLikeRuleset() && this.isKingInCheckForCurrentRuleset(toMove)) {
      const sig = `${hashGameState(this.state)}:${toMove}`;
      if (sig !== this.lastCheckToastSig) {
        this.lastCheckToastSig = sig;
        this.showToast(`Check! ${this.sideLabel(toMove)} to Play`, 1500, { force: true });
      }
      return;
    }
    this.lastCheckToastSig = null;

    if (shouldToast) {
      if (suppressTurnToastForStickyResume) return;
      if (this.isChessLikeRuleset()) {
        this.showToast(`${this.sideLabel(toMove)} to Play`, 1500);
      } else {
        const legal = this.getLegalMovesForTurn();
        const hasCapture = legal.some((m) => m.kind === "capture");
        this.showToast(`${this.sideLabel(toMove)} to ${hasCapture ? "capture" : "move"}`, 1500);
      }
    }
  }

  private drawPendingDamaCapturedMarks(): void {
    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    if (rulesetId !== "dama" && rulesetId !== "draughts_international") return;
    if (this.jumpedSquares.size === 0) return;

    const mode = getDamaCaptureRemovalMode(this.state);
    if (mode !== "end_of_sequence") return;

    for (const over of this.jumpedSquares) {
      // Mark pieces that have been captured but remain on-board until end-of-sequence.
      drawHighlightRing(this.overlayLayer, over, "#ff6b6b", 5);
    }
  }

  private showOpponentConnectionDetailsToast(): void {
    if (this.driver.mode !== "online") return;
    if (typeof document === "undefined") return;
    if (this.isGameOver) return;

    const key = "online_opponent_connection_details";

    // Toggle off if already showing.
    if (this.stickyToastKey === key) {
      this.clearStickyToast(key);
      return;
    }

    // Don't clobber non-online sticky toasts.
    if (this.stickyToastKey && !this.stickyToastKey.startsWith("online_")) return;

    const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
    const selfId = remote.getPlayerId();
    const localColor = remote.getPlayerColor();
    const opponentColor = localColor === "W" ? "B" : localColor === "B" ? "W" : null;
    const opponentIsLocal =
      opponentColor !== null && typeof remote.controlsColor === "function" && remote.controlsColor(opponentColor);
    const presence = remote.getPresence();
    if ((!presence || !selfId || selfId === "spectator") && !opponentIsLocal) {
      this.setStickyToastAction(key, null);
      this.showStickyToast(key, "Opponent status: —", { force: true });
      return;
    }

    const opponentId = Object.keys(presence).find((pid) => pid !== selfId) ?? null;
    const opp = opponentId ? (presence as any)[opponentId] : null;

    const identity = remote.getIdentity();
    const opponentNameRaw = opponentId ? identity?.[opponentId]?.displayName : null;
    const opponentName = typeof opponentNameRaw === "string" ? opponentNameRaw.trim() : "";
    const who = opponentName ? `Opponent (${opponentName})` : "Opponent";

    let msg = `${who} status: Waiting for opponent`;
    if (opponentIsLocal) {
      msg = `${who} status: Connected (local bot)`;
    } else if (opp) {
      if (opp.connected) {
        msg = `${who} status: Connected`;
      } else if (opp.inGrace && typeof opp.graceUntil === "string") {
        let whenText = opp.graceUntil;
        let remText = "";
        try {
          const untilMs = Date.parse(opp.graceUntil);
          if (Number.isFinite(untilMs)) {
            const d = new Date(untilMs);
            if (!Number.isNaN(d.getTime())) whenText = d.toLocaleTimeString();
            const remMs = Math.max(0, untilMs - Date.now());
            const remS = Math.ceil(remMs / 1000);
            remText = ` (about ${remS}s left)`;
          }
        } catch {
          // ignore
        }
        msg = `${who} status: Disconnected (grace until ${whenText}${remText})`;
      } else {
        msg = `${who} status: Disconnected`;
      }

      if (typeof opp.lastSeenAt === "string" && opp.lastSeenAt) {
        let lastSeen = opp.lastSeenAt;
        try {
          const d = new Date(opp.lastSeenAt);
          if (!Number.isNaN(d.getTime())) lastSeen = d.toLocaleString();
        } catch {
          // ignore
        }
        msg += `\nLast seen: ${lastSeen}`;
      }
    }

    this.setStickyToastAction(key, null);
    // Force=true because the user explicitly clicked to request this info.
    this.showStickyToast(key, msg, { force: true });
  }

  /**
   * Single render pipeline for authoritative state updates.
   *
   * Ordering contract:
   * 1) render board + pieces
   * 2) draw previews last
   * 3) safety belt: re-append preview-related layers so they stay on top
   */
  private renderAuthoritative(): void {
    // 1) board/pieces
    renderGameState(this.svg, this.piecesLayer, this.inspector, this.state, {
      getCoordLabel: this.coordLabelProvider,
    });

    // Persistent UI hint: last move origin/destination squares.
    try {
      if (!this.lastMoveHighlightsEnabled) {
        clearLastMoveSquares(this.overlayLayer);
      } else {
        const lm = this.state.ui?.lastMove;
        if (lm?.from && lm?.to) drawLastMoveSquares(this.overlayLayer, lm.from, lm.to, this.lastMoveHighlightStyle);
        else clearLastMoveSquares(this.overlayLayer);
      }
    } catch {
      // ignore
    }

    try {
      const badgeState = this.getCheckmateBadgeState();
      if (!badgeState) {
        clearCheckmateBadge(this.overlayLayer);
        this.lastCheckmateBadgeSignature = null;
      } else {
        const shouldAnimate = this.animationsEnabled && badgeState.signature !== this.lastCheckmateBadgeSignature;
        const existingBadge = this.svg.querySelector(".checkmateBadge") as SVGGElement | null;
        const existingNode = existingBadge?.getAttribute("data-node");
        const existingColor = existingBadge?.getAttribute("data-losing-color");
        const alreadyShowingSameBadge =
          !shouldAnimate &&
          existingBadge !== null &&
          existingNode === badgeState.nodeId &&
          existingColor === badgeState.losingColor;

        if (!alreadyShowingSameBadge) {
          drawCheckmateBadge(this.overlayLayer, badgeState.nodeId, badgeState.losingColor, {
            animate: shouldAnimate,
          });
        }
        this.lastCheckmateBadgeSignature = badgeState.signature;
      }
    } catch {
      clearCheckmateBadge(this.overlayLayer);
      this.lastCheckmateBadgeSignature = null;
    }

    // 2) previews (currently none; kept for move/stack preview rendering)
    // 3) keep preview layers on top (board coords / other layers might be appended later)
    const countsLayer = ensureStackCountsLayer(this.svg);
    const view = this.svg.querySelector("#boardView") as SVGGElement | null;
    const boardParent = view ?? this.svg;
    boardParent.appendChild(countsLayer);
    boardParent.appendChild(this.previewLayer);
    this.svg.appendChild(this.turnIndicatorLayer);
    this.svg.appendChild(this.opponentPresenceIndicatorLayer);

    this.refreshSelectableCursors();
  }

  public refreshView(): void {
    this.renderAuthoritative();
    this.updatePanel();
  }

  public setLastMoveHighlightsEnabled(enabled: boolean): void {
    this.lastMoveHighlightsEnabled = enabled;
    this.refreshView();
  }

  public setLastMoveHighlightStyle(style: LastMoveHighlightStyle): void {
    this.lastMoveHighlightStyle = style;
    if (this.lastMoveHighlightsEnabled) this.refreshView();
  }

  public setMoveHintStyle(style: MoveHintStyle): void {
    this.moveHintStyle = style;
    if (this.selected) this.showSelection(this.selected);
  }

  public setSelectionStyle(style: SelectionStyle): void {
    this.selectionStyle = style;
    if (this.selected) this.showSelection(this.selected);
  }

  public setHighlightSquaresEnabled(enabled: boolean): void {
    this.highlightSquaresEnabled = enabled;
    // If we have a selection, re-render it so the hint style updates immediately.
    if (this.selected) this.showSelection(this.selected);
  }

  private maybeShowReportIssueStickyToast(): void {
    // Back-compat: older builds used a sticky toast for this.
    // Keep the method name to avoid churn, but use a non-sticky, rate-limited hint.
    this.maybeShowReportIssueHintToast();
  }

  private maybeShowReportIssueHintToast(reason?: string): void {
    if (this.driver.mode !== "online") return;
    if (!this.readToastPref()) return;

    // Only show this hint on pages that actually include the "Copy Debug" affordance.
    const copyDebugBtn = document.getElementById("copyDebugBtn") as HTMLButtonElement | null;
    if (!copyDebugBtn) return;

    const remote = this.driver as OnlineGameDriver;
    const roomId = remote.getRoomId();
    if (!roomId) return;

    // Avoid spamming: at most once per room per minute.
    const now = Date.now();
    if (this.reportIssueHintShownForRoomId === roomId && now - this.reportIssueHintLastShownAtMs < 60_000) return;
    this.reportIssueHintShownForRoomId = roomId;
    this.reportIssueHintLastShownAtMs = now;

    const prefix = reason ? `${reason}. ` : "";
    this.showToast(`${prefix}Tip: reporting a bug? Online panel → ⓘ (Copy debug info)`, 4200);
  }

  private clearSelectionForInputLock(): void {
    // Clear only the *interactive* selection/targets.
    // Do NOT clear capture-chain constraints like `lockedCaptureFrom`/`jumpedSquares`,
    // otherwise the same piece can become capturable again during a chain.
    this.selected = null;
    this.currentTargets = [];
    this.currentMoves = [];
    clearOverlays(this.overlayLayer);
    clearPreviewLayer(this.previewLayer);
    this.drawPendingDamaCapturedMarks();
    this.updatePanel();
  }

  private captureDir(fromId: string, toId: string): { dr: number; dc: number } {
    const a = parseNodeId(fromId);
    const b = parseNodeId(toId);
    const dr = Math.sign(b.r - a.r);
    const dc = Math.sign(b.c - a.c);
    return { dr, dc };
  }

  constructor(
    svg: SVGSVGElement,
    piecesLayer: SVGGElement,
    inspector: ReturnType<typeof createStackInspector> | null,
    state: GameState,
    history: HistoryManager,
    driver?: GameDriver
  ) {
    this.svg = svg;
    this.piecesLayer = piecesLayer;
    this.inspector = inspector;
    this.overlayLayer = ensureOverlayLayer(svg);
    this.previewLayer = ensurePreviewLayer(svg);
    this.turnIndicatorLayer = ensureTurnIndicatorLayer(svg);
    this.opponentPresenceIndicatorLayer = ensureOpponentPresenceIndicatorLayer(svg);
    this.state = state;
    this.history = history;
    this.driver = driver ?? new LocalDriver(state, history);
    this.seedTrackedOutgoingDrawOfferFromState(this.state);
  }

  bind(): void {
    this.svg.style.userSelect = "none";
    (this.svg.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";
    this.svg.addEventListener("mousedown", (ev) => {
      if (ev.button === 0) ev.preventDefault();
    });
    this.svg.addEventListener("pointerdown", (ev) => this.onPointerDown(ev));
    this.svg.addEventListener("pointermove", (ev) => this.onPointerMove(ev));
    this.svg.addEventListener("pointerup", (ev) => void this.onPointerUp(ev));
    this.svg.addEventListener("pointercancel", () => this.cancelPointerInteraction());
    this.svg.addEventListener("click", (ev) => this.onClick(ev));

    // In online mode, the RemoteDriver may have already applied a server snapshot
    // during startup (create/join/resume). Sync controller state to the driver so
    // the board and history panel are consistent immediately.
    if (this.driver.mode === "online") {
      this.state = this.driver.getState();
      this.renderAuthoritative();
    }

    // Check for mandatory captures at game start
    this.recomputeMandatoryCapture();
    this.recomputeRepetitionCounts();
    this.updatePanel();
    this.refreshSelectableCursors();

    // If we entered an already-ended room, show the end-game status immediately.
    // This covers both server-forced end states and normal terminal positions.
    if (!this.isGameOver) {
      const forcedMsg = (this.state as any)?.forcedGameOver?.message as string | undefined;
      if (typeof forcedMsg === "string" && forcedMsg.trim()) {
        this.isGameOver = true;
        this.clearSelection();
        this.showBanner(forcedMsg, 0);
        this.showGameOverToast(forcedMsg);
        this.updatePanel();
        this.fireHistoryChange("gameOver");
      } else {
        this.checkAndHandleCurrentPlayerLost();
      }
    }

    // Initialize and (optionally) show a turn toast at startup.
    if (!this.isGameOver) {
      this.lastToastToMove = null;
      this.maybeToastTurnChange();
    }

    this.bindRoomIdCopyButton();
    this.bindWatchLinkCopyButton();
    this.bindDebugCopyButton();
    this.bindReplayButton();

    this.startOnlinePolling();
  }

  private isBlockedByDisconnectedOpponent(): boolean {
    if (this.driver.mode !== "online") return false;
    try {
      const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
      const selfId = remote.getPlayerId();
      const localColor = remote.getPlayerColor();
      const opponentColor = localColor === "W" ? "B" : localColor === "B" ? "W" : null;
      if (opponentColor && typeof remote.controlsColor === "function" && remote.controlsColor(opponentColor)) {
        return false;
      }
      const presence = remote.getPresence();
      if (presence && selfId && selfId !== "spectator") {
        const opponentId = Object.keys(presence).find((pid) => pid !== selfId) ?? null;
        const opp = opponentId ? (presence as any)[opponentId] : null;
        return Boolean(opp && opp.connected === false);
      }
    } catch {
      // If presence isn't available, don't block.
    }
    return false;
  }

  private refreshSelectableCursors(): void {
    // Clear any previous markings that we applied.
    for (const nodeId of this.cursorMarkedSelectableStacks) {
      const g = this.piecesLayer.querySelector(`g.stack[data-node="${nodeId}"]`) as SVGGElement | null;
      if (g && g.getAttribute("data-cursor") === "selectable") {
        g.style.cursor = "";
        g.removeAttribute("data-cursor");
      }
    }
    this.cursorMarkedSelectableStacks.clear();

    for (const nodeId of this.cursorMarkedTargets) {
      const el = document.getElementById(nodeId) as SVGElement | null;
      if (el && el.getAttribute("data-cursor") === "target") {
        (el as any).style.cursor = "";
        el.removeAttribute("data-cursor");
      }
    }
    this.cursorMarkedTargets.clear();

    // Only show the pointer cursor when input is actually meaningful.
    if (this.isGameOver) return;
    if (!this.inputEnabled) return;
    if (!this.analysisMode && !this.isLocalPlayersTurn()) return;
    if (!this.analysisMode && this.isBlockedByDisconnectedOpponent()) return;

    const legal = this.getLegalMovesForTurn();
    const selectableFrom = new Set<string>(
      legal.map((m) => (m as any).from).filter((v) => typeof v === "string") as string[]
    );

    // In analysis mode, pieces from the non-active side are also freely movable.
    if (this.analysisMode && !this.lockedCaptureFrom) {
      const otherSide: "W" | "B" = this.state.toMove === "W" ? "B" : "W";
      const otherLegal = generateLegalMoves({ ...this.state, toMove: otherSide });
      for (const m of otherLegal) {
        const from = (m as any).from;
        if (typeof from === "string") selectableFrom.add(from);
      }
    }

    for (const fromId of selectableFrom) {
      const g = this.piecesLayer.querySelector(`g.stack[data-node="${fromId}"]`) as SVGGElement | null;
      if (!g) continue;
      g.style.cursor = "pointer";
      g.setAttribute("data-cursor", "selectable");
      this.cursorMarkedSelectableStacks.add(fromId);
    }

    // When a piece is selected, also show a pointer over its legal destination squares.
    if (this.selected && this.currentTargets.length) {
      for (const toId of this.currentTargets) {
        const el = document.getElementById(toId) as SVGElement | null;
        if (!el) continue;
        (el as any).style.cursor = "pointer";
        el.setAttribute("data-cursor", "target");
        this.cursorMarkedTargets.add(toId);
      }
    }
  }

  /**
   * Theme switching can change which piece symbol IDs exist (e.g. Wooden variants).
   * Re-render the authoritative view so all <use href="#..."></use> references match the active theme.
   */
  refreshForThemeChange(): void {
    if (this.isGameOver) {
      // Still refresh so the final position renders under the new theme.
      this.renderAuthoritative();
      this.updatePanel();
      return;
    }

    this.renderAuthoritative();
    this.updatePanel();
  }

  setMoveHints(enabled: boolean): void {
    this.moveHintsEnabled = enabled;
    // If we have a selection, refresh it to show/hide hints
    if (this.selected) {
      this.showSelection(this.selected);
    }
  }

  setAnimations(enabled: boolean): void {
    this.animationsEnabled = enabled;
  }

  setHistoryChangeCallback(callback: (reason: HistoryChangeReason) => void): void {
    this.historyListeners = [callback];
  }

  addHistoryChangeCallback(callback: (reason: HistoryChangeReason) => void): void {
    this.historyListeners.push(callback);
  }

  addShellSnapshotChangeCallback(callback: () => void): void {
    this.shellSnapshotListeners.push(callback);
  }

  setLocalPlayerDisplayNames(displayNames: Partial<Record<Player, string | null | undefined>>): void {
    let didChange = false;
    for (const color of ["W", "B"] as const) {
      if (!(color in displayNames)) continue;
      const rawValue = displayNames[color];
      const nextValue = typeof rawValue === "string" ? rawValue.trim() : "";
      const prevValue = this.localShellDisplayNames[color] ?? "";
      if (nextValue) {
        if (prevValue !== nextValue) {
          this.localShellDisplayNames[color] = nextValue;
          didChange = true;
        }
        continue;
      }
      if (prevValue) {
        delete this.localShellDisplayNames[color];
        didChange = true;
      }
    }
    if (!didChange) return;
    this.updatePanel();
    this.fireShellSnapshotChange();
  }

  private checkAndHandleCurrentPlayerLost(): boolean {
    const result = checkCurrentPlayerLost(this.state);
    const isTerminal = Boolean(result.reason) || Boolean(result.winner);
    if (isTerminal) {
      if (this.isGameOver) return true;
      this.isGameOver = true;
      this.clearSelection();
      const msg = result.reason || "Game Over";
      this.showBanner(msg, 0);
      this.showGameOverToast(msg);
      this.updatePanel();
      this.fireHistoryChange("gameOver");
      return true;
    }
    return false;
  }

  private fireHistoryChange(reason: HistoryChangeReason): void {
    for (const cb of this.historyListeners) {
      try {
        cb(reason);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[controller] history listener error", err);
      }
    }
  }

  private fireShellSnapshotChange(): void {
    for (const cb of this.shellSnapshotListeners) {
      try {
        cb();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[controller] shell snapshot listener error", err);
      }
    }
  }

  private assignControllerState(next: GameState): void {
    this.state = next;
    this.fireShellSnapshotChange();
  }

  private flushDeferredTurnToast(): void {
    if (!this.pendingDeferredTurnToast) return;
    this.pendingDeferredTurnToast = false;
    this.maybeToastTurnChange();
  }

  isOver(): boolean {
    return this.isGameOver;
  }

  showStartupMessage(message: string): void {
    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) return;

    try {
      const elMsg = document.getElementById("statusMessage");
      if (elMsg) elMsg.textContent = msg;
    } catch {
      // ignore
    }

    // Toast is preference-gated inside showToast.
    this.showToast(msg, 3200);
  }

  setInputEnabled(enabled: boolean): void {
    const wasEnabled = this.lastInputEnabled;
    this.lastInputEnabled = enabled;
    this.inputEnabled = enabled;
    if (!enabled) {
      // Avoid leaving stale selection overlays when AI is running.
      this.clearSelectionForInputLock();
      // Also clear any pointer cursor hints while input is locked.
      this.refreshSelectableCursors();
      return;
    }

    // Local play: AI often disables input while thinking. When input returns,
    // show a prominent toast indicating who is up next.
    if (!wasEnabled && !this.isGameOver && this.driver.mode !== "online") {
      this.lastToastToMove = null;
      this.maybeToastTurnChange();
    }

    // Input re-enabled: re-apply cursor hints immediately.
    this.refreshSelectableCursors();
  }

  setShellStartupPlayLockEnabled(enabled: boolean): void {
    this.shellStartupPlayLockEnabled = enabled;
    if (enabled) {
      this.setInputEnabled(false);
      return;
    }
    this.refreshSelectableCursors();
  }

  isShellStartupPlayLockEnabled(): boolean {
    return this.shellStartupPlayLockEnabled;
  }

  getCaptureChainConstraints(): {
    lockedCaptureFrom: string | null;
    lockedCaptureDir: { dr: number; dc: number } | null;
    jumpedSquares: string[];
  } {
    return {
      lockedCaptureFrom: this.lockedCaptureFrom,
      lockedCaptureDir: this.lockedCaptureDir,
      jumpedSquares: Array.from(this.jumpedSquares),
    };
  }

  getLegalMovesForTurn(): Move[] {
    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    const isDamaStyle = rulesetId === "dama" || rulesetId === "draughts_international";
    const captureRemoval = isDamaStyle ? getDamaCaptureRemovalMode(this.state) : null;
    // All rulesets with multi-capture chains must prevent re-jumping the same square.
    const isDamasca = rulesetId === "damasca" || rulesetId === "damasca_classic" || rulesetId === "columns_draughts";
    const chainRules = rulesetId === "lasca" || isDamaStyle || isDamasca;
    // Only Dama/Damasca have capture-direction constraints (Officer zigzag).
    const chainHasDir = rulesetId === "dama" || isDamasca;
    const constraints = this.lockedCaptureFrom
      ? {
          forcedFrom: this.lockedCaptureFrom,
          ...(chainRules
            ? {
                excludedJumpSquares: this.jumpedSquares,
                ...(chainHasDir ? { lastCaptureDir: this.lockedCaptureDir ?? undefined } : {}),
              }
            : {}),
        }
      : undefined;
    const allLegal = generateLegalMoves(this.state, constraints);

    // Safety: if no legal moves exist, the position is terminal. This can occur
    // without a user action (e.g. AI-vs-AI), so ensure game-over messaging shows.
    // Avoid doing this mid-capture-chain (forcedFrom) or in analysis sandbox.
    if (!this.analysisMode && !this.isGameOver && !this.lockedCaptureFrom && allLegal.length === 0) {
      this.checkAndHandleCurrentPlayerLost();
    }

    if (this.lockedCaptureFrom) {
      return allLegal.filter((m) => m.kind === "capture");
    }

    return allLegal;
  }

  async playMove(move: Move): Promise<void> {
    if (this.isGameOver) return;
    if (this.shellStartupPlayLockEnabled) return;

    // Ensure move is still legal under the current turn constraints.
    const legal = this.getLegalMovesForTurn();
    const same = (a: Move, b: Move) => {
      if (a.kind !== b.kind) return false;
      if (a.from !== (b as any).from || (a as any).to !== (b as any).to) return false;
      if (a.kind === "capture") return (a as any).over === (b as any).over;
      return true;
    };
    if (!legal.some((m) => same(m, move))) return;

    await this.applyChosenMove(move, { animateLocalTravel: true });
  }

  undo(): void {
    if (this.analysisMode && !this.analysisHistory) return;
    const prevState = this.analysisMode ? this.analysisHistory!.undo() : this.driver.undo();
    if (prevState) {
      this.playSfx("undo");
      // Allow undoing out of terminal states.
      this.isGameOver = false;
      this.resetGameOverToastDedupe();
      this.clearGameOverStickyToast();

      // Cancel any transient UI timers from the previous position.
      if (this.bannerTimer) {
        window.clearTimeout(this.bannerTimer);
        this.bannerTimer = null;
      }
      if (this.remainderTimer) {
        window.clearTimeout(this.remainderTimer);
        this.remainderTimer = null;
      }

      this.state = prevState;
      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.clearSelection();
      this.renderAuthoritative();
      this.recomputeMandatoryCapture();
      this.updatePanel();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.maybeToastTurnChange();
      this.fireHistoryChange("undo");
    }
  }

  redo(): void {
    if (this.analysisMode && !this.analysisHistory) return;
    const nextState = this.analysisMode ? this.analysisHistory!.redo() : this.driver.redo();
    if (nextState) {
      this.playSfx("redo");
      // Allow redoing out of terminal states.
      this.isGameOver = false;
      this.resetGameOverToastDedupe();
      this.clearGameOverStickyToast();

      // Cancel any transient UI timers from the previous position.
      if (this.bannerTimer) {
        window.clearTimeout(this.bannerTimer);
        this.bannerTimer = null;
      }
      if (this.remainderTimer) {
        window.clearTimeout(this.remainderTimer);
        this.remainderTimer = null;
      }

      this.state = nextState;
      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.clearSelection();
      this.renderAuthoritative();
      this.recomputeMandatoryCapture();
      this.updatePanel();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.maybeToastTurnChange();
      this.fireHistoryChange("redo");
    }
  }

  jumpToHistory(index: number): void {
    if (this.analysisMode && !this.analysisHistory) return;
    const target = this.analysisMode ? this.analysisHistory!.jumpTo(index) : this.driver.jumpToHistory(index);
    if (!target) return;

    // Allow jumping out of terminal states.
    this.isGameOver = false;
    this.resetGameOverToastDedupe();
    this.clearGameOverStickyToast();

    // Cancel any transient UI timers.
    if (this.bannerTimer) {
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (this.remainderTimer) {
      window.clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }

    this.state = target;
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    this.currentTurnNodes = [];
    this.currentTurnHasCapture = false;
    this.clearSelection();
    this.renderAuthoritative();
    this.recomputeMandatoryCapture();
    this.updatePanel();
    this.recomputeRepetitionCounts();
    this.checkAndHandleCurrentPlayerLost();
    this.maybeToastTurnChange();
    this.fireHistoryChange("jump");
  }

  private inferHistoryTransition(
    prev: GameState,
    next: GameState
  ): { from: string; to: string } | null {
    const mover = prev.toMove;

    // Columns Chess needs a stronger inference than “top owner changed”.
    // In a capture that *liberates* a mixed-owner stack, the remainder that returns
    // to the mover’s origin can still have the mover on top, so top-owner heuristics
    // fail and playback looks like a snap (no inferred from/to).
    const rulesetId = prev.meta?.rulesetId ?? next.meta?.rulesetId;
    if (rulesetId === "columns_chess") {
      const pieceKey = (p: any): string => {
        const owner = String(p?.owner ?? "?");
        const rank = typeof p?.rank === "string" ? p.rank : "";
        return `${owner}:${rank}`;
      };

      const stacksEqual = (a: Stack | undefined, b: Stack | undefined): boolean => {
        const aa = a ?? [];
        const bb = b ?? [];
        if (aa.length !== bb.length) return false;
        for (let i = 0; i < aa.length; i++) {
          if (pieceKey(aa[i]) !== pieceKey(bb[i])) return false;
        }
        return true;
      };

      const topOwner = (s: Stack | undefined): "W" | "B" | null => {
        if (!s || s.length === 0) return null;
        return s[s.length - 1]?.owner ?? null;
      };

      let best: { from: string; to: string; score: number } | null = null;
      const prevEntries = Array.from(prev.board.entries());
      const nextEntries = Array.from(next.board.entries());

      for (const [fromId, fromStack] of prevEntries) {
        if (!fromStack || fromStack.length === 0) continue;
        if (topOwner(fromStack) !== mover) continue;

        // If the exact same stack is still on `from`, it didn’t move.
        if (stacksEqual(next.board.get(fromId), fromStack)) continue;

        for (const [toId, toStack] of nextEntries) {
          if (toId === fromId) continue;
          if (!toStack || toStack.length === 0) continue;
          if (topOwner(toStack) !== mover) continue;

          // Also require that `to` changed (otherwise identical-piece ambiguity explodes).
          if (stacksEqual(prev.board.get(toId), toStack)) continue;

          let score = -Infinity;

          // Quiet move: moved stack appears unchanged at destination.
          if (stacksEqual(toStack, fromStack)) {
            score = 10_000 + toStack.length;
          }

          // Capture: captured top piece gets stacked under mover (unshift), so
          // destination stack equals [captured, ...fromStack].
          if (toStack.length === fromStack.length + 1 && stacksEqual(toStack.slice(1) as unknown as Stack, fromStack)) {
            score = 20_000 + toStack.length;
          }

          if (score > -Infinity) {
            const prevToTop = topOwner(prev.board.get(toId));
            if (prevToTop === null) score += 200; // landing on empty squares is common for quiet moves
            else if (prevToTop !== mover) score += 120; // captures land on opponent squares
            else score -= 500; // avoid “moved onto own stack” ambiguity

            if (!best || score > best.score) best = { from: fromId, to: toId, score };
          }
        }
      }

      if (best) return { from: best.from, to: best.to };
      // Fall through to generic heuristics.
    }

    const topOwner = (s: Stack | undefined): "W" | "B" | null => {
      if (!s || s.length === 0) return null;
      return s[s.length - 1]?.owner ?? null;
    };

    const all = new Set<string>();
    for (const k of prev.board.keys()) all.add(k);
    for (const k of next.board.keys()) all.add(k);

    let bestFrom: string | null = null;
    let bestTo: string | null = null;
    let bestFromScore = -Infinity;
    let bestToScore = -Infinity;

    // Primary heuristic: ownership transition of the *top* piece.
    // - from: mover was on top in prev, but not in next
    // - to: mover was not on top in prev, but is on top in next
    for (const id of all) {
      const a = prev.board.get(id);
      const b = next.board.get(id);

      const aTop = topOwner(a);
      const bTop = topOwner(b);

      if (aTop === mover && bTop !== mover) {
        const score = (a?.length ?? 0);
        if (score > bestFromScore) {
          bestFromScore = score;
          bestFrom = id;
        }
      }

      if (aTop !== mover && bTop === mover) {
        const score = (b?.length ?? 0);
        if (score > bestToScore) {
          bestToScore = score;
          bestTo = id;
        }
      }
    }

    if (bestFrom && bestTo && bestFrom !== bestTo) return { from: bestFrom, to: bestTo };

    // Fallback: biggest length delta.
    let f: string | null = null;
    let t: string | null = null;
    let minDelta = 0;
    let maxDelta = 0;
    for (const id of all) {
      const aLen = (prev.board.get(id) ?? []).length;
      const bLen = (next.board.get(id) ?? []).length;
      const d = bLen - aLen;
      if (d < minDelta) {
        minDelta = d;
        f = id;
      }
      if (d > maxDelta) {
        maxDelta = d;
        t = id;
      }
    }

    if (f && t && f !== t) return { from: f, to: t };
    return null;
  }

  async jumpToHistoryAnimated(index: number, animationMs: number = DEFAULT_PLAYBACK_MOVE_ANIMATION_MS): Promise<void> {
    const prev = this.state;
    if (this.analysisMode && !this.analysisHistory) return;
    const target = this.analysisMode ? this.analysisHistory!.jumpTo(index) : this.driver.jumpToHistory(index);
    if (!target) return;

    // Allow jumping out of terminal states.
    this.isGameOver = false;
    this.resetGameOverToastDedupe();

    // Cancel any transient UI timers.
    if (this.bannerTimer) {
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (this.remainderTimer) {
      window.clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }

    // Clear interactive overlays before animating.
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    this.currentTurnNodes = [];
    this.currentTurnHasCapture = false;
    this.clearSelection();

    this.playGameplaySfx(this.inferMoveSfx(prev, target), target);

    // Animate using an inferred from/to (works for capture chains and multi-piece moves),
    // falling back to the target snapshot's last-move hint when available.
    if (this.animationsEnabled) {
      try {
        const inferred = this.inferHistoryTransition(prev, target);
        const lm = target.ui?.lastMove;
        const from = inferred?.from ?? lm?.from ?? null;
        const to = inferred?.to ?? lm?.to ?? null;

        if (from && to && from !== to) {
          // Show the highlight for the move we're about to animate.
          // (Render pipeline normally draws `state.ui.lastMove`, which updates only
          // after we render the target snapshot; during playback we want it visible
          // just before the animation begins.)
          try {
            if (this.lastMoveHighlightsEnabled) {
              clearLastMoveSquares(this.overlayLayer);
              drawLastMoveSquares(this.overlayLayer, from, to, this.lastMoveHighlightStyle);
            }
          } catch {
            // ignore
          }

          // Playback uses a hybrid duration so adjacent moves stay snappy while
          // longer slides get a little extra travel time without dragging.
          const unitHopPx = computeUnitHopPx(this.svg, from);
          const fromPos = getNodeCenter(this.svg, from);
          const toPos = getNodeCenter(this.svg, to);
          let hops = 1;
          if (unitHopPx && unitHopPx > 0 && fromPos && toPos) {
            const dist = Math.sqrt((toPos.x - fromPos.x) ** 2 + (toPos.y - fromPos.y) ** 2);
            hops = Math.max(1, Math.round(dist / unitHopPx));
          }
          const baseAnimMs = Math.max(0, Math.trunc(animationMs));
          const animMs = Math.min(
            MAX_PLAYBACK_MOVE_ANIMATION_MS,
            baseAnimMs + PLAYBACK_MOVE_ANIMATION_EXTRA_HOP_MS * Math.max(0, hops - 1)
          );

          const animations: Array<Promise<void>> = [];

          const movingGroup = this.piecesLayer.querySelector(`g.stack[data-node="${from}"]`) as SVGGElement | null;
          if (movingGroup) {
            const countsLayer = ensureStackCountsLayer(this.svg);
            const movingCount = countsLayer.querySelector(`g.stackCount[data-node="${from}"]`) as SVGGElement | null;
            animations.push(
              animateStack(
                this.svg,
                this.overlayLayer,
                from,
                to,
                movingGroup,
                animMs,
                movingCount ? [movingCount] : [],
                { easing: "linear", keepCloneAfter: true }
              )
            );
          }

          // Columns Chess: if a capture returned a remainder stack, animate it too.
          if (this.isColumnsChessRuleset()) {
            try {
              const mover = prev.toMove;
              const pieceKey = (p: any): string => {
                const owner = String(p?.owner ?? "?");
                const rank = typeof p?.rank === "string" ? p.rank : "";
                return `${owner}:${rank}`;
              };

              const stacksEqual = (a: Stack | undefined, b: Stack | undefined): boolean => {
                const aa = a ?? [];
                const bb = b ?? [];
                if (aa.length !== bb.length) return false;
                for (let i = 0; i < aa.length; i++) {
                  if (pieceKey(aa[i]) !== pieceKey(bb[i])) return false;
                }
                return true;
              };

              const topOwner = (s: Stack | undefined): "W" | "B" | null => {
                if (!s || s.length === 0) return null;
                return s[s.length - 1]?.owner ?? null;
              };

              // Detect a Columns Chess capture by the “captured piece stacked under mover” shape.
              const prevFromStack = prev.board.get(from) ?? [];
              const targetToStack = target.board.get(to) ?? [];
              const looksLikeCapture =
                prevFromStack.length > 0 &&
                targetToStack.length === prevFromStack.length + 1 &&
                topOwner(prevFromStack) === mover &&
                topOwner(targetToStack) === mover;

              // The remainder stack (if any) ends up on the mover's origin (`from`).
              const remainderAtFrom = target.board.get(from);
              if (looksLikeCapture && remainderAtFrom && remainderAtFrom.length > 0) {
                // Infer which square was captured (`over`) by matching:
                // prev[over].slice(0,-1) === target[from] (i.e., remainder moved back).
                let over: string | null = null;

                const prevToStack = prev.board.get(to);
                if (
                  prevToStack &&
                  prevToStack.length > 1 &&
                  topOwner(prevToStack) !== mover &&
                  stacksEqual(prevToStack.slice(0, prevToStack.length - 1) as unknown as Stack, remainderAtFrom)
                ) {
                  // Normal capture: land on the captured square.
                  over = to;
                } else {
                  // En passant or other rare capture forms: search for the matching captured stack.
                  for (const [id, a] of prev.board.entries()) {
                    if (id === from) continue;
                    if (!a || a.length <= 1) continue;
                    if (topOwner(a) === mover) continue;
                    if (stacksEqual(a.slice(0, a.length - 1) as unknown as Stack, remainderAtFrom)) {
                      over = id;
                      break;
                    }
                  }
                }

                if (over) {
                  const ghost = this.createGhostStackAtNode(over, remainderAtFrom);
                  if (ghost) {
                    // Double speed for the liberated stack so it doesn't dominate playback.
                    const remainderMs = Math.max(120, Math.round(animMs / 2));
                    animations.push(
                      animateStack(
                        this.svg,
                        this.overlayLayer,
                        over,
                        from,
                        ghost.stackG,
                        remainderMs,
                        ghost.extras,
                        // Keep the clone visible after it arrives so it doesn't vanish
                        // while the main stack is still animating.
                        { easing: "linear", keepCloneAfter: true }
                      )
                    );
                  }
                }
              }
            } catch {
              // ignore animation-only errors
            }
          }

          if (animations.length > 0) {
            await Promise.all(animations);
          }

        }
      } catch {
        // ignore animation-only errors
      }
    }

    this.state = target;
    this.renderAuthoritative();

    // Remove any kept animation clones only after the destination snapshot has rendered,
    // so the final landing frame stays visible without a handoff hitch.
    try {
      const kept = this.overlayLayer.querySelectorAll('[data-animating="true"]');
      for (const el of Array.from(kept)) {
        try {
          el.remove();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    this.recomputeMandatoryCapture();
    this.updatePanel();
    this.recomputeRepetitionCounts();
    this.checkAndHandleCurrentPlayerLost();
    this.maybeToastTurnChange();
    this.fireHistoryChange("jump");
  }

  canUndo(): boolean {
    if (this.analysisMode) return Boolean(this.analysisHistory?.canUndo() ?? false);
    return this.driver.canUndo();
  }

  canRedo(): boolean {
    if (this.analysisMode) return Boolean(this.analysisHistory?.canRedo() ?? false);
    return this.driver.canRedo();
  }

  getHistory(): ReturnType<HistoryManager["getHistory"]> {
    return this.analysisMode && this.analysisHistory ? this.analysisHistory.getHistory() : this.driver.getHistory();
  }

  getHistorySnapshots(): HistorySnapshots {
    return this.analysisMode && this.analysisHistory
      ? this.analysisHistory.exportSnapshots()
      : this.driver.exportHistorySnapshots();
  }

  exportMoveHistory(): string {
    const historyData = this.getHistory();
    const rulesetId = this.state.meta?.rulesetId;
    const isChessLike = rulesetId === "columns_chess" || rulesetId === "chess";
    const moves = historyData
      .filter((entry, idx) => idx > 0 && entry.notation) // Skip "Start" and entries without notation
      .map((entry, idx) => {
        const whoMoved = entry.toMove === "B" ? "W" : "B";
        const playerWhoMoved = isChessLike
          ? (whoMoved === "W" ? "white" : "black")
          : (whoMoved === "W" ? "Light" : "Dark");
        const moveNum = whoMoved === "B" ? Math.ceil((idx + 1) / 2) : Math.floor((idx + 2) / 2);
        return {
          moveNumber: moveNum,
          player: playerWhoMoved,
          notation: entry.notation,
        };
      });

    const variantId = this.state.meta?.variantId;

    let gameName = "Unknown";
    try {
      if (variantId) {
        gameName = getVariantById(variantId).displayName;
      } else if (rulesetId) {
        gameName = String(rulesetId);
      }
    } catch {
      // ignore and keep fallback
    }

    return JSON.stringify(
      {
        game: gameName,
        variantId,
        rulesetId,
        date: new Date().toISOString(),
        moves: moves,
      },
      null,
      2,
    );
  }

  setState(next: GameState): void {
    const prev = this.state;
    const prevWasGameOver = this.isGameOver;

    this.state = next;
    this.driver.setState(next);

    // Online snapshots (and other external pushes) should sound like the game is alive.
    // Only attempt when we have a real prior state.
    try {
      const didTurnFlip = prev?.toMove !== next.toMove;
      const didForcedOverAppear = Boolean((next as any)?.forcedGameOver) && !Boolean((prev as any)?.forcedGameOver);
      const onlineMoverIsLocal = (() => {
        if (this.driver.mode !== "online") return false;
        const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
        const localColor = remote.getPlayerColor();
        if (localColor === prev.toMove) return true;
        return typeof remote.controlsColor === "function" && remote.controlsColor(prev.toMove);
      })();
      if (!prevWasGameOver && !onlineMoverIsLocal && (didForcedOverAppear || didTurnFlip) && this.shouldPlayMoveTransitionSfx(prev, next)) {
        this.playGameplaySfx(this.inferMoveSfx(prev, next), next);
      }
    } catch {
      // ignore
    }
    
    // When loading a game, check if the current player has already lost
    const currentPlayerResult = checkCurrentPlayerLost(this.state);
    if (currentPlayerResult.reason || currentPlayerResult.winner) {
      this.isGameOver = true;
      const msg = currentPlayerResult.reason || "Game Over";
      this.playSfx("gameOver");
      this.showBanner(msg, 0);
      this.showGameOverToast(msg);
      this.maybeNotifyOnlineDrawOfferResolution(prev, next);
      this.updatePanel();
      this.pendingDeferredTurnToast = false;
      this.fireShellSnapshotChange();
      return;
    }
    
    // Game is not over, reset the flag
    this.isGameOver = false;
    this.resetGameOverToastDedupe();

    // Update repetition counts + draw rules from current history.
    this.syncRepetitionRules();

    // US Checkers: mutual-agreement draw offer flow.
    this.syncCheckersUsDrawOffers();
    this.maybeNotifyOnlineDrawOfferResolution(prev, next);
    
    // Check if captures are available for the current player
    this.recomputeMandatoryCapture();
    this.updatePanel();

    if (this.deferTurnToastUntilAfterRender) {
      this.pendingDeferredTurnToast = true;
    } else {
      this.maybeToastTurnChange();
    }
    this.fireShellSnapshotChange();
  }

  private syncCheckersUsDrawOffers(): void {
    if (this.isGameOver) {
      this.lastPromptedDrawOfferNonce = null;
      this.clearStickyToast(GameController.DRAW_OFFER_PENDING_STICKY_TOAST_KEY);
      if (this.drawOfferInputLockActive) {
        this.drawOfferInputLockActive = false;
        this.setInputEnabled(true);
      }
      return;
    }

    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    const pending: { offeredBy: "W" | "B"; nonce: number } | undefined =
      rulesetId === "checkers_us"
        ? ((this.state as any)?.checkersUsDraw?.pendingOffer as { offeredBy: "W" | "B"; nonce: number } | undefined)
        : ((this.state as any)?.pendingDrawOffer as { offeredBy: "W" | "B"; nonce: number } | undefined);

    if (!pending) {
      this.lastPromptedDrawOfferNonce = null;
      this.clearStickyToast(GameController.DRAW_OFFER_PENDING_STICKY_TOAST_KEY);
      if (this.drawOfferInputLockActive) {
        this.drawOfferInputLockActive = false;
        this.setInputEnabled(true);
      }
      return;
    }

    // Pause the game while the offer is pending.
    if (!this.drawOfferInputLockActive) {
      this.drawOfferInputLockActive = true;
      this.setInputEnabled(false);
    }

    // Only prompt once per offer.
    if (this.lastPromptedDrawOfferNonce === pending.nonce) return;

    if (this.driver.mode === "online") {
      const online = this.driver as OnlineGameDriver;
      const localColor = online.getPlayerColor();
      const selfId = online.getPlayerId();
      if (!localColor || selfId === "spectator") return;

      // Offerer does not get prompted.
      if (pending.offeredBy === localColor) {
        this.lastPromptedDrawOfferNonce = pending.nonce;
        this.clearStickyToast(GameController.DRAW_OFFER_PENDING_STICKY_TOAST_KEY);
        return;
      }

      this.lastPromptedDrawOfferNonce = pending.nonce;
      const offeredByLabel = this.sideLabel(pending.offeredBy);
      const key = GameController.DRAW_OFFER_PENDING_STICKY_TOAST_KEY;
      this.setStickyToastAction(key, () => {
        const accept = confirm(`${offeredByLabel} offers a draw. Accept?`);
        void this.respondDrawOfferOnline({ accept });
      });
      this.showStickyToast(key, `${offeredByLabel} offers a draw — tap to respond`, { force: true });
      return;
    }

    // Local/hotseat: prompt immediately.
    this.lastPromptedDrawOfferNonce = pending.nonce;
    const offeredByLabel = this.sideLabel(pending.offeredBy);
    const accept = confirm(`${offeredByLabel} offers a draw. Accept?`);
    this.respondDrawOfferLocal({ accept });
  }

  private async respondDrawOfferOnline(args: { accept: boolean }): Promise<void> {
    if (this.driver.mode !== "online") return;
    try {
      const next = await (this.driver as OnlineGameDriver).respondDrawOfferRemote({ accept: args.accept });
      this.clearSelection();
      this.setState(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Respond draw offer failed";
      this.showToast(msg, 1600);
      // Allow re-prompt if the offer is still pending.
      this.lastPromptedDrawOfferNonce = null;
    }
  }

  private respondDrawOfferLocal(args: { accept: boolean }): void {
    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    const prev = this.state as any;

    if (rulesetId === "checkers_us") {
      const draw = ensureCheckersUsDraw(prev.checkersUsDraw);
      if (!draw.pendingOffer) return;
      draw.pendingOffer = undefined;

      if (args.accept) {
        this.state = {
          ...prev,
          checkersUsDraw: draw,
          forcedGameOver: {
            winner: null,
            reasonCode: "DRAW_BY_AGREEMENT",
            message: "Draw by mutual agreement",
          },
        };
      } else {
        this.setState({ ...prev, checkersUsDraw: draw });
        return;
      }
    } else {
      if (!prev.pendingDrawOffer) return;

      if (args.accept) {
        this.state = {
          ...prev,
          pendingDrawOffer: undefined,
          forcedGameOver: {
            winner: null,
            reasonCode: "DRAW_BY_AGREEMENT",
            message: "Draw by mutual agreement",
          },
        };
      } else {
        this.setState({ ...prev, pendingDrawOffer: undefined });
        return;
      }
    }

    // Accepted: finalize as draw.
    this.driver.setState(this.state);

    const snap = this.driver.exportHistorySnapshots();
    if (snap.states.length > 0 && snap.currentIndex >= 0 && snap.currentIndex < snap.states.length) {
      snap.states[snap.currentIndex] = this.state;
      this.driver.replaceHistory(snap);
    }

    this.isGameOver = true;
    this.clearSelection();
    this.showBanner("Draw by mutual agreement", 0);
    this.showGameOverToast("Draw by mutual agreement");
    this.updatePanel();
    this.fireHistoryChange("gameOver");
  }

  async offerDraw(): Promise<void> {
    if (this.isGameOver) return;

    if (!this.drawOffersAllowed()) {
      this.showToast("Draw offers are disabled when playing a bot", 1600);
      return;
    }

    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    const isCheckersUs = rulesetId === "checkers_us";

    if (isCheckersUs) {
      const pending = (this.state as any)?.checkersUsDraw?.pendingOffer;
      if (pending) {
        this.showToast("Draw offer already pending", 1600);
        return;
      }
    } else {
      const pending = (this.state as any)?.pendingDrawOffer;
      if (pending) {
        this.showToast("Draw offer already pending", 1600);
        return;
      }
    }

    if (this.driver.mode === "online") {
      const online = this.driver as OnlineGameDriver;
      const selfId = online.getPlayerId();
      const localColor = online.getPlayerColor();
      if (!selfId || selfId === "spectator" || !localColor) {
        this.showToast("Only seated players can offer a draw", 1600);
        return;
      }
      if (isCheckersUs && this.state.toMove !== localColor) {
        this.showToast("You can only offer a draw on your turn", 1600);
        return;
      }

      try {
        const next = await online.offerDrawRemote();
        this.clearSelection();
        this.setState(next);
        this.showToast("Draw offer sent", 1200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Offer draw failed";
        this.showToast(msg, 1600);
      }
      return;
    }

    // Local/hotseat.
    const prev = this.state as any;

    if (isCheckersUs) {
      if (this.state.toMove !== "W" && this.state.toMove !== "B") return;
      const draw = ensureCheckersUsDraw(prev.checkersUsDraw);
      const mover = this.state.toMove as "W" | "B";
      const currentTurns = Math.max(0, Math.floor(draw.turnCount?.[mover] ?? 0));
      const lastTurn = Math.floor(draw.lastOfferTurn?.[mover] ?? -999);
      if (currentTurns - lastTurn < 3) {
        this.showToast("You can only offer a draw once every 3 moves", 1600);
        return;
      }
      draw.lastOfferTurn[mover] = currentTurns;
      draw.pendingOffer = { offeredBy: mover, nonce: Date.now() & 0x7fffffff };
      this.setState({ ...prev, checkersUsDraw: draw });
    } else {
      if (this.state.toMove !== "W" && this.state.toMove !== "B") return;
      const mover = this.state.toMove as "W" | "B";
      this.setState({ ...prev, pendingDrawOffer: { offeredBy: mover, nonce: Date.now() & 0x7fffffff } });
    }
  }

  getState(): GameState {
    return this.state;
  }

  private formatPresenceDeadline(raw: string | null | undefined): string | null {
    if (typeof raw !== "string" || raw.trim().length === 0) return null;
    try {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString();
    } catch {
      // ignore
    }
    return raw;
  }

  private getPresenceStatus(args: {
    transportStatus?: "connected" | "reconnecting";
    presenceEntry?: { connected?: boolean; inGrace?: boolean; graceUntil?: string } | null;
    waiting?: boolean;
    spectating?: boolean;
  }): { status: PresenceState; text: string } {
    if (args.spectating) return { status: "spectating", text: "Spectating" };
    if (args.transportStatus === "reconnecting") return { status: "reconnecting", text: "Reconnecting" };
    if (args.waiting) return { status: "waiting", text: "Waiting" };

    const entry = args.presenceEntry;
    if (!entry) return { status: "waiting", text: "Waiting" };
    if (entry.connected) return { status: "connected", text: "Connected" };
    if (entry.inGrace) return { status: "in_grace", text: "Rejoining" };
    return { status: "disconnected", text: "Disconnected" };
  }

  private createShellPlayerIdentity(args: {
    color: Player;
    displayName: string;
    sideLabel: string;
    roleLabel: string;
    detailText: string;
    status: PresenceState;
    statusText: string;
    avatarUrl?: string | null;
    countryCode?: string | null;
    countryName?: string | null;
    isLocal: boolean;
    isActiveTurn?: boolean;
  }): PlayerIdentity {
    return {
      color: args.color,
      displayName: args.displayName,
      sideLabel: args.sideLabel,
      roleLabel: args.roleLabel,
      detailText: args.detailText,
      status: args.status,
      statusText: args.statusText,
      avatarUrl: args.avatarUrl ?? null,
      countryCode: args.countryCode ?? null,
      countryName: args.countryName ?? null,
      isLocal: args.isLocal,
      isActiveTurn: args.isActiveTurn ?? (this.state.toMove === args.color),
    };
  }

  private getShellTerminalStatus(): { statusText: string; detailText: string } | null {
    const isTerminal = this.isGameOver || Boolean((this.state as any)?.forcedGameOver);
    if (!isTerminal) return null;

    return {
      statusText: "Game over",
      detailText: this.computeTerminalStatusMessage(),
    };
  }

  private resolveShellAvatarUrl(serverUrl: string | null, rawAvatarUrl: string | null | undefined): string | null {
    const avatarUrl = typeof rawAvatarUrl === "string" ? rawAvatarUrl.trim() : "";
    if (!avatarUrl) return null;
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    if (!serverUrl) return avatarUrl;
    try {
      return new URL(avatarUrl, `${serverUrl.replace(/\/$/, "")}/`).toString();
    } catch {
      return avatarUrl;
    }
  }

  private resolveLocalShellDisplayName(color: Player): string {
    return this.localShellDisplayNames[color] ?? this.sideLabel(color);
  }

  getPlayerShellSnapshot(): PlayerShellSnapshot {
    const pendingDrawOffer = this.readPendingDrawOffer(this.state);
    const terminalStatus = this.getShellTerminalStatus();
    const hasTerminalStatus = Boolean(terminalStatus);
    const defaultPlayers: Record<Player, PlayerIdentity> = {
      W: this.createShellPlayerIdentity({
        color: "W",
        displayName: this.resolveLocalShellDisplayName("W"),
        sideLabel: this.sideLabel("W"),
        roleLabel: "Local match",
        detailText: terminalStatus?.detailText ?? (this.state.toMove === "W" ? "To move." : "Waiting for the next turn."),
        status: "offline",
        statusText: terminalStatus?.statusText ?? "Local play",
        isLocal: false,
        isActiveTurn: !hasTerminalStatus && this.state.toMove === "W",
      }),
      B: this.createShellPlayerIdentity({
        color: "B",
        displayName: this.resolveLocalShellDisplayName("B"),
        sideLabel: this.sideLabel("B"),
        roleLabel: "Local match",
        detailText: terminalStatus?.detailText ?? (this.state.toMove === "B" ? "To move." : "Waiting for the next turn."),
        status: "offline",
        statusText: terminalStatus?.statusText ?? "Local play",
        isLocal: false,
        isActiveTurn: !hasTerminalStatus && this.state.toMove === "B",
      }),
    };

    if (this.driver.mode !== "online") {
      return {
        mode: "local",
        transportStatus: "connected",
        serverUrl: null,
        viewerColor: null,
        viewerRole: "offline",
        players: defaultPlayers,
      };
    }

    const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
    const selfId = remote.getPlayerId();
    const localColor = remote.getPlayerColor();
    const serverUrl = remote.getServerUrl();
    const presence = remote.getPresence();
    const identity = remote.getIdentity();
    const identityByColor = remote.getIdentityByColor();
    const viewerRole = selfId === "spectator" ? "spectator" : "player";

    if (!selfId || selfId === "spectator" || !localColor) {
      const whiteIdentity = identityByColor?.W ?? null;
      const blackIdentity = identityByColor?.B ?? null;
      const hasSeatMapping = Boolean(whiteIdentity || blackIdentity);
      const seatCount = presence ? Object.keys(presence).length : 0;
      const waitingText = seatCount === 0
        ? "Waiting for players to join."
        : hasSeatMapping
          ? "Watching the live game."
          : "Seat mapping is still loading.";
      return {
        mode: "online",
        transportStatus: this.getEffectiveOnlineTransportStatus(),
        serverUrl: remote.getServerUrl(),
        viewerColor: null,
        viewerRole: selfId === "spectator" ? "spectator" : "player",
        players: {
          W: this.createShellPlayerIdentity({
            color: "W",
            displayName: whiteIdentity?.displayName?.trim() || this.sideLabel("W"),
            sideLabel: this.sideLabel("W"),
            roleLabel: viewerRole === "spectator" ? "Spectator view" : "Seat pending",
            detailText: terminalStatus?.detailText ?? waitingText,
            ...this.getPresenceStatus({ waiting: !hasSeatMapping, spectating: selfId === "spectator" }),
            statusText: terminalStatus?.statusText ?? this.getPresenceStatus({ waiting: !hasSeatMapping, spectating: selfId === "spectator" }).text,
            avatarUrl: this.resolveShellAvatarUrl(serverUrl, whiteIdentity?.avatarUrl),
            countryCode: whiteIdentity?.countryCode ?? null,
            countryName: whiteIdentity?.countryName ?? null,
            isLocal: false,
            isActiveTurn: !hasTerminalStatus && this.state.toMove === "W",
          }),
          B: this.createShellPlayerIdentity({
            color: "B",
            displayName: blackIdentity?.displayName?.trim() || this.sideLabel("B"),
            sideLabel: this.sideLabel("B"),
            roleLabel: viewerRole === "spectator" ? "Spectator view" : "Seat pending",
            detailText: terminalStatus?.detailText ?? waitingText,
            ...this.getPresenceStatus({ waiting: !hasSeatMapping, spectating: selfId === "spectator" }),
            statusText: terminalStatus?.statusText ?? this.getPresenceStatus({ waiting: !hasSeatMapping, spectating: selfId === "spectator" }).text,
            avatarUrl: this.resolveShellAvatarUrl(serverUrl, blackIdentity?.avatarUrl),
            countryCode: blackIdentity?.countryCode ?? null,
            countryName: blackIdentity?.countryName ?? null,
            isLocal: false,
            isActiveTurn: !hasTerminalStatus && this.state.toMove === "B",
          }),
        },
      };
    }

    const opponentColor: Player = localColor === "W" ? "B" : "W";
    const selfPresence = presence?.[selfId] ?? null;
    const opponentId = presence ? (Object.keys(presence).find((pid) => pid !== selfId) ?? null) : null;
    const opponentPresence = opponentId ? (presence?.[opponentId] ?? null) : null;
    const opponentIsLocal = typeof remote.controlsColor === "function" && remote.controlsColor(opponentColor);

    const selfIdentity = identity?.[selfId] ?? identityByColor?.[localColor] ?? null;
    const selfNameRaw = identity?.[selfId]?.displayName ?? selfIdentity?.displayName;
    const selfName = typeof selfNameRaw === "string" && selfNameRaw.trim().length > 0
      ? selfNameRaw.trim()
      : "You";

    const opponentIdentity = opponentId
      ? (identity?.[opponentId] ?? identityByColor?.[opponentColor] ?? null)
      : (identityByColor?.[opponentColor] ?? null);
    const opponentNameRaw = (opponentId ? identity?.[opponentId]?.displayName : null) ?? opponentIdentity?.displayName;
    const opponentName = typeof opponentNameRaw === "string" && opponentNameRaw.trim().length > 0
      ? opponentNameRaw.trim()
      : this.sideLabel(opponentColor);

    const selfStatus = this.getPresenceStatus({
      transportStatus: this.getEffectiveOnlineTransportStatus(),
      presenceEntry: selfPresence,
    });
    const opponentStatus = this.getPresenceStatus({
      waiting: !opponentPresence && !opponentIsLocal,
      presenceEntry: opponentIsLocal ? { connected: true, lastSeenAt: new Date().toISOString() } : opponentPresence,
    });

    const selfGraceUntil = this.formatPresenceDeadline(selfPresence?.graceUntil);
    const opponentGraceUntil = this.formatPresenceDeadline(opponentPresence?.graceUntil);

    let selfDetail = this.onlineAuthorityStatus === "stale"
      ? "Re-establishing the room connection."
      : this.state.toMove === localColor
        ? "Your turn."
        : "Waiting for the opponent move.";

    let opponentDetail = this.state.toMove === opponentColor ? "Opponent to move." : "Watching for the next move.";
    if (opponentIsLocal) {
      opponentDetail = this.state.toMove === opponentColor ? "Local bot to move." : "Local bot is ready.";
    } else if (!opponentPresence) {
      opponentDetail = "Waiting for opponent to join.";
    } else if (opponentPresence.inGrace && opponentGraceUntil) {
      opponentDetail = `Reconnect grace until ${opponentGraceUntil}.`;
    } else if (!opponentPresence.connected) {
      opponentDetail = "Opponent is currently disconnected.";
    }

    const selfStatusText = selfGraceUntil && selfStatus.status === "in_grace"
      ? `Rejoining until ${selfGraceUntil}`
      : selfStatus.text;
    const opponentStatusText = opponentGraceUntil && opponentStatus.status === "in_grace"
      ? `Rejoining until ${opponentGraceUntil}`
      : opponentStatus.text;

    let nextSelfStatusText = selfStatusText;
    let nextOpponentStatusText = opponentStatusText;

    if (terminalStatus) {
      nextSelfStatusText = terminalStatus.statusText;
      nextOpponentStatusText = terminalStatus.statusText;
      selfDetail = terminalStatus.detailText;
      opponentDetail = terminalStatus.detailText;
    } else if (pendingDrawOffer) {
      const offeredByLocalPlayer = pendingDrawOffer.offeredBy === localColor;
      nextSelfStatusText = offeredByLocalPlayer ? "Offer sent" : "Offer draw";
      nextOpponentStatusText = offeredByLocalPlayer ? "Offer draw" : "Offer sent";
      selfDetail = offeredByLocalPlayer
        ? "Waiting for the opponent to respond to the draw offer."
        : `${this.sideLabel(pendingDrawOffer.offeredBy)} offered a draw. Respond to continue.`;
      opponentDetail = offeredByLocalPlayer
        ? "Your draw offer is awaiting a response."
        : "Waiting for your response to the draw offer.";
    }

    return {
      mode: "online",
      transportStatus: this.getEffectiveOnlineTransportStatus(),
      serverUrl: remote.getServerUrl(),
      viewerColor: localColor,
      viewerRole: "player",
      players: {
        [localColor]: this.createShellPlayerIdentity({
          color: localColor,
          displayName: selfName,
          sideLabel: this.sideLabel(localColor),
          roleLabel: `You · ${this.sideLabel(localColor)}`,
          detailText: selfDetail,
          status: selfStatus.status,
          statusText: nextSelfStatusText,
          avatarUrl: this.resolveShellAvatarUrl(serverUrl, selfIdentity?.avatarUrl),
          countryCode: selfIdentity?.countryCode ?? null,
          countryName: selfIdentity?.countryName ?? null,
          isLocal: true,
          isActiveTurn: !hasTerminalStatus && this.state.toMove === localColor,
        }),
        [opponentColor]: this.createShellPlayerIdentity({
          color: opponentColor,
          displayName: opponentName,
          sideLabel: this.sideLabel(opponentColor),
          roleLabel: `${opponentIsLocal ? "Local bot" : "Opponent"} · ${this.sideLabel(opponentColor)}`,
          detailText: opponentDetail,
          status: opponentStatus.status,
          statusText: nextOpponentStatusText,
          avatarUrl: this.resolveShellAvatarUrl(serverUrl, opponentIdentity?.avatarUrl),
          countryCode: opponentIdentity?.countryCode ?? null,
          countryName: opponentIdentity?.countryName ?? null,
          isLocal: opponentIsLocal,
          isActiveTurn: !hasTerminalStatus && this.state.toMove === opponentColor,
        }),
      },
    };
  }

  async resign(): Promise<void> {
    if (this.isGameOver) return;

    if (this.driver.mode === "online") {
      try {
        const next = await (this.driver as OnlineGameDriver).resignRemote();
        // Clear selection/overlays even if setState exits early on game-over.
        this.clearSelection();
        this.setState(next);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[controller] resign failed", err);
        const msg = err instanceof Error ? err.message : "Resign failed";
        this.showBanner(msg, 1500);
      }
      return;
    }

    // Local: current player resigns, so the other player wins
    const winner = this.state.toMove === "B" ? "W" : "B";
    const winnerName = this.sideLabel(winner);
    const loserName = this.sideLabel(this.state.toMove);

    // Record as a forced game over so other subsystems can query the result.
    this.state = {
      ...this.state,
      forcedGameOver: {
        winner,
        reasonCode: "RESIGN",
        message: `${loserName} resigned — ${winnerName} wins!`,
      },
    };

    // Record resignation into history so Move History playback can surface the
    // game-over reason (toast + status message) when stepping to the final slide.
    try {
      this.driver.pushHistory(this.state, "resign");
    } catch {
      // Best-effort: if history can't be updated, still end the game.
      try {
        this.driver.setState(this.state);
      } catch {
        // ignore
      }
    }

    this.isGameOver = true;
    this.clearSelection();
    const msg = (this.state as any).forcedGameOver.message as string;
    this.showBanner(msg, 0);
    this.showGameOverToast(msg);
    this.updatePanel();
    this.fireHistoryChange("gameOver");
  }

  newGame(initialState: GameState): void {
    // Clear history and start fresh
    this.driver.clearHistory();
    this.driver.pushHistory(initialState);
    this.lastMoveCommittedAtMs = Date.now();
    
    // Reset game state
    this.state = initialState;
    this.driver.setState(initialState);
    this.isGameOver = false;
    this.resetGameOverToastDedupe();
    this.clearGameOverStickyToast();
    this.clearSelection();

    this.recomputeRepetitionCounts();
    
    // Re-render the board
    this.renderAuthoritative();
    
    // Check for mandatory captures at game start
    this.recomputeMandatoryCapture();
    this.updatePanel();

    // Always re-toast at new game start.
    this.lastToastToMove = null;
    this.maybeToastTurnChange();
    
    // Notify history change
    this.fireHistoryChange("newGame");
  }

  loadGame(
    loadedState: GameState,
    historyData?: {
      states: GameState[];
      notation: string[];
      currentIndex: number;
      emtMs?: Array<number | null>;
      evals?: Array<import("../bot/uciEngine.ts").EvalScore | null>;
    }
  ): void {
    if (historyData && historyData.states && historyData.states.length > 0) {
      this.driver.replaceHistory({
        ...historyData,
        currentIndex: 0,
      });
    } else {
      // Reset history and start fresh with loaded state
      this.driver.clearHistory();
      this.driver.pushHistory(loadedState);
    }

    // Save files historically did not persist UI hints like `ui.lastMove`.
    // Reconstruct them from successive snapshots so playback can still show
    // last-move origin/destination highlights after loading.
    this.ensureHistoryLastMoveHints();
    
    // Reset game state to idle phase; prefer aligning to the restored history's current state.
    const currentFromHistory = this.driver.getHistoryCurrent();
    const baseState = currentFromHistory ?? loadedState;
    this.isGameOver = false;
    this.resetGameOverToastDedupe();
    this.clearGameOverStickyToast();
    this.state = { ...baseState, phase: "idle" };
    this.driver.setState(this.state);
    
    // Clear any selection, overlays, and capture state
    this.clearSelection();
    
    // Re-render the board
    this.renderAuthoritative();
    
    // Recompute mandatory captures
    this.recomputeMandatoryCapture();
    this.updatePanel();

    this.recomputeRepetitionCounts();

    // If the loaded position is already terminal for the player to move, end immediately.
    this.checkAndHandleCurrentPlayerLost();

    // Always re-toast after load, but notify listeners first so subsystems
    // (e.g. bots) can install sticky resume toasts and suppress the generic
    // timed turn-change toast.
    this.lastToastToMove = null;
    this.fireHistoryChange("loadGame");
    this.lastMoveCommittedAtMs = Date.now();
    this.maybeToastTurnChange();
  }

  private ensureHistoryLastMoveHints(): void {
    try {
      const snap = this.driver.exportHistorySnapshots();
      if (!snap.states || snap.states.length <= 1) return;

      let changed = false;

      for (let i = 1; i < snap.states.length; i++) {
        const cur = snap.states[i] as GameState;
        const existing = cur.ui?.lastMove;
        if (existing && typeof existing.from === "string" && typeof existing.to === "string") continue;

        const prev = snap.states[i - 1] as GameState;
        const inferred = this.inferHistoryTransition(prev, cur);
        if (!inferred) continue;

        cur.ui = { ...(cur.ui ?? {}), lastMove: { from: inferred.from, to: inferred.to } };
        changed = true;
      }

      if (changed) this.driver.replaceHistory(snap);
    } catch {
      // Best-effort only.
    }
  }

  private updatePanel(): void {
    const elTurn = document.getElementById("statusTurn");
    const elPhase = document.getElementById("statusPhase");
    const elMsg = document.getElementById("statusMessage");
    const elDrawCounters = document.getElementById("statusDrawCounters") as HTMLElement | null;
    const elOfferDrawBtn = document.getElementById("offerDrawBtn") as HTMLButtonElement | null;
    const elPlaybackTitle = document.getElementById("playbackTitle");
    const elMoveHistoryTitle = document.getElementById("moveHistoryTitle");
    const elDeadPlayTimer =
      (document.getElementById("statusDeadPlayTimer") as HTMLElement | null) ??
      (document.getElementById("statusLoneKingTimer") as HTMLElement | null);
    const elOnlineInfoPanel = document.getElementById("onlineInfoPanel") as HTMLElement | null;
    const elRoomId = document.getElementById("infoRoomId");
    const elCopy = document.getElementById("copyRoomIdBtn") as HTMLButtonElement | null;
    const elCopyWatch = document.getElementById("copyWatchLinkBtn") as HTMLButtonElement | null;
    const elCopyDebug = document.getElementById("copyDebugBtn") as HTMLButtonElement | null;
    const elOpponent = document.getElementById("onlineOpponentStatus") as HTMLDivElement | null;
    const elReplayBtn = document.getElementById("openReplayBtn") as HTMLButtonElement | null;
    const elNewGame = document.getElementById("newGameBtn") as HTMLButtonElement | null;
    const elLoadGame = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
    const elLoadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
    const isOnline = this.driver.mode === "online";

    this.maybeClearOnlineResumeRecord();

    // Online UX: when a room is newly created and we're waiting for the opponent,
    // show a sticky toast offering to copy an invite link.
    // Call early so it still runs even if we early-return while setting status text.
    this.maybeShowOnlineWaitingInviteToast();

    if (elOnlineInfoPanel) elOnlineInfoPanel.hidden = !isOnline;

    if (elReplayBtn) elReplayBtn.disabled = !(isOnline && this.isGameOver);

    if (elCopyWatch) {
      if (!isOnline) {
        elCopyWatch.disabled = true;
      } else {
        const pid = (this.driver as OnlineGameDriver).getPlayerId();
        elCopyWatch.disabled = !pid || pid === "spectator";
      }
    }

    if (elNewGame) elNewGame.disabled = isOnline;
    if (elLoadGame) elLoadGame.disabled = isOnline;
    if (elLoadGameInput) elLoadGameInput.disabled = isOnline;

    if (elOfferDrawBtn) {
      const rulesetId = this.state.meta?.rulesetId ?? "lasca";
      const isCheckersUs = rulesetId === "checkers_us";
      const drawOffersAllowed = this.drawOffersAllowed();

      const pending = isCheckersUs
        ? Boolean((this.state as any)?.checkersUsDraw?.pendingOffer)
        : Boolean((this.state as any)?.pendingDrawOffer);

      let disabled = this.isGameOver || pending || !drawOffersAllowed;

      if (this.driver.mode === "online") {
        const online = this.driver as OnlineGameDriver;
        const pid = online.getPlayerId();
        const localColor = online.getPlayerColor();
        disabled =
          disabled ||
          !pid ||
          pid === "spectator" ||
          !localColor ||
          (localColor !== "W" && localColor !== "B");

        if (!disabled && isCheckersUs && (localColor === "W" || localColor === "B")) {
          // Checkers-specific: must be your turn + cooldown
          if (this.state.toMove !== localColor) disabled = true;
          if (!disabled) {
            const draw = ensureCheckersUsDraw((this.state as any).checkersUsDraw);
            const currentTurns = Math.max(0, Math.floor(draw.turnCount?.[localColor] ?? 0));
            const lastTurn = Math.floor(draw.lastOfferTurn?.[localColor] ?? -999);
            if (currentTurns - lastTurn < 3) disabled = true;
          }
        }
      } else if (isCheckersUs) {
        const mover = this.state.toMove;
        disabled = disabled || (mover !== "W" && mover !== "B");
        if (!disabled && (mover === "W" || mover === "B")) {
          const draw = ensureCheckersUsDraw((this.state as any).checkersUsDraw);
          const currentTurns = Math.max(0, Math.floor(draw.turnCount?.[mover] ?? 0));
          const lastTurn = Math.floor(draw.lastOfferTurn?.[mover] ?? -999);
          if (currentTurns - lastTurn < 3) disabled = true;
        }
      }

      elOfferDrawBtn.hidden = false;
      elOfferDrawBtn.disabled = disabled;
      elOfferDrawBtn.title = pending
        ? "Draw offer pending"
        : !drawOffersAllowed
          ? "Draw offers are disabled when playing a bot"
          : "Offer a draw (mutual agreement)";
    }

    if (elTurn) elTurn.textContent = this.sideLabel(this.state.toMove);
    if (elPhase) {
      elPhase.textContent =
        this.isGameOver ? "Game Over" : (this.analysisMode ? "Analysis (sandbox)" : (this.selected ? "Select" : "Idle"));
    }

    if (elPlaybackTitle) elPlaybackTitle.textContent = this.analysisMode ? "Playback (Analysis)" : "Playback";
    if (elMoveHistoryTitle)
      elMoveHistoryTitle.textContent = this.analysisMode ? "Move History (Analysis)" : "Move History";

    // Always reflect the terminal reason in the Status Message row.
    // (This matters for both live play and when replaying/stepping through history.)
    if (elMsg && this.isGameOver) {
      const msg = this.computeTerminalStatusMessage();
      elMsg.textContent = msg;
      this.showGameOverStickyToast(msg);
    }

    // Board HUD: show whose turn it is as a small icon in the board's upper-left.
    const isChessLike = this.isChessLikeRuleset();
    const isColumnsChess = this.isColumnsChessRuleset();
    const toMoveLabel = this.sideLabel(this.state.toMove);
    let turnTooltipText: string | undefined = `${toMoveLabel} to ${isChessLike ? "play" : "move"}`;
    if (this.driver.mode === "online") {
      const remote = this.driver as OnlineGameDriver;
      const selfId = remote.getPlayerId();
      const localColor = remote.getPlayerColor();

      if ((localColor === "W" || localColor === "B") && selfId && selfId !== "spectator") {
        const youLabel = this.sideLabel(localColor);
        const yourTurnText =
          this.state.toMove === localColor ? "your turn" : `${toMoveLabel} to ${isChessLike ? "play" : "move"}`;
        turnTooltipText = `You are ${youLabel} — ${yourTurnText}`;
      }
    }

    renderTurnIndicator(this.svg, this.turnIndicatorLayer, this.state.toMove, {
      hidden: this.isGameOver,
      tooltipText: turnTooltipText,
      icon: isChessLike ? "pawn" : "stone",
      labels: isChessLike ? { W: "White", B: "Black" } : { W: this.sideLabel("W"), B: this.sideLabel("B") },
      ...(this.analysisMode ? { decorator: "analysis" as const } : {}),
    });

    // Board HUD: show opponent presence under the turn indicator.
    if (this.driver.mode !== "online" || this.isGameOver) {
      renderOpponentPresenceIndicator(this.svg, this.opponentPresenceIndicatorLayer, {
        opponentColor: "B",
        status: "waiting",
        hidden: true,
      });
    } else {
      const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
      const selfId = remote.getPlayerId();
      const presence = remote.getPresence();
      const localColor = remote.getPlayerColor();

      const opponentColor = localColor === "B" ? "W" : "B";
      const opponentIsLocal = typeof remote.controlsColor === "function" && remote.controlsColor(opponentColor);

      let status: "connected" | "in_grace" | "disconnected" | "waiting" = "waiting";
      let graceUntil: string | null = null;

      if (opponentIsLocal) {
        status = "connected";
      } else if (!presence || !selfId || selfId === "spectator") {
        status = "waiting";
      } else {
        const opponentId = Object.keys(presence).find((pid) => pid !== selfId) ?? null;
        const opp = opponentId ? (presence as any)[opponentId] : null;

        if (!opp) {
          status = "waiting";
        } else if (opp.connected) {
          status = "connected";
        } else if (opp.inGrace) {
          status = "in_grace";
          graceUntil = typeof opp.graceUntil === "string" ? opp.graceUntil : null;
          if (graceUntil) {
            try {
              const d = new Date(graceUntil);
              if (!Number.isNaN(d.getTime())) graceUntil = d.toLocaleTimeString();
            } catch {
              // ignore
            }
          }
        } else {
          status = "disconnected";
        }
      }

      renderOpponentPresenceIndicator(this.svg, this.opponentPresenceIndicatorLayer, {
        opponentColor,
        status,
        graceUntil,
        hidden: false,
      });
    }

    // Allow clicking the opponent status in either the panel row or the board HUD icon.
    if (!this.didBindOpponentStatusClicks && typeof document !== "undefined") {
      this.didBindOpponentStatusClicks = true;

      const elOpponentStatus = document.getElementById("onlineOpponentStatus") as HTMLDivElement | null;
      if (elOpponentStatus) {
        elOpponentStatus.style.cursor = "pointer";
        elOpponentStatus.title = "Show opponent connection details";
        elOpponentStatus.addEventListener("click", () => this.showOpponentConnectionDetailsToast());
      }

      // SVG HUD icon.
      try {
        this.opponentPresenceIndicatorLayer.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showOpponentConnectionDetailsToast();
        });
      } catch {
        // ignore
      }
    }

    if (elDeadPlayTimer) {
      const rulesetId = this.state.meta?.rulesetId ?? "lasca";
      const isDamasca = rulesetId === "damasca" || rulesetId === "damasca_classic" || rulesetId === "columns_draughts";
      const dp = (this.state as any).damascaDeadPlay as
        | { noProgressPlies?: number; officerOnlyPlies?: number }
        | undefined;
      if (isDamasca && dp) {
        const np = Math.max(0, Math.floor(dp.noProgressPlies ?? 0));
        const oo = Math.max(0, Math.floor(dp.officerOnlyPlies ?? 0));
        const npRem = Math.max(0, DAMASCA_NO_PROGRESS_LIMIT_PLIES - np);
        const ooRem = Math.max(0, DAMASCA_OFFICER_ONLY_LIMIT_PLIES - oo);

        elDeadPlayTimer.textContent = `No-progress: ${npRem} plies left • Officer-only: ${ooRem} plies left`;

        // Prominent warning banner when either counter gets low.
        // Trigger at 20/10/5 plies remaining to avoid spam.
        if (!this.isGameOver && this.onlineAuthorityStatus === "fresh") {
          const thresholds = new Set([20, 10, 5]);
          const warnings: string[] = [];
          if (thresholds.has(npRem)) {
            warnings.push(
              `Dead-play warning: no-progress counter reaches 0 in ${npRem} plies (game ends; adjudicated)`
            );
          }
          if (thresholds.has(ooRem)) {
            warnings.push(
              `Dead-play warning: officer-only counter reaches 0 in ${ooRem} plies (game ends; adjudicated)`
            );
          }

          // Reset warning memory once we're safely out of the warning zone.
          if (npRem > 20 && ooRem > 20) this.lastDeadPlayWarning = null;

          const msg = warnings.join(" • ");
          if (msg && msg !== this.lastDeadPlayWarning) {
            this.lastDeadPlayWarning = msg;
            this.showBanner(msg, 2500);
            this.showToast(msg, 2600);
          }
        }
      } else {
        elDeadPlayTimer.textContent = "—";
      }
    }

    if (elDrawCounters) {
      const rulesetId = this.state.meta?.rulesetId ?? "lasca";
      if (rulesetId === "checkers_us") {
        const st = getCheckersUsDrawStatus(this.state);
        if (!st) {
          elDrawCounters.textContent = "—";
        } else {
          const parts: string[] = [];
          parts.push(`40-move: ${st.noProgressPliesRemaining} plies left`);
          if (st.thirteen) {
            parts.push(`13-move: ${st.thirteen.remaining} moves left for ${this.sideLabel(st.thirteen.stronger)}`);
          }
          elDrawCounters.textContent = parts.join(" • ");
        }
      } else if (rulesetId === "draughts_international") {
        const st = getInternationalDraughtsDrawStatus(this.state);
        if (!st) {
          elDrawCounters.textContent = "—";
        } else {
          const parts: string[] = [];
          parts.push(`25-move: ${st.noProgressKingOnlyPliesRemaining} plies left`);
          if (st.reduced) {
            parts.push(
              `${st.reduced.label} (${this.sideLabel("W")}: ${st.reduced.remaining.W}, ${this.sideLabel("B")}: ${st.reduced.remaining.B})`
            );
          }
          elDrawCounters.textContent = parts.join(" • ");
        }
      } else {
        elDrawCounters.textContent = "—";
      }
    }
    if (elRoomId) {
      if (this.driver.mode === "online") {
        const roomId = (this.driver as OnlineGameDriver).getRoomId();
        elRoomId.textContent = roomId ?? "—";
        if (elCopy) elCopy.disabled = !roomId;
        if (elCopyDebug) elCopyDebug.disabled = !roomId;
      } else {
        elRoomId.textContent = "—";
        if (elCopy) elCopy.disabled = true;
        if (elCopyDebug) elCopyDebug.disabled = true;
      }
    } else {
      if (elCopy) elCopy.disabled = true;
      if (elCopyDebug) elCopyDebug.disabled = true;
    }

    if (elOpponent) {
      if (this.driver.mode !== "online") {
        elOpponent.textContent = "—";
      } else {
        const remote = this.driver as OnlineGameDriver;
        const selfId = remote.getPlayerId();
        const presence = remote.getPresence();
        const identity = remote.getIdentity();

        if (!presence || !selfId || selfId === "spectator") {
          elOpponent.textContent = selfId === "spectator" ? "Spectating" : "—";
        } else {
          const opponentId = Object.keys(presence).find((pid) => pid !== selfId) ?? null;
          const opp = opponentId ? (presence as any)[opponentId] : null;

          const opponentNameRaw = opponentId ? identity?.[opponentId]?.displayName : null;
          const opponentName = typeof opponentNameRaw === "string" ? opponentNameRaw.trim() : "";
          const namePrefix = opponentName ? `${opponentName} — ` : "";

          this.maybeToastOpponentPresence({ selfId, opponentId, opp });

          if (!opp) {
            elOpponent.textContent = "Waiting for opponent";
          } else if (opp.inGrace && typeof opp.graceUntil === "string") {
            let when = opp.graceUntil;
            try {
              const d = new Date(opp.graceUntil);
              if (!Number.isNaN(d.getTime())) when = d.toLocaleTimeString();
            } catch {
              // ignore
            }
            elOpponent.textContent = `${namePrefix}Disconnected (grace until ${when})`;
          } else if (opp.connected) {
            elOpponent.textContent = `${namePrefix}Connected`;
          } else {
            elOpponent.textContent = `${namePrefix}Disconnected`;
          }
        }
      }
    }
    if (elMsg && !this.isGameOver) {
      if (isOnline && this.onlineAuthorityStatus === "stale") {
        elMsg.textContent = "Reconnecting…";
        return;
      }

      if (isOnline) {
        const remote = this.driver as OnlineGameDriver;
        const selfId = remote.getPlayerId();
        const localColor = remote.getPlayerColor();
        if (!selfId || selfId === "spectator") {
          elMsg.textContent = "Spectating";
          return;
        }
        if (!localColor) {
          elMsg.textContent = "Waiting for seat assignment";
          return;
        }
        if (!this.onlineHasOpponent()) {
          elMsg.textContent = "Waiting for opponent to join";
          return;
        }
        if (this.state.toMove !== localColor) {
          elMsg.textContent = "Opponent's turn";
          return;
        }
      }
      if (this.selected) {
        if (this.currentTargets.length > 0) {
          if (this.lockedCaptureFrom) {
            elMsg.textContent = "Continue capturing";
          } else {
            elMsg.textContent = "Choose a destination";
          }
        } else if (this.mandatoryCapture) {
          elMsg.textContent = "Capture required — select a capturing stack";
        } else {
          elMsg.textContent = "No moves";
        }
      } else {
        // No selection - check if captures are mandatory
        if (this.mandatoryCapture) {
          elMsg.textContent = "Capture available — you must capture";
        } else {
          // Chess(-like): when in check, show a prominent status message.
          // (Toasts also fire on turn change, but the status row should reflect check.)
          if (isChessLike) {
            const toMove = this.state.toMove;
            const inCheck = isColumnsChess
              ? isKingInCheckColumnsChess(this.state, toMove)
              : isKingInCheckChess(this.state, toMove);
            elMsg.textContent = inCheck ? `Check! ${this.sideLabel(toMove)} to Play` : "—";
          } else {
            elMsg.textContent = "—";
          }
        }
      }
    }

  }

  private maybeToastOpponentPresence(args: { selfId: string | null; opponentId: string | null; opp: any | null }): void {
    if (this.driver.mode !== "online") {
      this.lastOpponentPresent = null;
      this.lastOpponentConnected = null;
      this.clearStickyToast("online_opponent_presence");
      return;
    }
    if (this.isGameOver) return;

    const selfId = args.selfId;
    if (!selfId || selfId === "spectator") {
      this.lastOpponentPresent = null;
      this.lastOpponentConnected = null;
      this.clearStickyToast("online_opponent_presence");
      return;
    }

    const opponentPresent = Boolean(args.opp);
    const opponentConnected = opponentPresent ? Boolean(args.opp.connected) : null;
    const hadEverOpponent = this.everSawOpponentPresent;

    // Prime state without showing any toasts.
    if (this.lastOpponentPresent === null && this.lastOpponentConnected === null) {
      this.lastOpponentPresent = opponentPresent;
      this.lastOpponentConnected = opponentConnected;
      return;
    }

    const key = "online_opponent_presence";

    // Opponent no longer in room (seat missing).
    if (this.lastOpponentPresent === true && opponentPresent === false) {
      this.showStickyToast(key, "Opponent left the room");
      this.maybeShowReportIssueHintToast("Opponent left");
    }

    // Opponent (re)joins the room (seat appears).
    if (this.lastOpponentPresent === false && opponentPresent === true) {
      // If we already had an opponent earlier, treat this as a rejoin.
      // Otherwise, it is the initial join for a newly-created room.
      const msg = hadEverOpponent ? "Opponent rejoined" : "Opponent joined";
      this.clearStickyToast(key);
      this.showToast(msg, 1800);
    }

    // Opponent disconnected (still in room but not connected).
    if (this.lastOpponentConnected === true && opponentPresent && opponentConnected === false) {
      let msg = "Opponent disconnected";

      if (args.opp?.inGrace && typeof args.opp?.graceUntil === "string") {
        let when = args.opp.graceUntil;
        try {
          const d = new Date(args.opp.graceUntil);
          if (!Number.isNaN(d.getTime())) when = d.toLocaleTimeString();
        } catch {
          // ignore
        }
        msg = `Opponent disconnected (grace until ${when})`;
      }

      this.showStickyToast(key, msg);
      this.maybeShowReportIssueHintToast("Opponent disconnected");
    }

    // Opponent rejoined.
    if (this.lastOpponentConnected === false && opponentPresent && opponentConnected === true) {
      this.clearStickyToast(key);
      this.showToast("Opponent rejoined", 1800);
    }

    this.lastOpponentPresent = opponentPresent;
    this.lastOpponentConnected = opponentConnected;
    if (opponentPresent) this.everSawOpponentPresent = true;
  }

  private resolveClickedNode(target: EventTarget | null): string | null {
    // If clicking a rendered stack, read data-node from closest g.stack
    if (target && target instanceof Element) {
      // First, if the target (or ancestor) has data-node, prefer that
      const withData = target.closest("[data-node]") as Element | null;
      if (withData) {
        const id = withData.getAttribute("data-node");
        if (id) return id;
      }
      const stack = target.closest("g.stack") as SVGGElement | null;
      if (stack) {
        const id = stack.getAttribute("data-node");
        if (id) return id;
      }
      // Else if clicking a circle node
      if (target instanceof Element && target.tagName.toLowerCase() === "circle") {
        const id = target.getAttribute("id");
        if (id) return id;
      }
    }
    return null;
  }

  private svgPointFromClientCoords(clientX: number, clientY: number): { x: number; y: number } {
    const pt = (this.svg as any).createSVGPoint ? (this.svg as any).createSVGPoint() : null;
    if (pt && this.svg.getScreenCTM) {
      pt.x = clientX;
      pt.y = clientY;
      const m = this.svg.getScreenCTM();
      if (m && (m as any).inverse) {
        const p = pt.matrixTransform((m as any).inverse());
        return { x: p.x, y: p.y };
      }
    }
    const rect = this.svg.getBoundingClientRect();
    const viewBoxBase = this.svg.viewBox?.baseVal;
    const attr = this.svg.getAttribute("viewBox");
    const parsedViewBox = attr
      ? attr
          .trim()
          .split(/[\s,]+/)
          .map((value) => Number.parseFloat(value))
      : null;
    const viewBox =
      viewBoxBase && Number.isFinite(viewBoxBase.width) && Number.isFinite(viewBoxBase.height) && viewBoxBase.width > 0 && viewBoxBase.height > 0
        ? { x: viewBoxBase.x, y: viewBoxBase.y, width: viewBoxBase.width, height: viewBoxBase.height }
        : parsedViewBox && parsedViewBox.length === 4 && parsedViewBox.every((value) => Number.isFinite(value))
          ? { x: parsedViewBox[0], y: parsedViewBox[1], width: parsedViewBox[2], height: parsedViewBox[3] }
          : null;
    if (viewBox && rect.width > 0 && rect.height > 0) {
      return {
        x: viewBox.x + ((clientX - rect.left) * viewBox.width) / rect.width,
        y: viewBox.y + ((clientY - rect.top) * viewBox.height) / rect.height,
      };
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private layerPointFromClientCoords(layer: SVGGraphicsElement | null | undefined, clientX: number, clientY: number): { x: number; y: number } {
    const pt = (this.svg as any).createSVGPoint ? (this.svg as any).createSVGPoint() : null;
    if (pt && layer?.getScreenCTM) {
      pt.x = clientX;
      pt.y = clientY;
      const m = layer.getScreenCTM();
      if (m && (m as any).inverse) {
        const p = pt.matrixTransform((m as any).inverse());
        return { x: p.x, y: p.y };
      }
    }
    return this.svgPointFromClientCoords(clientX, clientY);
  }

  private svgPointFromClient(ev: MouseEvent): { x: number; y: number } {
    return this.svgPointFromClientCoords(ev.clientX, ev.clientY);
  }

  private getSquareRectForNode(nodeId: string): { x: number; y: number; w: number; h: number } | null {
    const rc = parseNodeId(nodeId);
    if (!rc) return null;

    const squares = this.svg.querySelector("#squares") as SVGGElement | null;
    if (!squares) return null;

    const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
    if (rects.length === 0) return null;

    const first = rects[0];
    const w = Number.parseFloat(first.getAttribute("width") ?? "0");
    const h = Number.parseFloat(first.getAttribute("height") ?? "0");
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const rect of rects) {
      const x = Number.parseFloat(rect.getAttribute("x") ?? "NaN");
      const y = Number.parseFloat(rect.getAttribute("y") ?? "NaN");
      if (Number.isFinite(x)) minX = Math.min(minX, x);
      if (Number.isFinite(y)) minY = Math.min(minY, y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    return { x: minX + rc.c * w, y: minY + rc.r * h, w, h };
  }

  private getNodeHitMetricsAtClientPoint(
    nodeId: string,
    clientX: number,
    clientY: number,
  ): { distance: number; radius: number; centerDistance: number; insideSquare: boolean } | null {
    const circle = document.getElementById(nodeId) as SVGCircleElement | null;
    const squareRect = this.getSquareRectForNode(nodeId);
    if (!circle && !squareRect) return null;

    const { x, y } = this.svgPointFromClientCoords(clientX, clientY);

    if (squareRect) {
      const cx = squareRect.x + squareRect.w / 2;
      const cy = squareRect.y + squareRect.h / 2;
      const insideSquare =
        x >= squareRect.x &&
        x <= squareRect.x + squareRect.w &&
        y >= squareRect.y &&
        y <= squareRect.y + squareRect.h;
      if (insideSquare) {
        return {
          distance: 0,
          radius: Math.min(squareRect.w, squareRect.h) / 2,
          centerDistance: Math.hypot(x - cx, y - cy),
          insideSquare: true,
        };
      }
    }

    if (!circle) return null;

    const cx0 = parseFloat(circle.getAttribute("cx") || "0");
    const cy0 = parseFloat(circle.getAttribute("cy") || "0");
    const r = parseFloat(circle.getAttribute("r") || "0");

    let cx = cx0;
    let cy = cy0;
    try {
      const m = circle.getCTM();
      const pt = (this.svg as any).createSVGPoint ? (this.svg as any).createSVGPoint() : null;
      if (m && pt) {
        pt.x = cx0;
        pt.y = cy0;
        const p = pt.matrixTransform(m);
        cx = p.x;
        cy = p.y;
      }
    } catch {
      // ignore and use raw attrs
    }

    return {
      distance: Math.hypot(x - cx, y - cy),
      radius: r,
      centerDistance: Math.hypot(x - cx, y - cy),
      insideSquare: false,
    };
  }

  private resolveNodeAtClientPoint(clientX: number, clientY: number): string | null {
    const targetAtPoint = this.resolveCurrentTargetAtClientPoint(clientX, clientY);
    if (targetAtPoint) return targetAtPoint;

    const pointTarget = typeof document.elementFromPoint === "function"
      ? document.elementFromPoint(clientX, clientY)
      : null;
    const pointResolved = this.resolveClickedNode(pointTarget);
    if (pointResolved) return pointResolved;

    const { x, y } = this.svgPointFromClientCoords(clientX, clientY);
    const circles = Array.from(this.svg.querySelectorAll("circle[id]")) as SVGCircleElement[];
    for (const circle of circles) {
      const id = circle.getAttribute("id");
      if (!id || !/^r\d+c\d+$/.test(id)) continue;
      const cx0 = parseFloat(circle.getAttribute("cx") || "0");
      const cy0 = parseFloat(circle.getAttribute("cy") || "0");
      const r = parseFloat(circle.getAttribute("r") || "0");
      let cx = cx0;
      let cy = cy0;
      try {
        const m = circle.getCTM();
        const pt = (this.svg as any).createSVGPoint ? (this.svg as any).createSVGPoint() : null;
        if (m && pt) {
          pt.x = cx0;
          pt.y = cy0;
          const p = pt.matrixTransform(m);
          cx = p.x;
          cy = p.y;
        }
      } catch {
        // ignore and use raw attrs
      }
      if (Math.hypot(x - cx, y - cy) <= r + 12) return id;
    }
    return null;
  }

  private resolveCurrentTargetAtClientPoint(clientX: number, clientY: number): string | null {
    if (!this.selected || this.currentTargets.length === 0) return null;
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const id of this.currentTargets) {
      const metrics = this.getNodeHitMetricsAtClientPoint(id, clientX, clientY);
      if (!metrics) continue;
      if (!metrics.insideSquare && metrics.distance > metrics.radius + 24) continue;
      const score = metrics.insideSquare ? metrics.centerDistance : metrics.distance;
      if (score < bestDistance) {
        bestDistance = score;
        bestId = id;
      }
    }
    return bestId;
  }

  private hitTestTargets(ev: MouseEvent): string | null {
    if (!this.selected || this.currentTargets.length === 0) return null;
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const id of this.currentTargets) {
      const metrics = this.getNodeHitMetricsAtClientPoint(id, ev.clientX, ev.clientY);
      if (!metrics) continue;
      if (!metrics.insideSquare && metrics.distance > metrics.radius + 12) continue;
      const score = metrics.insideSquare ? metrics.centerDistance : metrics.distance;
      if (score < bestDistance) {
        bestDistance = score;
        bestId = id;
      }
    }
    return bestId;
  }

  private resolveMoveFromDropNode(sourceNodeId: string, nodeId: string, clientX: number, clientY: number): Move | null {
    const directMove = this.currentMoves.find((candidate) => candidate.from === sourceNodeId && candidate.to === nodeId);
    if (directMove) return directMove;

    const captureCandidates = this.currentMoves.filter(
      (candidate): candidate is Extract<Move, { kind: "capture" }> =>
        candidate.from === sourceNodeId && candidate.kind === "capture" && candidate.over === nodeId,
    );
    if (captureCandidates.length === 0) return null;
    if (captureCandidates.length === 1) return captureCandidates[0];

    let bestMove: Extract<Move, { kind: "capture" }> | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of captureCandidates) {
      const metrics = this.getNodeHitMetricsAtClientPoint(candidate.to, clientX, clientY);
      if (!metrics) continue;
      if (metrics.distance < bestDistance) {
        bestDistance = metrics.distance;
        bestMove = candidate;
      }
    }

    return bestMove ?? captureCandidates[0];
  }

  private resolveMoveAtClientPoint(sourceNodeId: string, clientX: number, clientY: number): Move | null {
    const nodeId = this.resolveNodeAtClientPoint(clientX, clientY);
    if (!nodeId) return null;
    return this.resolveMoveFromDropNode(sourceNodeId, nodeId, clientX, clientY);
  }

  private isOwnStack(nodeId: string): boolean {
    const stack = this.state.board.get(nodeId);
    if (!stack || stack.length === 0) return false;
    // In analysis mode, allow selecting any piece (free-move for both sides).
    if (this.analysisMode) return true;
    const top = stack[stack.length - 1];
    return top.owner === this.state.toMove;
  }

  private canProcessBoardInput(): boolean {
    if (this.isGameOver) return false;
    if (this.shellStartupPlayLockEnabled) return false;
    if (!this.inputEnabled) return false;

    if (this.driver.mode === "online") {
      try {
        const remote = this.driver as OnlineGameDriver & { controlsColor?: (color: Player) => boolean };
        const selfId = remote.getPlayerId();
        const localColor = remote.getPlayerColor();
        const opponentColor = localColor === "W" ? "B" : localColor === "B" ? "W" : null;
        if (!(opponentColor && typeof remote.controlsColor === "function" && remote.controlsColor(opponentColor))) {
          const presence = remote.getPresence();
          if (presence && selfId && selfId !== "spectator") {
            const opponentId = Object.keys(presence).find((pid) => pid !== selfId) ?? null;
            const opp = opponentId ? (presence as any)[opponentId] : null;
            if (opp && opp.connected === false) {
              this.clearSelection();

              const identity = remote.getIdentity();
              const opponentNameRaw = opponentId ? identity?.[opponentId]?.displayName : null;
              const opponentName = typeof opponentNameRaw === "string" ? opponentNameRaw.trim() : "";
              const who = opponentName ? `Opponent (${opponentName})` : "Opponent";

              const now = Date.now();
              if (now - this.lastOpponentDisconnectedBlockToastAt > 1500) {
                this.lastOpponentDisconnectedBlockToastAt = now;
                this.showToast(
                  `${who} disconnected — waiting for reconnect (click the opponent status icon for details)`,
                  2200
                );
              }
              return false;
            }
          }
        }
      } catch {
        // ignore presence failures and continue
      }
    }

    if (!this.analysisMode && !this.isLocalPlayersTurn()) {
      this.clearSelection();
      return false;
    }

    return true;
  }

  private selectNodeForInteraction(nodeId: string): void {
    if (this.analysisMode) {
      const stack = this.state.board.get(nodeId);
      const top = stack?.[stack.length - 1];
      if (top && top.owner !== this.state.toMove) {
        this.assignControllerState({ ...this.state, toMove: top.owner });
        this.updatePanel();
      }
    }
    this.selected = nodeId;
    this.playSfx("select");
    this.showSelection(nodeId);
  }

  private clearDragPreview(): void {
    if (this.dragHiddenSourceGroup) {
      this.dragHiddenSourceGroup.style.visibility = "";
      this.dragHiddenSourceGroup = null;
    }
    this.dragPreviewGroup = null;
    clearPreviewLayer(this.previewLayer);
  }

  private setBoardTextSelectionSuppressed(suppressed: boolean): void {
    if (typeof document === "undefined") return;

    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    if (suppressed) {
      if (!this.boardTextSelectionRestore) {
        this.boardTextSelectionRestore = {
          bodyUserSelect: body.style.userSelect,
          bodyWebkitUserSelect: (body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect ?? "",
          docUserSelect: root.style.userSelect,
          docWebkitUserSelect: (root.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect ?? "",
        };
      }
      body.style.userSelect = "none";
      root.style.userSelect = "none";
      (body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";
      (root.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";
      try {
        document.getSelection()?.removeAllRanges();
      } catch {
        // ignore
      }
      return;
    }

    if (!this.boardTextSelectionRestore) return;
    body.style.userSelect = this.boardTextSelectionRestore.bodyUserSelect;
    root.style.userSelect = this.boardTextSelectionRestore.docUserSelect;
    (body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect =
      this.boardTextSelectionRestore.bodyWebkitUserSelect;
    (root.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect =
      this.boardTextSelectionRestore.docWebkitUserSelect;
    this.boardTextSelectionRestore = null;
  }

  private ensureDragPreview(): void {
    if (!this.dragSourceNodeId || this.dragPreviewGroup) return;
    const sourceGroup = this.piecesLayer.querySelector(`g.stack[data-node="${this.dragSourceNodeId}"]`) as SVGGElement | null;
    if (!sourceGroup) return;

    const preview = sourceGroup.cloneNode(true) as SVGGElement;
    preview.setAttribute("class", `${preview.getAttribute("class") ?? "stack"} dragPreviewStack`.trim());
    preview.setAttribute("data-preview", "dragging");
    preview.style.pointerEvents = "none";
    preview.style.opacity = "0.96";
    this.previewLayer.appendChild(preview);
    sourceGroup.style.visibility = "hidden";
    this.dragHiddenSourceGroup = sourceGroup;
    this.dragPreviewGroup = preview;
  }

  private updateDragPreview(clientX: number, clientY: number): void {
    if (!this.dragSourceNodeId) return;
    this.ensureDragPreview();
    if (!this.dragPreviewGroup) return;
    const { x, y } = this.layerPointFromClientCoords(this.previewLayer, clientX, clientY);
    const dx = x - this.dragStartSvgX;
    const dy = y - this.dragStartSvgY;
    this.dragPreviewGroup.setAttribute("transform", `translate(${dx} ${dy})`);
  }

  private cancelPointerInteraction(): void {
    this.activeBoardPointerId = null;
    this.dragSourceNodeId = null;
    this.dragHasMoved = false;
    this.dragStartSvgX = 0;
    this.dragStartSvgY = 0;
    this.clearDragPreview();
    this.setBoardTextSelectionSuppressed(false);
  }

  private onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    if (this.analysisMode && ev.pointerType === "touch") return;
    if (!this.canProcessBoardInput()) return;

    const nodeId = this.resolveClickedNode(ev.target);
    if (!nodeId) return;

    if (this.lockedCaptureFrom && nodeId !== this.lockedCaptureFrom) return;
    if (!this.isOwnStack(nodeId)) return;

    this.selectNodeForInteraction(nodeId);
    this.suppressBoardClickUntilMs = Date.now() + BOARD_DRAG_CLICK_SUPPRESS_MS;
    this.activeBoardPointerId = ev.pointerId;
    this.dragSourceNodeId = nodeId;
    this.dragStartClientX = ev.clientX;
    this.dragStartClientY = ev.clientY;
    const dragStartPoint = this.layerPointFromClientCoords(this.previewLayer, ev.clientX, ev.clientY);
    this.dragStartSvgX = dragStartPoint.x;
    this.dragStartSvgY = dragStartPoint.y;
    this.dragHasMoved = false;
    this.setBoardTextSelectionSuppressed(true);

    try {
      this.svg.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  }

  private onPointerMove(ev: PointerEvent): void {
    if (this.activeBoardPointerId === null || ev.pointerId !== this.activeBoardPointerId) return;
    if (!this.dragSourceNodeId) return;

    if (!this.dragHasMoved) {
      const distance = Math.hypot(ev.clientX - this.dragStartClientX, ev.clientY - this.dragStartClientY);
      if (distance < BOARD_DRAG_THRESHOLD_PX) return;
      this.dragHasMoved = true;
    }

    this.updateDragPreview(ev.clientX, ev.clientY);
    ev.preventDefault();
  }

  private async onPointerUp(ev: PointerEvent): Promise<void> {
    if (this.activeBoardPointerId === null || ev.pointerId !== this.activeBoardPointerId) return;

    const sourceNodeId = this.dragSourceNodeId;
    const dragWasMoved =
      this.dragHasMoved ||
      Math.hypot(ev.clientX - this.dragStartClientX, ev.clientY - this.dragStartClientY) >= BOARD_DRAG_THRESHOLD_PX;
    this.activeBoardPointerId = null;
    this.dragSourceNodeId = null;
    this.dragHasMoved = false;
    this.dragStartSvgX = 0;
    this.dragStartSvgY = 0;
    this.setBoardTextSelectionSuppressed(false);
    try {
      this.svg.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    if (!sourceNodeId || !dragWasMoved) {
      this.clearDragPreview();
      return;
    }

    this.suppressBoardClickUntilMs = Date.now() + BOARD_DRAG_CLICK_SUPPRESS_MS;
    ev.preventDefault();

    if (!this.selected || this.selected !== sourceNodeId) {
      this.clearDragPreview();
      if (this.selected === sourceNodeId) this.showSelection(sourceNodeId);
      return;
    }

    const move = this.resolveMoveAtClientPoint(sourceNodeId, ev.clientX, ev.clientY);
    if (!move) {
      this.clearDragPreview();
      this.showSelection(sourceNodeId);
      return;
    }

    try {
      await this.applyChosenMove(move, { animateLocalTravel: false });
    } finally {
      this.clearDragPreview();
    }
  }

  private recomputeRepetitionCounts(): void {
    this.repetitionCounts.clear();
    const snap = this.driver.exportHistorySnapshots();
    const states = snap.states;
    const end = snap.currentIndex;
    for (let i = 0; i <= end && i < states.length; i++) {
      const h = hashGameState(states[i]);
      this.repetitionCounts.set(h, (this.repetitionCounts.get(h) || 0) + 1);
    }
  }

  private repetitionCountForCurrentState(): number {
    const h = hashGameState(this.state);
    return this.repetitionCounts.get(h) || 0;
  }

  private clearThreefoldClaimToast(): void {
    this.clearStickyToast("threefold_claim");
  }

  private checkThreefoldRepetition(): boolean {
    if (!RULES.drawByThreefold) return false;
    this.recomputeRepetitionCounts();
    return this.repetitionCountForCurrentState() >= 3;
  }

  private async claimThreefoldDraw(): Promise<void> {
    if (this.isGameOver) return;
    if (this.repetitionCountForCurrentState() < 3) return;

    if (this.driver.mode === "online") {
      try {
        const next = await (this.driver as OnlineGameDriver).claimDrawRemote({ kind: "threefold" });
        this.clearSelection();
        this.setState(next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Claim draw failed";
        this.showToast(msg, 1600);
      }
      return;
    }

    // Local: immediately end the game in a draw.
    this.state = {
      ...(this.state as any),
      forcedGameOver: {
        winner: null,
        reasonCode: "THREEFOLD_REPETITION",
        message: "Draw by threefold repetition",
      },
    };
    this.driver.setState(this.state);

    // Ensure current history entry reflects the adjudication.
    const snap = this.driver.exportHistorySnapshots();
    if (snap.states.length > 0 && snap.currentIndex >= 0 && snap.currentIndex < snap.states.length) {
      snap.states[snap.currentIndex] = this.state;
      this.driver.replaceHistory(snap);
    }

    this.isGameOver = true;
    this.clearSelection();
    this.clearThreefoldClaimToast();
    this.showBanner("Draw by threefold repetition", 0);
    this.showGameOverToast("Draw by threefold repetition");
    this.updatePanel();
    this.fireHistoryChange("gameOver");
  }

  private nodeIdToA1ForView(nodeId: string, boardSize: number): string {
    try {
      // If the SVG board is flipped, show the viewer-oriented coordinates.
      return nodeIdToA1View(nodeId, boardSize, isBoardFlipped(this.svg));
    } catch {
      return nodeIdToA1(nodeId, boardSize);
    }
  }

  /**
   * Updates repetition UI and enforces automatic fivefold draw (local only).
   * Threefold is claimable via a sticky toast action.
   */
  private syncRepetitionRules(): void {
    if (this.isGameOver) {
      this.clearThreefoldClaimToast();
      return;
    }

    if (!RULES.drawByThreefold) {
      this.clearThreefoldClaimToast();
      return;
    }

    const rulesetId = this.state.meta?.rulesetId ?? "lasca";

    // US Checkers: threefold repetition is an automatic draw (required rules).
    if (rulesetId === "checkers_us") {
      this.clearThreefoldClaimToast();
      this.recomputeRepetitionCounts();
      const count = this.repetitionCountForCurrentState();

      // Online: server is authoritative.
      if (this.driver.mode === "online") return;

      if (count >= 3) {
        this.state = {
          ...(this.state as any),
          forcedGameOver: {
            winner: null,
            reasonCode: "THREEFOLD_REPETITION",
            message: "Draw by threefold repetition",
          },
        };
        this.driver.setState(this.state);

        const snap = this.driver.exportHistorySnapshots();
        if (snap.states.length > 0 && snap.currentIndex >= 0 && snap.currentIndex < snap.states.length) {
          snap.states[snap.currentIndex] = this.state;
          this.driver.replaceHistory(snap);
        }

        this.isGameOver = true;
        this.clearSelection();
        this.showBanner("Draw by threefold repetition", 0);
        this.showGameOverToast("Draw by threefold repetition");
        this.updatePanel();
        this.fireHistoryChange("gameOver");
      }
      return;
    }

    // Damasca uses special dead-play adjudication on threefold repetition.
    const isDamasca = rulesetId === "damasca" || rulesetId === "damasca_classic" || rulesetId === "columns_draughts";
    if (isDamasca) {
      this.clearThreefoldClaimToast();
      this.recomputeRepetitionCounts();
      const count = this.repetitionCountForCurrentState();
      if (count >= 3 && this.driver.mode !== "online") {
        this.state = adjudicateDamascaDeadPlay(this.state, "DAMASCA_THREEFOLD_REPETITION", "threefold repetition");

        const snap2 = this.driver.exportHistorySnapshots();
        if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
          snap2.states[snap2.currentIndex] = this.state;
          this.driver.replaceHistory(snap2);
        }

        this.isGameOver = true;
        this.clearSelection();
        const msg = (this.state as any).forcedGameOver?.message ?? "Game Over";
        this.showBanner(msg, 0);
        this.showGameOverToast(msg);
        this.updatePanel();
        this.fireHistoryChange("gameOver");
      }
      return;
    }

    this.recomputeRepetitionCounts();
    const count = this.repetitionCountForCurrentState();

    // Fivefold repetition is automatic.
    if (count >= 5) {
      this.clearThreefoldClaimToast();

      // Online: server is authoritative.
      if (this.driver.mode === "online") return;

      this.state = {
        ...(this.state as any),
        forcedGameOver: {
          winner: null,
          reasonCode: "FIVEFOLD_REPETITION",
          message: "Draw by fivefold repetition",
        },
      };
      this.driver.setState(this.state);

      const snap = this.driver.exportHistorySnapshots();
      if (snap.states.length > 0 && snap.currentIndex >= 0 && snap.currentIndex < snap.states.length) {
        snap.states[snap.currentIndex] = this.state;
        this.driver.replaceHistory(snap);
      }

      this.isGameOver = true;
      this.clearSelection();
      this.showBanner("Draw by fivefold repetition", 0);
      this.showGameOverToast("Draw by fivefold repetition");
      this.updatePanel();
      this.fireHistoryChange("gameOver");
      return;
    }

    // Threefold repetition is claimable.
    if (count >= 3) {
      const key = "threefold_claim";
      // Don't clobber online onboarding stickies.
      if (this.stickyToastKey && this.stickyToastKey !== key && this.stickyToastKey.startsWith("online_")) return;
      this.setStickyToastAction(key, () => void this.claimThreefoldDraw());
      this.showStickyToast(key, "Threefold repetition available — tap to claim a draw", { force: true });
    } else {
      this.clearThreefoldClaimToast();
    }
  }

  private showSelection(nodeId: string): void {
    clearOverlays(this.overlayLayer);

    const useSquares = this.highlightSquaresEnabled;
    const selectionStyle: SelectionStyle = this.moveHintsEnabled
      ? (this.moveHintStyle === "chesscom" ? "chesscom" : useSquares ? "classic-squares" : "classic")
      : this.selectionStyle;
    if (selectionStyle === "chesscom") drawSelectionChessCom(this.overlayLayer, nodeId);
    else if (selectionStyle === "classic-squares") drawSelectionSquare(this.overlayLayer, nodeId);
    else drawSelection(this.overlayLayer, nodeId);
    let allLegal = generateLegalMoves(
      this.state,
      this.lockedCaptureFrom
        ? { forcedFrom: this.lockedCaptureFrom, excludedJumpSquares: this.jumpedSquares }
        : undefined
    );
    this.recomputeMandatoryCapture(undefined, allLegal);
    
    // If in a capture chain, only allow moves from the locked position
    let movesForNode = allLegal.filter(m => m.from === nodeId);
    if (this.lockedCaptureFrom && this.lockedCaptureFrom !== nodeId) {
      movesForNode = [];
    }
    
    this.currentMoves = movesForNode;
    this.currentTargets = this.currentMoves.map(m => m.to);
    if (this.moveHintsEnabled) {
      if (this.moveHintStyle === "chesscom") {
        const occupiedCaptureTargets = this.currentMoves
          .filter((move): move is Extract<Move, { kind: "capture" }> => move.kind === "capture")
          .filter((move) => (this.state.board.get(move.to)?.length ?? 0) > 0)
          .map((move) => move.to);
        drawTargetsChessCom(this.overlayLayer, this.currentTargets, occupiedCaptureTargets);
      }
      else if (useSquares) drawTargetsSquares(this.overlayLayer, this.currentTargets);
      else drawTargets(this.overlayLayer, this.currentTargets);
    }

    // Dama International (end-of-sequence capture removal): visually mark already-captured pieces
    // that are pending removal so the player understands they cannot be jumped again.
    this.drawPendingDamaCapturedMarks();
    
    // Draw move hints if enabled
    if (this.moveHintsEnabled && this.moveHintStyle === "classic") {
      for (const move of this.currentMoves) {
        if (move.kind === "capture") {
          // Red circle for the piece being jumped over
          if (useSquares) drawHighlightSquare(this.overlayLayer, move.over, "#ff6b6b", 3);
          else drawHighlightRing(this.overlayLayer, move.over, "#ff6b6b", 3);
          // Orange circle for the landing square (target)
          if (useSquares) drawHighlightSquare(this.overlayLayer, move.to, "#ff9f40", 4);
          else drawHighlightRing(this.overlayLayer, move.to, "#ff9f40", 4);
        }
      }
    }
    
    this.updatePanel();
    this.refreshSelectableCursors();
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] select", nodeId, { targets: this.currentTargets });
    }
  }

  private clearSelection(): void {
    this.selected = null;
    this.currentTargets = [];
    this.currentMoves = [];
    // Recalculate mandatory capture based on current state, don't just set to false
    this.recomputeMandatoryCapture();
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    clearOverlays(this.overlayLayer);
    this.clearDragPreview();
    this.updatePanel();
    this.refreshSelectableCursors();
  }

  private showBanner(text: string, durationMs: number = 1500): void {
    const elMsg = document.getElementById("statusMessage");
    if (elMsg) elMsg.textContent = text;
    if (this.bannerTimer) window.clearTimeout(this.bannerTimer);
    
    // If durationMs is 0 or less, keep the banner permanently (for game over)
    if (durationMs > 0) {
      this.bannerTimer = window.setTimeout(() => {
        this.bannerTimer = null;
        this.updatePanel();
      }, durationMs);
    }
  }

  private showRemainderHint(nodeId: string, durationMs: number = 1200): void {
    // Draw a transient ring where remainder stays after capture
    drawHighlightRing(this.overlayLayer, nodeId, "#ff9f40", 4);
    if (this.remainderTimer) window.clearTimeout(this.remainderTimer);
    this.remainderTimer = window.setTimeout(() => {
      this.remainderTimer = null;
      clearOverlays(this.overlayLayer);
      this.updatePanel();
    }, durationMs);
  }

  private createGhostStackAtNode(nodeId: string, stack: Stack, opts?: { pieceSize?: number }): {
    stackG: SVGGElement;
    extras: SVGElement[];
  } | null {
    if (!stack || stack.length === 0) return null;
    if (typeof document === "undefined") return null;

    const node = document.getElementById(nodeId) as SVGCircleElement | null;
    if (!node) return null;

    const cx = parseFloat(node.getAttribute("cx") || "0");
    const cy = parseFloat(node.getAttribute("cy") || "0");

    const pieceSize = opts?.pieceSize ?? 86;
    const half = pieceSize / 2;

    const rulesetId = this.state.meta?.rulesetId;
    const top = stack[stack.length - 1];
    const themeId = this.svg.getAttribute("data-theme-id");

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    g.setAttribute("class", "stack ghost");
    g.setAttribute("data-node", nodeId);

    const baseHref = pieceToHref(top, { rulesetId, themeId });
    const href = maybeVariantStonePieceHref(
      this.svg,
      maybeVariantWoodenPieceHref(this.svg, baseHref, `${nodeId}:ghost`),
      `${nodeId}:ghost`
    );
    const use = makeUseWithTitle(href, cx - half, cy - half, pieceSize, pieceTooltip(top, { rulesetId }));
    if (isBoardFlipped(this.svg)) {
      use.setAttribute("transform", `rotate(180 ${cx} ${cy})`);
    }
    g.appendChild(use);

    // Include the mini spine so the animation reads as “a stack moving”.
    const spineG = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    spineG.setAttribute("class", "miniSpine ghost");
    spineG.setAttribute("data-node", nodeId);

    // Use an off-DOM scratch layer for stack-count bubbles so the ghost can animate
    // with a correctly-positioned count without touching the real board's counts layer.
    const scratchCounts = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    drawMiniStackSpine(this.svg, spineG, cx, cy, stack, {
      pieceSize,
      miniSize: 18,
      rulesetId,
      seedKey: `${nodeId}:ghost`,
      countLayer: scratchCounts,
    });

    const ghostCount = scratchCounts.querySelector("g.stackCount") as SVGGElement | null;
    return { stackG: g, extras: ghostCount ? [spineG, ghostCount] : [spineG] };
  }

  private async applyChosenMove(move: Move, opts: ApplyChosenMoveOptions = {}): Promise<void> {
    // Note: repetition is handled as draw by the rules (3× claimable, 5× automatic),
    // so we do not prohibit repeating moves client-side.

    // Track node path for notation
    if (this.currentTurnNodes.length === 0) {
      this.currentTurnNodes.push(move.from);
    }
    this.currentTurnNodes.push(move.to);
    if (move.kind === "capture") {
      this.currentTurnHasCapture = true;
    }
    
    const inAnalysis = this.analysisMode;

    let next: GameState & { didPromote?: boolean };
    try {
      if (inAnalysis) {
        next = applyMove(this.state as any, move as any) as any;
      } else {
        next = await this.driver.submitMove(move);
      }
    } catch (err) {
      this.playSfx("error");
      // eslint-disable-next-line no-console
      console.error("[controller] driver submitMove failed", err);
      const msg = err instanceof Error ? err.message : "Move failed";

      // In online mode, a failed submit often means our local view is stale
      // (opponent moved, grace timeout fired, etc). Resync once so UI doesn't
      // stay in an inconsistent state (e.g. still showing Select while server is over).
      if (this.driver.mode === "online") {
        try {
          await (this.driver as OnlineGameDriver).fetchLatest();
          this.assignControllerState(this.driver.getState());
          this.lockedCaptureFrom = null;
          this.lockedCaptureDir = null;
          this.jumpedSquares.clear();
          this.currentTurnNodes = [];
          this.currentTurnHasCapture = false;
          this.clearSelection();
          this.renderAuthoritative();

          this.recomputeMandatoryCapture();
          this.recomputeRepetitionCounts();

          // If the resynced state is actually over, lock the UI permanently.
          if (this.checkAndHandleCurrentPlayerLost()) return;
        } catch {
          // ignore resync errors
        }
      }

      // If the server says the game is over, keep the UI consistent.
      if (typeof msg === "string" && msg.toLowerCase().startsWith("game over")) {
        this.isGameOver = true;
        this.clearSelection();
        this.showBanner("Game Over", 0);
        this.showGameOverToast("Game Over");
        this.updatePanel();
        this.fireHistoryChange("gameOver");
        return;
      }

      this.showBanner(msg, 2500);
      return;
    }
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] apply", move);
    }

    this.rememberMoveTransitionSfx(this.state, next);
    const shouldPlayLocalMoveSfx = this.driver.mode !== "online";
    if (this.driver.mode === "online") {
      this.suppressOnlineGameplaySfxUntilTurnForColor = this.state.toMove;
    }
    if (shouldPlayLocalMoveSfx) {
      this.playGameplaySfx(move.kind === "capture" ? "capture" : "move", next);
      if (next.didPromote) this.playGameplaySfx("promote", next);
    }

    const prevForAnim = this.state;
    this.assignControllerState(next);
    
    // Animate the move before rendering (both quiet moves and captures)
    if (this.animationsEnabled && opts.animateLocalTravel !== false) {
      const animations: Array<Promise<void>> = [];

      const movingGroup = this.piecesLayer.querySelector(`g.stack[data-node="${move.from}"]`) as SVGGElement | null;
      if (movingGroup) {
        const countsLayer = ensureStackCountsLayer(this.svg);
        const movingCount = countsLayer.querySelector(`g.stackCount[data-node="${move.from}"]`) as SVGGElement | null;
        animations.push(
          animateStack(
            this.svg,
            this.overlayLayer,
            move.from,
            move.to,
            movingGroup,
            DEFAULT_PLAYBACK_MOVE_ANIMATION_MS,
            movingCount ? [movingCount] : []
          )
        );
      }

      // Columns Chess capture: animate the remainder of the captured stack back to the mover's origin.
      if (move.kind === "capture" && this.isColumnsChessRuleset()) {
        try {
          const capturedStack = prevForAnim.board.get(move.over);
          if (capturedStack && capturedStack.length > 1) {
            const remainder = capturedStack.slice(0, capturedStack.length - 1);
            if (remainder.length > 0) {
              const ghost = this.createGhostStackAtNode(move.over, remainder);
              if (ghost) {
                animations.push(
                  animateStack(
                    this.svg,
                    this.overlayLayer,
                    move.over,
                    move.from,
                    ghost.stackG,
                    DEFAULT_PLAYBACK_MOVE_ANIMATION_MS,
                    ghost.extras
                  )
                );
              }
            }
          }
        } catch {
          // ignore animation-only errors
        }
      }

      if (animations.length > 0) {
        await Promise.all(animations);
      }
    }
    
    // Now render the new state after animation
    this.renderAuthoritative();

    // Dead-play / server-enforced game over can happen mid-capture-chain.
    const forcedMsg = (this.state as any).forcedGameOver?.message as string | undefined;
    if (typeof forcedMsg === "string" && forcedMsg.length > 0) {
      if (inAnalysis) {
        // Ignore server-only end states while analyzing a hypothetical line.
        // Keep the sandbox interactive by stripping the forced marker.
        try {
          (this.state as any) = { ...(this.state as any) };
          delete (this.state as any).forcedGameOver;
        } catch {
          // ignore
        }
      } else {
        this.isGameOver = true;
        this.lockedCaptureFrom = null;
        this.lockedCaptureDir = null;
        this.jumpedSquares.clear();
        this.clearSelection();

        // In local mode, capture chains normally push history at turn boundary.
        // If the game ends mid-turn, record the final authoritative state now.
        if (this.driver.mode !== "online") {
          const separator = this.currentTurnHasCapture ? " × " : " → ";
          const boardSize = this.state.meta?.boardSize ?? 7;
          const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
          const emtMs = this.lastMoveCommittedAtMs > 0 ? Date.now() - this.lastMoveCommittedAtMs : null;
          this.lastMoveCommittedAtMs = Date.now();
          this.driver.pushHistory(this.state, notation, emtMs);
        }
        this.currentTurnNodes = [];
        this.currentTurnHasCapture = false;
        this.showBanner(forcedMsg, 0);
        this.showGameOverToast(forcedMsg);
        this.updatePanel();
        this.fireHistoryChange("gameOver");
        return;
      }
    }
    
    // Clear overlays immediately after move is rendered
    // Also cancel any pending remainder hint timers
    if (this.remainderTimer) {
      window.clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }
    clearOverlays(this.overlayLayer);
    
    if (move.kind === "capture") {
      // Columns Chess has no multi-capture chains; a capture ends the turn immediately.
      if (this.isChessLikeRuleset()) {
        this.clearSelection();

        // Record state in history at turn boundary (like quiet moves).
        const separator = this.currentTurnHasCapture ? " × " : " → ";
        const boardSize = this.state.meta?.boardSize ?? 8;
        const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
        if (inAnalysis) {
          this.analysisHistory?.push(this.state, notation);
        } else if (this.driver.mode !== "online") {
          const emtMs = this.lastMoveCommittedAtMs > 0 ? Date.now() - this.lastMoveCommittedAtMs : null;
          this.lastMoveCommittedAtMs = Date.now();
          this.driver.pushHistory(this.state, notation, emtMs);
        }
        this.currentTurnNodes = [];
        this.currentTurnHasCapture = false;
        this.fireHistoryChange("move");

        this.syncRepetitionRules();
        if (this.isGameOver) return;

        // No mandatory capture for chess-like rulesets.
        this.mandatoryCapture = false;

        if (!inAnalysis) {
          // Check for checkmate/stalemate.
          const gameResult = checkCurrentPlayerLost(this.state);
          if (gameResult.winner || gameResult.reason) {
            this.isGameOver = true;
            const msg = gameResult.reason || "Game Over";
            this.showBanner(msg, 0);
            this.showGameOverToast(msg);
            this.updatePanel();
            this.fireHistoryChange("gameOver");
            return;
          }
        }

        this.updatePanel();
        this.maybeToastTurnChange();
        return;
      }

      // Track the jumped-over square to prevent re-jumping it
      this.jumpedSquares.add(move.over);

      const lastDir = this.captureDir(move.from, move.to);

      const rulesetId = this.state.meta?.rulesetId ?? "lasca";
      const isDama = rulesetId === "dama" || rulesetId === "draughts_international";
      const isDamasca = rulesetId === "damasca" || rulesetId === "damasca_classic" || rulesetId === "columns_draughts";
      const isLasca = rulesetId === "lasca";
      const damaCaptureRemoval = isDama ? getDamaCaptureRemovalMode(this.state) : null;
      const damaStyleRulesetId = rulesetId === "draughts_international" ? "draughts_international" : "dama";
      
      // Check if promotion happened
      const didPromote = next.didPromote || false;
      
      // Check if there are more captures available from the destination
      const allCaptures = generateLegalMoves(this.state, {
        forcedFrom: move.to,
        ...((isLasca || isDama || isDamasca)
          ? { excludedJumpSquares: this.jumpedSquares, ...(isDama || isDamasca ? { lastCaptureDir: lastDir } : {}) }
          : {}),
      }).filter((m) => m.kind === "capture");
      const moreCapturesFromDest = allCaptures;
      
      // If promoted and rule says stop on promotion, end the chain
      if (didPromote && RULES.stopCaptureOnPromotion) {
        if (isDama) {
          // Dama promotes only at the end of the sequence; if we ever get here,
          // still finalize the chain correctly.
          if (this.driver.mode === "online") {
            this.assignControllerState(await (this.driver as OnlineGameDriver).finalizeCaptureChainRemote({
              rulesetId: damaStyleRulesetId,
              state: this.state,
              landing: move.to,
              jumpedSquares: this.jumpedSquares,
            }));
          } else {
            this.assignControllerState(this.driver.finalizeCaptureChain({
              rulesetId: damaStyleRulesetId,
              state: this.state,
              landing: move.to,
              jumpedSquares: this.jumpedSquares,
            }));
          }
        } else if (isDamasca) {
          // Damasca should not promote mid-chain, but finalize defensively.
          const damascaRulesetId = (rulesetId === "damasca_classic" ? "damasca_classic" : rulesetId === "columns_draughts" ? "columns_draughts" : "damasca") as
            | "damasca"
            | "damasca_classic"
            | "columns_draughts";
          if (this.driver.mode === "online") {
            this.assignControllerState(await (this.driver as OnlineGameDriver).finalizeCaptureChainRemote({
              rulesetId: damascaRulesetId,
              state: this.state,
              landing: move.to,
            }));
          } else {
            this.assignControllerState(this.driver.finalizeCaptureChain({
              rulesetId: damascaRulesetId,
              state: this.state,
              landing: move.to,
            }));
          }
        }
        // Switch turn now
        if (this.driver.mode === "online") {
          const separator = this.currentTurnHasCapture ? " × " : " → ";
          const boardSize = this.state.meta?.boardSize ?? 7;
          const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
          try {
            this.assignControllerState(await (this.driver as OnlineGameDriver).endTurnRemote(notation));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "End turn failed";
            this.showBanner(msg, 2500);
            return;
          }
        } else {
          this.assignControllerState(endTurn(this.state));
        }

        // In Dama, finalization may remove jumped pieces and/or promote.
        // We already rendered after applyMove, so re-render now to reflect finalization.
        if (
          (isDama && (damaCaptureRemoval === "end_of_sequence" || Boolean((this.state as any).didPromote))) ||
          (isDamasca && Boolean((this.state as any).didPromote))
        ) {
          this.renderAuthoritative();
        }

        this.lockedCaptureFrom = null;
        this.jumpedSquares.clear();
        this.clearSelection();
        
        // Record state in history at turn boundary
        if (this.driver.mode !== "online") {
          const separator = this.currentTurnHasCapture ? " × " : " → ";
          const boardSize = this.state.meta?.boardSize ?? 7;
          const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
          const emtMs = this.lastMoveCommittedAtMs > 0 ? Date.now() - this.lastMoveCommittedAtMs : null;
          this.lastMoveCommittedAtMs = Date.now();
          this.driver.pushHistory(this.state, notation, emtMs);
        }
        this.currentTurnNodes = [];
        this.currentTurnHasCapture = false;
        this.fireHistoryChange("move");

        this.syncRepetitionRules();
        if (this.isGameOver) return;

        // Update mandatory capture for new turn
        this.recomputeMandatoryCapture();
        
        // Check for game over - check if the player who now has the turn can play
        const gameResult = checkCurrentPlayerLost(this.state);
        if (gameResult.winner) {
          this.isGameOver = true;
          {
            const msg = gameResult.reason || "Game Over";
            this.showBanner(msg, 0);
            this.showGameOverToast(msg);
          }
          this.updatePanel();
          this.fireHistoryChange("gameOver");
          return;
        }

        this.maybeToastTurnChange();
        
        this.showBanner("Promoted — capture turn ends");
        // Don't show remainder hint - it will interfere with next turn's overlays
        return;
      }
      
      // If more captures available from destination, chain the capture
      if (moreCapturesFromDest.length > 0) {
        this.lockedCaptureFrom = move.to;
        this.lockedCaptureDir = lastDir;
        this.selected = move.to;
        this.showSelection(move.to);
        this.showBanner("Continue capture");
        // Don't show remainder hint during chain - it will be cleared when selection is shown
        return;
      }
      
      // No more captures, switch turn and end
      if (isDama) {
        if (this.driver.mode === "online") {
          this.assignControllerState(await (this.driver as OnlineGameDriver).finalizeCaptureChainRemote({
            rulesetId: damaStyleRulesetId,
            state: this.state,
            landing: move.to,
            jumpedSquares: this.jumpedSquares,
          }));
        } else {
          this.assignControllerState(this.driver.finalizeCaptureChain({
            rulesetId: damaStyleRulesetId,
            state: this.state,
            landing: move.to,
            jumpedSquares: this.jumpedSquares,
          }));
        }
      } else if (isDamasca) {
        const damascaRulesetId = (rulesetId === "damasca_classic" ? "damasca_classic" : rulesetId === "columns_draughts" ? "columns_draughts" : "damasca") as
          | "damasca"
          | "damasca_classic"
          | "columns_draughts";
        if (this.driver.mode === "online") {
          this.assignControllerState(await (this.driver as OnlineGameDriver).finalizeCaptureChainRemote({
            rulesetId: damascaRulesetId,
            state: this.state,
            landing: move.to,
          }));
        } else {
          this.assignControllerState(this.driver.finalizeCaptureChain({
            rulesetId: damascaRulesetId,
            state: this.state,
            landing: move.to,
          }));
        }
      }
      if (this.driver.mode === "online") {
        const separator = this.currentTurnHasCapture ? " × " : " → ";
        const boardSize = this.state.meta?.boardSize ?? 7;
        const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
        try {
          this.assignControllerState(await (this.driver as OnlineGameDriver).endTurnRemote(notation));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "End turn failed";
          this.showBanner(msg, 2500);
          return;
        }
      } else {
        this.assignControllerState(endTurn(this.state));
      }

      // Dama may promote during finalization even in immediate-removal mode.
      // Re-render so the promotion is visible before the opponent starts their turn.
      if (
        (isDama && (damaCaptureRemoval === "end_of_sequence" || Boolean((this.state as any).didPromote))) ||
        (isDamasca && Boolean((this.state as any).didPromote))
      ) {
        this.renderAuthoritative();
      }

      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.clearSelection();
      
      // Record state in history at turn boundary
      if (this.driver.mode !== "online") {
        const separator = this.currentTurnHasCapture ? " × " : " → ";
        const boardSize = this.state.meta?.boardSize ?? 7;
        const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
        const emtMs = this.lastMoveCommittedAtMs > 0 ? Date.now() - this.lastMoveCommittedAtMs : null;
        this.lastMoveCommittedAtMs = Date.now();
        this.driver.pushHistory(this.state, notation, emtMs);
      }
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.fireHistoryChange("move");

      this.syncRepetitionRules();
      if (this.isGameOver) return;
      
      // Update mandatory capture for new turn
      this.recomputeMandatoryCapture();
      
      // Check for game over - check if the player who now has the turn can play
      const gameResult = checkCurrentPlayerLost(this.state);
      if (gameResult.winner) {
        this.isGameOver = true;
        {
          const msg = gameResult.reason || "Game Over";
          this.showBanner(msg, 0);
          this.showGameOverToast(msg);
        }
        this.updatePanel();
        this.fireHistoryChange("gameOver");
        return;
      }

      this.maybeToastTurnChange();
      
      this.showBanner("Turn changed");
      // Don't show remainder hint - it will interfere with next turn's overlays
    } else {
      // Quiet move - turn already switched in applyMove
      this.clearSelection();
      
      // Record state in history at turn boundary
      const separator = this.currentTurnHasCapture ? " × " : " → ";
      const boardSize = this.state.meta?.boardSize ?? 7;
      const notation = this.currentTurnNodes.map((id) => this.nodeIdToA1ForView(id, boardSize)).join(separator);
      if (inAnalysis) {
        this.analysisHistory?.push(this.state, notation);
      } else if (this.driver.mode !== "online") {
        const emtMs = this.lastMoveCommittedAtMs > 0 ? Date.now() - this.lastMoveCommittedAtMs : null;
        this.lastMoveCommittedAtMs = Date.now();
        this.driver.pushHistory(this.state, notation, emtMs);
      }
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.fireHistoryChange("move");

      this.syncRepetitionRules();
      if (this.isGameOver) return;
      
      // Update mandatory capture for new turn
      this.recomputeMandatoryCapture();
      
      if (!inAnalysis) {
        // Check for game over after quiet move - check if current player can play
        const gameResult = checkCurrentPlayerLost(this.state);
        if (gameResult.winner || (this.isColumnsChessRuleset() && gameResult.reason)) {
          this.isGameOver = true;
          {
            const msg = gameResult.reason || "Game Over";
            this.showBanner(msg, 0);
            this.showGameOverToast(msg);
          }
          this.updatePanel();
          this.fireHistoryChange("gameOver");
          return;
        }
      }
      
      // Update panel to show capture message if needed
      this.updatePanel();

      this.maybeToastTurnChange();
    }
  }

  private async onClick(ev: MouseEvent): Promise<void> {
    if (Date.now() < this.suppressBoardClickUntilMs) return;

    // Any click on the board clears the last-move square highlights.
    // (They will re-appear after the next completed move.)
    if (this.lastMoveHighlightsEnabled) {
      try {
        if (this.state.ui?.lastMove) {
          // Keep `ui` but remove just the hint.
          this.state.ui = { ...(this.state.ui ?? {}) };
          delete this.state.ui.lastMove;
        }
        clearLastMoveSquares(this.overlayLayer);
      } catch {
        // ignore
      }
    }

    if (!this.canProcessBoardInput()) return;

    let nodeId = this.resolveClickedNode(ev.target);
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] click", { target: ev.target, resolved: nodeId, selected: this.selected, targets: this.currentTargets });
    }
    if (!nodeId) {
      // Try geometric hit-test against current target circles
      nodeId = this.hitTestTargets(ev);
    }
    if (!nodeId) {
      this.clearSelection();
      return;
    }

    if (this.selected) {
      const move = this.resolveMoveFromDropNode(this.selected, nodeId, ev.clientX, ev.clientY);
      if (move) {
        await this.applyChosenMove(move, { animateLocalTravel: true });
        return;
      }

      if (this.currentTargets.includes(nodeId)) {
        this.clearSelection();
        return;
      }

    }

    // If we're in a capture chain, only allow clicking the locked piece or its targets
    if (this.lockedCaptureFrom) {
      if (nodeId === this.lockedCaptureFrom) {
        // Clicked the piece that must continue capturing - reselect it
        this.selected = nodeId;
        this.showSelection(nodeId);
        return;
      }
      // Otherwise, clicking anything else during a locked chain does nothing
      return;
    }

    // Select only your own stack; clicking empty node clears selection.
    // In analysis mode any piece is selectable; if the chosen piece belongs to the
    // non-active side, flip toMove so legal-move generation and applyMove work correctly.
    if (this.isOwnStack(nodeId)) {
      this.selectNodeForInteraction(nodeId);
    } else {
      this.clearSelection();
    }
  }
}
