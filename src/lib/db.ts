import Dexie, { type EntityTable } from "dexie";

export interface MonthlySale {
  id: string;
  month: string; // YYYY-MM
  catt_quantity: number;
  tonghop_quantity: number;
}

export interface Garden {
  id: string;
  name: string;
}

export interface Plant {
  id: string;
  name: string;
  total_quantity: number;
  image_url: string;
}

export interface Platform {
  id: string;
  garden_id: string;
  floor: number;
  name: string;
  capacity: number;
}

export interface PlantLocation {
  id: string;
  plant_id: string;
  platform_id: string;
  quantity: number;
  pot_size: number;      // 14 | 16 | 21
  planted_date: string;  // "YYYY-MM-DD"
  price?: number;        // giá mỗi batch
}

export interface SyncQueueItem {
  id: string;
  type: "CREATE" | "UPDATE" | "DELETE";
  entity: "plant" | "platform" | "plant_location" | "garden" | "monthly_sales";
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "failed";
  retry_count: number;
  created_at: number;
}

const db = new Dexie("PlantManagerDB") as Dexie & {
  gardens: EntityTable<Garden, "id">;
  plants: EntityTable<Plant, "id">;
  platforms: EntityTable<Platform, "id">;
  plantLocations: EntityTable<PlantLocation, "id">;
  syncQueue: EntityTable<SyncQueueItem, "id">;
  monthlySales: EntityTable<MonthlySale, "id">;
};

db.version(3).stores({
  gardens: "id, name",
  plants: "id, name",
  platforms: "id, garden_id, floor",
  plantLocations: "id, plant_id, platform_id",
  syncQueue: "id, status, entity",
});

db.version(4).stores({
  gardens: "id, name",
  plants: "id, name",
  platforms: "id, garden_id, floor",
  plantLocations: "id, plant_id, platform_id",
  syncQueue: "id, status, entity",
});

db.version(5).stores({
  gardens: "id, name",
  plants: "id, name",
  platforms: "id, garden_id, floor",
  plantLocations: "id, plant_id, platform_id",
  syncQueue: "id, status, entity",
  monthlySales: "id, month",
});

export { db };
