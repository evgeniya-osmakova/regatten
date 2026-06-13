import {
  DODV_LEVEL,
  DODV_REGATTA_API_URL,
  MANAGE2SAIL_API_BASE_URL,
  MANAGE2SAIL_EVENT_PAGE_BASE_URL,
} from "./constants.js";
import { isUuid } from "./normalization.js";
import type {
  DodvRegionCode,
  DodvRegattaItem,
  Manage2SailRegattaInfo,
  Manage2SailResult,
} from "./types.js";

const DEFAULT_HEADERS = {
  accept: "application/json, text/html;q=0.9, */*;q=0.8",
  "user-agent": "regatten-backend/0.1",
};

export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

export class InvalidJsonError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = "InvalidJsonError";
  }
}

export class DodvClient {
  async fetchRegattas(params: {
    region: DodvRegionCode;
    time: number;
  }): Promise<DodvRegattaItem[]> {
    const url = new URL(DODV_REGATTA_API_URL);
    url.searchParams.set("region", params.region);
    url.searchParams.set("level", DODV_LEVEL);
    url.searchParams.set("time", String(params.time));

    const json = await fetchJson(url.toString());
    if (!Array.isArray(json)) {
      throw new InvalidJsonError("DODV response is not an array", url.toString());
    }

    return json as DodvRegattaItem[];
  }
}

export class Manage2SailClient {
  async resolveEventId(eventSlugOrId: string): Promise<string | null> {
    if (isUuid(eventSlugOrId)) {
      return eventSlugOrId;
    }

    const url = `${MANAGE2SAIL_EVENT_PAGE_BASE_URL}/${encodeURIComponent(
      eventSlugOrId,
    )}`;
    const html = await fetchText(url);

    return extractEventId(html);
  }

  async resolveResultClassId(params: {
    eventSlugOrId: string;
    eventId: string;
    classId: string;
  }): Promise<string | null> {
    if (isUuid(params.classId)) {
      return params.classId;
    }

    const pageId = isUuid(params.eventSlugOrId)
      ? params.eventId
      : params.eventSlugOrId;
    const url = `${MANAGE2SAIL_EVENT_PAGE_BASE_URL}/${encodeURIComponent(
      pageId,
    )}`;
    const html = await fetchText(url);
    const regattas = extractBootstrappedRegattas(html);
    const matchingRegatta = regattas.find((regatta) =>
      hasResults(regatta) &&
      [regatta.Id, regatta.InfoAlias, regatta.LinkIdOrAlias].some((value) =>
        apiValueMatches(value, params.classId),
      ),
    );

    return apiValueToString(matchingRegatta?.Id) ?? null;
  }

  async fetchResult(params: {
    eventId: string;
    classId: string;
  }): Promise<Manage2SailResult> {
    const url = `${MANAGE2SAIL_API_BASE_URL}/event/${encodeURIComponent(
      params.eventId,
    )}/regattaresult/${encodeURIComponent(params.classId)}`;

    const json = await fetchJson(url);
    if (!isRecord(json)) {
      throw new InvalidJsonError("Manage2Sail result is not an object", url);
    }

    return json as Manage2SailResult;
  }
}

export function extractBootstrappedRegattas(
  html: string,
): Manage2SailRegattaInfo[] {
  const objectText = extractAssignedObject(
    html,
    "window.boostrapedResourceData",
  );
  if (!objectText) {
    return [];
  }

  try {
    const data = JSON.parse(objectText) as { Regatta?: unknown };
    return Array.isArray(data.Regatta)
      ? (data.Regatta as Manage2SailRegattaInfo[])
      : [];
  } catch {
    return [];
  }
}

function extractEventId(html: string): string | null {
  const directMatch =
    /window\.SailingInfo\.eventId\s*=\s*['"]([0-9a-f-]{36})['"]/i.exec(html);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const apiRootMatch =
    /window\.SailingInfo\.ConfigEventApiRoot\s*=\s*['"]\/api\/event\/([0-9a-f-]{36})\//i.exec(
      html,
    );
  return apiRootMatch?.[1] ?? null;
}

function extractAssignedObject(
  html: string,
  assignmentName: string,
): string | null {
  const assignmentIndex = html.indexOf(assignmentName);
  if (assignmentIndex === -1) {
    return null;
  }

  const objectStart = html.indexOf("{", assignmentIndex);
  if (objectStart === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(objectStart, index + 1);
      }
    }
  }

  return null;
}

function hasResults(regatta: Manage2SailRegattaInfo): boolean {
  if (typeof regatta.HasResults === "boolean") {
    return regatta.HasResults;
  }

  if (typeof regatta.HasResults === "number") {
    return regatta.HasResults !== 0;
  }

  if (typeof regatta.HasResults === "string") {
    return ["true", "1", "yes"].includes(regatta.HasResults.toLowerCase());
  }

  return false;
}

function apiValueMatches(value: unknown, expected: string): boolean {
  return apiValueToString(value)?.toLowerCase() === expected.toLowerCase();
}

function apiValueToString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new HttpStatusError(
      `HTTP ${response.status} while fetching ${url}`,
      response.status,
      url,
    );
  }

  try {
    return await response.json();
  } catch (error) {
    throw new InvalidJsonError(
      `Invalid JSON from ${url}: ${errorMessage(error)}`,
      url,
    );
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new HttpStatusError(
      `HTTP ${response.status} while fetching ${url}`,
      response.status,
      url,
    );
  }

  return response.text();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
