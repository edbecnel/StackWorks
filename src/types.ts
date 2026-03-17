export type Player = "W" | "B";
// Core game ranks are S (soldier) and O (officer). Columns Chess uses chess ranks.
export type Rank = "S" | "O" | "P" | "N" | "B" | "R" | "Q" | "K";

export type PresenceState = "offline" | "connected" | "waiting" | "in_grace" | "disconnected" | "spectating" | "reconnecting";

export interface PlayerIdentity {
	color: Player;
	displayName: string;
	roleLabel: string;
	detailText: string;
	status: PresenceState;
	statusText: string;
	isLocal: boolean;
	isActiveTurn: boolean;
}

export interface PlayerShellSnapshot {
	mode: "local" | "online";
	transportStatus: "connected" | "reconnecting";
	viewerColor: Player | null;
	viewerRole: "offline" | "player" | "spectator";
	players: Record<Player, PlayerIdentity>;
}

export interface Piece { owner: Player; rank: Rank; }
export type Stack = Piece[];
