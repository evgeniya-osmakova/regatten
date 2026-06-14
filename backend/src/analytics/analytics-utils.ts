import type { FleetSegment, FleetSegmentInfo, RaceSummary, Trend } from "./types.js";

const FLEET_SEGMENT_LABELS: Record<FleetSegment, string> = {
  SPITZENGRUPPE: "Spitzengruppe",
  MITTELFELD: "Mittelfeld",
  HINTERFELD: "Hinterfeld",
};

const TREND_STABLE_THRESHOLD = 0.05;

export function calculatePercentile(params: {
  boats: number | null | undefined;
  rank: number | null | undefined;
}): number | null {
  const { boats, rank } = params;
  if (!boats || boats <= 1 || !rank || rank < 1) {
    return null;
  }

  return 1 - (rank - 1) / (boats - 1);
}

export function getFleetSegmentLabel(
  segment: FleetSegment | null,
): string | null {
  return segment ? FLEET_SEGMENT_LABELS[segment] : null;
}

export function calculateFleetSegment(params: {
  boats: number | null | undefined;
  rank: number | null | undefined;
}): FleetSegmentInfo {
  const { boats, rank } = params;
  if (!boats || boats < 1 || !rank || rank < 1 || rank > boats) {
    return emptyFleetSegmentInfo();
  }

  const topEnd = Math.max(1, Math.floor(boats / 3));
  const middleEnd = Math.max(topEnd, boats - topEnd);

  if (rank <= topEnd) {
    return {
      fleetSegment: "SPITZENGRUPPE",
      fleetSegmentLabel: FLEET_SEGMENT_LABELS.SPITZENGRUPPE,
      positionsToNextSegment: null,
      nextSegmentLabel: null,
    };
  }

  if (rank <= middleEnd) {
    return {
      fleetSegment: "MITTELFELD",
      fleetSegmentLabel: FLEET_SEGMENT_LABELS.MITTELFELD,
      positionsToNextSegment: rank - topEnd,
      nextSegmentLabel: FLEET_SEGMENT_LABELS.SPITZENGRUPPE,
    };
  }

  return {
    fleetSegment: "HINTERFELD",
    fleetSegmentLabel: FLEET_SEGMENT_LABELS.HINTERFELD,
    positionsToNextSegment: rank - middleEnd,
    nextSegmentLabel: FLEET_SEGMENT_LABELS.MITTELFELD,
  };
}

export function fleetSegmentFromPercentile(
  percentile: number | null | undefined,
): FleetSegment | null {
  if (percentile === null || percentile === undefined) {
    return null;
  }

  if (percentile > 2 / 3) {
    return "SPITZENGRUPPE";
  }

  if (percentile >= 1 / 3) {
    return "MITTELFELD";
  }

  return "HINTERFELD";
}

export function calculateRaceSummary(
  raceResults: {
    rank: number | null;
    pointsDiscarded: boolean;
  }[],
): RaceSummary {
  const ranks = raceResults
    .map((race) => race.rank)
    .filter((rank): rank is number => rank !== null && rank > 0);
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;
  const worstRank = ranks.length > 0 ? Math.max(...ranks) : null;

  return {
    racesCount: raceResults.length,
    bestRank,
    worstRank,
    averageRank: average(ranks),
    rankSpread:
      bestRank !== null && worstRank !== null ? worstRank - bestRank : null,
    discardedRacesCount: raceResults.filter((race) => race.pointsDiscarded)
      .length,
  };
}

export function calculateTrend(
  chronologicalPercentiles: (number | null)[],
): Trend {
  const values = chronologicalPercentiles.filter(
    (percentile): percentile is number => percentile !== null,
  );

  if (values.length < 3) {
    return "NOT_ENOUGH_DATA";
  }

  const half = Math.floor(values.length / 2);
  const firstAverage = average(values.slice(0, half));
  const latestAverage = average(values.slice(-half));

  if (firstAverage === null || latestAverage === null) {
    return "NOT_ENOUGH_DATA";
  }

  const delta = latestAverage - firstAverage;
  if (delta >= TREND_STABLE_THRESHOLD) {
    return "IMPROVING";
  }
  if (delta <= -TREND_STABLE_THRESHOLD) {
    return "DECLINING";
  }

  return "STABLE";
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function emptyFleetSegmentInfo(): FleetSegmentInfo {
  return {
    fleetSegment: null,
    fleetSegmentLabel: null,
    positionsToNextSegment: null,
    nextSegmentLabel: null,
  };
}
