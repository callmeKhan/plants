import Dexie, { type EntityTable } from "dexie";

export interface Plant {
  id: string;
  name: string;
  total_quantity: number;
  image_url: string;
}

export interface Platform {
  id: string;
  floor: number;
  side: "left" | "right";
  name: string;
  capacity: number;
}

export interface PlantLocation {
  id: string;
  plant_id: string;
  platform_id: string;
  quantity: number;
}

export interface SyncQueueItem {
  id: string;
  type: "CREATE" | "UPDATE" | "DELETE";
  entity: "plant" | "platform" | "plant_location";
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "failed";
  retry_count: number;
  created_at: number;
}

const db = new Dexie("PlantManagerDB") as Dexie & {
  plants: EntityTable<Plant, "id">;
  platforms: EntityTable<Platform, "id">;
  plantLocations: EntityTable<PlantLocation, "id">;
  syncQueue: EntityTable<SyncQueueItem, "id">;
};

db.version(1).stores({
  plants: "id, name",
  platforms: "id, floor, side",
  plantLocations: "id, plant_id, platform_id",
  syncQueue: "id, status, entity",
});

export { db };
