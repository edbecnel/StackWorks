import { beforeEach, describe, expect, it, vi } from "vitest";

function setAdminDom(): void {
  document.body.innerHTML = `
    <input id="adminServerUrl" value="http://localhost:8788" />
    <input id="adminToken" value="test-token" />
    <button id="adminTokenToggle" type="button">Show</button>
    <input id="adminRememberToken" type="checkbox" />
    <input id="adminIncludeFull" type="checkbox" checked />
    <input id="adminLobbyLimit" value="200" />
    <button id="adminRefreshLobby" type="button">Refresh lobby</button>
    <button id="adminRefreshLobby2" type="button">Refresh lobby</button>
    <button id="adminDeleteSelectedBtn" type="button" disabled>Delete Selected</button>
    <span id="adminLobbySummary">—</span>
    <div id="adminStatus">—</div>
    <input id="adminDeleteRoomId" value="" />
    <button id="adminDeleteBtn" type="button">Delete room</button>
    <button id="adminCopyRoomIdBtn" type="button">Copy</button>
    <div id="adminLobbyList"></div>
    <dialog id="adminDeleteConfirmDialog">
      <div>
        <div id="adminDeleteConfirmText"></div>
        <div id="adminDeleteConfirmRoomId"></div>
        <div id="adminDeleteConfirmError" hidden></div>
        <button id="adminDeleteConfirmNo" type="button">Cancel</button>
        <button id="adminDeleteConfirmYes" type="button">Delete room</button>
      </div>
    </dialog>
  `;

  const dialog = document.getElementById("adminDeleteConfirmDialog") as HTMLDialogElement & {
    showModal?: () => void;
    close?: () => void;
  };
  dialog.showModal = function showModal(): void {
    this.setAttribute("open", "");
  };
  dialog.close = function close(): void {
    this.removeAttribute("open");
  };

  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: {
      writeText: vi.fn(async () => undefined),
    },
  });
}

function makeJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function importAdminMain(): Promise<void> {
  vi.resetModules();
  await import("./adminMain.ts");
}

describe("admin bulk delete", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    setAdminDom();
  });

  it("enables Delete Selected only when lobby rooms are checked and deletes all selected rooms", async () => {
    let rooms = [
      {
        roomId: "room-a",
        variantId: "chess_classic",
        visibility: "public",
        seatsTaken: ["W"],
        seatsOpen: ["B"],
        status: "waiting",
        createdAt: "2026-03-24T10:00:00.000Z",
      },
      {
        roomId: "room-b",
        variantId: "columns_chess",
        visibility: "public",
        seatsTaken: ["W", "B"],
        seatsOpen: [],
        status: "in_game",
        createdAt: "2026-03-24T11:00:00.000Z",
      },
    ];
    const deletedRoomIds: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/lobby")) return makeJsonResponse({ rooms });

        const match = url.match(/\/api\/admin\/room\/([^/?#]+)/);
        if (match && init?.method === "DELETE") {
          const roomId = decodeURIComponent(match[1]);
          deletedRoomIds.push(roomId);
          rooms = rooms.filter((room) => room.roomId !== roomId);
          return makeJsonResponse({ ok: true, roomId });
        }

        return makeJsonResponse({ error: "Not found" }, { status: 404 });
      }),
    );

    await importAdminMain();

    const refresh = document.getElementById("adminRefreshLobby2") as HTMLButtonElement;
    const deleteSelected = document.getElementById("adminDeleteSelectedBtn") as HTMLButtonElement;
    const confirmYes = document.getElementById("adminDeleteConfirmYes") as HTMLButtonElement;
    const confirmText = document.getElementById("adminDeleteConfirmText") as HTMLDivElement;
    const confirmRoomIds = document.getElementById("adminDeleteConfirmRoomId") as HTMLDivElement;
    const dialog = document.getElementById("adminDeleteConfirmDialog") as HTMLDialogElement;

    expect(deleteSelected.disabled).toBe(true);

    refresh.click();
    await settle();

    const checkboxes = Array.from(document.querySelectorAll(".lobbySelectCheckbox")) as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(deleteSelected.disabled).toBe(true);

    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event("change", { bubbles: true }));
    expect(deleteSelected.disabled).toBe(false);

    checkboxes[1].checked = true;
    checkboxes[1].dispatchEvent(new Event("change", { bubbles: true }));
    expect(deleteSelected.disabled).toBe(false);

    deleteSelected.click();
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(confirmText.textContent).toContain("Delete 2 selected rooms");
    expect(confirmRoomIds.textContent).toContain("room-a");
    expect(confirmRoomIds.textContent).toContain("room-b");

    confirmYes.click();
    await settle();

    expect(deletedRoomIds).toHaveLength(2);
    expect(new Set(deletedRoomIds)).toEqual(new Set(["room-a", "room-b"]));
    expect(deleteSelected.disabled).toBe(true);
    expect(dialog.hasAttribute("open")).toBe(false);
    expect((document.getElementById("adminStatus") as HTMLDivElement).textContent).toBe("Lobby loaded");
    expect((document.getElementById("adminLobbySummary") as HTMLSpanElement).textContent).toBe("0 rooms");
    expect(document.querySelectorAll(".lobbySelectCheckbox")).toHaveLength(0);
  });
});