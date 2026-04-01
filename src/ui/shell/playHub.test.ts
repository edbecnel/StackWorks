import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BotControllerMode,
  GlobalSection,
  normalizeBotPersona,
  normalizeCoachLevel,
  normalizeBotPlayState,
  normalizeHostedRoomState,
  normalizeOnlineSubSection,
  normalizePlaySubSection,
  HostedRoomOwnerControl,
  HostedRoomVisibilityMode,
  OnlineSubSection,
  PlaySubSection,
} from "../../config/shellState";
import { createInitialGameStateForVariant } from "../../game/state";
import { writeAuthSessionUserId } from "../../shared/authSessionClient";
import { serializeWireGameState } from "../../shared/wireState";
import type { VariantId } from "../../variants/variantTypes";
import { createPlayHub } from "./playHub";

describe("createPlayHub", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Stub `/api/room/:id/meta` + snapshot fetches so async resume validation can confirm an active seat. */
  function stubFetchForValidResumeSeat(args: { roomId: string; playerId: string; variantId: VariantId }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes(`/api/room/${encodeURIComponent(args.roomId)}/meta`)) {
          return new Response(
            JSON.stringify({
              roomId: args.roomId,
              variantId: args.variantId,
              visibility: "public",
              isOver: false,
              seatsTaken: ["W", "B"],
              seatsOpen: [],
              timeControl: { mode: "none" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes(`/api/room/${encodeURIComponent(args.roomId)}`) && url.includes(`playerId=${encodeURIComponent(args.playerId)}`)) {
          const gs = createInitialGameStateForVariant(args.variantId);
          const wire = serializeWireGameState(gs);
          return new Response(
            JSON.stringify({
              snapshot: {
                state: wire,
                history: { states: [wire], notation: [], currentIndex: 0 },
                stateVersion: 1,
              },
              presence: {
                [args.playerId]: { connected: true, lastSeenAt: new Date().toISOString() },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
    );
  }

  function readTopLevelTabLabels(): string[] {
    return Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).map((tab) => tab.textContent?.trim() ?? "");
  }

  function readVisiblePlayHubTopTabLabels(): string[] {
    return Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]'))
      .filter((tab) => !(tab as HTMLButtonElement).hidden)
      .map((tab) => tab.textContent?.trim() ?? "");
  }

  it("offers a direct host action on the current variant page", () => {
    window.history.replaceState({}, "", "/chess.html");
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);

    const hostAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Host quick match here"),
    ) as HTMLAnchorElement | undefined;

    expect(hostAction?.getAttribute("href")).toContain("/chess.html?mode=online");
    expect(hostAction?.getAttribute("href")).toContain("server=http%3A%2F%2Flocalhost%3A8788");
    expect(hostAction?.getAttribute("href")).toContain("create=1");
    expect(hostAction?.getAttribute("href")).toContain("botSeats=off");
  });

  it("uses Online, Bots, Coach, and Local as visible top-level tabs while Resume stays hidden until a server-validated seat exists", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/",
    });

    document.body.appendChild(hub.element);

    expect(readVisiblePlayHubTopTabLabels()).toEqual(["Online", "Bots", "Coach", "Local"]);
    const tabLabels = readTopLevelTabLabels();
    expect(tabLabels).toEqual(["Online", "Bots", "Coach", "Local", "Resume"]);
    expect(tabLabels).not.toContain("Friend");
    expect(tabLabels).not.toContain("Tournaments");
    expect(tabLabels).not.toContain("Variants");
    const resumeTabDefault = Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).find(
      (b) => b.textContent?.trim() === "Resume",
    ) as HTMLButtonElement | undefined;
    expect(resumeTabDefault?.hidden).toBe(true);
    const onlineModeLabels = Array.from(document.querySelectorAll('.playHubOnlineModeTabs [role="tab"]')).map((tab) => tab.textContent?.trim());
    expect(onlineModeLabels).toEqual(["Quick Match", "Custom Challenge", "Play a Friend", "Hosted Rooms", "Tournaments"]);
    expect(document.querySelector(".playHubSectionTitle")?.textContent).toBe("Switch variant");
  });

  it("restores the nested online mode from shell state without promoting it to a top-level tab", () => {
    localStorage.setItem("stackworks.shell.state", JSON.stringify({
      activeSection: "community",
      activeGame: "chess_classic",
      gameSection: null,
      playSubSection: "online",
      onlineSubSection: "friend",
    }));

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/",
    });

    document.body.appendChild(hub.element);

    const activeTopTab = document.querySelector('.playHub > .stackworksTabs[role="tablist"] [role="tab"][aria-selected="true"]');
    const activeOnlineTab = document.querySelector('.playHubOnlineModeTabs [role="tab"][aria-selected="true"]');

    expect(activeTopTab?.textContent?.trim()).toBe("Online");
    expect(activeOnlineTab?.textContent?.trim()).toBe("Play a Friend");
    expect(document.querySelector('.playHubOnlineModePanel.isActive .playHubOnlineModeTitle')?.textContent).toBe("Play a Friend");
  });

  it("persists the selected nested online mode when the user changes it", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/",
    });

    document.body.appendChild(hub.element);

    const hostedRoomsTab = Array.from(document.querySelectorAll('.playHubOnlineModeTabs [role="tab"]')).find((tab) =>
      tab.textContent?.trim() === "Hosted Rooms",
    ) as HTMLButtonElement | undefined;

    hostedRoomsTab?.click();

    const persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, string>;
    expect(persistedState.playSubSection).toBe("online");
    expect(persistedState.onlineSubSection).toBe("hosted-rooms");
    expect(document.querySelector('.playHubOnlineModePanel.isActive .playHubOnlineModeTitle')?.textContent).toBe("Hosted Rooms");
  });

  it("switches the rendered panel when the user clicks the Bots tab", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/",
    });

    document.body.appendChild(hub.element);

    const botsTab = Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).find((tab) =>
      tab.textContent?.trim() === "Bots",
    ) as HTMLButtonElement | undefined;

    botsTab?.click();

    expect(document.querySelectorAll('.playHubPanel.isActive [data-bot-field="controller"]')).toHaveLength(2);

    const persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    expect(persistedState.playSubSection).toBe("bots");
  });

  it("wires Play a Friend to a private online launcher configuration", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);

    const friendTab = Array.from(document.querySelectorAll('.playHubOnlineModeTabs [role="tab"]')).find((tab) =>
      tab.textContent?.trim() === "Play a Friend",
    ) as HTMLButtonElement | undefined;
    friendTab?.click();

    const friendAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Create private invite room"),
    ) as HTMLAnchorElement | undefined;
    friendAction?.addEventListener("click", (event) => event.preventDefault(), { once: true });
    friendAction?.click();

    expect(localStorage.getItem("lasca.play.mode")).toBe("online");
    expect(localStorage.getItem("lasca.online.action")).toBe("create");
    expect(localStorage.getItem("lasca.online.visibility")).toBe("private");
    expect(localStorage.getItem("lasca.variantId")).toBe("chess_classic");
  });

  it("persists Hosted Rooms policy before returning to the launcher", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);

    const hostedTab = Array.from(document.querySelectorAll('.playHubOnlineModeTabs [role="tab"]')).find((tab) =>
      tab.textContent?.trim() === "Hosted Rooms",
    ) as HTMLButtonElement | undefined;
    hostedTab?.click();

    const visibilitySelect = document.querySelector('[data-hosted-field="visibility"]') as HTMLSelectElement | null;
    const ownerSelect = document.querySelector('[data-hosted-field="owner-control"]') as HTMLSelectElement | null;
    visibilitySelect!.value = "invite-only";
    visibilitySelect!.dispatchEvent(new Event("change", { bubbles: true }));
    ownerSelect!.value = "members-can-invite";
    ownerSelect!.dispatchEvent(new Event("change", { bubbles: true }));

    const hostedAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Create hosted room"),
    ) as HTMLAnchorElement | undefined;
    hostedAction?.addEventListener("click", (event) => event.preventDefault(), { once: true });
    hostedAction?.click();

    expect(localStorage.getItem("lasca.online.visibility")).toBe("private");
    expect(localStorage.getItem("stackworks.online.hosted.visibility")).toBe("invite-only");
    expect(localStorage.getItem("stackworks.online.hosted.ownerControl")).toBe("members-can-invite");

    const persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    expect(normalizeHostedRoomState(persistedState.hostedRoomState)).toEqual({
      visibility: HostedRoomVisibilityMode.InviteOnly,
      ownerControl: HostedRoomOwnerControl.MembersCanInvite,
    });
  });

  it("loads live hosted rooms for the active variant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        rooms: [
          {
            roomId: "abc123",
            variantId: "chess_classic",
            visibility: "public",
            status: "waiting",
            hostDisplayName: "Club Night",
            seatsTaken: ["W"],
            seatsOpen: ["B"],
            createdAt: new Date(Date.now() - 60_000).toISOString(),
          },
          {
            roomId: "def456",
            variantId: "lasca_7_classic",
            visibility: "public",
            status: "waiting",
            hostDisplayName: "Other Variant",
            seatsTaken: [],
            seatsOpen: ["W", "B"],
          },
        ],
      }),
    })));

    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);

    const hostedTab = Array.from(document.querySelectorAll('.playHubOnlineModeTabs [role="tab"]')).find((tab) =>
      tab.textContent?.trim() === "Hosted Rooms",
    ) as HTMLButtonElement | undefined;
    hostedTab?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector(".playHubHostedStatus")?.textContent).toContain("1 live Classic Chess room");
    expect(document.querySelector(".playHubHostedRoomTitle")?.textContent).toContain("Club Night");
    expect(Array.from(document.querySelectorAll(".playHubHostedRoomActions .playHubAction")).some((element) => element.textContent?.includes("Join room"))).toBe(true);
  });

  it("allows both bots when switching human to bot but prevents two humans when switching bot to human", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    expect(controllerSelects).toHaveLength(2);
    expect(controllerSelects[0]?.value).toBe("human");
    expect(controllerSelects[1]?.value).toBe("bot");

    controllerSelects[0].value = "bot";
    controllerSelects[0].dispatchEvent(new Event("change", { bubbles: true }));

    let persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    let botPlayState = normalizeBotPlayState(persistedState.botPlayState);
    expect(botPlayState?.white.controller).toBe(BotControllerMode.Bot);
    expect(botPlayState?.black.controller).toBe(BotControllerMode.Bot);

    controllerSelects[1].value = "human";
    controllerSelects[1].dispatchEvent(new Event("change", { bubbles: true }));

    persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    botPlayState = normalizeBotPlayState(persistedState.botPlayState);
    expect(botPlayState?.white.controller).toBe(BotControllerMode.Bot);
    expect(botPlayState?.black.controller).toBe(BotControllerMode.Human);

    controllerSelects[0].value = "human";
    controllerSelects[0].dispatchEvent(new Event("change", { bubbles: true }));

    persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    botPlayState = normalizeBotPlayState(persistedState.botPlayState);
    expect(botPlayState?.white.controller).toBe(BotControllerMode.Human);
    expect(botPlayState?.black.controller).toBe(BotControllerMode.Bot);
  });

  it("persists chess bot launcher keys when starting offline bot game (full load: reload or navigate)", () => {
    window.history.replaceState({}, "", "/chess.html?mode=local");

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const startAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Start new offline bot game"),
    ) as HTMLAnchorElement | undefined;

    expect(startAction?.getAttribute("href")).toContain("mode=local");
    startAction?.click();

    expect(window.localStorage.getItem("lasca.chessbot.white")).toBe("human");
    expect(window.localStorage.getItem("lasca.chessbot.black")).not.toBe("human");
  });

  it("persists generic ai launcher keys when starting offline bot game (full load: reload or navigate)", () => {
    window.history.replaceState({}, "", "/lasca.html?mode=local");

    const hub = createPlayHub({
      currentVariantId: "lasca_7_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const startAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Start new offline bot game"),
    ) as HTMLAnchorElement | undefined;

    expect(startAction?.getAttribute("href")).toContain("mode=local");
    startAction?.click();

    expect(window.localStorage.getItem("lasca.ai.white")).toBe("human");
    expect(window.localStorage.getItem("lasca.ai.black")).not.toBe("human");

    document.querySelectorAll('[data-bot-field="persona-avatar"]').forEach((el) => {
      expect((el as HTMLImageElement).hidden).toBe(true);
    });
  });

  it("offers an online bot room action for human-versus-bot setups", () => {
    window.history.replaceState({}, "", "/chess.html?mode=local");

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const onlineAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Start online bot room here"),
    ) as HTMLAnchorElement | undefined;

    expect(onlineAction).toBeTruthy();
    expect(onlineAction?.getAttribute("href")).toContain("mode=online");
    expect(onlineAction?.getAttribute("href")).toContain("create=1");
    expect(onlineAction?.getAttribute("href")).toContain("prefColor=W");
    expect(onlineAction?.getAttribute("href")).not.toContain("botSeats=off");
  });

  it("defaults Play Bots to human versus bot when no bot setup exists", () => {
    localStorage.setItem("lasca.chessbot.white", "human");
    localStorage.setItem("lasca.chessbot.black", "human");

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    const levelSelects = Array.from(document.querySelectorAll('[data-bot-field="level"]')) as HTMLSelectElement[];

    expect(controllerSelects).toHaveLength(2);
    expect(controllerSelects[0]?.value).toBe("human");
    expect(controllerSelects[1]?.value).toBe("bot");
    expect(levelSelects[1]?.value).toBe("beginner");
    expect(document.querySelector(".playHubBotStateTitle")?.textContent).toContain("Human vs bot");
  });

  it("preserves an existing bot-controlled setup instead of forcing the default", () => {
    localStorage.setItem("lasca.chessbot.white", "easy");
    localStorage.setItem("lasca.chessbot.black", "human");

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    const levelSelects = Array.from(document.querySelectorAll('[data-bot-field="level"]')) as HTMLSelectElement[];

    expect(controllerSelects[0]?.value).toBe("bot");
    expect(controllerSelects[1]?.value).toBe("human");
    expect(levelSelects[0]?.value).toBe("beginner");
  });

  it("maps cross-variant beginner levels onto the current variant so Bot level is never blank", () => {
    localStorage.setItem(
      "stackworks.shell.state",
      JSON.stringify({
        activeGame: "lasca_7_classic",
        activeSection: GlobalSection.Games,
        botPlayState: {
          white: { controller: "human", level: null, persona: null },
          black: { controller: "bot", level: "beginner", persona: "balanced" },
        },
      }),
    );

    const hub = createPlayHub({
      currentVariantId: "lasca_7_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const levelSelects = Array.from(document.querySelectorAll('[data-bot-field="level"]')) as HTMLSelectElement[];
    expect(levelSelects[1]?.value).toBe("easy");

    const persisted = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as {
      botPlayState?: { black?: { level?: string } };
    };
    expect(persisted.botPlayState?.black?.level).toBe("easy");
  });

  it("persists independent bot personalities per seat", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    const personaSelects = Array.from(document.querySelectorAll('[data-bot-field="persona"]')) as HTMLSelectElement[];

    controllerSelects[0].value = "bot";
    controllerSelects[0].dispatchEvent(new Event("change", { bubbles: true }));
    personaSelects[0].value = "endgame";
    personaSelects[0].dispatchEvent(new Event("change", { bubbles: true }));

    const persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    const botPlayState = normalizeBotPlayState(persistedState.botPlayState);
    expect(botPlayState?.white.persona).toBe("endgame");
    expect(document.querySelectorAll(".playHubBotProfileTitle")[0]?.textContent).toContain("Endgame bot");

    const whiteAvatar = document.querySelector('[data-bot-seat="white"][data-bot-field="persona-avatar"]') as HTMLImageElement | null;
    expect(whiteAvatar).toBeTruthy();
    expect(whiteAvatar?.hidden).toBe(false);
    expect(whiteAvatar?.getAttribute("src")).toContain("Endgame%20Chess%20bot%20avatar.png");
    expect(whiteAvatar?.alt).toContain("Endgame");
  });

  it("shows the signed-in user name for human bot-profile seats", async () => {
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "Local Account" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const titles = Array.from(document.querySelectorAll(".playHubBotProfileTitle")).map((element) => element.textContent?.trim() ?? "");
    expect(titles).toContain("Local Account");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8788/api/auth/me", { credentials: "include" });
  });

  it("shows the signed-in user name beside a Human controller dropdown", async () => {
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "Local Account" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const identities = Array.from(document.querySelectorAll('[data-bot-field="controller-identity"]')) as HTMLSpanElement[];
    expect(identities[0]?.textContent?.trim()).toBe("Local Account");
    expect(identities[0]?.hidden).toBe(false);
    expect(identities[1]?.hidden).toBe(true);
  });

  it("does not show the controller identity chip when that seat is set to Bot", async () => {
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: { displayName: "Local Account" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    controllerSelects[0].value = "bot";
    controllerSelects[0].dispatchEvent(new Event("change", { bubbles: true }));

    const identities = Array.from(document.querySelectorAll('[data-bot-field="controller-identity"]')) as HTMLSpanElement[];
    expect(identities[0]?.hidden).toBe(true);
    expect(getComputedStyle(identities[0]).display).toBe("none");
  });

  it("falls back to the default human side label when no signed-in user is available", async () => {
    localStorage.setItem("lasca.online.serverUrl", "http://localhost:8788");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, user: null }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const titles = Array.from(document.querySelectorAll(".playHubBotProfileTitle")).map((element) => element.textContent?.trim() ?? "");
    expect(titles).toContain("White");
    expect(titles).toContain("Teacher bot");
  });

  it("preserves persisted bot-vs-bot setups and surfaces watch-bots actions", () => {
    localStorage.setItem("stackworks.shell.state", JSON.stringify({
      activeSection: "games",
      activeGame: "chess_classic",
      gameSection: null,
      playSubSection: "bots",
      botPlayState: {
        white: { controller: "bot", level: "advanced" },
        black: { controller: "bot", level: "master" },
      },
    }));

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    expect(controllerSelects[0]?.value).toBe("bot");
    expect(controllerSelects[1]?.value).toBe("bot");
    expect(document.querySelector(".playHubBotStateTitle")?.textContent).toContain("Watch Bots mode ready");
    expect(Array.from(document.querySelectorAll(".playHubAction")).some((element) => element.textContent?.includes("Open watch-bots launcher"))).toBe(true);
  });

  it("persists coach level selection", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Coach);

    const expertButton = document.querySelector('[data-coach-level="expert"]') as HTMLButtonElement | null;
    expertButton?.click();

    const persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    expect(normalizeCoachLevel(persistedState.coachLevel)).toBe("expert");
    expect(document.querySelector(".playHubCoachCardTitle")?.textContent).toBe("Expert");
  });

  it("writes coach guidance presets into variant launch prefs", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Coach);

    const expertButton = document.querySelector('[data-coach-level="expert"]') as HTMLButtonElement | null;
    expertButton?.click();

    const coachAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Open Expert coach"),
    ) as HTMLAnchorElement | undefined;
    coachAction?.addEventListener("click", (event) => event.preventDefault(), { once: true });
    coachAction?.click();

    expect(localStorage.getItem("lasca.opt.chess_classic.moveHints")).toBe("0");
    expect(localStorage.getItem("lasca.opt.chess_classic.moveHintStyle")).toBe("classic");
    expect(localStorage.getItem("stackworks.play.coachLevel")).toBe("expert");
  });

  it("enables Resume tab and actions when saved online seats exist", async () => {
    stubFetchForValidResumeSeat({ roomId: "room-42", playerId: "player-7", variantId: "chess_classic" });
    window.history.replaceState({}, "", "/chess.html");
    const resumeUserId = "0123456789abcdef0123456789abcdef";
    writeAuthSessionUserId("ws://server.example", resumeUserId);
    localStorage.setItem("lasca.online.resume.ws://server.example/room-42", JSON.stringify({
      serverUrl: "ws://server.example",
      roomId: "room-42",
      playerId: "player-7",
      displayName: "Pat",
      userId: resumeUserId,
      color: "W",
      variantId: "chess_classic",
      savedAtMs: 100,
    }));
    localStorage.setItem("stackworks.shell.state", JSON.stringify({
      activeSection: "community",
      activeGame: "chess_classic",
      gameSection: null,
      playSubSection: "resume",
    }));

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/?mode=local",
    });

    document.body.appendChild(hub.element);

    const resumeTab = await vi.waitUntil(() => {
      const b = Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).find(
        (el) => el.textContent?.trim() === "Resume",
      ) as HTMLButtonElement | undefined;
      if (!b || b.hidden || b.disabled) return undefined;
      return b;
    });
    expect(resumeTab.hidden).toBe(false);
    expect(resumeTab.disabled).toBe(false);
    expect(readVisiblePlayHubTopTabLabels()).toEqual(["Online", "Bots", "Coach", "Local", "Resume"]);

    const activeTab = document.querySelector('.playHub > .stackworksTabs[role="tablist"] [role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe("Online");

    const resumeAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Resume Pat"),
    ) as HTMLAnchorElement | undefined;
    expect(resumeAction).toBeTruthy();
    expect(resumeAction?.getAttribute("href")).toContain("/chess.html?mode=online");
    expect(resumeAction?.getAttribute("href")).toContain("mode=online");
    expect(resumeAction?.getAttribute("href")).toContain("server=ws%3A%2F%2Fserver.example");
    expect(resumeAction?.getAttribute("href")).toContain("roomId=room-42");
    expect(resumeAction?.getAttribute("href")).toContain("playerId=player-7");
    expect(resumeAction?.getAttribute("href")).toContain("color=W");
  });

  it("hides the Resume tab when there is no saved online seat", () => {
    window.history.replaceState({}, "", "/chess.html");
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/?mode=local",
    });
    document.body.appendChild(hub.element);

    expect(readVisiblePlayHubTopTabLabels()).toEqual(["Online", "Bots", "Coach", "Local"]);
    expect(readTopLevelTabLabels()).toEqual(["Online", "Bots", "Coach", "Local", "Resume"]);

    const resumeTab = Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).find(
      (b) => b.textContent?.trim() === "Resume",
    ) as HTMLButtonElement | undefined;
    expect(resumeTab).toBeTruthy();
    expect(resumeTab.hidden).toBe(true);

    expect(hub.element.textContent).toContain("No unfinished online games");
    expect(hub.element.textContent).toContain("Sign in on the game server");
  });

  it("hides resume actions when not signed in even if localStorage has a resume record", () => {
    window.history.replaceState({}, "", "/chess.html");
    localStorage.setItem("lasca.online.resume.http%3A%2F%2Flocalhost%3A8788.room-9", JSON.stringify({
      serverUrl: "http://localhost:8788",
      roomId: "room-9",
      playerId: "abcd1234efgh",
      displayName: "StalePat",
      userId: "0123456789abcdef0123456789abcdef",
      variantId: "chess_classic",
      savedAtMs: 100,
    }));

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/?mode=local",
    });
    document.body.appendChild(hub.element);

    const resumeTab = Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).find(
      (b) => b.textContent?.trim() === "Resume",
    ) as HTMLButtonElement | undefined;
    expect(resumeTab?.hidden).toBe(true);
    expect(
      Array.from(document.querySelectorAll(".playHubAction")).some((el) => el.textContent?.includes("StalePat")),
    ).toBe(false);
  });

  it("drops resume entries when stored userId does not match the signed-in account", () => {
    window.history.replaceState({}, "", "/chess.html");
    writeAuthSessionUserId("http://localhost:8788", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    localStorage.setItem("lasca.online.resume.http%3A%2F%2Flocalhost%3A8788.room-z", JSON.stringify({
      serverUrl: "http://localhost:8788",
      roomId: "room-z",
      playerId: "abcd1234efgh",
      displayName: "Other",
      userId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      variantId: "chess_classic",
      savedAtMs: 100,
    }));

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/?mode=local",
    });
    document.body.appendChild(hub.element);

    const resumeTab = Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).find(
      (b) => b.textContent?.trim() === "Resume",
    ) as HTMLButtonElement | undefined;
    expect(resumeTab?.hidden).toBe(true);
  });

  it("uses generic room label for legacy resume records without userId even when signed in", async () => {
    stubFetchForValidResumeSeat({ roomId: "room-legacy", playerId: "abcd1234efgh", variantId: "chess_classic" });
    window.history.replaceState({}, "", "/chess.html");
    writeAuthSessionUserId("http://localhost:8788", "0123456789abcdef0123456789abcdef");
    localStorage.setItem("lasca.online.resume.http%3A%2F%2Flocalhost%3A8788.room-legacy", JSON.stringify({
      serverUrl: "http://localhost:8788",
      roomId: "room-legacy",
      playerId: "abcd1234efgh",
      displayName: "OldGuestName",
      variantId: "chess_classic",
      savedAtMs: 100,
    }));

    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/?mode=local",
    });
    document.body.appendChild(hub.element);

    const resumeAction = await vi.waitUntil(() =>
      Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
        element.textContent?.includes("Resume room room-legacy"),
      ) as HTMLAnchorElement | undefined,
    );
    expect(resumeAction).toBeTruthy();
    expect(hub.element.textContent).not.toContain("OldGuestName");
  });
});

describe("normalizePlaySubSection", () => {
  it("maps legacy launcher tabs onto the new play hub sections", () => {
    expect(normalizePlaySubSection("friend")).toBe(PlaySubSection.Online);
    expect(normalizePlaySubSection("tournaments")).toBe(PlaySubSection.Online);
    expect(normalizePlaySubSection("variants")).toBe(PlaySubSection.Local);
  });
});

describe("normalizeOnlineSubSection", () => {
  it("normalizes legacy and explicit nested online modes", () => {
    expect(normalizeOnlineSubSection("quickmatch")).toBe(OnlineSubSection.QuickMatch);
    expect(normalizeOnlineSubSection("custom_challenge")).toBe(OnlineSubSection.CustomChallenge);
    expect(normalizeOnlineSubSection("hosted_rooms")).toBe(OnlineSubSection.HostedRooms);
    expect(normalizeOnlineSubSection("friend")).toBe(OnlineSubSection.Friend);
    expect(normalizeOnlineSubSection("tournaments")).toBe(OnlineSubSection.Tournaments);
  });
});

describe("normalizeBotPlayState", () => {
  it("normalizes persisted bot seat state", () => {
    const normalized = normalizeBotPlayState({
      white: { controller: "bot", level: "advanced" },
      black: { controller: "human", level: "master" },
    });

    expect(normalized).toEqual({
      white: { controller: BotControllerMode.Bot, level: "advanced", persona: null },
      black: { controller: BotControllerMode.Human, level: null, persona: null },
    });
  });
});

describe("normalizeBotPersona", () => {
  it("normalizes persisted bot persona state", () => {
    expect(normalizeBotPersona("teacher")).toBe("teacher");
    expect(normalizeBotPersona("endgame")).toBe("endgame");
  });
});

describe("normalizeHostedRoomState", () => {
  it("normalizes hosted room shell state", () => {
    expect(normalizeHostedRoomState({ visibility: "private", ownerControl: "organizer-managed" })).toEqual({
      visibility: HostedRoomVisibilityMode.Private,
      ownerControl: HostedRoomOwnerControl.OrganizerManaged,
    });
  });
});

describe("normalizeCoachLevel", () => {
  it("normalizes coach level shell state", () => {
    expect(normalizeCoachLevel("intermediate-ii")).toBe("intermediate-ii");
    expect(normalizeCoachLevel("expert")).toBe("expert");
  });
});