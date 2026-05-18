"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

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

interface DataContextType {
  gardens: Garden[];
  plants: Plant[];
  platforms: Platform[];
  locations: PlantLocation[];
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  gardens: [],
  plants: [],
  platforms: [],
  locations: [],
  refresh: async () => {},
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [locations, setLocations] = useState<PlantLocation[]>([]);

  const refresh = useCallback(async () => {
    const [gRes, pRes, plRes, lRes] = await Promise.all([
      fetch("/api/gardens"),
      fetch("/api/plants"),
      fetch("/api/platforms"),
      fetch("/api/plant-locations"),
    ]);
    if (gRes.ok) setGardens(await gRes.json());
    if (pRes.ok) setPlants(await pRes.json());
    if (plRes.ok) setPlatforms(await plRes.json());
    if (lRes.ok) setLocations(await lRes.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DataContext value={{ gardens, plants, platforms, locations, refresh }}>
      {children}
    </DataContext>
  );
}

export function useData() {
  return useContext(DataContext);
}
