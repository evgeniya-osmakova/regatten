import type {
  Manage2SailEntryResult,
  ParsedManage2SailLink,
  SailorIdentity,
} from "./types.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function requiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required field: ${fieldName}`);
  }

  return text;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function intOrDefault(value: unknown, fallback: number): number {
  const numeric = numberOrNull(value);
  return numeric === null ? fallback : Math.trunc(numeric);
}

export function intOrNull(value: unknown): number | null {
  const numeric = numberOrNull(value);
  return numeric === null ? null : Math.trunc(numeric);
}

export function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", ""].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export function parseDodvDate(value: unknown, fieldName: string): Date {
  const dateText = requiredString(value, fieldName);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);

  if (!match) {
    throw new Error(`Invalid DODV date in ${fieldName}: ${dateText}`);
  }

  const [, year, month, day] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0),
  );
}

export function isDateBeforeToday(date: Date, now = new Date()): boolean {
  return dateOnlyTimestamp(date) < dateOnlyTimestamp(now);
}

export function normalizeName(name: string): string {
  return name
    .replace(/[ßẞ]/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeSailNumber(sailNumber: string): string {
  return sailNumber
    .normalize("NFKC")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function normalizeClubCode(clubCode: string | undefined): string {
  return normalizeName(clubCode ?? "").replace(/[^a-z0-9]/gi, "");
}

export function getSailorName(entry: Manage2SailEntryResult): string | undefined {
  const firstName = optionalString(entry.Skipper?.FirstName);
  const lastName = optionalString(entry.Skipper?.LastName);
  const skipperName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return skipperName || optionalString(entry.Name);
}

export function buildSailorIdentity(params: {
  name: string;
  sailNumber?: string;
  clubCode?: string;
}): SailorIdentity {
  const sailNumber = params.sailNumber?.trim() ?? "";
  const normalizedName = normalizeName(params.name);
  const normalizedSailNumber = normalizeSailNumber(sailNumber);
  const normalizedClubCode = normalizeClubCode(params.clubCode);
  const identitySuffix = normalizedSailNumber
    ? `sail:${normalizedSailNumber}`
    : `club:${normalizedClubCode || "no-club"}`;

  return {
    identityKey: `${normalizedName}|${identitySuffix}`,
    normalizedName,
    sailNumber,
    sailNumberNormalized: normalizedSailNumber,
  };
}

export function parseManage2SailResultLink(
  resultLink: string | undefined,
): ParsedManage2SailLink | null {
  if (!resultLink) {
    return null;
  }

  const eventMatch = /\/event\/([^/?#!]+)/i.exec(resultLink);
  const classMatch = /[?&]classId=([^&#]+)/i.exec(resultLink);

  if (!eventMatch?.[1] || !classMatch?.[1]) {
    return null;
  }

  return {
    eventSlugOrId: decodeUrlPart(eventMatch[1]),
    classId: decodeUrlPart(classMatch[1]),
  };
}

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function decodeUrlPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function dateOnlyTimestamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
