import type { DodvRegionConfig } from "./types.js";

export const DODV_REGATTA_API_URL =
  "https://segler-rangliste.de/dodv/api/regatta";

export const DODV_LEVEL = "b";

export const DODV_REGIONS: DodvRegionConfig[] = [
  { code: "b", name: "Berlin" },
  { code: "bg", name: "Brandenburg" },
];

export const DODV_TIMES_BY_YEAR = {
  2022: 834,
  2023: 953,
  2024: 1078,
  2025: 1180,
  2026: 1259,
} as const;

export const MANAGE2SAIL_EVENT_PAGE_BASE_URL =
  "https://www.manage2sail.com/de-DE/event";

export const MANAGE2SAIL_API_BASE_URL = "https://www.manage2sail.com/api";
