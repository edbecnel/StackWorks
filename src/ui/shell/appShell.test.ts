import { beforeEach, describe, expect, it, vi } from "vitest";
import { initStartPageAppShell } from "./appShell";

function setShellState(state: unknown): void {
  localStorage.setItem("stackworks.shell.state", JSON.stringify(state));
}

describe("initStartPageAppShell", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(min-width: 1040px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("switches to online mode and opens the lobby when Community is the active shell section", () => {
    setShellState({ activeSection: "community", activeGame: "chess_classic", gameSection: null, playSubSection: "online" });

    const onSelectPlayMode = vi.fn();
    const onOpenLobby = vi.fn();
    const scrollIntoView = vi.fn();

    document.body.innerHTML = `
      <main id="pageRoot">
        <div id="contentRoot">
          <header>
            <h1>StackWorks</h1>
            <p class="subtle">Original subtitle</p>
          </header>
        </div>
        <details id="launchLobbySection" data-start-section="lobby">
          <summary>Lobby</summary>
          <div>Lobby content</div>
        </details>
        <section data-start-section="game">Game content</section>
        <section id="launchAccountSection">Account content</section>
        <section data-start-section="startup">Settings content</section>
      </main>
    `;

    const lobby = document.getElementById("launchLobbySection") as HTMLDetailsElement;
    lobby.open = false;
    lobby.scrollIntoView = scrollIntoView;

    initStartPageAppShell({
      contentRoot: document.getElementById("contentRoot") as HTMLElement,
      initialVariantId: "chess_classic",
      initialPlayMode: "local",
      onSelectPlayMode,
      onOpenLobby,
    });

    expect(onSelectPlayMode).toHaveBeenCalledWith("online");
    expect(onOpenLobby).toHaveBeenCalledTimes(1);
    expect(lobby.open).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });
});