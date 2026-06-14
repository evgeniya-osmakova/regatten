export type FleetSegment = "SPITZENGRUPPE" | "MITTELFELD" | "HINTERFELD";

export type Trend = "IMPROVING" | "STABLE" | "DECLINING" | "NOT_ENOUGH_DATA";

export interface FleetSegmentInfo {
  fleetSegment: FleetSegment | null;
  fleetSegmentLabel: string | null;
  positionsToNextSegment: number | null;
  nextSegmentLabel: string | null;
}

export interface RaceSummary {
  racesCount: number;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: number | null;
  rankSpread: number | null;
  discardedRacesCount: number;
}

export interface SailorHistoricalStrength {
  sailorId: string;
  sailorName: string;
  sailNumber: string | null;
  regattasCount: number;
  averagePercentile: number | null;
  bestPercentile: number | null;
  latestPercentile: number | null;
  historicalFleetSegment: FleetSegment | null;
  historicalFleetSegmentLabel: string | null;
}

export interface NearbyCompetitor {
  sailorId: string;
  sailorName: string;
  sailNumber: string | null;
  rank: number | null;
  rankDifferenceToTracked: number | null;
  historicalRegattasCount: number;
  historicalAveragePercentile: number | null;
  historicalFleetSegment: FleetSegment | null;
  historicalFleetSegmentLabel: string | null;
}

export interface HistoricalHeadToHead {
  competitorSailorId: string;
  competitorName: string;
  competitorSailNumber: string | null;
  commonRegattasCount: number;
  trackedAheadCount: number;
  competitorAheadCount: number;
  trackedWinRate: number | null;
  competitorHistoricalRegattasCount: number;
  competitorAveragePercentile: number | null;
  competitorFleetSegment: FleetSegment | null;
  competitorFleetSegmentLabel: string | null;
}

export interface TrackedSailorSummary {
  sailorId: string;
  sailorName: string;
  sailNumber: string;
}

export interface TrackedSailorsResponse {
  sailors: TrackedSailorSummary[];
  missingSailorIds: string[];
}

export interface TrackedSailorDashboard {
  sailorId: string;
  sailorName: string;
  sailNumber: string;
  totalRegattas: number;
  averagePercentile: number | null;
  bestPercentile: number | null;
  latestPercentile: number | null;
  trend: Trend;
  results: TrackedRegattaPerformance[];
}

export interface TrackedRegattaPerformance {
  regattaId: string;
  regattaName: string;
  year: number;
  dateFrom: string;
  dateTo: string;
  location: string | null;
  rank: number | null;
  boats: number | null;
  percentile: number | null;
  fleetSegment: FleetSegment | null;
  fleetSegmentLabel: string | null;
  positionsToNextSegment: number | null;
  nextSegmentLabel: string | null;
  totalPoints: number | null;
  netPoints: number | null;
  fieldStrengthAveragePercentile: number | null;
  fieldStrengthKnownSailors: number;
  fieldStrengthTotalSailors: number;
  raceSummary: RaceSummary;
  nearbyCompetitors: NearbyCompetitor[];
}
