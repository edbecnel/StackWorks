import { beforeEach, describe, expect, it } from "vitest";
import { normalizePlaySubSection, PlaySubSection } from "../../config/shellState";
import { createPlayHub } from "./playHub";

describe("createPlayHub", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    localStorage.clear();
  });

  it("uses Online, Bots, Coach, and Local as the default top-level tabs", () => {
    const hub = createPlayHub({
      currentVariantId: "chess_classic",
      backHref: "/",
    });

    document.body.appendChild(hub.element);

    const tabLabels = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim());
    expect(tabLabels).toEqual(["Online", "Bots", "Coach", "Local"]);
    expect(tabLabels).not.toContain("Friend");
    expect(tabLabels).not.toContain("Tournaments");
    expect(tabLabels).not.toContain("Variants");
    expect(document.querySelector(".playHubSectionTitle")?.textContent).toBe("Switch variant");
  });

  it("shows Resume only when saved online seats exist", () => {
    localStorage.setItem("lasca.online.resume.ws://server.example/room-42", JSON.stringify({
      serverUrl: "ws://server.example",
      roomId: "room-42",
      playerId: "player-7",
      displayName: "Pat",
      color: "W",
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

    const tabLabels = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim());
    expect(tabLabels).toEqual(["Online", "Bots", "Coach", "Local", "Resume"]);

    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe("Resume");

    const resumeAction = Array.from(document.querySelectorAll(".playHubAction")).find((element) =>
      element.textContent?.includes("Resume Pat"),
    ) as HTMLAnchorElement | undefined;
    expect(resumeAction).toBeTruthy();
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