export type DodvRegionCode = "b" | "bg";

export type ApiScalar = string | number | boolean | null | undefined;
export type ApiTextScalar = Exclude<ApiScalar, boolean>;
export type ApiNumberScalar = Exclude<ApiScalar, boolean>;
export type ApiBooleanScalar = ApiScalar;

export interface DodvRegionConfig {
  code: DodvRegionCode;
  name: string;
}

export interface DodvRegattaItem {
  id?: ApiTextScalar;
  year?: ApiNumberScalar;
  level?: ApiTextScalar;
  name?: ApiTextScalar;
  date_from?: ApiTextScalar;
  date_to?: ApiTextScalar;
  location?: ApiTextScalar;
  canceled?: ApiNumberScalar;
  boats?: ApiNumberScalar;
  clubname?: ApiTextScalar;
  club?: ApiTextScalar;
  runs_total?: ApiNumberScalar;
  runs_scored?: ApiNumberScalar;
  factor?: ApiNumberScalar;
  resultlink?: ApiTextScalar;
  url?: ApiTextScalar;
}

export interface ParsedManage2SailLink {
  eventSlugOrId: string;
  classId: string;
}

export interface Manage2SailResult {
  EntryResults?: Manage2SailEntryResult[] | null;
}

export interface Manage2SailEntryResult {
  Rank?: ApiNumberScalar;
  Name?: ApiTextScalar;
  SailNumber?: ApiTextScalar;
  ClubName?: ApiTextScalar;
  ClubCode?: ApiTextScalar;
  TotalPoints?: ApiNumberScalar;
  NetPoints?: ApiNumberScalar;
  Skipper?: {
    FirstName?: ApiTextScalar;
    LastName?: ApiTextScalar;
  } | null;
  EntryRaceResults?: Manage2SailEntryRaceResult[] | null;
}

export interface Manage2SailEntryRaceResult {
  OverallRaceIndex?: ApiNumberScalar;
  Rank?: ApiNumberScalar;
  Points?: ApiNumberScalar;
  PointsDiscarded?: ApiBooleanScalar;
  RaceStatusCode?: ApiTextScalar;
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
