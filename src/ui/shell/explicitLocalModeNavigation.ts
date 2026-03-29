/**
 * Builds ?mode=local (and clears online/join params) on the current pathname.
 * Used for explicit local seating (human vs human, human vs bot, bot vs bot)
 * without reloading the board SVG when combined with shell staging unlock.
 */
export function buildExplicitLocalModeUrlString(): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "local");
    url.searchParams.delete("server");
    url.searchParams.delete("roomId");
    url.searchParams.delete("playerId");
    url.searchParams.delete("watchToken");
    url.searchParams.delete("color");
    url.searchParams.delete("prefColor");
    url.searchParams.delete("visibility");
    url.searchParams.delete("create");
    url.searchParams.delete("join");
    url.searchParams.delete("botSeats");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return window.location.pathname;
  }
}

export function replaceHistoryWithExplicitLocalMode(): void {
  try {
    const next = buildExplicitLocalModeUrlString();
    window.history.replaceState(window.history.state, "", next);
  } catch {
    // ignore
  }
}
