"use client";

import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export default function PlacementPage() {
  const [plantId, setPlantId] = useState("");
  const [plantSearch, setPlantSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [platformId, setPlatformId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [filterFloor, setFilterFloor] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [msg, setMsg] = useState("");

  const plants = useLiveQuery(() => db.plants.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);

  // Derive unique floors and filtered platforms
  const floors = [...new Set(platforms?.map((p) => p.floor))].sort((a, b) => a - b);
  const filteredPlatforms = platforms?.filter((p) => {
    if (filterFloor && p.floor !== Number(filterFloor)) return false;
    return true;
  });

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!plantId || !platformId || !quantity) {
      setMsg("❌ Chọn cây, platform và nhập số lượng");
      return;
    }

    const qty = Number(quantity);

    // Validate inventory constraint (client-side)
    const plant = await db.plants.get(plantId);
    if (!plant) {
      setMsg("❌ Không tìm thấy cây");
      return;
    }

    const usedByPlant = (await db.plantLocations.where("plant_id").equals(plantId).toArray())
      .reduce((sum, l) => sum + l.quantity, 0);

    if (usedByPlant + qty > plant.total_quantity) {
      setMsg(
        `❌ Vượt tồn kho: đã dùng ${usedByPlant} + ${qty} > tổng ${plant.total_quantity}`
      );
      return;
    }

    // Validate capacity constraint
    const platform = await db.platforms.get(platformId);
    if (!platform) {
      setMsg("❌ Không tìm thấy platform");
      return;
    }

    const usedCapacity = (await db.plantLocations.where("platform_id").equals(platformId).toArray())
      .reduce((sum, l) => sum + l.quantity, 0);

    if (usedCapacity + qty > platform.capacity) {
      setMsg(
        `❌ Vượt sức chứa: đã dùng ${usedCapacity} + ${qty} > cap ${platform.capacity}`
      );
      return;
    }

    // Upsert: if same plant+platform exists, add quantity instead of new record
    const existing = (await db.plantLocations
      .where("plant_id").equals(plantId)
      .toArray())
      .find((l) => l.platform_id === platformId);

    if (existing) {
      const newQty = existing.quantity + qty;
      await db.plantLocations.update(existing.id, { quantity: newQty });
      await db.syncQueue.add({
        id: uuidv4(),
        type: "UPDATE",
        entity: "plant_location",
        payload: { ...existing, quantity: newQty },
        status: "pending",
        retry_count: 0,
        created_at: Date.now(),
      });
    } else {
      const id = uuidv4();
      const loc = { id, plant_id: plantId, platform_id: platformId, quantity: qty, pot_size: 0, planted_date: "" };
      await db.plantLocations.add(loc);
      await db.syncQueue.add({
        id: uuidv4(),
        type: "CREATE",
        entity: "plant_location",
        payload: loc,
        status: "pending",
        retry_count: 0,
        created_at: Date.now(),
      });
    }

    setQuantity("");
    setPlantId("");
    setPlantSearch("");
    setMsg("✅ Đã gán cây vào vị trí");
  }

  // Resolve names for display
  function plantName(id: string) {
    return plants?.find((p) => p.id === id)?.name ?? id;
  }
  function platformName(id: string) {
    return platforms?.find((p) => p.id === id)?.name ?? id;
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">📍 Vị trí</h1>

      <form onSubmit={handleAssign} className="space-y-2 mb-4">
        <div className="relative" ref={wrapperRef}>
          <input
            className="border rounded w-full px-3 py-2 text-sm"
            placeholder="Nhập tên cây..."
            value={plantSearch}
            onChange={(e) => {
              setPlantSearch(e.target.value);
              setPlantId("");
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && (
            <ul className="absolute z-10 w-full bg-white border rounded shadow max-h-48 overflow-y-auto text-sm">
              {plants
                ?.filter((p) => p.name.toLowerCase().includes(plantSearch.toLowerCase()))
                .map((p) => {
                  const remaining = p.total_quantity -
                    (locations?.filter((l) => l.plant_id === p.id).reduce((s, l) => s + l.quantity, 0) ?? 0);
                  return (
                    <li
                      key={p.id}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                      onMouseDown={() => {
                        setPlantId(p.id);
                        setPlantSearch(`${p.name} (còn: ${remaining})`);
                        setShowSuggestions(false);
                      }}
                    >
                      {p.name} (còn: {remaining})
                    </li>
                  );
                })}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <select
            className="border rounded w-1/3 px-3 py-2 text-sm"
            value={filterFloor}
            onChange={(e) => { setFilterFloor(e.target.value); setPlatformId(""); }}
          >
            <option value="">Tất cả tầng</option>
            {floors?.map((f) => (
              <option key={f} value={f}>Tầng {f}</option>
            ))}
          </select>

          <select
            className="border rounded w-2/3 px-3 py-2 text-sm"
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
          >
            <option value="">-- Chọn sàn --</option>
            {filteredPlatforms?.map((p) => {
              const free = p.capacity -
                (locations?.filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0) ?? 0);
              const label = filterFloor
                ? `${p.name} (${free})`
                : `Tầng ${p.floor} - ${p.name} (${free})`;
              return (
                <option key={p.id} value={p.id}>{label}</option>
              );
            })}
          </select>
        </div>

        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Số lượng"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button
          type="submit"
          className="bg-purple-600 text-white px-4 py-2 rounded text-sm w-full"
        >
          Gán vị trí
        </button>
      </form>

      {msg && <p className="text-sm mb-2">{msg}</p>}

      <h2 className="font-semibold text-sm mb-2">
        Vị trí hiện tại ({locations?.length ?? 0})
      </h2>
      <ul className="space-y-1 text-sm">
        {locations?.map((l) => (
          <li key={l.id} className="border rounded px-3 py-2">
            {`(${l.quantity}) ` + plantName(l.plant_id)} {" → 📦 "} {platformName(l.platform_id) + ` Tầng ${platforms?.find((f) => f.id === l.platform_id)?.floor}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
