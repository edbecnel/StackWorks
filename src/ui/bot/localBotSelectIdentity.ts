type AuthMeResponse = {
  ok: true;
  user: {
    displayName: string;
  } | null;
};

const SIGNED_IN_NAME_OPTION_ATTR = "data-local-auth-display-name-option";

function clearSignedInNameOption(select: HTMLSelectElement): void {
  const existing = select.querySelector(`option[${SIGNED_IN_NAME_OPTION_ATTR}="1"]`) as HTMLOptionElement | null;
  existing?.remove();
}

function prependSignedInNameOption(select: HTMLSelectElement, displayName: string): void {
  clearSignedInNameOption(select);
  const option = document.createElement("option");
  option.textContent = displayName;
  option.value = "";
  option.disabled = true;
  option.setAttribute(SIGNED_IN_NAME_OPTION_ATTR, "1");
  select.insertBefore(option, select.firstChild);
}

async function fetchSignedInDisplayName(serverBaseUrl?: string): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL as string | undefined;
    const base = serverBaseUrl ?? (typeof envServerUrl === "string" && envServerUrl.trim() ? envServerUrl.trim() : "");
    const url = base ? `${base.replace(/\/$/, "")}/api/auth/me` : "/api/auth/me";
    const res = await fetch(url, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = await res.json() as AuthMeResponse;
    const displayName = typeof body?.user?.displayName === "string" ? body.user.displayName.trim() : "";
    return displayName || null;
  } catch {
    return null;
  }
}

export async function applySignedInNameToLocalBotSelects(
  selects: Array<HTMLSelectElement | null | undefined>,
  options?: { serverBaseUrl?: string },
): Promise<void> {
  const liveSelects = selects.filter((select): select is HTMLSelectElement => Boolean(select));
  if (!liveSelects.length) return;

  const displayName = await fetchSignedInDisplayName(options?.serverBaseUrl);
  if (!displayName) {
    for (const select of liveSelects) clearSignedInNameOption(select);
    return;
  }

  for (const select of liveSelects) prependSignedInNameOption(select, displayName);
}