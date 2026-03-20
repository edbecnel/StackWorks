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
    createBotManager: true,
    showBotSection: args.onlineLocalBotEnabled,
    disableBotSelectors: true,
    resetSelectorsToHuman: !args.onlineLocalBotEnabled,
  };
}