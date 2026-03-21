import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { waitForSvgImagesLoaded } from "./waitForSvgImages";

describe("waitForSvgImagesLoaded", () => {
  const OriginalImage = globalThis.Image;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Image = OriginalImage;
  });

  it("deduplicates hrefs before preloading", async () => {
    const seen: string[] = [];

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(value: string) {
        seen.push(value);
        queueMicrotask(() => {
          this.onload?.();
        });
      }

      decode(): Promise<void> {
        return Promise.resolve();
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const href of ["/pieces/raster3d/W_Q.png", "/pieces/raster3d/W_Q.png", "/pieces/raster3d/B_Q.png"]) {
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", href);
      svg.appendChild(image);
    }

    await waitForSvgImagesLoaded(svg, { timeoutMs: 0 });

    expect(seen).toEqual(["/pieces/raster3d/W_Q.png", "/pieces/raster3d/B_Q.png"]);
  });

  it("resolves after the timeout when an image never finishes loading", async () => {
    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        // Intentionally never settles.
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
    image.setAttribute("href", "/pieces/raster3d/W_K.png");
    svg.appendChild(image);

    const promise = waitForSvgImagesLoaded(svg, { timeoutMs: 25 });

    await vi.advanceTimersByTimeAsync(25);
    await expect(promise).resolves.toBeUndefined();
  });
});