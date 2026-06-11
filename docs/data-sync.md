# Data Sync

The project needs a reusable data synchronization service.

The service is responsible for downloading Optimist B regattas and results from public sources and saving them to PostgreSQL.

The service must be usable in two ways:

1. Initial database population during project setup.
2. Future UI update button.

The synchronization logic must not be tied only to a CLI command.

## Current MVP

For now, implement:

- Prisma schema
- data sync service
- one seed/import script that runs the sync once and fills the database

No React UI yet.

## Future UI

Later, the React UI will have an “Update data” button.

That button should call a backend endpoint, for example:

POST /api/admin/sync-results

The endpoint should call the same data sync service.

Do not duplicate import logic in the UI or API route.

## Sync process

1. Fetch regattas from DODV API for:
    - Berlin
    - Brandenburg
    - years 2022–2026
    - level B

2. Determine whether each regatta is completed:

   canceled === 0
   resultLink is not empty
   dateTo < today
   boats > 0

3. Upsert regattas into the database. Don't save canceled regattas.

4. For completed regattas, fetch Manage2Sail results.

5. Resolve Manage2Sail eventId if needed.

6. Save/update:
    - Sailor
    - RegattaSailorResult
    - RaceResult

7. Mark the regatta resultImportStatus.

## Idempotency

The sync must be safe to run more than once.

Running the sync again should update existing data, not create duplicates.

Use upsert where possible.

## Error handling

If one regatta fails, do not stop the whole sync.

Save a failure status on that regatta and continue with the next one.

## One-time initial population

For the MVP, provide a script such as:

npm run db:sync

or

npm run seed

This script should call the data sync service and fill the database.

The exact command name is not important, but the sync logic must live in reusable TypeScript code, not inside a one-off script only.
