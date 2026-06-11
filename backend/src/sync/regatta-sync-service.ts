import {
  PrismaClient,
  ResultImportStatus,
  type Prisma,
} from "@prisma/client";
import { DODV_REGIONS, DODV_TIMES_BY_YEAR } from "./constants.js";
import {
  booleanOrDefault,
  getSailorName,
  intOrDefault,
  intOrNull,
  isDateBeforeToday,
  isUuid,
  numberOrNull,
  optionalString,
  parseDodvDate,
  parseManage2SailResultLink,
  requiredString,
  buildSailorIdentity,
} from "./normalization.js";
import {
  DodvClient,
  HttpStatusError,
  InvalidJsonError,
  Manage2SailClient,
} from "./source-clients.js";
import type {
  DodvRegattaItem,
  DodvRegionConfig,
  Manage2SailEntryResult,
  SyncError,
  SyncSummary,
} from "./types.js";

type ResultImportOutcome = "imported" | "skipped" | "failed";

interface RegattaSyncServiceOptions {
  prisma: PrismaClient;
  dodvClient?: DodvClient;
  manage2SailClient?: Manage2SailClient;
  now?: () => Date;
}

type RegattaUpsertData = Prisma.RegattaUncheckedCreateInput;

export class RegattaSyncService {
  private readonly prisma: PrismaClient;
  private readonly dodvClient: DodvClient;
  private readonly manage2SailClient: Manage2SailClient;
  private readonly now: () => Date;

  constructor(options: RegattaSyncServiceOptions) {
    this.prisma = options.prisma;
    this.dodvClient = options.dodvClient ?? new DodvClient();
    this.manage2SailClient =
      options.manage2SailClient ?? new Manage2SailClient();
    this.now = options.now ?? (() => new Date());
  }

  async syncOptimistBRegattas(): Promise<SyncSummary> {
    const summary = createEmptySummary();

    for (const region of DODV_REGIONS) {
      for (const [yearText, time] of Object.entries(DODV_TIMES_BY_YEAR)) {
        const year = Number(yearText);
        summary.dodvRequests += 1;

        let items: DodvRegattaItem[];
        try {
          items = await this.dodvClient.fetchRegattas({
            region: region.code,
            time,
          });
        } catch (error) {
          summary.errors.push({
            source: `DODV ${region.code}/${year}`,
            message: errorMessage(error),
          });
          continue;
        }

        summary.dodvRegattasFetched += items.length;

        for (const item of items) {
          await this.syncDodvRegatta(item, region, year, summary);
        }
      }
    }

    return summary;
  }

  private async syncDodvRegatta(
    item: DodvRegattaItem,
    region: DodvRegionConfig,
    fallbackYear: number,
    summary: SyncSummary,
  ): Promise<void> {
    const regattaId = optionalString(item.id);
    if (!regattaId) {
      summary.errors.push({
        source: `DODV ${region.code}/${fallbackYear}`,
        message: "DODV regatta item has no id",
      });
      return;
    }

    try {
      const canceled = intOrDefault(item.canceled, 0);
      if (canceled !== 0) {
        const deleteResult = await this.prisma.regatta.deleteMany({
          where: { id: regattaId },
        });
        summary.canceledRegattasDeleted += deleteResult.count;
        return;
      }

      const regattaData = this.buildRegattaUpsertData(
        item,
        region.name,
        fallbackYear,
      );
      const { id, ...updateData } = regattaData;

      await this.prisma.regatta.upsert({
        where: { id },
        create: regattaData,
        update: updateData,
      });
      summary.regattasUpserted += 1;

      if (!regattaData.isCompleted) {
        summary.resultImportsSkipped += 1;
        return;
      }

      summary.completedRegattas += 1;
      summary.resultImportsAttempted += 1;

      const outcome = await this.importCompletedRegattaResults(
        regattaId,
        optionalString(item.resultlink),
        summary,
      );

      if (outcome === "imported") {
        summary.resultImportsSucceeded += 1;
      } else if (outcome === "failed") {
        summary.resultImportFailures += 1;
      } else {
        summary.resultImportsSkipped += 1;
      }
    } catch (error) {
      summary.resultImportFailures += 1;
      summary.errors.push({
        source: "sync",
        regattaId,
        message: errorMessage(error),
      });
    }
  }

  private buildRegattaUpsertData(
    item: DodvRegattaItem,
    regionName: string,
    fallbackYear: number,
  ): RegattaUpsertData {
    const id = requiredString(item.id, "id");
    const dateFrom = parseDodvDate(item.date_from, "date_from");
    const dateTo = parseDodvDate(item.date_to, "date_to");
    const canceled = intOrDefault(item.canceled, 0);
    const boats = intOrDefault(item.boats, 0);
    const resultLink = optionalString(item.resultlink);
    const parsedLink = parseManage2SailResultLink(resultLink);
    const isCompleted =
      canceled === 0 &&
      Boolean(resultLink) &&
      isDateBeforeToday(dateTo, this.now()) &&
      boats > 0;

    return {
      id,
      year: intOrDefault(item.year, fallbackYear),
      level: optionalString(item.level) ?? "b",
      regionName,
      name: requiredString(item.name, "name"),
      dateFrom,
      dateTo,
      location: optionalString(item.location) ?? null,
      canceled,
      boats,
      clubNameFull: optionalString(item.clubname) ?? null,
      clubNameShort: optionalString(item.club) ?? null,
      runsTotal: intOrNull(item.runs_total),
      runsScored: intOrNull(item.runs_scored),
      factor: numberOrNull(item.factor),
      resultLink: resultLink ?? null,
      vereinUrl: optionalString(item.url) ?? null,
      eventId:
        parsedLink && isUuid(parsedLink.eventSlugOrId)
          ? parsedLink.eventSlugOrId
          : null,
      classId: parsedLink?.classId ?? null,
      isCompleted,
      resultImportStatus: isCompleted
        ? ResultImportStatus.NOT_STARTED
        : ResultImportStatus.SKIPPED_NOT_COMPLETED,
    };
  }

  private async importCompletedRegattaResults(
    regattaId: string,
    resultLink: string | undefined,
    summary: SyncSummary,
  ): Promise<ResultImportOutcome> {
    const parsedLink = parseManage2SailResultLink(resultLink);
    if (!parsedLink) {
      await this.markRegattaStatus(regattaId, {
        status: ResultImportStatus.MISSING_RESULT_LINK,
        eventId: null,
        classId: null,
      });
      return "skipped";
    }

    let eventId: string | null;
    try {
      eventId = await this.manage2SailClient.resolveEventId(
        parsedLink.eventSlugOrId,
      );
    } catch (error) {
      await this.markRegattaStatus(regattaId, {
        status: ResultImportStatus.EVENT_ID_UNRESOLVED,
        classId: parsedLink.classId,
      });
      summary.errors.push({
        source: "Manage2Sail event",
        regattaId,
        status: ResultImportStatus.EVENT_ID_UNRESOLVED,
        message: errorMessage(error),
      });
      return "failed";
    }

    if (!eventId) {
      await this.markRegattaStatus(regattaId, {
        status: ResultImportStatus.EVENT_ID_UNRESOLVED,
        eventId: null,
        classId: parsedLink.classId,
      });
      return "failed";
    }

    let result;
    try {
      result = await this.manage2SailClient.fetchResult({
        eventId,
        classId: parsedLink.classId,
      });
    } catch (error) {
      const status =
        error instanceof InvalidJsonError
          ? ResultImportStatus.INVALID_RESULT_JSON
          : ResultImportStatus.RESULT_FETCH_FAILED;
      await this.markRegattaStatus(regattaId, {
        status,
        eventId,
        classId: parsedLink.classId,
      });
      summary.errors.push({
        source: "Manage2Sail result",
        regattaId,
        status,
        message:
          error instanceof HttpStatusError
            ? `${error.message} (${error.url})`
            : errorMessage(error),
      });
      return "failed";
    }

    if (!Array.isArray(result.EntryResults)) {
      await this.markRegattaStatus(regattaId, {
        status: ResultImportStatus.INVALID_RESULT_JSON,
        eventId,
        classId: parsedLink.classId,
      });
      return "failed";
    }

    if (result.EntryResults.length === 0) {
      await this.markRegattaStatus(regattaId, {
        status: ResultImportStatus.NO_ENTRIES,
        eventId,
        classId: parsedLink.classId,
      });
      return "skipped";
    }

    await this.saveManage2SailResults({
      regattaId,
      eventId,
      classId: parsedLink.classId,
      entries: result.EntryResults,
    });

    return "imported";
  }

  private async saveManage2SailResults(params: {
    regattaId: string;
    eventId: string;
    classId: string;
    entries: Manage2SailEntryResult[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const syncedResultIds: string[] = [];

      for (const entry of params.entries) {
        const name = getSailorName(entry);
        if (!name) {
          continue;
        }

        const clubName = optionalString(entry.ClubName);
        const clubCode = optionalString(entry.ClubCode);
        const identity = buildSailorIdentity({
          name,
          sailNumber: optionalString(entry.SailNumber),
          clubCode,
        });

        const sailor = await tx.sailor.upsert({
          where: { identityKey: identity.identityKey },
          create: {
            identityKey: identity.identityKey,
            name,
            normalizedName: identity.normalizedName,
            sailNumber: identity.sailNumber,
            sailNumberNormalized: identity.sailNumberNormalized,
            clubName: clubName ?? null,
            clubCode: clubCode ?? null,
          },
          update: {
            name,
            normalizedName: identity.normalizedName,
            sailNumber: identity.sailNumber,
            sailNumberNormalized: identity.sailNumberNormalized,
            clubName: clubName ?? undefined,
            clubCode: clubCode ?? undefined,
          },
        });

        const sailorResult = await tx.regattaSailorResult.upsert({
          where: {
            regattaId_sailorId: {
              regattaId: params.regattaId,
              sailorId: sailor.id,
            },
          },
          create: {
            regattaId: params.regattaId,
            sailorId: sailor.id,
            rank: intOrNull(entry.Rank),
            totalPoints: numberOrNull(entry.TotalPoints),
            netPoints: numberOrNull(entry.NetPoints),
            clubName: clubName ?? null,
            clubCode: clubCode ?? null,
          },
          update: {
            rank: intOrNull(entry.Rank),
            totalPoints: numberOrNull(entry.TotalPoints),
            netPoints: numberOrNull(entry.NetPoints),
            clubName: clubName ?? null,
            clubCode: clubCode ?? null,
          },
        });

        syncedResultIds.push(sailorResult.id);
        await this.syncRaceResults(tx, sailorResult.id, entry);
      }

      await tx.regattaSailorResult.deleteMany({
        where: {
          regattaId: params.regattaId,
          id: { notIn: syncedResultIds },
        },
      });

      await tx.regatta.update({
        where: { id: params.regattaId },
        data: {
          eventId: params.eventId,
          classId: params.classId,
          resultImportStatus: ResultImportStatus.IMPORTED,
        },
      });
    });
  }

  private async syncRaceResults(
    tx: Prisma.TransactionClient,
    regattaSailorResultId: string,
    entry: Manage2SailEntryResult,
  ): Promise<void> {
    const syncedRaceIndexes: number[] = [];

    for (const race of entry.EntryRaceResults ?? []) {
      const raceIndex = intOrNull(race.OverallRaceIndex);
      if (raceIndex === null) {
        continue;
      }

      syncedRaceIndexes.push(raceIndex);
      await tx.raceResult.upsert({
        where: {
          regattaSailorResultId_raceIndex: {
            regattaSailorResultId,
            raceIndex,
          },
        },
        create: {
          regattaSailorResultId,
          raceIndex,
          rank: intOrNull(race.Rank),
          points: numberOrNull(race.Points),
          pointsDiscarded: booleanOrDefault(race.PointsDiscarded, false),
          raceStatusCode: optionalString(race.RaceStatusCode) ?? null,
        },
        update: {
          rank: intOrNull(race.Rank),
          points: numberOrNull(race.Points),
          pointsDiscarded: booleanOrDefault(race.PointsDiscarded, false),
          raceStatusCode: optionalString(race.RaceStatusCode) ?? null,
        },
      });
    }

    await tx.raceResult.deleteMany({
      where: {
        regattaSailorResultId,
        raceIndex: { notIn: syncedRaceIndexes },
      },
    });
  }

  private async markRegattaStatus(
    regattaId: string,
    params: {
      status: ResultImportStatus;
      eventId?: string | null;
      classId?: string | null;
    },
  ): Promise<void> {
    await this.prisma.regatta.update({
      where: { id: regattaId },
      data: {
        resultImportStatus: params.status,
        eventId: params.eventId,
        classId: params.classId,
      },
    });
  }
}

function createEmptySummary(): SyncSummary {
  return {
    dodvRequests: 0,
    dodvRegattasFetched: 0,
    regattasUpserted: 0,
    canceledRegattasDeleted: 0,
    completedRegattas: 0,
    resultImportsAttempted: 0,
    resultImportsSucceeded: 0,
    resultImportsSkipped: 0,
    resultImportFailures: 0,
    errors: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
