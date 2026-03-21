import type { Stack } from "../types.ts";
import type { GameMeta } from "../variants/variantTypes";
import type { GameState } from "../game/state.ts";

export type WireCaptureChain = {
  promotionEarned?: boolean;
};

export type WireGameState = {
  board: [string, Stack][];
  toMove: "B" | "W";
  phase: "idle" | "select" | "anim";
  meta?: GameMeta;
  ui?: GameState["ui"];
  /** Columns Chess / chess-like aux state (castling, en passant). */
  chess?: GameState["chess"];
  forcedGameOver?: {
    winner: "B" | "W" | null;
    reasonCode: string;
    message: string;
  };
  captureChain?: WireCaptureChain;
  damascaDeadPlay?: {
    noProgressPlies: number;
    officerOnlyPlies: number;
  };

  /** US Checkers draw tracking. */
  checkersUsDraw?: GameState["checkersUsDraw"];
  pendingDrawOffer?: GameState["pendingDrawOffer"];
};

export type WireHistory = {
  states: WireGameState[];
  notation: string[];
  currentIndex: number;
  emtMs?: Array<number | null>;
  evals?: Array<import("../bot/uciEngine.ts").EvalScore | null>;
};

export type WireSnapshot = {
  state: WireGameState;
  history: WireHistory;
  stateVersion: number;
};

export function serializeWireGameState(state: any): WireGameState {
  return {
    board: Array.from(state.board?.entries?.() ?? []),
    toMove: state.toMove,
    phase: state.phase,
    meta: state.meta,
    ui: state.ui,
    chess: state.chess,
    forcedGameOver: state.forcedGameOver,
    captureChain: state.captureChain,
    damascaDeadPlay: state.damascaDeadPlay,
    checkersUsDraw: state.checkersUsDraw,
    pendingDrawOffer: state.pendingDrawOffer,
  };
}

export function deserializeWireGameState(wire: WireGameState): any {
  return {
    board: new Map(wire.board),
    toMove: wire.toMove,
    phase: wire.phase,
    meta: wire.meta,
    ui: (wire as any).ui,
    chess: (wire as any).chess,
    forcedGameOver: (wire as any).forcedGameOver,
    captureChain: wire.captureChain,
    damascaDeadPlay: (wire as any).damascaDeadPlay,
    checkersUsDraw: (wire as any).checkersUsDraw,
    pendingDrawOffer: (wire as any).pendingDrawOffer,
  };
}

export function serializeWireHistory(history: {
  states: any[];
  notation: string[];
  currentIndex: number;
  emtMs?: Array<number | null>;
  evals?: Array<import("../bot/uciEngine.ts").EvalScore | null>;
}): WireHistory {
  return {
    states: history.states.map(serializeWireGameState),
    notation: [...history.notation],
    currentIndex: history.currentIndex,
    ...(Array.isArray(history.emtMs) ? { emtMs: [...history.emtMs] } : {}),
    ...(Array.isArray(history.evals)
      ? { evals: history.evals.map((score) => (score ? { ...score } : null)) }
      : {}),
  };
}

export function deserializeWireHistory(wire: WireHistory): {
  states: any[];
  notation: string[];
  currentIndex: number;
  emtMs?: Array<number | null>;
  evals?: Array<import("../bot/uciEngine.ts").EvalScore | null>;
} {
  return {
    states: wire.states.map(deserializeWireGameState),
    notation: Array.isArray(wire.notation) ? [...wire.notation] : [],
    currentIndex: Number.isInteger(wire.currentIndex) ? wire.currentIndex : wire.states.length - 1,
    ...(Array.isArray((wire as any).emtMs) ? { emtMs: [...(wire as any).emtMs] } : {}),
    ...(Array.isArray((wire as any).evals)
      ? { evals: (wire as any).evals.map((score: any) => (score ? { ...score } : null)) }
      : {}),
  };
}
