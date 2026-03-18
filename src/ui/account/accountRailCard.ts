export type AccountRailCardState = {
  status: "loading" | "signed-out" | "signed-in" | "error";
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
  countryName?: string | null;
  timeZone?: string | null;
  message?: string;
};

type AccountRailCardOptions = {
  onSignUp?: () => void;
  onLogIn?: () => void;
  onManageAccount?: () => void;
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
      margin-top: auto;
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

    .accountRailCardAvatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
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
      if (state.avatarUrl) {
        const image = document.createElement("img");
        image.src = state.avatarUrl;
        image.alt = "";
        avatar.appendChild(image);
      } else {
        avatar.textContent = renderInitial(state.displayName ?? state.email ?? "Player");
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