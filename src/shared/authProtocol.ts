export type UserId = string;

export type AuthUser = {
  userId: UserId;
  /** Lowercased email used for login. */
  email: string;
  /** Display name for UI. */
  displayName: string;
  /** Optional avatar URL (purely decorative). */
  avatarUrl?: string;
  /** Optional ISO 3166-1 alpha-2 profile country. */
  countryCode?: string;
  /** Optional display name derived from countryCode. */
  countryName?: string;
  /** Optional IANA time zone selected for the profile. */
  timeZone?: string;
  createdAtIso: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName?: string;
  countryCode?: string;
  timeZone?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type UpdateProfileRequest = {
  displayName?: string;
  avatarUrl?: string;
  countryCode?: string;
  timeZone?: string;
};

export type AuthOkResponse = {
  ok: true;
  user: AuthUser;
};

export type AuthMeResponse =
  | { ok: true; user: AuthUser }
  | { ok: true; user: null };

export type AuthErrorResponse = {
  error: string;
};
