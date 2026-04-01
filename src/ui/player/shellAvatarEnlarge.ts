/**
 * Shared hover preview + full-screen lightbox for shell avatars (Play Hub bot personas,
 * game shell player identity bars, etc.).
 */

const STYLE_ID = "stackworks-shell-avatar-enlarge-style";

export function prefersHoverAvatarEnlargePreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}

let lightboxRoot: HTMLDivElement | null = null;
let lightboxImg: HTMLImageElement | null = null;
let lightboxEscapeHandler: ((ev: KeyboardEvent) => void) | null = null;
let lightboxPrevFocus: Element | null = null;

export function ensureShellAvatarEnlargeStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .shellAvatarEnlargeWrap {
      position: relative;
      flex: 0 0 auto;
    }

    .shellAvatarEnlargeTap {
      display: block;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      line-height: 0;
      cursor: zoom-in;
      border-radius: inherit;
    }

    .shellAvatarEnlargeTap:disabled {
      cursor: default;
      opacity: 1;
    }

    .shellAvatarEnlargeTap:focus-visible {
      outline: 2px solid rgba(202, 157, 78, 0.85);
      outline-offset: 2px;
    }

    .shellAvatarEnlargeHover {
      /* Position is applied in JS (fixed + viewport clamp) so previews are not clipped by
         overflow:hidden ancestors (e.g. game shell #centerArea). */
      position: fixed;
      left: 0;
      top: 0;
      z-index: 100050;
      padding: 8px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(14, 14, 16, 0.97);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
      pointer-events: none;
    }

    .shellAvatarEnlargeHover[hidden] {
      display: none !important;
    }

    .shellAvatarEnlargeHoverImg {
      display: block;
      /* Square thumb; shrink so card + padding fits common viewports (short windows, player bars). */
      width: min(260px, 70vw, calc(100vw - 32px), calc(100vh - 48px));
      height: min(260px, 70vw, calc(100vw - 32px), calc(100vh - 48px));
      max-width: min(260px, 70vw, calc(100vw - 32px), calc(100vh - 48px));
      max-height: min(260px, 70vw, calc(100vw - 32px), calc(100vh - 48px));
      object-fit: cover;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .shellAvatarLightbox {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(52px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom))
        max(16px, env(safe-area-inset-left));
      box-sizing: border-box;
    }

    .shellAvatarLightbox[hidden] {
      display: none !important;
    }

    .shellAvatarLightboxBackdrop {
      position: absolute;
      inset: 0;
      margin: 0;
      padding: 0;
      border: none;
      background: rgba(0, 0, 0, 0.86);
      cursor: pointer;
    }

    .shellAvatarLightboxClose {
      position: fixed;
      top: max(10px, env(safe-area-inset-top));
      right: max(10px, env(safe-area-inset-right));
      z-index: 100001;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(28, 28, 30, 0.94);
      color: rgba(255, 255, 255, 0.95);
      font-size: 26px;
      line-height: 1;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
    }

    .shellAvatarLightboxClose:focus-visible {
      outline: 2px solid rgba(202, 157, 78, 0.9);
      outline-offset: 2px;
    }

    .shellAvatarLightboxInner {
      position: relative;
      z-index: 1;
      max-width: min(92vw, 540px);
      max-height: min(82vh, 540px);
      pointer-events: none;
    }

    .shellAvatarLightboxImg {
      display: block;
      max-width: min(92vw, 540px);
      max-height: min(82vh, 540px);
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 12px 56px rgba(0, 0, 0, 0.55);
    }
  `;
  document.head.appendChild(style);
}

function ensureLightbox(): {
  root: HTMLDivElement;
  img: HTMLImageElement;
  close: () => void;
} {
  ensureShellAvatarEnlargeStyles();
  if (lightboxRoot && lightboxImg) {
    return {
      root: lightboxRoot,
      img: lightboxImg,
      close: closeShellAvatarLightbox,
    };
  }

  const root = document.createElement("div");
  root.className = "shellAvatarLightbox";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Enlarged avatar");

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "shellAvatarLightboxBackdrop";
  backdrop.setAttribute("aria-label", "Close");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "shellAvatarLightboxClose";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "\u00d7";

  const inner = document.createElement("div");
  inner.className = "shellAvatarLightboxInner";
  const img = document.createElement("img");
  img.className = "shellAvatarLightboxImg";
  img.alt = "";
  inner.appendChild(img);

  root.append(backdrop, inner, closeBtn);
  document.body.appendChild(root);

  const close = (): void => {
    closeShellAvatarLightbox();
  };

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  lightboxRoot = root;
  lightboxImg = img;

  return { root, img, close: closeShellAvatarLightbox };
}

export function closeShellAvatarLightbox(): void {
  if (!lightboxRoot || !lightboxImg || lightboxRoot.hidden) return;
  lightboxRoot.hidden = true;
  lightboxImg.removeAttribute("src");
  lightboxImg.alt = "";
  document.body.style.overflow = "";
  if (lightboxEscapeHandler) {
    document.removeEventListener("keydown", lightboxEscapeHandler);
    lightboxEscapeHandler = null;
  }
  const ref = lightboxPrevFocus;
  lightboxPrevFocus = null;
  if (ref instanceof HTMLElement) {
    try {
      ref.focus();
    } catch {
      // ignore
    }
  }
}

export function openShellAvatarLightbox(src: string, alt: string): void {
  const { root, img } = ensureLightbox();
  img.src = src;
  img.alt = alt || "Avatar";
  root.hidden = false;
  lightboxPrevFocus = document.activeElement;
  document.body.style.overflow = "hidden";
  if (lightboxEscapeHandler) {
    document.removeEventListener("keydown", lightboxEscapeHandler);
  }
  lightboxEscapeHandler = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeShellAvatarLightbox();
    }
  };
  document.addEventListener("keydown", lightboxEscapeHandler);
  const closeBtn = root.querySelector(".shellAvatarLightboxClose") as HTMLButtonElement | null;
  closeBtn?.focus();
}

export interface ShellAvatarEnlargeAttachOptions {
  tapButton: HTMLButtonElement;
  getThumbSrc: () => string | null;
  getThumbAlt: () => string;
}

/**
 * One-time bind per wrap. `wrap` must contain `.shellAvatarEnlargeHover` with `.shellAvatarEnlargeHoverImg`.
 */
const HOVER_VIEWPORT_PAD = 8;
const HOVER_ANCHOR_GAP = 10;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Places the hover card beside the anchor, flipping horizontally if needed and clamping to the viewport.
 */
function positionShellAvatarHoverPreview(hover: HTMLElement, anchorRect: DOMRect): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = hover.offsetWidth;
  const h = hover.offsetHeight;
  if (w <= 0 || h <= 0) return;

  let left = anchorRect.right + HOVER_ANCHOR_GAP;
  let top = anchorRect.top + anchorRect.height / 2 - h / 2;

  if (left + w > vw - HOVER_VIEWPORT_PAD) {
    left = anchorRect.left - HOVER_ANCHOR_GAP - w;
  }
  left = clamp(left, HOVER_VIEWPORT_PAD, vw - HOVER_VIEWPORT_PAD - w);
  top = clamp(top, HOVER_VIEWPORT_PAD, vh - HOVER_VIEWPORT_PAD - h);

  hover.style.left = `${Math.round(left)}px`;
  hover.style.top = `${Math.round(top)}px`;
}

function clearShellAvatarHoverLayout(hover: HTMLElement): void {
  hover.style.left = "";
  hover.style.top = "";
}

export function attachShellAvatarEnlarge(wrap: HTMLElement, opts: ShellAvatarEnlargeAttachOptions): void {
  ensureShellAvatarEnlargeStyles();
  if (wrap.dataset.shellAvatarEnlargeBound === "1") return;
  wrap.dataset.shellAvatarEnlargeBound = "1";

  const hover = wrap.querySelector(".shellAvatarEnlargeHover") as HTMLDivElement | null;
  const hoverImg = hover?.querySelector(".shellAvatarEnlargeHoverImg") as HTMLImageElement | null;
  if (!hover || !hoverImg) return;

  const { tapButton, getThumbSrc, getThumbAlt } = opts;

  let removeRepositionListeners: (() => void) | null = null;
  let pendingImgLoadHandler: (() => void) | null = null;

  const detachRepositionListeners = (): void => {
    removeRepositionListeners?.();
    removeRepositionListeners = null;
  };

  const scheduleReposition = (): void => {
    requestAnimationFrame(() => {
      if (hover.hidden) return;
      positionShellAvatarHoverPreview(hover, tapButton.getBoundingClientRect());
    });
  };

  const bindRepositionListeners = (): void => {
    detachRepositionListeners();
    const onReposition = (): void => {
      scheduleReposition();
    };
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    removeRepositionListeners = (): void => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  };

  wrap.addEventListener("mouseenter", () => {
    if (!prefersHoverAvatarEnlargePreview()) return;
    const src = getThumbSrc();
    if (!src) return;
    hoverImg.src = src;
    hoverImg.alt = getThumbAlt();
    hover.hidden = false;

    const afterLayout = (): void => {
      if (hover.hidden) return;
      scheduleReposition();
      bindRepositionListeners();
    };

    if (hoverImg.complete && hoverImg.naturalWidth > 0) {
      afterLayout();
    } else {
      const finishPendingLayout = (): void => {
        pendingImgLoadHandler = null;
        afterLayout();
      };
      pendingImgLoadHandler = finishPendingLayout;
      hoverImg.addEventListener("load", finishPendingLayout, { once: true });
      hoverImg.addEventListener("error", finishPendingLayout, { once: true });
    }
  });

  wrap.addEventListener("mouseleave", () => {
    if (pendingImgLoadHandler) {
      hoverImg.removeEventListener("load", pendingImgLoadHandler);
      hoverImg.removeEventListener("error", pendingImgLoadHandler);
      pendingImgLoadHandler = null;
    }
    detachRepositionListeners();
    hover.hidden = true;
    clearShellAvatarHoverLayout(hover);
  });

  tapButton.addEventListener("click", (e) => {
    const src = getThumbSrc();
    if (!src || tapButton.disabled) return;
    e.preventDefault();
    if (prefersHoverAvatarEnlargePreview() && (e as PointerEvent).pointerType === "mouse") return;
    openShellAvatarLightbox(src, getThumbAlt());
  });
}
