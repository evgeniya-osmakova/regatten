export type DodvRegionCode = "b" | "bg";

export interface DodvRegionConfig {
  code: DodvRegionCode;
  name: string;
}

export interface DodvRegattaItem {
  id?: unknown;
  year?: unknown;
  level?: unknown;
  name?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  location?: unknown;
  canceled?: unknown;
  boats?: unknown;
  clubname?: unknown;
  club?: unknown;
  runs_total?: unknown;
  runs_scored?: unknown;
  factor?: unknown;
  resultlink?: unknown;
  url?: unknown;
}

export interface ParsedManage2SailLink {
  eventSlugOrId: string;
  classId: string;
}

export interface Manage2SailResult {
  EntryResults?: Manage2SailEntryResult[];
}

export interface Manage2SailEntryResult {
  Rank?: unknown;
  Name?: unknown;
  SailNumber?: unknown;
  ClubName?: unknown;
  ClubCode?: unknown;
  TotalPoints?: unknown;
  NetPoints?: unknown;
  Skipper?: {
    FirstName?: unknown;
    LastName?: unknown;
  };
  EntryRaceResults?: Manage2SailEntryRaceResult[];
}

export interface Manage2SailEntryRaceResult {
  OverallRaceIndex?: unknown;
  Rank?: unknown;
  Points?: unknown;
  PointsDiscarded?: unknown;
  RaceStatusCode?: unknown;
}

export interface SailorIdentity {
  identityKey: string;
  normalizedName: string;
  sailNumber: string;
  sailNumberNormalized: string;
}

export interface SyncSummary {
  dodvRequests: number;
  dodvRegattasFetched: number;
  regattasUpserted: number;
  canceledRegattasDeleted: number;
  completedRegattas: number;
  resultImportsAttempted: number;
  resultImportsSucceeded: number;
  resultImportsSkipped: number;
  resultImportFailures: number;
  errors: SyncError[];
}

export interface SyncError {
  source: string;
  regattaId?: string;
  status?: string;
  message: string;
}
