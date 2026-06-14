import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { prisma } from "../db/prisma.js";
import {
  AnalyticsNotFoundError,
  TrackedSailorAnalyticsService,
} from "../analytics/tracked-sailor-service.js";

interface StartApiServerOptions {
  port?: number;
  hostname?: string;
}

interface ApiErrorBody {
  error: {
    message: string;
  };
}

type JsonValue = unknown;

export function createApiServer(
  service = new TrackedSailorAnalyticsService({ prisma }),
) {
  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, service);
    } catch (error) {
      sendError(response, error);
    }
  });
}

export async function startApiServer(
  options: StartApiServerOptions = {},
): Promise<void> {
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const hostname = options.hostname ?? process.env.HOST ?? "0.0.0.0";
  const server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(port, hostname, resolve);
  });

  console.log(`Regatten API listening on http://${hostname}:${port}`);

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await prisma.$disconnect();
  };

  process.once("SIGINT", () => {
    shutdown()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
  });
  process.once("SIGTERM", () => {
    shutdown()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: TrackedSailorAnalyticsService,
): Promise<void> {
  setCommonHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean).map(decodePathPart);

  if (segments[0] !== "api") {
    sendJson(response, 404, {
      error: {
        message: "Not found",
      },
    });
    return;
  }

  if (request.method === "GET" && isRoute(segments, ["api", "tracked-sailors"])) {
    sendJson(response, 200, await service.listTrackedSailors());
    return;
  }

  if (request.method === "GET" && isRoute(segments, ["api", "historical-competitor-strength"])) {
    sendJson(response, 200, await service.getHistoricalCompetitorStrength());
    return;
  }

  if (
    request.method === "GET" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "tracked-sailors" &&
    segments[3] === "dashboard"
  ) {
    sendJson(response, 200, await service.getTrackedSailorDashboard(segments[2]));
    return;
  }

  if (
    request.method === "GET" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "tracked-sailors" &&
    segments[3] === "timeline"
  ) {
    sendJson(
      response,
      200,
      await service.getTrackedSailorRegattaTimeline(segments[2]),
    );
    return;
  }

  if (
    request.method === "GET" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "tracked-sailors" &&
    segments[3] === "head-to-head"
  ) {
    sendJson(response, 200, await service.getHistoricalHeadToHead(segments[2]));
    return;
  }

  if (
    request.method === "GET" &&
    segments.length === 5 &&
    segments[0] === "api" &&
    segments[1] === "tracked-sailors" &&
    segments[3] === "regattas"
  ) {
    sendJson(
      response,
      200,
      await service.getRegattaDetailForTrackedSailor({
        sailorId: segments[2],
        regattaId: segments[4],
      }),
    );
    return;
  }

  if (
    request.method === "GET" &&
    segments.length === 6 &&
    segments[0] === "api" &&
    segments[1] === "tracked-sailors" &&
    segments[3] === "regattas" &&
    segments[5] === "nearby-competitors"
  ) {
    sendJson(
      response,
      200,
      await service.getNearbyCompetitorsForRegatta({
        sailorId: segments[2],
        regattaId: segments[4],
      }),
    );
    return;
  }

  sendJson(response, 404, {
    error: {
      message: "Not found",
    },
  });
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: JsonValue,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown): void {
  const statusCode = error instanceof AnalyticsNotFoundError ? 404 : 500;
  const body: ApiErrorBody = {
    error: {
      message: error instanceof Error ? error.message : "Internal server error",
    },
  };

  sendJson(response, statusCode, body);
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isRoute(segments: string[], expected: string[]): boolean {
  return (
    segments.length === expected.length &&
    expected.every((segment, index) => segments[index] === segment)
  );
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
