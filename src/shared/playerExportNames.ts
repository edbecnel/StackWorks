import type { IdentityByColor, PlayerColor } from "./onlineProtocol.ts";

type ResolveExportPlayerNameArgs = {
  side: PlayerColor;
  explicitName?: string | null;
  botSetting?: string | null;
  identityByColor?: IdentityByColor | null;
};

export function resolveExportPlayerName(args: ResolveExportPlayerNameArgs): string {
  const explicitName = String(args.explicitName ?? "").trim();
  const botSetting = String(args.botSetting ?? "human").trim();
  if (botSetting && botSetting !== "human") return args.side === "W" ? "white" : "black";

  const onlineNameRaw = args.identityByColor?.[args.side]?.displayName;
  const onlineName = typeof onlineNameRaw === "string" ? onlineNameRaw.trim() : "";

  return explicitName || onlineName || "human";
}