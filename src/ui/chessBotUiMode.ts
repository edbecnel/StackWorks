import type { DriverMode } from "../driver/gameDriver.ts";

export type ChessBotUiMode = {
  createBotManager: boolean;
  showBotSection: boolean;
  disableBotSelectors: boolean;
  resetSelectorsToHuman: boolean;
};

export function resolveChessBotUiMode(args: {
  driverMode: DriverMode;
  onlineLocalBotEnabled: boolean;
}): ChessBotUiMode {
  if (args.driverMode !== "online") {
    return {
      createBotManager: true,
      showBotSection: true,
      disableBotSelectors: false,
      resetSelectorsToHuman: false,
    };
  }

  return {
    // Keep a local manager alive for engine-eval support in online play,
    // even when this client is not controlling a local bot seat.
    createBotManager: true,
    showBotSection: args.onlineLocalBotEnabled,
    disableBotSelectors: true,
    resetSelectorsToHuman: !args.onlineLocalBotEnabled,
  };
}