"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export default function PlatformsPage() {
  const [floor, setFloor] = useState("");
  const [side, setSide] = useState<"left" | "right">("left");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [msg, setMsg] = useState("");

  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!floor || !name || !capacity) {
      setMsg("❌ Tầng, tên và sức chứa là bắt buộc");
      return;
    }

    const id = uuidv4();
    const platform = {
      id,
      floor: Number(floor),
      side,
      name,
      capacity: Number(capacity),
    };

    await db.platforms.add(platform);
    await db.syncQueue.add({
      id: uuidv4(),
      type: "CREATE",
      entity: "platform",
      payload: platform,
      status: "pending",
      retry_count: 0,
      created_at: Date.now(),
    });

    setFloor("");
    setName("");
    setCapacity("");
    setMsg(`✅ Đã thêm: ${platform.name}`);
  }

  async function handleDelete(id: string) {
    await db.platforms.delete(id);
    // Also remove related plant_locations
    await db.plantLocations.where("platform_id").equals(id).delete();

    await db.syncQueue.add({
      id: uuidv4(),
      type: "DELETE",
      entity: "platform",
      payload: { id },
      status: "pending",
      retry_count: 0,
      created_at: Date.now(),
    });

    setMsg("🗑️ Đã xoá platform");
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">📦 Sàn</h1>

      <form onSubmit={handleAdd} className="space-y-2 mb-4">
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Tầng (số)"
          type="number"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
        />
        <select
          className="border rounded w-full px-3 py-2 text-sm"
          value={side}
          onChange={(e) => setSide(e.target.value as "left" | "right")}
        >
          <option value="left">Trái</option>
          <option value="right">Phải</option>
        </select>
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Tên platform"
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
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full"
        >
          Thêm platform
        </button>
      </form>

      {msg && <p className="text-sm mb-2">{msg}</p>}

      <h2 className="font-semibold text-sm mb-2">
        Danh sách ({platforms?.length ?? 0})
      </h2>
      <ul className="space-y-1 text-sm">
        {platforms?.map((p) => (
          <li
            key={p.id}
            className="border rounded px-3 py-2 flex justify-between items-center"
          >
            <span>
              <strong>{p.name}</strong> — Tầng {p.floor} ({p.side}) — Chứa:{" "}
              {p.capacity}
            </span>
            <button
              onClick={() => handleDelete(p.id)}
              className="text-red-500 text-xs ml-2"
            >
              Xoá
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
