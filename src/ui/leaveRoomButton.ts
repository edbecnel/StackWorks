import type { DriverMode, OnlineGameDriver } from "../driver/gameDriver.ts";

export const ONLINE_SUSPEND_TO_START_PAGE_MESSAGE = "Return to the Start Page? The current game will be suspended. You may return to this game to continue before the game pause/wait period expires.";

export function bindLeaveRoomButton(args: {
  button: HTMLButtonElement | null;
  driverMode: DriverMode;
  onlineDriver?: OnlineGameDriver | null;
  confirmLeave?: (message: string) => boolean;
  navigate?: (href: string) => void;
}): void {
  const { button } = args;
  if (!button) return;

  const confirmLeave = args.confirmLeave ?? ((message: string) => window.confirm(message));
  const navigate = args.navigate ?? ((href: string) => window.location.assign(href));

  button.addEventListener("click", () => {
    if (args.driverMode !== "online") {
      navigate("./");
      return;
    }

    const online = args.onlineDriver ?? null;
    const playerId = online?.getPlayerId() ?? null;
    if (!playerId || playerId === "spectator") {
      navigate("./");
      return;
    }

    if (!confirmLeave(ONLINE_SUSPEND_TO_START_PAGE_MESSAGE)) return;
    navigate("./");
  });
}