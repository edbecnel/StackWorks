type PlayerBotSelectorConfig = {
  storageSelectId: string;
  roleSelectId: string;
  levelSelectId?: string;
  levelWrapId?: string;
};

type PlayerBotSelectorBinding = {
  sync: () => void;
};

const HUMAN_VALUE = "human";
const BOT_VALUE = "bot";

const bindings = new Map<string, PlayerBotSelectorBinding>();

function getSelectOptionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .map((option) => ({
      value: String(option.value ?? "").trim(),
      disabled: option.disabled,
    }))
    .filter((option) => option.value && !option.disabled)
    .map((option) => option.value);
}

function getBotOptions(select: HTMLSelectElement): HTMLOptionElement[] {
  return Array.from(select.options).filter((option) => {
    const value = String(option.value ?? "").trim();
    return Boolean(value) && value !== HUMAN_VALUE && !option.disabled;
  });
}

function normalizeBotValue(raw: string, botValues: string[], fallback: string): string {
  return botValues.includes(raw) ? raw : fallback;
}

function syncLevelOptions(storageSelect: HTMLSelectElement, levelSelect: HTMLSelectElement | null): string[] {
  const botOptions = getBotOptions(storageSelect);
  const botValues = botOptions.map((option) => option.value);
  if (!levelSelect) return botValues;

  const signature = botOptions.map((option) => `${option.value}:${option.textContent ?? ""}`).join("|");
  if (levelSelect.dataset.optionsSig !== signature) {
    levelSelect.replaceChildren(
      ...botOptions.map((option) => {
        const next = document.createElement("option");
        next.value = option.value;
        next.textContent = option.textContent ?? option.value;
        return next;
      }),
    );
    levelSelect.dataset.optionsSig = signature;
  }

  return botValues;
}

function updateLevelVisibility(args: {
  levelWrap: HTMLElement | null;
  levelSelect: HTMLSelectElement | null;
  show: boolean;
  disabled: boolean;
}): void {
  if (args.levelWrap) {
    args.levelWrap.hidden = !args.show;
    args.levelWrap.style.display = args.show ? "" : "none";
  }
  if (args.levelSelect) {
    args.levelSelect.hidden = !args.show;
    args.levelSelect.disabled = args.disabled;
  }
}

export function installPlayerBotSelector(config: PlayerBotSelectorConfig, root: ParentNode = document): void {
  const storageSelect = root.querySelector(`#${config.storageSelectId}`) as HTMLSelectElement | null;
  const roleSelect = root.querySelector(`#${config.roleSelectId}`) as HTMLSelectElement | null;
  if (!storageSelect || !roleSelect) return;

  const levelSelect = config.levelSelectId
    ? (root.querySelector(`#${config.levelSelectId}`) as HTMLSelectElement | null)
    : null;
  const levelWrap = config.levelWrapId
    ? (root.querySelector(`#${config.levelWrapId}`) as HTMLElement | null)
    : (levelSelect?.parentElement as HTMLElement | null) ?? null;

  const sync = (): void => {
    const botValues = syncLevelOptions(storageSelect, levelSelect);
    const fallbackBotValue = botValues[0] ?? BOT_VALUE;
    const isBot = storageSelect.value !== HUMAN_VALUE;

    roleSelect.value = isBot ? BOT_VALUE : HUMAN_VALUE;
    roleSelect.disabled = storageSelect.disabled;

    if (levelSelect) {
      const nextLevelValue = normalizeBotValue(storageSelect.value, botValues, fallbackBotValue);
      if (levelSelect.options.length && nextLevelValue) {
        levelSelect.value = nextLevelValue;
      }
    }

    updateLevelVisibility({
      levelWrap,
      levelSelect,
      show: isBot && botValues.length > 0,
      disabled: storageSelect.disabled || !isBot,
    });
  };

  const commitStorageValue = (nextValue: string): void => {
    const normalized = String(nextValue || HUMAN_VALUE).trim() || HUMAN_VALUE;
    if (storageSelect.value === normalized) {
      sync();
      return;
    }
    storageSelect.value = normalized;
    storageSelect.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  };

  roleSelect.addEventListener("change", () => {
    const botValues = syncLevelOptions(storageSelect, levelSelect);
    const fallbackBotValue = botValues[0] ?? BOT_VALUE;
    if (roleSelect.value === HUMAN_VALUE) {
      commitStorageValue(HUMAN_VALUE);
      return;
    }

    const nextLevelValue = levelSelect
      ? normalizeBotValue(levelSelect.value, botValues, fallbackBotValue)
      : fallbackBotValue;
    commitStorageValue(nextLevelValue);
  });

  levelSelect?.addEventListener("change", () => {
    if (roleSelect.value !== BOT_VALUE) return;
    const botValues = syncLevelOptions(storageSelect, levelSelect);
    const fallbackBotValue = botValues[0] ?? BOT_VALUE;
    commitStorageValue(normalizeBotValue(levelSelect.value, botValues, fallbackBotValue));
  });

  storageSelect.addEventListener("change", sync);

  if (!getSelectOptionValues(roleSelect).includes(BOT_VALUE)) {
    const option = document.createElement("option");
    option.value = BOT_VALUE;
    option.textContent = "Bot";
    roleSelect.appendChild(option);
  }

  bindings.set(config.storageSelectId, { sync });
  sync();
}

export function syncPlayerBotSelector(storageSelectId: string): void {
  bindings.get(storageSelectId)?.sync();
}
