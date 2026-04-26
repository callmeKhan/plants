"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export default function PlantsPage() {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [msg, setMsg] = useState("");

  const plants = useLiveQuery(() => db.plants.toArray(), [], []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !quantity) {
      setMsg("❌ Tên và số lượng là bắt buộc");
      return;
    }

    const id = uuidv4();
    const plant = {
      id,
      name,
      total_quantity: Number(quantity),
      image_url: imageUrl,
    };

    // Write to IndexedDB
    await db.plants.add(plant);

    // Queue for sync
    await db.syncQueue.add({
      id: uuidv4(),
      type: "CREATE",
      entity: "plant",
      payload: plant,
      status: "pending",
      retry_count: 0,
      created_at: Date.now(),
    });

    setName("");
    setQuantity("");
    setImageUrl("");
    setMsg(`✅ Đã thêm: ${plant.name}`);
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">🌿 Cây</h1>

      <form onSubmit={handleAdd} className="space-y-2 mb-4">
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Tên cây"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Số lượng"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <input
          className="border rounded w-full px-3 py-2 text-sm"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded text-sm w-full"
        >
          Thêm cây
        </button>
      </form>

      {msg && <p className="text-sm mb-2">{msg}</p>}

      <h2 className="font-semibold text-sm mb-2">Danh sách ({plants?.length ?? 0})</h2>
      <ul className="space-y-1 text-sm">
        {plants?.map((p) => (
          <li key={p.id} className="border rounded px-3 py-2">
            <strong>{p.name}</strong> — SL: {p.total_quantity}
            {p.image_url && (
              <span className="text-gray-400 ml-2 text-xs">[có ảnh]</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
