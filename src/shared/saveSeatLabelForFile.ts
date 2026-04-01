import type { GameController } from "../controller/gameController";
import type { Player } from "../types";
import { isLocalBotSide, resolveActiveLocalSeatDisplayName, resolveBotPersonaDisplayName } from "./localPlayerNames";
import { getSideLabelsForRuleset } from "./sideTerminology";

/**
 * Player label for `buildPlayerNamedSaveFilename` / save JSON metadata.
 * Local bot seats use the stored persona title (e.g. Teacher bot, Balanced bot); humans use the same
 * resolution as board/shell local names (stored names, signed-in, side labels).
 */
export function resolveSeatLabelForGameSaveFile(args: {
  side: Player;
  controller: GameController;
  rulesetId: string;
  boardSize?: number | null;
  root?: ParentNode;
  signedInDisplayName?: string | null;
}): string {
  const root = args.root ?? document;
  const pinned = args.controller.getSavePinnedSeatDisplayName(args.side)?.trim();
  if (pinned) return pinned;

  const labels = getSideLabelsForRuleset(args.rulesetId, { boardSize: args.boardSize });
  const sideLabel = args.side === "W" ? labels.W : labels.B;
  const snap = args.controller.getPlayerShellSnapshot();

  if (isLocalBotSide(args.side, root)) {
    return resolveBotPersonaDisplayName(args.side, sideLabel);
  }

  return resolveActiveLocalSeatDisplayName(args.side, {
    root,
    sideLabel,
    fallbackDisplayName: snap.players[args.side].displayName,
    signedInDisplayName: args.signedInDisplayName ?? null,
  });
}
