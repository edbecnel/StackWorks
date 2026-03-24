import { describe, expect, it, vi } from "vitest";

import { installPlayerBotSelector, syncPlayerBotSelector } from "./playerBotSelector";

describe("installPlayerBotSelector", () => {
  it("maps Human/Bot role changes onto the hidden storage select", () => {
    document.body.innerHTML = `
      <label for="role">Light</label>
      <select id="role">
        <option value="human">Human</option>
        <option value="bot">Bot</option>
      </select>
      <div id="levelWrap">
        <select id="level"></select>
      </div>
      <select id="storage">
        <option value="human">Human</option>
        <option value="easy">Beginner</option>
        <option value="medium">Intermediate</option>
        <option value="advanced">Advanced</option>
        <option value="master">Master</option>
      </select>
    `;

    const storage = document.getElementById("storage") as HTMLSelectElement;
    const role = document.getElementById("role") as HTMLSelectElement;
    const level = document.getElementById("level") as HTMLSelectElement;
    const onChange = vi.fn();
    storage.addEventListener("change", onChange);

    installPlayerBotSelector({
      storageSelectId: "storage",
      roleSelectId: "role",
      levelSelectId: "level",
      levelWrapId: "levelWrap",
    });

    expect(role.value).toBe("human");
    expect(level.hidden).toBe(true);

    role.value = "bot";
    role.dispatchEvent(new Event("change", { bubbles: true }));

    expect(storage.value).toBe("easy");
    expect(level.hidden).toBe(false);
    expect(level.value).toBe("easy");
    expect(onChange).toHaveBeenCalledTimes(1);

    level.value = "advanced";
    level.dispatchEvent(new Event("change", { bubbles: true }));

    expect(storage.value).toBe("advanced");
    expect(onChange).toHaveBeenCalledTimes(2);

    role.value = "human";
    role.dispatchEvent(new Event("change", { bubbles: true }));

    expect(storage.value).toBe("human");
    expect(level.hidden).toBe(true);
  });

  it("syncs visible controls after programmatic storage-select updates", () => {
    document.body.innerHTML = `
      <select id="role">
        <option value="human">Human</option>
        <option value="bot">Bot</option>
      </select>
      <div id="levelWrap">
        <select id="level"></select>
      </div>
      <select id="storage">
        <option value="human">Human</option>
        <option value="beginner">Beginner</option>
        <option value="intermediate">Intermediate</option>
        <option value="advanced">Advanced</option>
        <option value="master">Master</option>
      </select>
    `;

    const storage = document.getElementById("storage") as HTMLSelectElement;
    const role = document.getElementById("role") as HTMLSelectElement;
    const level = document.getElementById("level") as HTMLSelectElement;

    installPlayerBotSelector({
      storageSelectId: "storage",
      roleSelectId: "role",
      levelSelectId: "level",
      levelWrapId: "levelWrap",
    });

    storage.value = "advanced";
    syncPlayerBotSelector("storage");

    expect(role.value).toBe("bot");
    expect(level.hidden).toBe(false);
    expect(level.options).toHaveLength(4);
    expect(level.value).toBe("advanced");
  });
});