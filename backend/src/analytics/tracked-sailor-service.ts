import type { PrismaClient } from "@prisma/client";
import {
  average,
  calculateFleetSegment,
  calculatePercentile,
  calculateRaceSummary,
  calculateTrend,
  fleetSegmentFromPercentile,
  getFleetSegmentLabel,
  hasActuallyParticipatedInRegatta,
} from "./analytics-utils.js";
import type {
  HistoricalHeadToHead,
  NearbyCompetitor,
  SailorHistoricalStrength,
  TrackedRegattaPerformance,
  TrackedSailorDashboard,
  TrackedSailorsResponse,
} from "./types.js";
import { getTrackedSailorIdsFromEnv } from "./tracked-sailor-config.js";

interface TrackedSailorAnalyticsServiceOptions {
  prisma: PrismaClient;
}

interface RegattaView {
  id: string;
  name: string;
  year: number;
  dateFrom: Date;
  dateTo: Date;
  location: string | null;
  boats: number;
}

interface SailorView {
  id: string;
  name: string;
  sailNumber: string;
}

interface TrackedResultView {
  regattaId: string;
  sailorId: string;
  rank: number | null;
  totalPoints: number | null;
  netPoints: number | null;
  regatta: RegattaView;
}

interface ParticipantResultView {
  regattaId: string;
  sailorId: string;
  rank: number | null;
  sailor: SailorView;
}

interface HistoricalResultView {
  sailorId: string;
  rank: number | null;
  sailor: SailorView;
  regatta: Pick<RegattaView, "id" | "boats" | "dateFrom" | "dateTo">;
}

interface RaceResultView {
  regattaId: string;
  rank: number | null;
  pointsDiscarded: boolean;
}

interface RaceParticipationView {
  regattaId: string;
  sailorId: string;
  rank: number | null;
  raceStatusCode: string | null;
}

interface FieldStrength {
  fieldStrengthAveragePercentile: number | null;
  fieldStrengthKnownSailors: number;
  fieldStrengthTotalSailors: number;
}

interface HeadToHeadAccumulator {
  competitor: SailorView;
  commonRegattasCount: number;
  trackedAheadCount: number;
  competitorAheadCount: number;
}

export class AnalyticsNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = "AnalyticsNotFoundError";
  }
}

export class TrackedSailorAnalyticsService {
  private readonly prisma: PrismaClient;

  constructor(options: TrackedSailorAnalyticsServiceOptions) {
    this.prisma = options.prisma;
  }

  async listTrackedSailors(): Promise<TrackedSailorsResponse> {
    const trackedSailorIds = getTrackedSailorIdsFromEnv();

    if (trackedSailorIds.length === 0) {
      return {
        sailors: [],
        missingSailorIds: [],
      };
    }

    const sailors = await this.prisma.sailor.findMany({
      where: {
        id: {
          in: trackedSailorIds,
        },
      },
      orderBy: [{ name: "asc" }, { sailNumber: "asc" }],
      select: {
        id: true,
        name: true,
        sailNumber: true,
      },
    });
    const existingSailorIds = new Set(sailors.map((sailor) => sailor.id));

    return {
      sailors: sailors.map((sailor) => ({
        sailorId: sailor.id,
        sailorName: sailor.name,
        sailNumber: sailor.sailNumber,
      })),
      missingSailorIds: trackedSailorIds.filter(
        (id) => !existingSailorIds.has(id),
      ),
    };
  }

  async getTrackedSailorDashboard(
    sailorId: string,
  ): Promise<TrackedSailorDashboard> {
    const sailor = await this.getTrackedSailorOrThrow(sailorId);
    const results = await this.getTrackedSailorResults(sailorId);
    const performances = await this.buildTrackedRegattaPerformances(
      sailorId,
      results,
    );
    const percentiles = performances.map((result) => result.percentile);
    const validPercentiles = percentiles.filter(
      (percentile): percentile is number => percentile !== null,
    );

    return {
      sailorId: sailor.id,
      sailorName: sailor.name,
      sailNumber: sailor.sailNumber,
      totalRegattas: performances.length,
      averagePercentile: average(validPercentiles),
      bestPercentile:
        validPercentiles.length > 0 ? Math.max(...validPercentiles) : null,
      latestPercentile: latestValidValue(percentiles),
      trend: calculateTrend(percentiles),
      results: performances,
    };
  }

  async getTrackedSailorRegattaTimeline(
    sailorId: string,
  ): Promise<TrackedRegattaPerformance[]> {
    const dashboard = await this.getTrackedSailorDashboard(sailorId);
    return dashboard.results;
  }

  async getRegattaDetailForTrackedSailor(params: {
    sailorId: string;
    regattaId: string;
  }): Promise<TrackedRegattaPerformance> {
    await this.getTrackedSailorOrThrow(params.sailorId);

    const result = await this.prisma.regattaResult.findUnique({
      where: {
        regattaId_sailorId: {
          regattaId: params.regattaId,
          sailorId: params.sailorId,
        },
      },
      select: trackedResultSelect,
    });

    if (!result) {
      throw new AnalyticsNotFoundError(
        `Regatta result not found for sailor ${params.sailorId} in regatta ${params.regattaId}`,
      );
    }

    const [performance] = await this.buildTrackedRegattaPerformances(
      params.sailorId,
      [result],
    );

    if (!performance) {
      throw new AnalyticsNotFoundError(
        `Regatta result not found for sailor ${params.sailorId} in regatta ${params.regattaId}`,
      );
    }

    return performance;
  }

  async getNearbyCompetitorsForRegatta(params: {
    sailorId: string;
    regattaId: string;
  }): Promise<NearbyCompetitor[]> {
    const detail = await this.getRegattaDetailForTrackedSailor(params);
    return detail.nearbyCompetitors;
  }

  async getHistoricalCompetitorStrength(): Promise<SailorHistoricalStrength[]> {
    const strengths = await this.getHistoricalStrengthsBySailorId();
    return [...strengths.values()].sort((left, right) =>
      compareText(left.sailorName, right.sailorName) ||
      compareNullableText(left.sailNumber, right.sailNumber),
    );
  }

  async getHistoricalHeadToHead(
    sailorId: string,
  ): Promise<HistoricalHeadToHead[]> {
    await this.getTrackedSailorOrThrow(sailorId);

    const trackedResults = await this.prisma.regattaResult.findMany({
      where: { sailorId },
      select: {
        regattaId: true,
        rank: true,
      },
    });
    const candidateRegattaIds = trackedResults.map((result) => result.regattaId);

    if (candidateRegattaIds.length === 0) {
      return [];
    }

    const trackedRaceResults = await this.prisma.raceResult.findMany({
      where: {
        sailorId,
        regattaId: { in: candidateRegattaIds },
      },
      select: raceParticipationSelect,
    });
    const trackedRaceResultsByRegattaId =
      groupRaceResultsByRegattaId(trackedRaceResults);
    const trackedRankByRegattaId = new Map<string, number | null>();

    for (const result of trackedResults) {
      const races = trackedRaceResultsByRegattaId.get(result.regattaId) ?? [];
      if (hasActuallyParticipatedInRegatta(races)) {
        trackedRankByRegattaId.set(result.regattaId, result.rank);
      }
    }

    const regattaIds = [...trackedRankByRegattaId.keys()];
    if (regattaIds.length === 0) {
      return [];
    }

    const competitorResults = await this.prisma.regattaResult.findMany({
      where: {
        regattaId: { in: regattaIds },
        sailorId: { not: sailorId },
      },
      select: participantResultSelect,
    });
    const competitorRaceResults = await this.prisma.raceResult.findMany({
      where: {
        regattaId: { in: regattaIds },
        sailorId: { not: sailorId },
      },
      select: raceParticipationSelect,
    });
    const competitorRaceResultsByKey =
      groupRaceResultsByRegattaAndSailorId(competitorRaceResults);
    const strengths = await this.getHistoricalStrengthsBySailorId();
    const accumulators = new Map<string, HeadToHeadAccumulator>();

    for (const result of competitorResults) {
      const trackedRank = trackedRankByRegattaId.get(result.regattaId);
      const competitorRaces = competitorRaceResultsByKey.get(
        buildRegattaSailorKey(result.regattaId, result.sailorId),
      ) ?? [];

      if (!hasActuallyParticipatedInRegatta(competitorRaces)) {
        continue;
      }

      const accumulator =
        accumulators.get(result.sailorId) ??
        createHeadToHeadAccumulator(result.sailor);

      accumulator.commonRegattasCount += 1;
      updateHeadToHeadAheadCounts(accumulator, trackedRank, result.rank);

      accumulators.set(result.sailorId, accumulator);
    }

    const participatedRegattasCountBySailorId =
      await this.getParticipatedRegattasCountBySailorId([
        ...accumulators.keys(),
      ]);

    return [...accumulators.entries()]
      .map(([competitorSailorId, accumulator]) => {
        const comparableCount =
          accumulator.trackedAheadCount + accumulator.competitorAheadCount;
        const strength = strengths.get(competitorSailorId);

        return {
          competitorSailorId,
          competitorName: accumulator.competitor.name,
          competitorSailNumber: nullableSailNumber(
            accumulator.competitor.sailNumber,
          ),
          competitorParticipatedRegattasCount:
            participatedRegattasCountBySailorId.get(competitorSailorId) ?? 0,
          commonRegattasCount: accumulator.commonRegattasCount,
          trackedAheadCount: accumulator.trackedAheadCount,
          competitorAheadCount: accumulator.competitorAheadCount,
          trackedWinRate:
            comparableCount > 0
              ? accumulator.trackedAheadCount / comparableCount
              : null,
          competitorHistoricalRegattasCount: strength?.regattasCount ?? 0,
          competitorAveragePercentile: strength?.averagePercentile ?? null,
          competitorFleetSegment:
            strength?.historicalFleetSegment ?? null,
          competitorFleetSegmentLabel:
            strength?.historicalFleetSegmentLabel ?? null,
        };
      })
      .sort(
        (left, right) =>
          right.commonRegattasCount - left.commonRegattasCount ||
          right.trackedAheadCount + right.competitorAheadCount -
            (left.trackedAheadCount + left.competitorAheadCount) ||
          compareText(left.competitorName, right.competitorName),
      );
  }

  private async getTrackedSailorOrThrow(sailorId: string): Promise<SailorView> {
    const trackedSailorIds = getTrackedSailorIdsFromEnv();

    if (!trackedSailorIds.includes(sailorId)) {
      throw new AnalyticsNotFoundError(
        `Sailor is not configured as tracked: ${sailorId}`,
      );
    }

    const sailor = await this.prisma.sailor.findUnique({
      where: { id: sailorId },
      select: {
        id: true,
        name: true,
        sailNumber: true,
      },
    });

    if (!sailor) {
      throw new AnalyticsNotFoundError(
        `Configured tracked sailor not found in database: ${sailorId}`,
      );
    }

    return sailor;
  }

  private async getTrackedSailorResults(
    sailorId: string,
  ): Promise<TrackedResultView[]> {
    const results = await this.prisma.regattaResult.findMany({
      where: { sailorId },
      select: trackedResultSelect,
    });

    return results.sort(compareTrackedResultsByDate);
  }

  private async buildTrackedRegattaPerformances(
    trackedSailorId: string,
    results: TrackedResultView[],
  ): Promise<TrackedRegattaPerformance[]> {
    if (results.length === 0) {
      return [];
    }

    const regattaIds = results.map((result) => result.regattaId);
    const strengths = await this.getHistoricalStrengthsBySailorId();
    const participantsByRegattaId =
      await this.getParticipantsByRegattaId(regattaIds);
    const raceSummaryByRegattaId = await this.getRaceSummaryByRegattaId({
      sailorId: trackedSailorId,
      regattaIds,
    });

    return results.map((result) => {
      const percentile = calculatePercentile({
        boats: result.regatta.boats,
        rank: result.rank,
      });
      const fleetSegment = calculateFleetSegment({
        boats: result.regatta.boats,
        rank: result.rank,
      });
      const participants = participantsByRegattaId.get(result.regattaId) ?? [];
      const fieldStrength = calculateFieldStrength(participants, strengths);

      return {
        regattaId: result.regatta.id,
        regattaName: result.regatta.name,
        year: result.regatta.year,
        dateFrom: toDateString(result.regatta.dateFrom),
        dateTo: toDateString(result.regatta.dateTo),
        location: result.regatta.location,
        rank: result.rank,
        boats: result.regatta.boats,
        percentile,
        fleetSegment: fleetSegment.fleetSegment,
        fleetSegmentLabel: fleetSegment.fleetSegmentLabel,
        positionsToNextSegment: fleetSegment.positionsToNextSegment,
        nextSegmentLabel: fleetSegment.nextSegmentLabel,
        totalPoints: result.totalPoints,
        netPoints: result.netPoints,
        ...fieldStrength,
        raceSummary: raceSummaryByRegattaId.get(result.regattaId) ?? {
          racesCount: 0,
          bestRank: null,
          worstRank: null,
          averageRank: null,
          rankSpread: null,
          discardedRacesCount: 0,
        },
        nearbyCompetitors: calculateNearbyCompetitors({
          participants,
          trackedSailorId,
          trackedRank: result.rank,
          strengths,
        }),
      };
    });
  }

  private async getHistoricalStrengthsBySailorId(): Promise<
    Map<string, SailorHistoricalStrength>
  > {
    const [sailors, results] = await Promise.all([
      this.prisma.sailor.findMany({
        select: {
          id: true,
          name: true,
          sailNumber: true,
        },
      }),
      this.prisma.regattaResult.findMany({
        where: {
          rank: { not: null },
          regatta: {
            boats: { gt: 1 },
          },
        },
        select: historicalResultSelect,
      }),
    ]);
    const strengths = new Map<string, SailorHistoricalStrength>();
    const entriesBySailorId = new Map<
      string,
      {
        percentile: number;
        dateTo: Date;
        dateFrom: Date;
      }[]
    >();

    for (const sailor of sailors) {
      strengths.set(sailor.id, {
        sailorId: sailor.id,
        sailorName: sailor.name,
        sailNumber: nullableSailNumber(sailor.sailNumber),
        regattasCount: 0,
        averagePercentile: null,
        bestPercentile: null,
        latestPercentile: null,
        historicalFleetSegment: null,
        historicalFleetSegmentLabel: null,
      });
    }

    for (const result of results) {
      const percentile = calculatePercentile({
        boats: result.regatta.boats,
        rank: result.rank,
      });

      if (percentile === null) {
        continue;
      }

      const entries = entriesBySailorId.get(result.sailorId) ?? [];
      entries.push({
        percentile,
        dateFrom: result.regatta.dateFrom,
        dateTo: result.regatta.dateTo,
      });
      entriesBySailorId.set(result.sailorId, entries);

      if (!strengths.has(result.sailorId)) {
        strengths.set(result.sailorId, {
          sailorId: result.sailorId,
          sailorName: result.sailor.name,
          sailNumber: nullableSailNumber(result.sailor.sailNumber),
          regattasCount: 0,
          averagePercentile: null,
          bestPercentile: null,
          latestPercentile: null,
          historicalFleetSegment: null,
          historicalFleetSegmentLabel: null,
        });
      }
    }

    for (const [sailorId, entries] of entriesBySailorId) {
      const strength = strengths.get(sailorId);
      if (!strength) {
        continue;
      }

      const sortedEntries = entries.sort(compareHistoricalEntriesByDate);
      const percentiles = sortedEntries.map((entry) => entry.percentile);
      const averagePercentile = average(percentiles);
      const historicalFleetSegment =
        fleetSegmentFromPercentile(averagePercentile);

      strengths.set(sailorId, {
        ...strength,
        regattasCount: percentiles.length,
        averagePercentile,
        bestPercentile:
          percentiles.length > 0 ? Math.max(...percentiles) : null,
        latestPercentile: latestValidValue(percentiles),
        historicalFleetSegment,
        historicalFleetSegmentLabel: getFleetSegmentLabel(
          historicalFleetSegment,
        ),
      });
    }

    return strengths;
  }

  private async getParticipantsByRegattaId(
    regattaIds: string[],
  ): Promise<Map<string, ParticipantResultView[]>> {
    const participants = await this.prisma.regattaResult.findMany({
      where: {
        regattaId: { in: regattaIds },
      },
      select: participantResultSelect,
    });
    const byRegattaId = new Map<string, ParticipantResultView[]>();

    for (const participant of participants) {
      const regattaParticipants = byRegattaId.get(participant.regattaId) ?? [];
      regattaParticipants.push(participant);
      byRegattaId.set(participant.regattaId, regattaParticipants);
    }

    return byRegattaId;
  }

  private async getRaceSummaryByRegattaId(params: {
    sailorId: string;
    regattaIds: string[];
  }): Promise<Map<string, ReturnType<typeof calculateRaceSummary>>> {
    const raceResults = await this.prisma.raceResult.findMany({
      where: {
        sailorId: params.sailorId,
        regattaId: { in: params.regattaIds },
      },
      select: {
        regattaId: true,
        rank: true,
        pointsDiscarded: true,
      },
    });
    const byRegattaId = new Map<string, RaceResultView[]>();

    for (const raceResult of raceResults) {
      const regattaRaceResults = byRegattaId.get(raceResult.regattaId) ?? [];
      regattaRaceResults.push(raceResult);
      byRegattaId.set(raceResult.regattaId, regattaRaceResults);
    }

    return new Map(
      [...byRegattaId.entries()].map(([regattaId, races]) => [
        regattaId,
        calculateRaceSummary(races),
      ]),
    );
  }

  private async getParticipatedRegattasCountBySailorId(
    sailorIds: string[],
  ): Promise<Map<string, number>> {
    if (sailorIds.length === 0) {
      return new Map();
    }

    const raceResults = await this.prisma.raceResult.findMany({
      where: {
        sailorId: { in: sailorIds },
        regatta: {
          canceled: 0,
        },
      },
      select: raceParticipationSelect,
    });
    const raceResultsByKey =
      groupFullRaceResultsByRegattaAndSailorId(raceResults);
    const countsBySailorId = new Map<string, number>(
      sailorIds.map((sailorId) => [sailorId, 0]),
    );

    for (const races of raceResultsByKey.values()) {
      const firstRace = races[0];
      if (!firstRace || !hasActuallyParticipatedInRegatta(races)) {
        continue;
      }

      countsBySailorId.set(
        firstRace.sailorId,
        (countsBySailorId.get(firstRace.sailorId) ?? 0) + 1,
      );
    }

    return countsBySailorId;
  }
}

const trackedResultSelect = {
  regattaId: true,
  sailorId: true,
  rank: true,
  totalPoints: true,
  netPoints: true,
  regatta: {
    select: {
      id: true,
      name: true,
      year: true,
      dateFrom: true,
      dateTo: true,
      location: true,
      boats: true,
    },
  },
} as const;

const participantResultSelect = {
  regattaId: true,
  sailorId: true,
  rank: true,
  sailor: {
    select: {
      id: true,
      name: true,
      sailNumber: true,
    },
  },
} as const;

const historicalResultSelect = {
  sailorId: true,
  rank: true,
  sailor: {
    select: {
      id: true,
      name: true,
      sailNumber: true,
    },
  },
  regatta: {
    select: {
      id: true,
      boats: true,
      dateFrom: true,
      dateTo: true,
    },
  },
} as const;

const raceParticipationSelect = {
  regattaId: true,
  sailorId: true,
  rank: true,
  raceStatusCode: true,
} as const;

function calculateFieldStrength(
  participants: ParticipantResultView[],
  strengths: Map<string, SailorHistoricalStrength>,
): FieldStrength {
  const knownPercentiles = participants
    .map((participant) => strengths.get(participant.sailorId)?.averagePercentile)
    .filter((percentile): percentile is number => percentile !== null && percentile !== undefined);

  return {
    fieldStrengthAveragePercentile: average(knownPercentiles),
    fieldStrengthKnownSailors: knownPercentiles.length,
    fieldStrengthTotalSailors: participants.length,
  };
}

function calculateNearbyCompetitors(params: {
  participants: ParticipantResultView[];
  trackedSailorId: string;
  trackedRank: number | null;
  strengths: Map<string, SailorHistoricalStrength>;
}): NearbyCompetitor[] {
  if (!isValidRank(params.trackedRank)) {
    return [];
  }

  const trackedRank = params.trackedRank;

  return params.participants
    .filter((participant) => participant.sailorId !== params.trackedSailorId)
    .filter(hasValidParticipantRank)
    .filter(
      (participant) =>
        Math.abs(participant.rank - trackedRank) <= 5,
    )
    .sort((left, right) => Number(left.rank) - Number(right.rank))
    .map((participant) => {
      const strength = params.strengths.get(participant.sailorId);

      return {
        sailorId: participant.sailorId,
        sailorName: participant.sailor.name,
        sailNumber: nullableSailNumber(participant.sailor.sailNumber),
        rank: participant.rank,
        rankDifferenceToTracked: participant.rank - trackedRank,
        historicalRegattasCount: strength?.regattasCount ?? 0,
        historicalAveragePercentile: strength?.averagePercentile ?? null,
        historicalFleetSegment: strength?.historicalFleetSegment ?? null,
        historicalFleetSegmentLabel:
          strength?.historicalFleetSegmentLabel ?? null,
      };
    });
}

function createHeadToHeadAccumulator(
  competitor: SailorView,
): HeadToHeadAccumulator {
  return {
    competitor,
    commonRegattasCount: 0,
    trackedAheadCount: 0,
    competitorAheadCount: 0,
  };
}

function updateHeadToHeadAheadCounts(
  accumulator: HeadToHeadAccumulator,
  trackedRank: number | null | undefined,
  competitorRank: number | null,
): void {
  const trackedHasRank = isValidRank(trackedRank);
  const competitorHasRank = isValidRank(competitorRank);

  if (trackedHasRank && competitorHasRank) {
    if (trackedRank < competitorRank) {
      accumulator.trackedAheadCount += 1;
    } else if (trackedRank > competitorRank) {
      accumulator.competitorAheadCount += 1;
    }
    return;
  }

  if (trackedHasRank && !competitorHasRank) {
    accumulator.trackedAheadCount += 1;
    return;
  }

  if (!trackedHasRank && competitorHasRank) {
    accumulator.competitorAheadCount += 1;
  }
}

function groupRaceResultsByRegattaId(
  raceResults: RaceParticipationView[],
): Map<string, { rank: number | null; raceStatusCode: string | null }[]> {
  const byRegattaId = new Map<
    string,
    { rank: number | null; raceStatusCode: string | null }[]
  >();

  for (const raceResult of raceResults) {
    const races = byRegattaId.get(raceResult.regattaId) ?? [];
    races.push({
      rank: raceResult.rank,
      raceStatusCode: raceResult.raceStatusCode,
    });
    byRegattaId.set(raceResult.regattaId, races);
  }

  return byRegattaId;
}

function groupRaceResultsByRegattaAndSailorId(
  raceResults: RaceParticipationView[],
): Map<string, { rank: number | null; raceStatusCode: string | null }[]> {
  const byKey = new Map<
    string,
    { rank: number | null; raceStatusCode: string | null }[]
  >();

  for (const raceResult of raceResults) {
    const key = buildRegattaSailorKey(
      raceResult.regattaId,
      raceResult.sailorId,
    );
    const races = byKey.get(key) ?? [];
    races.push({
      rank: raceResult.rank,
      raceStatusCode: raceResult.raceStatusCode,
    });
    byKey.set(key, races);
  }

  return byKey;
}

function groupFullRaceResultsByRegattaAndSailorId(
  raceResults: RaceParticipationView[],
): Map<string, RaceParticipationView[]> {
  const byKey = new Map<string, RaceParticipationView[]>();

  for (const raceResult of raceResults) {
    const key = buildRegattaSailorKey(
      raceResult.regattaId,
      raceResult.sailorId,
    );
    const races = byKey.get(key) ?? [];
    races.push(raceResult);
    byKey.set(key, races);
  }

  return byKey;
}

function buildRegattaSailorKey(regattaId: string, sailorId: string): string {
  return `${regattaId}\u0000${sailorId}`;
}

function latestValidValue(values: (number | null)[]): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function compareTrackedResultsByDate(
  left: TrackedResultView,
  right: TrackedResultView,
): number {
  return (
    compareDates(left.regatta.dateFrom, right.regatta.dateFrom) ||
    compareDates(left.regatta.dateTo, right.regatta.dateTo) ||
    compareText(left.regatta.id, right.regatta.id)
  );
}

function compareHistoricalEntriesByDate(
  left: { dateFrom: Date; dateTo: Date },
  right: { dateFrom: Date; dateTo: Date },
): number {
  return (
    compareDates(left.dateFrom, right.dateFrom) ||
    compareDates(left.dateTo, right.dateTo)
  );
}

function compareDates(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "de");
}

function compareNullableText(
  left: string | null,
  right: string | null,
): number {
  return (left ?? "").localeCompare(right ?? "", "de");
}

function nullableSailNumber(sailNumber: string): string | null {
  const trimmed = sailNumber.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isValidRank(rank: number | null | undefined): rank is number {
  return rank !== null && rank !== undefined && rank > 0;
}

function hasValidParticipantRank(
  participant: ParticipantResultView,
): participant is ParticipantResultView & { rank: number } {
  return isValidRank(participant.rank);
}
