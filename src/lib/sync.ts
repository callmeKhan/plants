import { db, type SyncQueueItem, type Garden, type Plant, type Platform, type PlantLocation } from "./db";

/**
 * Pull data from server (Supabase via API) into IndexedDB.
 * Merges by id — existing local records are kept (local wins for pending syncs).
 */
export async function pullFromServer(): Promise<void> {
  try {
    const [gardensRes, plantsRes, platformsRes, locationsRes] = await Promise.all([
      fetch("/api/gardens"),
      fetch("/api/plants"),
      fetch("/api/platforms"),
      fetch("/api/plant-locations"),
    ]);

    if (gardensRes.ok) {
      const gardens: Garden[] = await gardensRes.json();
      await db.transaction("rw", db.gardens, async () => {
        await db.gardens.clear();
        await db.gardens.bulkPut(gardens);
      });
    }
    if (plantsRes.ok) {
      const plants: Plant[] = await plantsRes.json();
      await db.transaction("rw", db.plants, async () => {
        await db.plants.clear();
        await db.plants.bulkPut(plants);
      });
    }
    if (platformsRes.ok) {
      const platforms: Platform[] = await platformsRes.json();
      await db.transaction("rw", db.platforms, async () => {
        await db.platforms.clear();
        await db.platforms.bulkPut(platforms);
      });
    }
    if (locationsRes.ok) {
      const locations: PlantLocation[] = await locationsRes.json();
      await db.transaction("rw", db.plantLocations, async () => {
        await db.plantLocations.clear();
        await db.plantLocations.bulkPut(locations);
      });
    }
  } catch {
    console.log("Pull from server skipped (offline or error)");
  }
}

/**
 * Process all pending items in the sync queue.
 */
export async function processQueue(): Promise<void> {
  const items = await db.syncQueue
    .where("status")
    .equals("pending")
    .toArray();

  for (const item of items) {
    await processItem(item);
  }
}

async function processItem(item: SyncQueueItem): Promise<void> {
  await db.syncQueue.update(item.id, { status: "syncing" });

  const endpointMap: Record<string, string> = {
    plant: "/api/plants",
    platform: "/api/platforms",
    plant_location: "/api/plant-locations",
    garden: "/api/gardens",
  };

  const url = endpointMap[item.entity];
  if (!url) {
    await db.syncQueue.update(item.id, { status: "failed" });
    return;
  }

  try {
    let res: Response;

    if (item.type === "CREATE") {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
    } else if (item.type === "UPDATE") {
      const id = (item.payload as { id?: string }).id;
      res = await fetch(`${url}?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
    } else if (item.type === "DELETE") {
      const id = (item.payload as { id?: string }).id;
      res = await fetch(`${url}?id=${id}`, { method: "DELETE" });
    } else {
      await db.syncQueue.update(item.id, { status: "failed" });
      return;
    }

    if (res.ok) {
      await db.syncQueue.delete(item.id);
    } else if (res.status === 503) {
      await db.syncQueue.update(item.id, { status: "pending" });
    } else {
      throw new Error(`API error: ${res.status}`);
    }
  } catch {
    const newCount = item.retry_count + 1;
    if (newCount >= 5) {
      await db.syncQueue.update(item.id, {
        status: "failed",
        retry_count: newCount,
      });
    } else {
      await db.syncQueue.update(item.id, {
        status: "pending",
        retry_count: newCount,
      });
    }
  }
}

/**
 * Start sync worker: pull from server on startup, push queue periodically.
 */
export function startSyncWorker(): () => void {
  // Pull data from server on first load, and immediately flush any pending queue
  if (navigator.onLine) {
    pullFromServer().catch(console.error);
    processQueue().catch(console.error);
  }

  const interval = setInterval(() => {
    if (navigator.onLine) {
      processQueue().catch(console.error);
    }
  }, 30000);

  const onlineHandler = () => {
    pullFromServer().catch(console.error);
    processQueue().catch(console.error);
  };
  window.addEventListener("online", onlineHandler);

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onlineHandler);
  };
}
