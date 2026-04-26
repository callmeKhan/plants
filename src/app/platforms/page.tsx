"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";

type ConfirmModal = { message: string; onConfirm: () => void } | null;

export default function PlatformsPage() {
  // Garden form
  const [gardenName, setGardenName] = useState("");
  const [gardenMsg, setGardenMsg] = useState("");

  // Platform form
  const [gardenId, setGardenId] = useState("");
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [msg, setMsg] = useState("");

  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);

  function confirm(message: string, onConfirm: () => void) {
    setConfirmModal({ message, onConfirm });
  }

  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);

  async function handleAddGarden(e: React.FormEvent) {
    e.preventDefault();
    if (!gardenName) { setGardenMsg("❌ Tên vườn là bắt buộc"); return; }
    const garden = { id: uuidv4(), name: gardenName };
    await db.gardens.add(garden);
    await db.syncQueue.add({
      id: uuidv4(), type: "CREATE", entity: "garden",
      payload: garden, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setGardenName("");
    setGardenMsg(`✅ Đã thêm vườn: ${garden.name}`);
    processQueue().catch(console.error);
  }

  async function doDeleteGarden(id: string) {
    const pts = (platforms ?? []).filter((p) => p.garden_id === id);
    const deletedPlantIds = new Set<string>();
    for (const p of pts) {
      const locs = await db.plantLocations.where("platform_id").equals(p.id).toArray();
      for (const loc of locs) {
        deletedPlantIds.add(loc.plant_id);
        await db.plantLocations.delete(loc.id);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant_location",
          // eslint-disable-next-line react-hooks/purity
          payload: { id: loc.id }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
      await db.platforms.delete(p.id);
      await db.syncQueue.add({
        id: uuidv4(), type: "DELETE", entity: "platform",
        // eslint-disable-next-line react-hooks/purity
        payload: { id: p.id }, status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
    await db.gardens.delete(id);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "garden",
      // eslint-disable-next-line react-hooks/purity
      payload: { id }, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    // Delete plants that have no remaining locations
    for (const plantId of deletedPlantIds) {
      const remaining = await db.plantLocations.where("plant_id").equals(plantId).count();
      if (remaining === 0) {
        await db.plants.delete(plantId);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant",
          // eslint-disable-next-line react-hooks/purity
          payload: { id: plantId }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
    }
    setGardenMsg("🗑️ Đã xoá vườn");
    processQueue().catch(console.error);
  }

  function handleDeleteGarden(id: string, gardenName: string) {
    const gardenPlatformIds = (platforms ?? []).filter((p) => p.garden_id === id).map((p) => p.id);
    const plantCount = (locations ?? [])
      .filter((l) => gardenPlatformIds.includes(l.platform_id))
      .reduce((s, l) => s + l.quantity, 0);
    confirm(
      `Xoá vườn "${gardenName}"?\nHiện có ${plantCount} cây đang được trồng trong vườn này.`,
      () => doDeleteGarden(id)
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!gardenId || !floor || !name || !capacity) {
      setMsg("❌ Vườn, tầng, tên và sức chứa là bắt buộc");
      return;
    }
    const platform = {
      id: uuidv4(),
      garden_id: gardenId,
      floor: Number(floor),
      name,
      capacity: Number(capacity),
    };
    await db.platforms.add(platform);
    await db.syncQueue.add({
      id: uuidv4(), type: "CREATE", entity: "platform",
      payload: platform, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setFloor(""); setName(""); setCapacity("");
    setMsg(`✅ Đã thêm: ${platform.name}`);
    processQueue().catch(console.error);
  }

  async function doDeletePlatform(id: string) {
    const locs = await db.plantLocations.where("platform_id").equals(id).toArray();
    const deletedPlantIds = new Set(locs.map((l) => l.plant_id));
    for (const loc of locs) {
      await db.plantLocations.delete(loc.id);
      await db.syncQueue.add({
        id: uuidv4(), type: "DELETE", entity: "plant_location",
        // eslint-disable-next-line react-hooks/purity
        payload: { id: loc.id }, status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
    await db.platforms.delete(id);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "platform",
      // eslint-disable-next-line react-hooks/purity
      payload: { id }, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    // Delete plants that have no remaining locations
    for (const plantId of deletedPlantIds) {
      const remaining = await db.plantLocations.where("plant_id").equals(plantId).count();
      if (remaining === 0) {
        await db.plants.delete(plantId);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant",
          // eslint-disable-next-line react-hooks/purity
          payload: { id: plantId }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
    }
    setMsg("🗑️ Đã xoá sàn");
    processQueue().catch(console.error);
  }

  function handleDelete(id: string, platformName: string) {
    const plantCount = (locations ?? [])
      .filter((l) => l.platform_id === id)
      .reduce((s, l) => s + l.quantity, 0);
    confirm(
      `Xoá sàn "${platformName}"?\nHiện có ${plantCount} cây đang được trồng trên sàn này.`,
      () => doDeletePlatform(id)
    );
  }


  return (
    <div>
      {/* Garden section */}
      <h1 className="text-xl font-bold mb-4">🌳 Vườn</h1>
      <form onSubmit={handleAddGarden} className="flex gap-2 mb-2">
        <input
          className="border rounded flex-1 px-3 py-2 text-sm"
          placeholder="Tên vườn"
          value={gardenName}
          onChange={(e) => setGardenName(e.target.value)}
        />
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm">
          Thêm
        </button>
      </form>
      {gardenMsg && <p className="text-sm mb-2">{gardenMsg}</p>}
      <ul className="space-y-1 text-sm mb-6">
        {gardens?.map((g) => (
          <li key={g.id} className="border rounded px-3 py-2 flex justify-between items-center">
            <span className="font-medium">{g.name}</span>
            <button onClick={() => handleDeleteGarden(g.id, g.name)} className="text-red-500 text-xs ml-2">Xoá</button>
          </li>
        ))}
      </ul>

      {/* Platform section */}
      <h1 className="text-xl font-bold mb-4">📦 Sàn</h1>
      <form onSubmit={handleAdd} className="space-y-2 mb-4">
        <select
          className="border rounded w-full px-3 py-2 text-sm"
          value={gardenId}
          onChange={(e) => setGardenId(e.target.value)}
        >
          <option value="">-- Chọn vườn --</option>
          {gardens?.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Tầng (số)"
          type="number"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
        />
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Tên sàn"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Sức chứa"
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full">
          Thêm sàn
        </button>
      </form>
      {msg && <p className="text-sm mb-2">{msg}</p>}

      <h2 className="font-semibold text-sm mb-2">Danh sách sàn ({platforms?.length ?? 0})</h2>
      <div className="space-y-4">
        {gardens?.map((g) => {
          const gardenPlatforms = platforms?.filter((p) => p.garden_id === g.id) || [];
          if (gardenPlatforms.length === 0) return null;

          const floors = [...new Set(gardenPlatforms.map((p) => p.floor))].sort((a, b) => a - b);

          return (
            <div key={g.id} className="border rounded-lg p-3 bg-gray-50">
              <h3 className="font-bold text-gray-800 mb-2">🌳 {g.name}</h3>
              <div className="space-y-3">
                {floors.map((floor) => {
                  const floorPlatforms = gardenPlatforms.filter((p) => p.floor === floor);
                  return (
                    <div key={floor} className="pl-3 border-l-2 border-blue-200">
                      <h4 className="font-semibold text-gray-700 text-sm mb-1">Tầng {floor}:</h4>
                      <ul className="space-y-1 pl-2">
                        {floorPlatforms.map((p) => (
                          <li key={p.id} className="flex justify-between items-center bg-white border rounded px-3 py-2">
                            <span>
                              <strong>{p.name}</strong> — Chứa: {p.capacity}
                            </span>
                            <button onClick={() => handleDelete(p.id, p.name)} className="text-red-500 text-xs ml-2">Xoá</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Các sàn chưa có vườn / rác dữ liệu cũ */}
        {(() => {
          const orphanedPlatforms = platforms?.filter((p) => !gardens?.find((g) => g.id === p.garden_id)) || [];
          if (orphanedPlatforms.length === 0) return null;
          
          const floors = [...new Set(orphanedPlatforms.map((p) => p.floor))].sort((a, b) => a - b);
          
          return (
            <div className="border rounded-lg p-3 bg-gray-100 opacity-80">
              <h3 className="font-bold text-gray-600 mb-2">❓ Không rõ vườn</h3>
              <div className="space-y-3">
                {floors.map((floor) => {
                  const floorPlatforms = orphanedPlatforms.filter((p) => p.floor === floor);
                  return (
                    <div key={floor} className="pl-3 border-l-2 border-gray-300">
                      <h4 className="font-semibold text-gray-600 text-sm mb-1">Tầng {floor}:</h4>
                      <ul className="space-y-1 pl-2">
                        {floorPlatforms.map((p) => (
                          <li key={p.id} className="flex justify-between items-center bg-white border rounded px-3 py-2">
                            <span>
                              <strong>{p.name}</strong> — Chứa: {p.capacity}
                            </span>
                            <button onClick={() => handleDelete(p.id, p.name)} className="text-red-500 text-xs ml-2">Xoá</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-xs">
            <p className="text-sm text-gray-800 mb-5 text-center whitespace-pre-line">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                className="flex-1 border rounded-lg py-2 text-sm text-gray-600"
                onClick={() => setConfirmModal(null)}
              >
                Huỷ
              </button>
              <button
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium"
                onClick={() => { confirmModal!.onConfirm(); setConfirmModal(null); }}
              >
                Xoá
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
