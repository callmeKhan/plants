"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { BatchColor } from "@/lib/batch-color";

// ── Types (moved from db.ts) ──

export interface Garden {
  id: string;
  name: string;
}

export interface Plant {
  id: string;
  name: string;
  total_quantity: number;
  image_url: string;
  tags?: string[];
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
  pot_size: number;
  planted_date: string;
  sort_order: number;
  color: BatchColor;
  price?: number;
  status?: string;
}

export interface PlantSale {
  id: string;
  plant_id: string;
  quantity: number;
  created_at: string;
}

export interface PlantNoteImage {
  id: string;
  plant_id: string;
  image_url: string;
  object_key: string;
  content_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
}

export interface PlantNote {
  id: string;
  plant_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformNote {
  id: string;
  platform_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface HomeTask {
  id: string;
  content: string;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Context ──

export type Resource = "gardens" | "plants" | "platforms" | "locations" | "sales" | "notes" | "images" | "platformNotes" | "homeTasks";

interface Mutate {
  upsertGarden: (g: Garden) => void;
  removeGarden: (id: string) => void;
  upsertPlant: (p: Plant) => void;
  removePlant: (id: string) => void;
  upsertPlatform: (p: Platform) => void;
  removePlatform: (id: string) => void;
  upsertLocation: (l: PlantLocation) => void;
  removeLocation: (id: string) => void;
  upsertPlantSale: (s: PlantSale) => void;
  upsertPlantNote: (n: PlantNote) => void;
  removePlantNote: (id: string) => void;
  upsertPlantImage: (i: PlantNoteImage) => void;
  removePlantImage: (id: string) => void;
  upsertPlatformNote: (n: PlatformNote) => void;
  removePlatformNote: (id: string) => void;
  upsertHomeTask: (t: HomeTask) => void;
  removeHomeTask: (id: string) => void;
}

interface DataContextType {
  gardens: Garden[];
  plants: Plant[];
  platforms: Platform[];
  locations: PlantLocation[];
  plantSales: PlantSale[];
  plantNotes: PlantNote[];
  plantImages: PlantNoteImage[];
  platformNotes: PlatformNote[];
  homeTasks: HomeTask[];
  locationsByPlatform: Map<string, PlantLocation[]>;
  locationsByPlant: Map<string, PlantLocation[]>;
  locationsById: Map<string, PlantLocation>;
  salesByPlant: Map<string, PlantSale[]>;
  notesByPlant: Map<string, PlantNote[]>;
  imagesByPlant: Map<string, PlantNoteImage[]>;
  notesByPlatform: Map<string, PlatformNote[]>;
  refresh: (...resources: Resource[]) => Promise<void>;
  mutate: Mutate;
}

const noop = () => {};
const defaultMutate: Mutate = {
  upsertGarden: noop, removeGarden: noop,
  upsertPlant: noop, removePlant: noop,
  upsertPlatform: noop, removePlatform: noop,
  upsertLocation: noop, removeLocation: noop,
  upsertPlantSale: noop,
  upsertPlantNote: noop, removePlantNote: noop,
  upsertPlantImage: noop, removePlantImage: noop,
  upsertPlatformNote: noop, removePlatformNote: noop,
  upsertHomeTask: noop, removeHomeTask: noop,
};

const DataContext = createContext<DataContextType>({
  gardens: [],
  plants: [],
  platforms: [],
  locations: [],
  plantSales: [],
  plantNotes: [],
  plantImages: [],
  platformNotes: [],
  homeTasks: [],
  locationsByPlatform: new Map(),
  locationsByPlant: new Map(),
  locationsById: new Map(),
  salesByPlant: new Map(),
  notesByPlant: new Map(),
  imagesByPlant: new Map(),
  notesByPlatform: new Map(),
  refresh: async () => {},
  mutate: defaultMutate,
});

const RESOURCE_CONFIG = {
  gardens: { url: "/api/gardens" },
  plants: { url: "/api/plants" },
  platforms: { url: "/api/platforms" },
  locations: { url: "/api/plant-locations" },
  sales: { url: "/api/plant-sales" },
  notes: { url: "/api/plant-notes" },
  images: { url: "/api/plant-images" },
  platformNotes: { url: "/api/platform-notes" },
  homeTasks: { url: "/api/home-tasks" },
} as const;

const ALL_RESOURCES: Resource[] = ["gardens", "plants", "platforms", "locations", "sales", "notes", "images", "platformNotes", "homeTasks"];

export function DataProvider({ children }: { children: ReactNode }) {
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [locations, setLocations] = useState<PlantLocation[]>([]);
  const [plantSales, setPlantSales] = useState<PlantSale[]>([]);
  const [plantNotes, setPlantNotes] = useState<PlantNote[]>([]);
  const [plantImages, setPlantImages] = useState<PlantNoteImage[]>([]);
  const [platformNotes, setPlatformNotes] = useState<PlatformNote[]>([]);
  const [homeTasks, setHomeTasks] = useState<HomeTask[]>([]);

  const setters = useMemo<Record<Resource, (data: never[]) => void>>(() => ({
    gardens: setGardens,
    plants: setPlants,
    platforms: setPlatforms,
    locations: setLocations,
    sales: setPlantSales,
    notes: setPlantNotes,
    images: setPlantImages,
    platformNotes: setPlatformNotes,
    homeTasks: setHomeTasks,
  }), []);

  const refresh = useCallback(async (...resources: Resource[]) => {
    const targets = resources.length === 0 ? ALL_RESOURCES : resources;
    await Promise.all(
      targets.map(async (r) => {
        const res = await fetch(RESOURCE_CONFIG[r].url);
        if (res.ok) setters[r](await res.json());
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = useMemo<Mutate>(() => {
    function upsert<T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>) {
      return (item: T) => set(prev => {
        const idx = prev.findIndex(x => x.id === item.id);
        return idx >= 0 ? prev.map(x => x.id === item.id ? item : x) : [...prev, item];
      });
    }
    function remove<T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>) {
      return (id: string) => set(prev => prev.filter(x => x.id !== id));
    }
    return {
      upsertGarden: upsert(setGardens),
      removeGarden: remove(setGardens),
      upsertPlant: upsert(setPlants),
      removePlant: remove(setPlants),
      upsertPlatform: upsert(setPlatforms),
      removePlatform: remove(setPlatforms),
      upsertLocation: upsert(setLocations),
      removeLocation: remove(setLocations),
      upsertPlantSale: upsert(setPlantSales),
      upsertPlantNote: upsert(setPlantNotes),
      removePlantNote: remove(setPlantNotes),
      upsertPlantImage: upsert(setPlantImages),
      removePlantImage: remove(setPlantImages),
      upsertPlatformNote: upsert(setPlatformNotes),
      removePlatformNote: remove(setPlatformNotes),
      upsertHomeTask: upsert(setHomeTasks),
      removeHomeTask: remove(setHomeTasks),
    };
  }, []);

  const locationsByPlatform = useMemo(() => {
    const map = new Map<string, PlantLocation[]>();
    for (const l of locations) {
      const arr = map.get(l.platform_id);
      if (arr) arr.push(l); else map.set(l.platform_id, [l]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        return orderDiff || a.id.localeCompare(b.id);
      });
    }
    return map;
  }, [locations]);

  const locationsByPlant = useMemo(() => {
    const map = new Map<string, PlantLocation[]>();
    for (const l of locations) {
      const arr = map.get(l.plant_id);
      if (arr) arr.push(l); else map.set(l.plant_id, [l]);
    }
    return map;
  }, [locations]);

  const locationsById = useMemo(() => {
    const map = new Map<string, PlantLocation>();
    for (const l of locations) map.set(l.id, l);
    return map;
  }, [locations]);

  const salesByPlant = useMemo(() => {
    const map = new Map<string, PlantSale[]>();
    for (const sale of plantSales) {
      const arr = map.get(sale.plant_id);
      if (arr) arr.push(sale); else map.set(sale.plant_id, [sale]);
    }
    return map;
  }, [plantSales]);

  const notesByPlant = useMemo(() => {
    const map = new Map<string, PlantNote[]>();
    for (const note of plantNotes) {
      const arr = map.get(note.plant_id);
      if (arr) arr.push(note); else map.set(note.plant_id, [note]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    }
    return map;
  }, [plantNotes]);

  const imagesByPlant = useMemo(() => {
    const map = new Map<string, PlantNoteImage[]>();
    for (const image of plantImages) {
      const arr = map.get(image.plant_id);
      if (arr) arr.push(image); else map.set(image.plant_id, [image]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [plantImages]);

  const notesByPlatform = useMemo(() => {
    const map = new Map<string, PlatformNote[]>();
    for (const note of platformNotes) {
      const arr = map.get(note.platform_id);
      if (arr) arr.push(note); else map.set(note.platform_id, [note]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    }
    return map;
  }, [platformNotes]);

  const sortedHomeTasks = useMemo(() => {
    return [...homeTasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.done) {
        const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        return orderDiff || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
      }
      return b.updated_at.localeCompare(a.updated_at) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
    });
  }, [homeTasks]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DataContext value={{ gardens, plants, platforms, locations, plantSales, plantNotes, plantImages, platformNotes, homeTasks: sortedHomeTasks, locationsByPlatform, locationsByPlant, locationsById, salesByPlant, notesByPlant, imagesByPlant, notesByPlatform, refresh, mutate }}>
      {children}
    </DataContext>
  );
}

export function useData() {
  return useContext(DataContext);
}
