export function getTrackedSailorIdsFromEnv(
  value = process.env.TRACKED_SAILOR_IDS,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
