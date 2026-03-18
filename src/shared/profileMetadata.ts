export type CountryOption = {
  code: string;
  name: string;
};

const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR", "BS", "BT", "BW", "BY", "BZ",
  "CA", "CD", "CF", "CG", "CH", "CI", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "ER", "ES", "ET",
  "FI", "FJ", "FM", "FR",
  "GA", "GB", "GD", "GE", "GH", "GM", "GN", "GQ", "GR", "GT", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT",
  "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MR", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NZ",
  "OM",
  "PA", "PE", "PG", "PH", "PK", "PL", "PS", "PT", "PW", "PY",
  "QA",
  "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SY", "SZ",
  "TC", "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VN", "VU",
  "WS",
  "YE",
  "ZA", "ZM", "ZW",
];

const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Kyiv",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function createRegionDisplayNames(): { of(code: string): string | undefined } | null {
  const DisplayNamesCtor = (Intl as any)?.DisplayNames;
  if (typeof DisplayNamesCtor !== "function") return null;
  try {
    return new DisplayNamesCtor(["en"], { type: "region" }) as { of(code: string): string | undefined };
  } catch {
    return null;
  }
}

export function normalizeCountryCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const next = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(next)) return undefined;
  if (next === "XX" || next === "T1") return undefined;
  return next;
}

export function resolveCountryName(code: string): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  const regionNames = createRegionDisplayNames();
  const resolved = regionNames?.of(normalized)?.trim();
  return resolved || normalized;
}

export function listCountryOptions(): CountryOption[] {
  return COUNTRY_CODES
    .map((code) => ({ code, name: resolveCountryName(code) ?? code }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function isValidTimeZone(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const next = raw.trim();
  if (!next || next.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: next }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(raw: unknown): string | undefined {
  if (!isValidTimeZone(raw)) return undefined;
  return raw.trim();
}

export function listTimeZones(): string[] {
  const supportedValuesOf = (Intl as any)?.supportedValuesOf as ((key: string) => string[]) | undefined;
  if (typeof supportedValuesOf === "function") {
    try {
      const zones = supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length) return [...zones].sort((left, right) => left.localeCompare(right));
    } catch {
      // ignore
    }
  }

  return [...FALLBACK_TIME_ZONES];
}

export function resolveLocalTimeZone(): string | undefined {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return undefined;
  }
}