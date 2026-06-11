# Data sources

This document describes the external public data sources used by the importer.

## Regatta list source

Regatta metadata comes from the DODV / segler-rangliste API.

Endpoint pattern:

```text
https://segler-rangliste.de/dodv/api/regatta?region={region}&level=b&time={time}
```

## Regions

```ts
Berlin = "b"
Brandenburg = "bg"
```

## Years

The `time` parameter is the same for Berlin and Brandenburg.

```ts
2022 = 834
2023 = 953
2024 = 1078
2025 = 1180
2026 = 1259
```

## Level

Only level `b` is imported.

```text
level=b
```

## DODV field mapping

Map the DODV response to `Regatta` fields like this:

```ts
Regatta.id = item.id
Regatta.year = item.year
Regatta.level = item.level
Regatta.regionName = region code mapping, "Berlin" or "Brandenburg"
Regatta.name = item.name
Regatta.dateFrom = item.date_from
Regatta.dateTo = item.date_to
Regatta.location = item.location
Regatta.canceled = item.canceled
Regatta.boats = item.boats
Regatta.clubNameFull = item.clubname
Regatta.clubNameShort = item.club
Regatta.runsTotal = item.runs_total
Regatta.runsScored = item.runs_scored
Regatta.factor = item.factor
Regatta.resultLink = item.resultlink
Regatta.vereinUrl = item.url
```

Do not store raw DODV JSON.

## Completed regatta rule

A regatta is completed when all conditions are true:

```ts
canceled === 0
resultLink is not empty
dateTo < today
boats > 0
```

Only completed regattas should trigger Manage2Sail result fetching. We don't need to save canceled regattas to database. If regatta was canceled we need to delete it from database.

## Manage2Sail result links

A DODV `resultlink` usually looks like this:

```text
https://www.manage2sail.com/de-DE/event/KJR2026#!/results?classId=4b47f28f-0400-4db4-9526-15081d2d72dc
```

Extract:

```ts
event slug or id = "KJR2026"
classId = "4b47f28f-0400-4db4-9526-15081d2d72dc"
```

The `classId` may also be a non-UUID string such as `OptiB`.

Because Manage2Sail uses hash routing, `classId` is after `#!` in many URLs. Native `URL.searchParams` may not find it. Parse the full result link string and search for `classId=...`.

## Manage2Sail event id resolution

If the event part after `/event/` is already a UUID, use it directly as `eventId`.

If it is not a UUID, fetch the public event page:

```text
https://www.manage2sail.com/de-DE/event/{slug}
```

The event page HTML contains:

```js
window.SailingInfo = window.SailingInfo || {};
window.SailingInfo.eventId = '5fc196ec-be73-44b4-a8d6-4e4c02eccd1a';
window.SailingInfo.ConfigEventApiRoot = '/api/event/5fc196ec-be73-44b4-a8d6-4e4c02eccd1a/';
window.SailingInfo.ForPress = 0;
```

Extract `eventId` from:

```js
window.SailingInfo.eventId
```

Fallback:

```js
window.SailingInfo.ConfigEventApiRoot
```

Recommended regexes:

```ts
/window\.SailingInfo\.eventId\s*=\s*['"]([0-9a-f-]{36})['"]/i
/window\.SailingInfo\.ConfigEventApiRoot\s*=\s*['"]\/api\/event\/([0-9a-f-]{36})\//i
```

## Manage2Sail result API

After resolving `eventId` and `classId`, fetch result JSON from:

```text
https://www.manage2sail.com/api/event/{eventId}/regattaresult/{classId}
```

Example:

```text
https://www.manage2sail.com/api/event/5fc196ec-be73-44b4-a8d6-4e4c02eccd1a/regattaresult/4b47f28f-0400-4db4-9526-15081d2d72dc
```

This URL returns JSON directly in the browser and can be fetched by the Node.js CLI.

## Manage2Sail field mapping

From `EntryResults[]`:

```ts
Sailor.name = Skipper.FirstName + " " + Skipper.LastName
fallback Sailor.name = EntryResults[].Name

Sailor.sailNumber = EntryResults[].SailNumber
Sailor.clubName = EntryResults[].ClubName
Sailor.clubCode = EntryResults[].ClubCode

RegattaSailorResult.rank = EntryResults[].Rank
RegattaSailorResult.totalPoints = EntryResults[].TotalPoints
RegattaSailorResult.netPoints = EntryResults[].NetPoints
RegattaSailorResult.clubName = EntryResults[].ClubName
RegattaSailorResult.clubCode = EntryResults[].ClubCode
```

From `EntryRaceResults[]`:

```ts
RaceResult.raceIndex = EntryRaceResults[].OverallRaceIndex
RaceResult.rank = EntryRaceResults[].Rank
RaceResult.points = EntryRaceResults[].Points
RaceResult.pointsDiscarded = EntryRaceResults[].PointsDiscarded || false
RaceResult.raceStatusCode = EntryRaceResults[].RaceStatusCode
```
