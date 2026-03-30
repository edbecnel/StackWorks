import { describe, it, expect, beforeEach } from "vitest";
import { writePanelLayoutMode } from "./panelLayoutMode";

describe("writePanelLayoutMode", () => {
  beforeEach(() => {
    document.body.removeAttribute("data-panel-layout");
    localStorage.removeItem("lasca.ui.panelLayout");
  });

  it("updates data-panel-layout before synchronous panelLayoutModeChanged listeners run", () => {
    document.body.dataset.panelLayout = "menu";

    let observedDuringEvent: string | undefined;
    const onChange = (): void => {
      observedDuringEvent = document.body.dataset.panelLayout;
    };
    window.addEventListener("panelLayoutModeChanged", onChange);

    writePanelLayoutMode("panels");

    window.removeEventListener("panelLayoutModeChanged", onChange);

    expect(observedDuringEvent).toBe("panels");
    expect(document.body.dataset.panelLayout).toBe("panels");
  });
});
