import { beforeEach, describe, expect, it, vi } from "vitest";
import { initStartPageAppShell } from "./appShell";

function setShellState(state: unknown): void {
  localStorage.setItem("stackworks.shell.state", JSON.stringify(state));
}

function installMatchMedia(opts: { desktop: boolean; compactRail?: boolean }): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1040px")
        ? opts.desktop
        : query.includes("max-width: 1279px")
          ? (opts.compactRail ?? false)
          : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("initStartPageAppShell", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    localStorage.clear();
    installMatchMedia({ desktop: true, compactRail: false });
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

  it("opens separate Sections and Games drawers on non-desktop viewports", () => {
    installMatchMedia({ desktop: false, compactRail: false });

    document.body.innerHTML = `
      <main id="pageRoot">
        <div id="contentRoot">
          <header>
            <h1>StackWorks</h1>
            <p class="subtle">Original subtitle</p>
          </header>
        </div>
        <details id="launchLobbySection" data-start-section="lobby"><summary>Lobby</summary></details>
        <section data-start-section="game">Game content</section>
        <section id="launchAccountSection">Account content</section>
        <section data-start-section="startup">Settings content</section>
      </main>
    `;

    initStartPageAppShell({
      contentRoot: document.getElementById("contentRoot") as HTMLElement,
      initialVariantId: "chess_classic",
      initialPlayMode: "local",
    });

    const sectionsToggle = document.querySelector(".appShellMenuToggle") as HTMLButtonElement | null;
    const gamesToggle = document.querySelector(".appShellGamesToggle") as HTMLButtonElement | null;
    const rail = document.getElementById("stackworksAppShellRail") as HTMLElement;
    const gamesRail = document.getElementById("stackworksAppShellGamesRail") as HTMLElement;
    expect(sectionsToggle?.textContent).toBe("Sections");
    expect(gamesToggle?.textContent).toBe("Games");
    expect(sectionsToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(gamesToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(rail).toBeTruthy();
    expect(rail.getAttribute("aria-hidden")).toBe("true");
    expect(gamesRail.getAttribute("aria-hidden")).toBe("true");

    const headerBrand = document.querySelector(".appShellHeaderBrand") as HTMLAnchorElement | null;
    expect(headerBrand?.getAttribute("href")).toBe("./");
    expect(headerBrand?.getAttribute("aria-label")).toBe("Start Page");
    expect(headerBrand?.querySelector('.appShellHeaderBrandMark img')?.getAttribute("src")).toContain("stackworks-logo-icon.svg");
    expect(headerBrand?.querySelector('.appShellHeaderBrandWordmark img')?.getAttribute("src")).toContain("stackworks-wordmark.svg");

    sectionsToggle?.click();
    expect(sectionsToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(rail.getAttribute("aria-hidden")).toBe("false");

    gamesToggle?.click();
    expect(sectionsToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(gamesToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(rail.getAttribute("aria-hidden")).toBe("true");
    expect(gamesRail.getAttribute("aria-hidden")).toBe("false");
  });

  it("switches the desktop rail into compact mode at narrower desktop widths", () => {
    installMatchMedia({ desktop: true, compactRail: true });

    document.body.innerHTML = `
      <main id="pageRoot">
        <div id="contentRoot">
          <header>
            <h1>StackWorks</h1>
            <p class="subtle">Original subtitle</p>
          </header>
        </div>
        <details id="launchLobbySection" data-start-section="lobby"><summary>Lobby</summary></details>
        <section data-start-section="game">Game content</section>
        <section id="launchAccountSection">Account content</section>
        <section data-start-section="startup">Settings content</section>
      </main>
    `;

    initStartPageAppShell({
      contentRoot: document.getElementById("contentRoot") as HTMLElement,
      initialVariantId: "chess_classic",
      initialPlayMode: "local",
    });

    const shell = document.querySelector(".appShellRoot") as HTMLElement | null;
    expect(shell?.dataset.railMode).toBe("compact");

    const gamesRail = document.getElementById("stackworksAppShellGamesRail") as HTMLElement | null;
    expect(gamesRail?.getAttribute("aria-hidden")).toBe("false");

    const firstNav = document.querySelector(".appShellNavButton") as HTMLButtonElement | null;
    expect(firstNav?.getAttribute("aria-label")).toBe("Home");
    expect(firstNav?.querySelector(".appShellNavShortLabel")?.textContent).toBe("Ho");
  });

  it("lists all launchable variants in the start-page shell chooser", () => {
    document.body.innerHTML = `
      <main id="pageRoot">
        <div id="contentRoot">
          <header>
            <h1>StackWorks</h1>
            <p class="subtle">Original subtitle</p>
          </header>
        </div>
        <details id="launchLobbySection" data-start-section="lobby"><summary>Lobby</summary></details>
        <section data-start-section="game">Game content</section>
        <section id="launchAccountSection">Account content</section>
        <section data-start-section="startup">Settings content</section>
      </main>
    `;

    initStartPageAppShell({
      contentRoot: document.getElementById("contentRoot") as HTMLElement,
      initialVariantId: "chess_classic",
      initialPlayMode: "local",
    });

    const variantGrid = document.querySelector('[data-shell-variants]') as HTMLElement | null;
    const labels = Array.from(variantGrid?.querySelectorAll('.appShellChoiceLabel') ?? []).map((node) => node.textContent?.trim());

    expect(labels).toContain("Lasca 8×8");
    expect(labels).toContain("International Draughts");
    expect(labels).toContain("Checkers (US)");
    expect(labels).toContain("Dama International");
    expect(labels).toContain("Damasca Classic");
  });

  it("shows an Open Page button in the Selected game card and keeps it synced to the current variant", () => {
    document.body.innerHTML = `
      <main id="pageRoot">
        <div id="contentRoot">
          <header>
            <h1>StackWorks</h1>
            <p class="subtle">Original subtitle</p>
          </header>
        </div>
        <details id="launchLobbySection" data-start-section="lobby"><summary>Lobby</summary></details>
        <section data-start-section="game">Game content</section>
        <section id="launchAccountSection">Account content</section>
        <section data-start-section="startup">Settings content</section>
      </main>
    `;

    const shell = initStartPageAppShell({
      contentRoot: document.getElementById("contentRoot") as HTMLElement,
      initialVariantId: "chess_classic",
      initialPlayMode: "local",
    });

    const selectedGameOpenPage = document.querySelector('[data-shell-open-page]') as HTMLAnchorElement | null;
    expect(selectedGameOpenPage?.textContent?.trim()).toBe("Open Page");
    expect(selectedGameOpenPage?.getAttribute("href")).toBe("./chess");

    shell.setSelectedGame("columns_chess");
    expect(selectedGameOpenPage?.getAttribute("href")).toBe("./columnsChess");
  });

  it("allows the mobile header title to wrap to two lines instead of truncating", () => {
    installMatchMedia({ desktop: false, compactRail: false });

    document.body.innerHTML = `
      <main id="pageRoot">
        <div id="contentRoot">
          <header>
            <h1>StackWorks</h1>
            <p class="subtle">Original subtitle</p>
          </header>
        </div>
        <details id="launchLobbySection" data-start-section="lobby"><summary>Lobby</summary></details>
        <section data-start-section="game">Game content</section>
        <section id="launchAccountSection">Account content</section>
        <section data-start-section="startup">Settings content</section>
      </main>
    `;

    initStartPageAppShell({
      contentRoot: document.getElementById("contentRoot") as HTMLElement,
      initialVariantId: "draughts_10_international",
      initialPlayMode: "local",
    });

    const shellStyle = document.getElementById("stackworks-app-shell-style");
    expect(shellStyle?.textContent).toContain("grid-template-columns: 260px minmax(0, 1fr) 320px;");
    expect(shellStyle?.textContent).toContain('"sections title title"');
    expect(shellStyle?.textContent).toContain('"games help ."');
    expect(shellStyle?.textContent).toContain("align-items: center;");
    expect(shellStyle?.textContent).toContain("min-height: 36px;");
    expect(shellStyle?.textContent).toContain("-webkit-line-clamp: 2;");
    expect(shellStyle?.textContent).toContain("white-space: normal;");
    expect(shellStyle?.textContent).toContain("font-size: clamp(16px, 3.6vw, 20px);");
    expect(shellStyle?.textContent).toContain("overflow-wrap: anywhere;");
    expect(shellStyle?.textContent).toContain("-webkit-text-size-adjust: 100%;");
    expect(shellStyle?.textContent).toContain("justify-self: end;");
    expect(shellStyle?.textContent).toContain("margin-top: 0;");
    expect(shellStyle?.textContent).toContain("flex: 0 0 auto;");
  });
});