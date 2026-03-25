import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BotControllerMode,
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

  function readTopLevelTabLabels(): string[] {
    return Array.from(document.querySelectorAll('.playHub > .stackworksTabs[role="tablist"] [role="tab"]')).map((tab) => tab.textContent?.trim() ?? "");
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

  it("uses Online, Bots, Coach, and Local as the default top-level tabs", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/",
    });

    document.body.appendChild(hub.element);

    const tabLabels = readTopLevelTabLabels();
    expect(tabLabels).toEqual(["Online", "Bots", "Coach", "Local"]);
    expect(tabLabels).not.toContain("Friend");
    expect(tabLabels).not.toContain("Tournaments");
    expect(tabLabels).not.toContain("Variants");
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
            variantId: "lasca",
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

  it("persists two-seat bot setup and routes human-human back to Local", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/start",
    });

    document.body.appendChild(hub.element);
    hub.setActiveTab(PlaySubSection.Bots);

    const controllerSelects = Array.from(document.querySelectorAll('[data-bot-field="controller"]')) as HTMLSelectElement[];
    expect(controllerSelects).toHaveLength(2);

    controllerSelects[0].value = "bot";
    controllerSelects[0].dispatchEvent(new Event("change", { bubbles: true }));

    let persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    let botPlayState = normalizeBotPlayState(persistedState.botPlayState);
    expect(botPlayState?.white.controller).toBe(BotControllerMode.Bot);

    controllerSelects[0].value = "human";
    controllerSelects[0].dispatchEvent(new Event("change", { bubbles: true }));
    controllerSelects[1].value = "human";
    controllerSelects[1].dispatchEvent(new Event("change", { bubbles: true }));

    const switchToLocal = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Switch to Local setup"),
    ) as HTMLButtonElement | undefined;
    expect(switchToLocal).toBeTruthy();

    switchToLocal?.click();

    persistedState = JSON.parse(localStorage.getItem("stackworks.shell.state") ?? "{}") as Record<string, unknown>;
    expect(persistedState.playSubSection).toBe("local");
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
  });

  it("surfaces watch-bots mode when both seats are bot-controlled", () => {
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

  it("shows Resume only when saved online seats exist", () => {
    window.history.replaceState({}, "", "/chess.html");
    localStorage.setItem("lasca.online.resume.ws://server.example/room-42", JSON.stringify({
      serverUrl: "ws://server.example",
      roomId: "room-42",
      playerId: "player-7",
      displayName: "Pat",
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

    const tabLabels = readTopLevelTabLabels();
    expect(tabLabels).toEqual(["Online", "Bots", "Coach", "Local", "Resume"]);

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