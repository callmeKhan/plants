"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const POT_SIZES = [14, 16, 21];
const PLACEHOLDER_IMAGE = "/plant-placeholder.png";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

type ConfirmModal = { message: string; onConfirm: () => void } | null;

export default function PlantsPage() {
  const [name, setName] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [potSize, setPotSize] = useState<number>(16);
  const [plantedDate, setPlantedDate] = useState(todayStr());
  const [filterGarden, setFilterGarden] = useState("");
  const [filterFloor, setFilterFloor] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [msg, setMsg] = useState("");

  // Detail panel state
  const [detailPlantId, setDetailPlantId] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);

  const plants = useLiveQuery(() => db.plants.toArray(), [], []);
  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);

  // Floors available under selected garden
  const floorsInGarden = [...new Set(
    platforms
      ?.filter((p) => !filterGarden || p.garden_id === filterGarden)
      .map((p) => p.floor) ?? []
  )].sort((a, b) => a - b);

  const filteredPlatforms = platforms?.filter((p) => {
    if (filterGarden && p.garden_id !== filterGarden) return false;
    if (filterFloor && p.floor !== Number(filterFloor)) return false;
    return true;
  });

  function confirm(message: string, onConfirm: () => void) {
    setConfirmModal({ message, onConfirm });
  }

  async function doSubmit() {
    if (!name || !quantity || !platformId) {
      setMsg("❌ Tên cây, số lượng và sàn là bắt buộc");
      return;
    }

    const qty = Number(quantity);

    const resolvedId = selectedPlantId
      ?? plants?.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id
      ?? null;

    let plant = resolvedId ? plants?.find((p) => p.id === resolvedId) ?? null : null;

    if (!plant) {
      const newPlant = { id: uuidv4(), name, total_quantity: qty, image_url: imageUrl };
      await db.plants.add(newPlant);
      await db.syncQueue.add({
        id: uuidv4(), type: "CREATE", entity: "plant",
        payload: newPlant as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
      plant = newPlant;
    } else {
      const newTotal = plant.total_quantity + qty;
      await db.plants.update(plant.id, { total_quantity: newTotal });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant",
        payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
      plant = { ...plant, total_quantity: newTotal };
    }

    const platform = platforms?.find((p) => p.id === platformId);
    if (!platform) { setMsg("❌ Không tìm thấy sàn"); return; }
    const usedCap = (locations ?? [])
      .filter((l) => l.platform_id === platformId)
      .reduce((s, l) => s + l.quantity, 0);
    if (usedCap + qty > platform.capacity) {
      setMsg(`❌ Vượt sức chứa: đã dùng ${usedCap} + ${qty} > cap ${platform.capacity}`);
      return;
    }

    const loc = {
      id: uuidv4(),
      plant_id: plant.id,
      platform_id: platformId,
      quantity: qty,
      pot_size: potSize,
      planted_date: plantedDate,
    };
    await db.plantLocations.add(loc);
    await db.syncQueue.add({
      id: uuidv4(), type: "CREATE", entity: "plant_location",
      payload: loc as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });

    setName(""); setSelectedPlantId(null); setQuantity("");
    setImageUrl(""); setPlatformId(""); setPlantedDate(todayStr());
    setMsg("✅ Đã lưu cây và vị trí");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !quantity || !platformId) {
      setMsg("❌ Tên cây, số lượng và sàn là bắt buộc");
      return;
    }
    const qty = Number(quantity);
    const platform = platforms?.find((p) => p.id === platformId);
    const gardenOfPlatform = gardens?.find((g) => g.id === platform?.garden_id);
    confirm(
      `Thêm ${qty} cây "${name}" vào ${gardenOfPlatform ? gardenOfPlatform.name + " · " : ""}${platform ? `Tầng ${platform.floor} - ${platform.name}` : platformId}?`,
      doSubmit
    );
  }

  function platformLabel(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    const garden = gardens?.find((g) => g.id === p.garden_id);
    return `${garden ? garden.name + " · " : ""}Tầng ${p.floor} - ${p.name}`;
  }

  async function doUpdateImage() {
    if (!detailPlantId || !newImageUrl.trim()) return;
    const plant = plants?.find((p) => p.id === detailPlantId);
    if (!plant) return;
    const updated = { ...plant, image_url: newImageUrl.trim() };
    await db.plants.update(detailPlantId, { image_url: newImageUrl.trim() });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "plant",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingImage(false);
    setNewImageUrl("");
  }

  function handleUpdateImage() {
    if (!newImageUrl.trim()) return;
    confirm("Cập nhật hình ảnh cho cây này?", doUpdateImage);
  }

  async function doDeleteBatch(batchId: string, qty: number, plantId: string) {
    await db.plantLocations.delete(batchId);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "plant_location",
      payload: { id: batchId } as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    const plant = plants?.find((p) => p.id === plantId);
    if (plant) {
      const newTotal = Math.max(0, plant.total_quantity - qty);
      await db.plants.update(plantId, { total_quantity: newTotal });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant",
        payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
  }

  async function doDeletePlant(plantId: string) {
    const batches = (locations ?? []).filter((l) => l.plant_id === plantId);
    for (const b of batches) {
      await db.plantLocations.delete(b.id);
      await db.syncQueue.add({
        id: uuidv4(), type: "DELETE", entity: "plant_location",
        payload: { id: b.id } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
    await db.plants.delete(plantId);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "plant",
      payload: { id: plantId } as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setDetailPlantId(null);
  }

  const plantIds = [...new Set(locations?.map((l) => l.plant_id) ?? [])];
  const detailPlant = detailPlantId ? plants?.find((p) => p.id === detailPlantId) : null;
  const detailBatches = detailPlantId
    ? (locations ?? []).filter((l) => l.plant_id === detailPlantId)
    : [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">🌿 Thêm cây</h1>

      <form onSubmit={handleSubmit} className="space-y-2 mb-4">
        {/* Plant name with autocomplete */}
        <div className="relative">
          <input
            className="border rounded w-full px-3 py-2 text-sm"
            placeholder="Tên cây"
            value={name}
            autoComplete="off"
            onChange={(e) => { setName(e.target.value); setSelectedPlantId(null); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && name && (
            <ul className="absolute z-10 w-full bg-white border rounded shadow max-h-48 overflow-y-auto text-sm">
              {plants
                ?.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()))
                .map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                    onMouseDown={() => { setName(p.name); setSelectedPlantId(p.id); setShowSuggestions(false); }}
                  >
                    {p.name}
                    <span className="text-gray-400 ml-1 text-xs">(tổng: {p.total_quantity})</span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <input
            className="border rounded w-1/3 px-3 py-2 text-sm"
            placeholder="Số lượng"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <input
            className="border rounded w-2/3 px-3 py-2 text-sm"
            placeholder="URL hình (tuỳ chọn)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>

        {/* Pot size + planted date */}
        <div className="flex gap-2">
          <select
            className="border rounded w-1/3 px-3 py-2 text-sm"
            value={potSize}
            onChange={(e) => setPotSize(Number(e.target.value))}
          >
            {POT_SIZES.map((s) => (
              <option key={s} value={s}>Cỡ {s}</option>
            ))}
          </select>
          <input
            className="border rounded w-2/3 px-3 py-2 text-sm"
            type="date"
            value={plantedDate}
            onChange={(e) => setPlantedDate(e.target.value)}
          />
        </div>

        {/* Garden filter */}
        <select
          className="border rounded w-full px-3 py-2 text-sm"
          value={filterGarden}
          onChange={(e) => { setFilterGarden(e.target.value); setFilterFloor(""); setPlatformId(""); }}
        >
          <option value="">-- Chọn vườn --</option>
          {gardens?.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        {/* Floor filter */}
        <div className="flex gap-2">
          <select
            className="border rounded w-1/3 px-3 py-2 text-sm"
            value={filterFloor}
            onChange={(e) => { setFilterFloor(e.target.value); setPlatformId(""); }}
          >
            <option value="">Tất cả tầng</option>
            {floorsInGarden.map((f) => (
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
                ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
              const label = filterFloor
                ? `${p.name} (${free})`
                : `Tầng ${p.floor} - ${p.name} (${free})`;
              return <option key={p.id} value={p.id}>{label}</option>;
            })}
          </select>
        </div>

        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm w-full">
          Lưu
        </button>
      </form>

      {msg && <p className="text-sm mb-3">{msg}</p>}

      {/* Plant list */}
      <h2 className="font-semibold text-sm mb-2">
        Danh sách ({locations?.length ?? 0} đợt)
      </h2>
      <ul className="space-y-2 text-sm">
        {plantIds.map((pid) => {
          const plant = plants?.find((p) => p.id === pid);
          const batches = (locations ?? []).filter((l) => l.plant_id === pid);
          const total = batches.reduce((s, l) => s + l.quantity, 0);
          return (
            <li
              key={pid}
              className="border rounded px-3 py-2 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
              onClick={() => { setDetailPlantId(pid); setEditingImage(false); setNewImageUrl(""); }}
            >
              <div className="font-semibold mb-1">
                {plant?.name ?? pid} × {total}
              </div>
              <ul className="space-y-0.5 text-gray-600 text-xs pl-2">
                {batches.map((b) => (
                  <li key={b.id}>
                    {b.quantity} cỡ {b.pot_size} [{platformLabel(b.platform_id)}] {fmtDate(b.planted_date)}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {/* Detail panel (bottom sheet style) */}
      {detailPlant && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setDetailPlantId(null)}>
          <div
            className="bg-white rounded-t-2xl shadow-xl p-4 max-h-[80vh] overflow-y-auto mb-[100px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{detailPlant.name}</h2>
              <button
                className="text-gray-400 text-xl leading-none"
                onClick={() => setDetailPlantId(null)}
              >
                ✕
              </button>
            </div>

            {/* Image */}
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detailPlant.image_url || PLACEHOLDER_IMAGE}
                alt={detailPlant.name}
                className="object-contain w-full h-48 rounded-lg bg-gray-100"
                onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
              />
            </div>

            {/* Update image */}
            {editingImage ? (
              <div className="flex gap-2 mb-3">
                <input
                  className="border rounded flex-1 px-3 py-2 text-sm"
                  placeholder="Nhập URL hình mới"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  autoFocus
                />
                <button
                  className="bg-green-600 text-white px-3 py-2 rounded text-sm"
                  onClick={handleUpdateImage}
                >
                  Lưu
                </button>
                <button
                  className="bg-gray-100 border px-3 py-2 rounded text-sm"
                  onClick={() => { setEditingImage(false); setNewImageUrl(""); }}
                >
                  Huỷ
                </button>
              </div>
            ) : (
              <button
                className="mb-3 text-sm text-blue-600 border border-blue-200 rounded px-3 py-1.5 w-full"
                onClick={() => setEditingImage(true)}
              >
                🖼 Cập nhật hình
              </button>
            )}

            {/* Info */}
            <div className="text-sm text-gray-700 mb-3">
              <p><span className="font-medium">Tổng số lượng:</span> {detailPlant.total_quantity}</p>
            </div>

            {/* Batches */}
            <h3 className="font-semibold text-sm mb-1">Các đợt trồng</h3>
            <ul className="space-y-1 text-xs text-gray-600 mb-4">
              {detailBatches.map((b) => (
                <li key={b.id} className="border rounded px-2 py-1.5 flex items-center justify-between">
                  <span>
                    {b.quantity} cây · cỡ {b.pot_size} · {platformLabel(b.platform_id)} · {fmtDate(b.planted_date)}
                  </span>
                  <button
                    className="ml-2 text-red-500 border border-red-200 rounded px-2 py-0.5 text-xs shrink-0"
                    onClick={() => confirm(
                      `Xoá đợt ${b.quantity} cây tại ${platformLabel(b.platform_id)}?`,
                      () => doDeleteBatch(b.id, b.quantity, b.plant_id)
                    )}
                  >
                    Xoá
                  </button>
                </li>
              ))}
            </ul>

            {/* Delete plant */}
            <button
              className="w-full text-sm text-red-600 border border-red-300 rounded px-3 py-2"
              onClick={() => confirm(
                `Xoá toàn bộ cây "${detailPlant.name}" và tất cả ${detailBatches.length} đợt trồng?`,
                () => doDeletePlant(detailPlant.id)
              )}
            >
              🗑 Xoá toàn bộ cây
            </button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-xs">
            <p className="text-sm text-gray-800 mb-5 text-center">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                className="flex-1 border rounded-lg py-2 text-sm text-gray-600"
                onClick={() => setConfirmModal(null)}
              >
                Huỷ
              </button>
              <button
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium"
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
