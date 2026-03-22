import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createThemeDropdownMock } = vi.hoisted(() => ({
  createThemeDropdownMock: vi.fn((opts: { onSelect?: (id: string) => void | Promise<void> }) => ({
    setSelected: async (id: string) => {
      if (typeof opts.onSelect === "function") await opts.onSelect(id);
    },
    getSelected: () => "classic",
    open: () => {},
    close: () => {},
    destroy: () => {},
  })),
}));

vi.mock("../render/loadSvgDefs", () => ({
  loadSvgDefsInto: vi.fn(async () => {}),
}));

vi.mock("../render/waitForSvgImages", () => ({
  waitForSvgImagesLoaded: vi.fn(async () => {}),
}));

vi.mock("../ui/nextPaint", () => ({
  nextPaint: vi.fn(async () => {}),
}));

vi.mock("../ui/components/themeDropdown", () => ({
  createThemeDropdown: createThemeDropdownMock,
}));

import { createThemeManager } from "./themeManager";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvgRoot(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;

  const defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
  defs.setAttribute("id", "lascaDefs");
  const themeDefs = document.createElementNS(SVG_NS, "g") as SVGGElement;
  themeDefs.setAttribute("id", "lascaThemeDefs");
  const runtimeDefs = document.createElementNS(SVG_NS, "g") as SVGGElement;
  runtimeDefs.setAttribute("id", "lascaRuntimeDefs");
  defs.append(themeDefs, runtimeDefs);
  svg.appendChild(defs);

  const pieces = document.createElementNS(SVG_NS, "g") as SVGGElement;
  pieces.setAttribute("id", "pieces");
  svg.appendChild(pieces);

  document.body.appendChild(svg);
  return svg;
}

function makeDropdownRoot(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = '<button id="themeDropdownBtn" type="button"></button><div id="themeDropdownMenu"></div>';
  document.body.appendChild(root);
  return root;
}

describe("themeManager.bindThemeDropdown", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    localStorage.clear();
    createThemeDropdownMock.mockClear();

    const originalAppendChild = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation((node: Node) => {
      const appended = originalAppendChild(node);
      if (node instanceof HTMLLinkElement) {
        queueMicrotask(() => node.dispatchEvent(new Event("load")));
      }
      return appended;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fire onUserSelect while restoring the initial saved theme", async () => {
    localStorage.setItem("lasca.theme", "wooden");
    const svg = makeSvgRoot();
    const dropdownRoot = makeDropdownRoot();
    const onUserSelect = vi.fn(async () => {});

    const themeManager = createThemeManager(svg);
    await themeManager.bindThemeDropdown(dropdownRoot, onUserSelect);

    expect(onUserSelect).not.toHaveBeenCalled();
    expect(createThemeDropdownMock).toHaveBeenCalledTimes(1);
  });

  it("includes the Candy theme in the general dropdown items", async () => {
    const svg = makeSvgRoot();
    const dropdownRoot = makeDropdownRoot();

    const themeManager = createThemeManager(svg);
    await themeManager.bindThemeDropdown(dropdownRoot);

    expect(createThemeDropdownMock).toHaveBeenCalledTimes(1);
    const args = createThemeDropdownMock.mock.calls[0]?.[0];
    expect(Array.isArray(args?.items)).toBe(true);
    expect(args.items.some((item: { id: string }) => item.id === "candy")).toBe(true);
  });
});