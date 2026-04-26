"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import type { Plant, PlantLocation, Platform } from "@/lib/db";

interface SearchResult extends Plant {
  locations: (PlantLocation & { platform?: Platform })[];
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;

    const allPlants = await db.plants.toArray();
    const matched = allPlants.filter((p) =>
      p.name.toLowerCase().includes(q)
    );

    const allLocations = await db.plantLocations.toArray();
    const allPlatforms = await db.platforms.toArray();

    const enriched: SearchResult[] = matched.map((plant) => {
      const locs = allLocations
        .filter((l) => l.plant_id === plant.id)
        .map((l) => ({
          ...l,
          platform: allPlatforms.find((p) => p.id === l.platform_id),
        }));
      return { ...plant, locations: locs };
    });

    setResults(enriched);
    setSearched(true);
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">🔍 Tìm kiếm</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          className="border rounded flex-1 px-3 py-2 text-sm"
          placeholder="Nhập tên cây..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="bg-gray-800 text-white px-4 py-2 rounded text-sm"
        >
          Tìm
        </button>
      </form>

      {searched && (
        <div className="text-sm">
          {results.length === 0 ? (
            <p className="text-gray-500">Không tìm thấy kết quả.</p>
          ) : (
            <ul className="space-y-3">
              {results.map((r) => (
                <li key={r.id} className="border rounded px-3 py-2">
                  <p>
                    <strong>{r.name}</strong> — Tổng: {r.total_quantity}
                  </p>
                  {r.locations.length > 0 ? (
                    <ul className="ml-4 mt-1 text-xs text-gray-600">
                      {r.locations.map((l) => (
                        <li key={l.id}>
                          📦 Tầng {l.platform?.floor} - {l.platform?.name ?? l.platform_id} — SL:{" "}
                          {l.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">
                      Chưa gán vị trí
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
