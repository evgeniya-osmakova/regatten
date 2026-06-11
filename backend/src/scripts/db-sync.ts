import "dotenv/config";

import { prisma } from "../db/prisma.js";
import { RegattaSyncService } from "../sync/regatta-sync-service.js";

const service = new RegattaSyncService({ prisma });

try {
  const summary = await service.syncOptimistBRegattas();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
