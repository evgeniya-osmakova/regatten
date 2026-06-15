import type {
  HistoricalHeadToHead,
  TrackedRegattaPerformance,
  TrackedSailorDashboard,
  TrackedSailorsResponse,
} from "./types";

const fallbackApiBaseUrl = "http://localhost:3000";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const apiBaseUrl = (
  configuredApiBaseUrl && configuredApiBaseUrl.length > 0
    ? configuredApiBaseUrl
    : fallbackApiBaseUrl
).replace(/\/$/, "");

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

export function getTrackedSailors(signal?: AbortSignal) {
  return getJson<TrackedSailorsResponse>("/api/tracked-sailors", signal);
}

export function getTrackedSailorDashboard(sailorId: string, signal?: AbortSignal) {
  return getJson<TrackedSailorDashboard>(
    `/api/tracked-sailors/${encodeURIComponent(sailorId)}/dashboard`,
    signal,
  );
}

export function getHistoricalHeadToHead(sailorId: string, signal?: AbortSignal) {
  return getJson<HistoricalHeadToHead[]>(
    `/api/tracked-sailors/${encodeURIComponent(sailorId)}/head-to-head`,
    signal,
  );
}

export function getTrackedRegattaDetail(sailorId: string, regattaId: string, signal?: AbortSignal) {
  return getJson<TrackedRegattaPerformance>(
    `/api/tracked-sailors/${encodeURIComponent(sailorId)}/regattas/${encodeURIComponent(regattaId)}`,
    signal,
  );
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
