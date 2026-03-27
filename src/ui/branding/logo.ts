export type LogoPlacement = "desktop-header" | "mobile-header" | "compact-nav" | "footer" | "fallback";
export type LogoVariant = "horizontal" | "wordmark" | "icon" | "mono";

type LogoRenderOptions = {
  placement?: LogoPlacement;
  variant?: LogoVariant;
  alt?: string;
  className?: string;
  ariaHidden?: boolean;
};

const LOGO_SOURCES: Record<LogoVariant, string> = {
  // Horizontal and wordmark both resolve to the current .games asset.
  horizontal: "stackworks-logo-horizontal.games.svg",
  wordmark: "stackworks-logo-horizontal.games.svg",
  icon: "stackworks-logo-icon.svg",
  mono: "stackworks-logo-mono.svg",
};

export function resolveLogoVariant(placement?: LogoPlacement): LogoVariant {
  switch (placement) {
    case "mobile-header":
    case "compact-nav":
      return "icon";
    case "footer":
      return "wordmark";
    case "fallback":
      return "mono";
    case "desktop-header":
    default:
      return "horizontal";
  }
}

export function createLogoImage(opts: LogoRenderOptions = {}): HTMLImageElement {
  const placement = opts.placement ?? "desktop-header";
  const variant = opts.variant ?? resolveLogoVariant(placement);
  const img = document.createElement("img");
  img.src = `/icons/${LOGO_SOURCES[variant]}`;
  img.alt = opts.alt ?? "StackWorks";
  img.draggable = false;
  img.dataset.logoVariant = variant;
  img.dataset.logoPlacement = placement;
  if (opts.className) img.className = opts.className;
  if (opts.ariaHidden) img.setAttribute("aria-hidden", "true");
  return img;
}

export function renderLogo(container: HTMLElement, opts: LogoRenderOptions = {}): HTMLImageElement {
  const img = createLogoImage(opts);
  container.appendChild(img);
  return img;
}

const logoPlacementRules = {
  horizontal: {
    maxWidth: "100%",
    maxHeight: "50px",
    "@media (max-width: 600px)": {
      display: "none",
    },
  },
  icon: {
    maxWidth: "40px",
    height: "auto",
  },
};

export default logoPlacementRules;