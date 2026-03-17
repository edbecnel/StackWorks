export type LogoVariant = "horizontal" | "icon" | "wordmark" | "mono";

export type LogoPlacement = "desktop-header" | "mobile-header" | "compact-nav" | "footer" | "fallback";

export interface RenderLogoOptions {
  variant?: LogoVariant;
  placement?: LogoPlacement;
  alt?: string;
  className?: string;
  assetBasePath?: string;
  ariaHidden?: boolean;
}

const LOGO_ASSET_BY_VARIANT: Record<LogoVariant, string> = {
  horizontal: "stackworks-logo-horizontal.svg",
  icon: "stackworks-logo-icon.svg",
  wordmark: "stackworks-wordmark.svg",
  mono: "stackworks-logo-mono.svg",
};

function normalizeAssetBasePath(assetBasePath?: string): string {
  const trimmed = (assetBasePath ?? "/icons").trim();
  if (!trimmed) return "/icons";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolveLogoVariant(placement?: LogoPlacement): LogoVariant {
  switch (placement) {
    case "desktop-header":
      return "horizontal";
    case "mobile-header":
    case "compact-nav":
      return "icon";
    case "footer":
      return "wordmark";
    case "fallback":
      return "mono";
    default:
      return "horizontal";
  }
}

export function createLogoImage(opts: RenderLogoOptions = {}): HTMLImageElement {
  const variant = opts.variant ?? resolveLogoVariant(opts.placement);
  const src = `${normalizeAssetBasePath(opts.assetBasePath)}/${LOGO_ASSET_BY_VARIANT[variant]}`;

  const img = document.createElement("img");
  img.src = src;
  img.alt = opts.ariaHidden ? "" : (opts.alt ?? "StackWorks");
  img.decoding = "async";
  img.loading = "eager";
  img.className = opts.className ?? "";

  if (opts.ariaHidden) {
    img.setAttribute("aria-hidden", "true");
  }

  return img;
}

export function renderLogo(container: HTMLElement, opts: RenderLogoOptions = {}): HTMLImageElement {
  const img = createLogoImage(opts);
  container.replaceChildren(img);
  return img;
}