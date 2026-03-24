export type OnlineLaunchRole = "human" | "bot";
export type OnlineLaunchPreferredColor = "auto" | "W" | "B";
export type OnlineHumanSeatOwner = "remote" | "local";

export function resolveOnlineHumanSeat(args: {
  whiteRole: OnlineLaunchRole;
  blackRole: OnlineLaunchRole;
  whiteOwner: OnlineHumanSeatOwner;
  blackOwner: OnlineHumanSeatOwner;
  preferredColor: OnlineLaunchPreferredColor;
}): "W" | "B" | null {
  if (args.whiteRole === "human" && args.blackRole === "bot") return "W";
  if (args.whiteRole === "bot" && args.blackRole === "human") return "B";

  const whiteHuman = args.whiteRole === "human" && args.whiteOwner === "local";
  const blackHuman = args.blackRole === "human" && args.blackOwner === "local";

  if (whiteHuman && !blackHuman) return "W";
  if (!whiteHuman && blackHuman) return "B";
  if (!whiteHuman && !blackHuman) return null;
  return args.preferredColor === "B" ? "B" : "W";
}

export function deriveOnlineLaunchIdentity(args: {
  whiteRole: OnlineLaunchRole;
  blackRole: OnlineLaunchRole;
  whiteOwner: OnlineHumanSeatOwner;
  blackOwner: OnlineHumanSeatOwner;
  preferredColor: OnlineLaunchPreferredColor;
  signedInDisplayName: string;
  lightName: string;
  darkName: string;
}): {
  guestName: string;
  prefColor: OnlineLaunchPreferredColor;
} {
  const localHumanSeat = resolveOnlineHumanSeat(args);

  let prefColor: OnlineLaunchPreferredColor = localHumanSeat;
  if (!prefColor) {
    const whiteHuman = args.whiteRole === "human";
    const blackHuman = args.blackRole === "human";

    if (whiteHuman && !blackHuman) prefColor = "B";
    else if (!whiteHuman && blackHuman) prefColor = "W";
    else if (!whiteHuman && !blackHuman) prefColor = args.preferredColor === "B" ? "B" : "W";
    else prefColor = "auto";
  }

  return {
    guestName: (args.signedInDisplayName || args.lightName || args.darkName || "").trim(),
    prefColor,
  };
}