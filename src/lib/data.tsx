"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

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
  price?: number;
  status?: string;
}

// ── Context ──

export type Resource = "gardens" | "plants" | "platforms" | "locations";

interface Mutate {
  upsertGarden: (g: Garden) => void;
  removeGarden: (id: string) => void;
  upsertPlant: (p: Plant) => void;
  removePlant: (id: string) => void;
  upsertPlatform: (p: Platform) => void;
  removePlatform: (id: string) => void;
  upsertLocation: (l: PlantLocation) => void;
  removeLocation: (id: string) => void;
}

interface DataContextType {
  gardens: Garden[];
  plants: Plant[];
  platforms: Platform[];
  locations: PlantLocation[];
  locationsByPlatform: Map<string, PlantLocation[]>;
  locationsByPlant: Map<string, PlantLocation[]>;
  locationsById: Map<string, PlantLocation>;
  refresh: (...resources: Resource[]) => Promise<void>;
  mutate: Mutate;
}

const noop = () => {};
const defaultMutate: Mutate = {
  upsertGarden: noop, removeGarden: noop,
  upsertPlant: noop, removePlant: noop,
  upsertPlatform: noop, removePlatform: noop,
  upsertLocation: noop, removeLocation: noop,
};

const DataContext = createContext<DataContextType>({
  gardens: [],
  plants: [],
  platforms: [],
  locations: [],
  locationsByPlatform: new Map(),
  locationsByPlant: new Map(),
  locationsById: new Map(),
  refresh: async () => {},
  mutate: defaultMutate,
});

const RESOURCE_CONFIG = {
  gardens: { url: "/api/gardens" },
  plants: { url: "/api/plants" },
  platforms: { url: "/api/platforms" },
  locations: { url: "/api/plant-locations" },
} as const;

const ALL_RESOURCES: Resource[] = ["gardens", "plants", "platforms", "locations"];

export function DataProvider({ children }: { children: ReactNode }) {
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [locations, setLocations] = useState<PlantLocation[]>([]);

  const setters: Record<Resource, (data: never[]) => void> = {
    gardens: setGardens,
    plants: setPlants,
    platforms: setPlatforms,
    locations: setLocations,
  };

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
    };
  }, []);

  const locationsByPlatform = useMemo(() => {
    const map = new Map<string, PlantLocation[]>();
    for (const l of locations) {
      const arr = map.get(l.platform_id);
      if (arr) arr.push(l); else map.set(l.platform_id, [l]);
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DataContext value={{ gardens, plants, platforms, locations, locationsByPlatform, locationsByPlant, locationsById, refresh, mutate }}>
      {children}
    </DataContext>
  );
}

export function useData() {
  return useContext(DataContext);
}
