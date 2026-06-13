export type DodvRegionCode = "b" | "bg";

export type ApiValue = string | number | boolean | null | undefined;

export interface DodvRegionConfig {
  code: DodvRegionCode;
  name: "Berlin" | "Brandenburg";
}

export interface DodvRegattaItem {
  id?: ApiValue;
  year?: ApiValue;
  level?: ApiValue;
  name?: ApiValue;
  date_from?: ApiValue;
  date_to?: ApiValue;
  location?: ApiValue;
  canceled?: ApiValue;
  boats?: ApiValue;
  clubname?: ApiValue;
  club?: ApiValue;
  runs_total?: ApiValue;
  runs_scored?: ApiValue;
  factor?: ApiValue;
  resultlink?: ApiValue;
  url?: ApiValue;
}

export interface ParsedManage2SailLink {
  eventSlugOrId: string;
  classId: string;
}

export interface Manage2SailResult {
  EntryResults?: Manage2SailEntryResult[] | null;
}

export interface Manage2SailRegattaInfo {
  Id?: ApiValue;
  Name?: ApiValue;
  InfoAlias?: ApiValue;
  LinkIdOrAlias?: ApiValue;
  HasResults?: ApiValue;
}

export interface Manage2SailEntryResult {
  Rank?: ApiValue;
  Name?: ApiValue;
  SailNumber?: ApiValue;
  ClubName?: ApiValue;
  ClubCode?: ApiValue;
  TotalPoints?: ApiValue;
  NetPoints?: ApiValue;
  Skipper?: {
    FirstName?: ApiValue;
    LastName?: ApiValue;
  } | null;
  EntryRaceResults?: Manage2SailEntryRaceResult[] | null;
}

export interface Manage2SailEntryRaceResult {
  OverallRaceIndex?: ApiValue;
  Rank?: ApiValue;
  Points?: ApiValue;
  PointsDiscarded?: ApiValue;
  RaceStatusCode?: ApiValue;
}

export interface SailorIdentity {
  sailorId: string;
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
  notCompletedRegattas: number;
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
  resultLink?: string;
  eventId?: string;
  classId?: string;
  resolvedClassId?: string;
  httpStatus?: number;
  message: string;
}
