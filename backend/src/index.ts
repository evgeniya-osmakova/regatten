import "dotenv/config";

import { pathToFileURL } from "node:url";

export * from "./analytics/analytics-utils.js";
export * from "./analytics/tracked-sailor-config.js";
export * from "./analytics/tracked-sailor-service.js";
export * from "./analytics/types.js";
export { RegattaSyncService } from "./sync/regatta-sync-service.js";
export { DodvClient, Manage2SailClient } from "./sync/source-clients.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { startApiServer } = await import("./http/api-server.js");
  await startApiServer();
}
