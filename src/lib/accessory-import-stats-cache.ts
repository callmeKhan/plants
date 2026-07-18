import type { AccessoryImportStatsPayload as AccessoryImportStatsPayloadType } from "@/lib/accessory-import-stats";

export type {
  AccessoryImportItemStat,
  AccessoryImportPeriodStat,
  AccessoryImportStatsPayload,
  AccessoryImportStatsRow,
  AccessoryImportTotals,
} from "@/lib/accessory-import-stats";

let cachedStats: AccessoryImportStatsPayloadType | null = null;
let pendingStats: Promise<AccessoryImportStatsPayloadType> | null = null;
let cacheGeneration = 0;
const storageKey = "plants:accessory-import-stats:v3";

function readStoredStats() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AccessoryImportStatsPayloadType) : null;
  } catch {
    return null;
  }
}

function writeStoredStats(stats: AccessoryImportStatsPayloadType) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(stats));
  } catch {
    // In-memory cache still covers the current route transition.
  }
}

function clearStoredStats() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing else to do if browser storage is unavailable.
  }
}

export function getCachedAccessoryImportStats() {
  if (!cachedStats) cachedStats = readStoredStats();
  return cachedStats;
}

export function invalidateAccessoryImportStatsCache() {
  cacheGeneration += 1;
  cachedStats = null;
  pendingStats = null;
  clearStoredStats();
}

export async function loadAccessoryImportStats() {
  if (cachedStats) return cachedStats;
  if (pendingStats) return pendingStats;

  const requestGeneration = cacheGeneration;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  pendingStats = fetch("/api/accessory-imports/stats", {
    cache: "no-store",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to load accessory import stats");
      return (await res.json()) as AccessoryImportStatsPayloadType;
    })
    .then((data) => {
      if (requestGeneration === cacheGeneration) {
        cachedStats = data;
        writeStoredStats(data);
      }
      return data;
    })
    .finally(() => {
      clearTimeout(timeoutId);
      if (requestGeneration === cacheGeneration) pendingStats = null;
    });

  return pendingStats;
}
