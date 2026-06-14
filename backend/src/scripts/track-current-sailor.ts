import "dotenv/config";

import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export const CURRENT_TRACKED_SAILOR_ID = "daria sidorkevich|sail:ger13643";

export async function markCurrentSailorAsTracked(
  client: PrismaClient,
): Promise<void> {
  await client.sailor.update({
    where: {
      id: CURRENT_TRACKED_SAILOR_ID,
    },
    data: {
      isTracked: true,
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await markCurrentSailorAsTracked(prisma);
    console.log(
      JSON.stringify(
        {
          sailorId: CURRENT_TRACKED_SAILOR_ID,
          isTracked: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
