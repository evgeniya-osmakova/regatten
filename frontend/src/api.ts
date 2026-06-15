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
    return body.error?.message
      ? localizeApiErrorMessage(body.error.message)
      : `Anfrage fehlgeschlagen (Status ${response.status}).`;
  } catch {
    return `Anfrage fehlgeschlagen (Status ${response.status}).`;
  }
}

function localizeApiErrorMessage(message: string): string {
  if (message === "Not found") {
    return "Nicht gefunden.";
  }

  if (message === "Internal server error") {
    return "Interner Serverfehler.";
  }

  if (message.startsWith("Sailor is not configured as tracked: ")) {
    return `Der Segler ist nicht als beobachteter Segler konfiguriert: ${message.replace(
      "Sailor is not configured as tracked: ",
      "",
    )}`;
  }

  if (message.startsWith("Configured tracked sailor not found in database: ")) {
    return `Der konfigurierte beobachtete Segler wurde in der Datenbank nicht gefunden: ${message.replace(
      "Configured tracked sailor not found in database: ",
      "",
    )}`;
  }

  if (message.startsWith("Regatta result not found for sailor ")) {
    return "Das Regatta-Ergebnis für diesen Segler wurde nicht gefunden.";
  }

  return `Serverfehler: ${message}`;
}
