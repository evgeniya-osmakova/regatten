import type { Trend } from "./types";

const percentFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const trendLabels: Record<Trend, string> = {
  IMPROVING: "Verbessert sich",
  STABLE: "Stabil",
  DECLINING: "Verschlechtert sich",
  NOT_ENOUGH_DATA: "Zu wenig Daten",
};

export function formatPercentile(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${percentFormatter.format(value * 100)}%`;
}

export function formatRank(
  rank: number | null | undefined,
  boats: number | null | undefined,
): string {
  if (rank === null || rank === undefined) {
    return boats === null || boats === undefined ? "-" : `${boats} Boote`;
  }

  if (boats === null || boats === undefined) {
    return `Platz ${rank}`;
  }

  return `Platz ${rank} / ${boats} Boote`;
}

export function formatDistanceToNextSegment(
  positions: number | null | undefined,
  label: string | null | undefined,
): string {
  if (positions === null || positions === undefined || !label) {
    return "-";
  }

  const placeLabel = positions === 1 ? "Platz" : "Positionen";
  return `${positions} ${placeLabel} bis ${label}`;
}

export function formatTrend(trend: Trend): string {
  return trendLabels[trend];
}

export function formatDateRange(dateFrom: string, dateTo: string): string {
  const formattedFrom = formatDate(dateFrom);
  const formattedTo = formatDate(dateTo);

  return formattedFrom === formattedTo ? formattedFrom : `${formattedFrom} - ${formattedTo}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return numberFormatter.format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}
