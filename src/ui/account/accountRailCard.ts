export type AccountRailCardState = {
  status: "loading" | "signed-out" | "signed-in" | "error";
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
  countryName?: string | null;
  timeZone?: string | null;
  message?: string;
  diagnosticLabel?: string;
  diagnosticDetail?: string;
  diagnosticTone?: "neutral" | "good" | "warn";
};

type AccountRailCardOptions = {
  onSignUp?: () => void;
  onLogIn?: () => void;
  onManageAccount?: () => void;
  onAvatarUpload?: () => void;
  onLogOut?: () => void;
};

export type AccountRailCardController = {
  element: HTMLElement;
  update(state: AccountRailCardState): void;
};

const STYLE_ID = "stackworks-account-rail-card-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .accountRailCard {
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015)),
        rgba(0, 0, 0, 0.22);
      padding: 14px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
    }

    .accountRailCardEyebrow {
      margin: 0;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.54);
    }

    .accountRailCardBody {
      display: grid;
      gap: 10px;
      margin-top: 10px;
    }

    .accountRailCardIdentity {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
    }

    .accountRailCardAvatar {
      position: relative;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
    }

    .accountRailCardAvatar[data-can-upload="true"]::after {
      content: "";
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.42);
      opacity: 0;
      transition: opacity 140ms ease;
      pointer-events: none;
    }

    .accountRailCardAvatar[data-can-upload="true"]:hover::after,
    .accountRailCardAvatar[data-can-upload="true"]:focus-within::after {
      opacity: 1;
    }

    .accountRailCardAvatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: filter 140ms ease;
    }

    .accountRailCardAvatarLabel {
      position: relative;
      z-index: 0;
      transition: filter 140ms ease;
    }

    .accountRailCardAvatar[data-can-upload="true"]:hover img,
    .accountRailCardAvatar[data-can-upload="true"]:focus-within img,
    .accountRailCardAvatar[data-can-upload="true"]:hover .accountRailCardAvatarLabel,
    .accountRailCardAvatar[data-can-upload="true"]:focus-within .accountRailCardAvatarLabel {
      filter: brightness(0.58);
    }

    .accountRailCardAvatarCameraButton {
      appearance: none;
      position: absolute;
      inset: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      background: transparent;
      color: #fff;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 140ms ease, transform 140ms ease;
      pointer-events: none;
      cursor: pointer;
      z-index: 1;
    }

    .accountRailCardAvatar[data-can-upload="true"]:hover .accountRailCardAvatarCameraButton,
    .accountRailCardAvatar[data-can-upload="true"]:focus-within .accountRailCardAvatarCameraButton {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .accountRailCardAvatarCameraButton:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.9);
      outline-offset: -2px;
      border-radius: 14px;
    }

    .accountRailCardAvatarCameraIcon {
      width: 18px;
      height: 18px;
      display: block;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
    }

    @media (hover: none), (pointer: coarse) {
      .accountRailCardAvatar[data-can-upload="true"] {
        cursor: pointer;
      }

      .accountRailCardAvatar[data-can-upload="true"]::after,
      .accountRailCardAvatar[data-can-upload="true"] .accountRailCardAvatarCameraButton {
        display: none;
      }
    }

    .accountRailCardName {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.96);
    }

    .accountRailCardEmail,
    .accountRailCardMessage {
      margin: 3px 0 0;
      font-size: 11px;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.66);
      word-break: break-word;
    }

    .accountRailCardMeta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .accountRailCardChip {
      display: inline-flex;
      align-items: center;
      padding: 5px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      font-size: 10px;
      color: rgba(255, 255, 255, 0.84);
    }

    .accountRailCardChip[data-tone="good"] {
      border-color: rgba(104, 200, 140, 0.28);
      background: rgba(67, 151, 99, 0.16);
    }

    .accountRailCardChip[data-tone="warn"] {
      border-color: rgba(232, 191, 112, 0.28);
      background: rgba(202, 157, 78, 0.14);
    }

    .accountRailCardActions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .accountRailCardButton {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      padding: 10px 11px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }

    .accountRailCardButton:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .accountRailCardButton[data-variant="primary"] {
      border-color: rgba(232, 191, 112, 0.34);
      background: linear-gradient(180deg, rgba(202, 157, 78, 0.18), rgba(202, 157, 78, 0.06));
    }
  `;

  document.head.appendChild(style);
}

function renderInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function createActionButton(label: string, variant: "default" | "primary", onClick?: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "accountRailCardButton";
  if (variant === "primary") button.dataset.variant = "primary";
  button.textContent = label;
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function createCameraIcon(): SVGElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNs, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("accountRailCardAvatarCameraIcon");

  const path = document.createElementNS(svgNs, "path");
  path.setAttribute(
    "d",
    "M9 5.5 10.4 4h3.2L15 5.5H18A2.5 2.5 0 0 1 20.5 8v8a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 16V8A2.5 2.5 0 0 1 6 5.5h3Zm3 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z",
  );
  path.setAttribute("fill", "currentColor");
  icon.appendChild(path);

  return icon;
}

function isTouchPrimaryInput(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

export function createAccountRailCard(
  initialState: AccountRailCardState,
  opts: AccountRailCardOptions = {},
): AccountRailCardController {
  ensureStyles();

  const element = document.createElement("section");
  element.className = "accountRailCard";

  const eyebrow = document.createElement("p");
  eyebrow.className = "accountRailCardEyebrow";
  eyebrow.textContent = "Account";

  const body = document.createElement("div");
  body.className = "accountRailCardBody";

  element.append(eyebrow, body);

  const update = (state: AccountRailCardState): void => {
    body.replaceChildren();

    if (state.status === "signed-in") {
      const identity = document.createElement("div");
      identity.className = "accountRailCardIdentity";

      const avatar = document.createElement("div");
      avatar.className = "accountRailCardAvatar";
      if (opts.onAvatarUpload) avatar.dataset.canUpload = "true";
      if (state.avatarUrl) {
        const image = document.createElement("img");
        image.src = state.avatarUrl;
        image.alt = "";
        avatar.appendChild(image);
      } else {
        const label = document.createElement("span");
        label.className = "accountRailCardAvatarLabel";
        label.textContent = renderInitial(state.displayName ?? state.email ?? "Player");
        avatar.appendChild(label);
      }

      if (opts.onAvatarUpload) {
        const cameraButton = document.createElement("button");
        cameraButton.type = "button";
        cameraButton.className = "accountRailCardAvatarCameraButton";
        cameraButton.setAttribute("aria-label", "Upload avatar");
        cameraButton.appendChild(createCameraIcon());
        cameraButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          opts.onAvatarUpload?.();
        });
        avatar.appendChild(cameraButton);

        avatar.addEventListener("click", (event) => {
          if (!isTouchPrimaryInput()) return;
          event.preventDefault();
          opts.onAvatarUpload?.();
        });
      }

      const text = document.createElement("div");
      const name = document.createElement("p");
      name.className = "accountRailCardName";
      name.textContent = state.displayName?.trim() || "Player";
      const email = document.createElement("p");
      email.className = "accountRailCardEmail";
      email.textContent = state.email?.trim() || "Signed in";
      text.append(name, email);
      identity.append(avatar, text);

      body.appendChild(identity);

      if (state.countryName || state.timeZone) {
        const meta = document.createElement("div");
        meta.className = "accountRailCardMeta";
        if (state.countryName) {
          const country = document.createElement("span");
          country.className = "accountRailCardChip";
          country.textContent = state.countryName;
          meta.appendChild(country);
        }
        if (state.timeZone) {
          const timeZone = document.createElement("span");
          timeZone.className = "accountRailCardChip";
          timeZone.textContent = state.timeZone;
          meta.appendChild(timeZone);
        }
        body.appendChild(meta);
      }

      if (state.diagnosticLabel) {
        const meta = document.createElement("div");
        meta.className = "accountRailCardMeta";
        const diagnostic = document.createElement("span");
        diagnostic.className = "accountRailCardChip";
        diagnostic.textContent = state.diagnosticLabel;
        if (state.diagnosticTone && state.diagnosticTone !== "neutral") diagnostic.dataset.tone = state.diagnosticTone;
        if (state.diagnosticDetail) diagnostic.title = state.diagnosticDetail;
        meta.appendChild(diagnostic);
        body.appendChild(meta);
      }

      if (state.message) {
        const message = document.createElement("p");
        message.className = "accountRailCardMessage";
        message.textContent = state.message;
        body.appendChild(message);
      }

      const actions = document.createElement("div");
      actions.className = "accountRailCardActions";
      actions.append(
        createActionButton("Manage", "primary", opts.onManageAccount),
        createActionButton("Log out", "default", opts.onLogOut),
      );
      body.appendChild(actions);
      return;
    }

    const title = document.createElement("p");
    title.className = "accountRailCardName";
    title.textContent = state.status === "signed-out" ? "Signed out" : state.status === "loading" ? "Checking session" : "Account unavailable";

    const message = document.createElement("p");
    message.className = "accountRailCardMessage";
    message.textContent = state.message
      ?? (state.status === "signed-out"
        ? "Use your multiplayer account for profile identity, country, and time-zone settings."
        : state.status === "loading"
          ? "Contacting the configured multiplayer server."
          : "Review the account section for the current server status.");

    body.append(title, message);

    const actions = document.createElement("div");
    actions.className = "accountRailCardActions";
    if (state.status === "signed-out") {
      actions.append(
        createActionButton("Sign Up", "primary", opts.onSignUp),
        createActionButton("Log In", "default", opts.onLogIn),
      );
    } else {
      actions.append(createActionButton("Open account", "primary", opts.onManageAccount));
    }
    body.appendChild(actions);
  };

  update(initialState);
  return { element, update };
}