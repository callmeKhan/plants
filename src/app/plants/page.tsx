"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Leaf,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Trash2,
  ImageIcon,
  AlertCircle,
  MapPin,
  Calendar,
  Package,
  Pencil,
} from "lucide-react";
import { Toast } from "@/components/ui/toast";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [potSize, setPotSize] = useState<number>(16);
  const [plantedDate, setPlantedDate] = useState(todayStr());
  const [filterGarden, setFilterGarden] = useState("");
  const [filterFloor, setFilterFloor] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [platformSearch, setPlatformSearch] = useState("");
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const [detailPlantId, setDetailPlantId] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);

  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editPotSize, setEditPotSize] = useState<number>(16);
  const [editDate, setEditDate] = useState("");
  const [editPlatformId, setEditPlatformId] = useState("");
  const [editPlatformSearch, setEditPlatformSearch] = useState("");
  const [showEditPlatformDropdown, setShowEditPlatformDropdown] = useState(false);

  const plants = useLiveQuery(() => db.plants.toArray(), [], []);
  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);

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
      setMsg({ text: "Tên cây, số lượng và sàn là bắt buộc", type: "error" });
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
    if (!platform) { setMsg({ text: "Không tìm thấy sàn", type: "error" }); return; }
    const usedCap = (locations ?? [])
      .filter((l) => l.platform_id === platformId)
      .reduce((s, l) => s + l.quantity, 0);
    if (usedCap + qty > platform.capacity) {
      setMsg({ text: `Vượt sức chứa: đã dùng ${usedCap} + ${qty} > cap ${platform.capacity}`, type: "error" });
      return;
    }

    const loc = {
      id: uuidv4(), plant_id: plant.id, platform_id: platformId,
      quantity: qty, pot_size: potSize, planted_date: plantedDate,
      ...(price ? { price: Number(price) } : {}),
    };
    await db.plantLocations.add(loc);
    await db.syncQueue.add({
      id: uuidv4(), type: "CREATE", entity: "plant_location",
      payload: loc as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });

    setName(""); setSelectedPlantId(null); setQuantity(""); setPrice("");
    setImageUrl(""); setPlatformId(""); setPlantedDate(todayStr());
    setMsg({ text: "Đã lưu cây và vị trí thành công!", type: "success" });
    processQueue().catch(console.error);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !quantity || !platformId) {
      setMsg({ text: "Tên cây, số lượng và sàn là bắt buộc", type: "error" });
      return;
    }
    const qty = Number(quantity);
    const platform = platforms?.find((p) => p.id === platformId);
    const gardenOfPlatform = gardens?.find((g) => g.id === platform?.garden_id);
    confirm(
      `Thêm ${qty} tấm "${name}" vào ${gardenOfPlatform ? gardenOfPlatform.name + " · " : ""}${platform ? `Tầng ${platform.floor} - ${platform.name}` : platformId}?`,
      doSubmit
    );
  }

  function platformLabel(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    return `Sàn ${p.name}`;
  }

  function platformLabelWithGarden(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    return `${gardens?.find((g) => g.id === p.garden_id)?.name + " | "}Tầng ${p.floor} - ${p.name}`;
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
    processQueue().catch(console.error);
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
    processQueue().catch(console.error);
  }
  function startEditBatch(b: { id: string; quantity: number; pot_size: number; planted_date: string; platform_id: string; price?: number }) {
    setEditingBatchId(b.id);
    setEditQty(String(b.quantity));
    setEditPrice(b.price != null ? String(b.price) : "");
    setEditPotSize(b.pot_size);
    setEditDate(b.planted_date);
    setEditPlatformId(b.platform_id);
  }

  async function doUpdateBatch(batchId: string, oldQty: number, plantId: string) {
    const newQty = Number(editQty);
    if (!newQty || !editPlatformId) return;

    const updates = {
      quantity: newQty, pot_size: editPotSize, planted_date: editDate, platform_id: editPlatformId,
      ...(editPrice ? { price: Number(editPrice) } : { price: undefined }),
    };
    await db.plantLocations.update(batchId, updates);

    const batch = (locations ?? []).find((l) => l.id === batchId);
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "plant_location",
      payload: { ...(batch ?? {}), ...updates, id: batchId } as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });

    const plant = plants?.find((p) => p.id === plantId);
    if (plant && newQty !== oldQty) {
      const newTotal = Math.max(0, plant.total_quantity - oldQty + newQty);
      await db.plants.update(plantId, { total_quantity: newTotal });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant",
        payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }

    setEditingBatchId(null);
    processQueue().catch(console.error);
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
    processQueue().catch(console.error);
    closeDetail();
  }

  function closeDetail() {
    setDetailPlantId(null);
    setEditingBatchId(null);
    setEditPlatformSearch("");
  }

  let plantIds = [...new Set(locations?.map((l) => l.plant_id) ?? [])];
  if (searchQuery.trim()) {
    plantIds = plantIds.filter((pid) => {
      const plant = plants?.find((p) => p.id === pid);
      return plant?.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    });
  }
  const detailPlant = detailPlantId ? plants?.find((p) => p.id === detailPlantId) : null;
  const detailBatches = detailPlantId
    ? (locations ?? []).filter((l) => l.plant_id === detailPlantId)
    : [];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Form header — collapsible */}
      <button
        onClick={() => setOpenForm((v) => !v)}
        className="w-full flex items-center gap-3 pt-1 text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0">
          <Leaf className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Thêm cây mới</h1>
          <p className="text-xs text-gray-400">Nhập thông tin và vị trí trồng</p>
        </div>
        <ChevronDown
          className="w-5 h-5 text-gray-400 transition-transform duration-200"
          style={{ transform: openForm ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Toast */}
      {msg && <Toast msg={msg} onClose={() => setMsg(null)} />}

      {/* Add plant form — collapsed by default */}
      {openForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Plant name autocomplete */}
              <div className="relative">
                <Input
                  placeholder="🌿 Tên cây"
                  value={name}
                  autoComplete="off"
                  onChange={(e) => { setName(e.target.value); setSelectedPlantId(null); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && name && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-100 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                    {plants
                      ?.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()))
                      .map((p) => (
                        <li
                          key={p.id}
                          className="px-4 py-2.5 hover:bg-emerald-50 cursor-pointer flex items-center justify-between"
                          onMouseDown={() => { setName(p.name); setSelectedPlantId(p.id); setShowSuggestions(false); }}
                        >
                          <span className="font-medium text-gray-800">{p.name}</span>
                          <Badge variant="secondary">tổng: {p.total_quantity}</Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {/* Quantity + Price + Image URL */}
              <div className="flex gap-2">
                <Input
                  className="w-1/3"
                  placeholder="📦 Số lượng"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <Input
                  className="w-1/3"
                  placeholder="💰 Giá tiền"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <Input
                  className="w-1/3"
                  placeholder="🖼 URL hình (tuỳ chọn)"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>

              {/* Pot size + Planted date */}
              <div className="flex gap-2">
                <Select
                  className="w-1/3"
                  value={potSize}
                  onChange={(e) => setPotSize(Number(e.target.value))}
                >
                  {POT_SIZES.map((s) => (
                    <option key={s} value={s}>🪴 Chậu {s}</option>
                  ))}
                </Select>
                <Input
                  className="w-2/3 h-10"
                  type="date"
                  value={plantedDate}
                  onChange={(e) => setPlantedDate(e.target.value)}
                />
              </div>

              {/* Location selects */}
              <div className="flex gap-2">
                <Select
                  className="w-1/4"
                  value={filterGarden}
                  onChange={(e) => { setFilterGarden(e.target.value); setFilterFloor(""); setPlatformId(""); }}
                >
                  <option value="">Vườn</option>
                  {gardens?.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </Select>
                <Select
                  className="w-1/4"
                  value={filterFloor}
                  onChange={(e) => { setFilterFloor(e.target.value); setPlatformId(""); }}
                >
                  <option value="">Tầng</option>
                  {floorsInGarden.map((f) => (
                    <option key={f} value={f}>Tầng {f}</option>
                  ))}
                </Select>
                <div className="relative w-2/4">
                  <div
                    className="flex items-center border border-gray-200 rounded-xl bg-white px-2 h-10 gap-1 cursor-text"
                    onClick={() => setShowPlatformDropdown(true)}
                  >
                    <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input
                      className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0"
                      placeholder={platformId ? platformLabel(platformId) : "— Sàn —"}
                      value={platformSearch}
                      onChange={(e) => { setPlatformSearch(e.target.value); setShowPlatformDropdown(true); }}
                      onFocus={() => setShowPlatformDropdown(true)}
                      onBlur={() => setTimeout(() => setShowPlatformDropdown(false), 150)}
                    />
                    {platformId && (
                      <button
                        type="button"
                        className="shrink-0 text-gray-400 hover:text-gray-600"
                        onMouseDown={(e) => { e.preventDefault(); setPlatformId(""); setPlatformSearch(""); }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {showPlatformDropdown && (
                    <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                      {(filteredPlatforms ?? [])
                        .filter((p) => {
                          if (!platformSearch.trim()) return true;
                          const q = platformSearch.toLowerCase();
                          const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                          const label = `tầng ${p.floor} ${p.name} ${free}`;
                          return label.toLowerCase().includes(q);
                        })
                        .map((p) => {
                          const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                          const label = filterFloor ? `${p.name} (còn ${free})` : `${gardens?.find((g) => g.id === p.garden_id)?.name + " | "}Tầng ${p.floor} - ${p.name} (${free})`;
                          return (
                            <li
                              key={p.id}
                              className={`px-3 py-2 cursor-pointer hover:bg-emerald-50 ${platformId === p.id ? "bg-emerald-50 font-medium text-emerald-700" : "text-gray-800"}`}
                              onMouseDown={() => { setPlatformId(p.id); setPlatformSearch(""); setShowPlatformDropdown(false); }}
                            >
                              {label}
                            </li>
                          );
                        })}
                      {(filteredPlatforms ?? []).filter((p) => {
                        if (!platformSearch.trim()) return true;
                        const q = platformSearch.toLowerCase();
                        const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                        return `tầng ${p.floor} ${p.name} ${free}`.toLowerCase().includes(q);
                      }).length === 0 && (
                        <li className="px-3 py-2 text-gray-400 text-center">Không tìm thấy</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>

              <button
                type="submit"
                style={{ backgroundColor: "#059669", color: "white" }}
                className="w-full h-11 rounded-xl font-semibold text-base flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all"
              >
                <Leaf className="w-4 h-4" />
                Lưu
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            Danh sách
            <Badge variant="default">{plants?.length ?? 0} loại hoa</Badge>
          </h2>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs text-emerald-600 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Bỏ lọc
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 bg-white shadow-sm">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            className="flex-1 h-10 text-sm bg-transparent outline-none placeholder-gray-400"
            placeholder="Tìm kiếm cây..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Cards */}
        <div className="space-y-2">
          {plantIds.length === 0 && (
            <div className="flex flex-col items-center py-10 text-gray-400">
              <Leaf className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Chưa có cây nào</p>
            </div>
          )}
          {plantIds.map((pid) => {
            const plant = plants?.find((p) => p.id === pid);
            const batches = (locations ?? []).filter((l) => l.plant_id === pid);
            const total = batches.reduce((s, l) => s + l.quantity, 0);
            return (
              <button
                key={pid}
                className="w-full text-left"
                onClick={() => { setDetailPlantId(pid); setEditingImage(false); setNewImageUrl(""); }}
              >
                <Card className="hover:shadow-md hover:border-emerald-200 transition-all duration-200 active:scale-[0.99]">
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-emerald-50 shrink-0 mt-0.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={plant?.image_url || PLACEHOLDER_IMAGE}
                        alt={plant?.name ?? ""}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 justify-between">
                        <span className="font-semibold text-gray-900 truncate">{plant?.name ?? pid}</span>
                        <Badge variant="default">×{total}</Badge>
                      </div>
                      <div className="space-y-1">
                        {batches.map((b) => (
                          <div key={b.id} className="text-xs text-gray-500 flex flex-wrap items-start gap-x-1 gap-y-0 border-b border-gray-200">
                            {/* <MapPin className="w-3 h-3 shrink-0 text-gray-400" /> */}
                            <div className="flex flex-col">
                              <span>{platformLabelWithGarden(b.platform_id)}</span>
                              <span>{b.quantity} tấm, chậu {b.pot_size}</span>
                            </div>
                            <span className="text-gray-900 text-xs ml-auto">{fmtDate(b.planted_date)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail bottom sheet */}
      {detailPlant && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => closeDetail()}
        >
          <div
            className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
            style={{ marginBottom: "64px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky header: drag handle + tên + nút X */}
            <div className="sticky top-0 bg-white rounded-t-3xl z-10 px-5 pt-3 pb-3 border-b border-gray-100">
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">{detailPlant.name}</h2>
                <button
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                  onClick={() => closeDetail()}
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-5 pb-6 space-y-4 pt-4">

              {/* Image */}
              <div className="rounded-2xl overflow-hidden bg-gray-50 aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detailPlant.image_url || PLACEHOLDER_IMAGE}
                  alt={detailPlant.name}
                  className="object-cover w-full h-full"
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                />
              </div>

              {/* Update image */}
              {editingImage ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Nhập URL hình mới"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleUpdateImage}>Lưu</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingImage(false); setNewImageUrl(""); }}>Huỷ</Button>
                </div>
              ) : (
                <button
                  className="w-full h-8 rounded-xl border border-gray-200 text-sm text-gray-600 flex items-center justify-center gap-2 hover:bg-gray-50"
                  onClick={() => setEditingImage(true)}
                >
                  <ImageIcon className="w-4 h-4" />
                  Cập nhật hình ảnh
                </button>
              )}

              {/* Stats */}
              <div className="rounded-2xl p-4" style={{ backgroundColor: "#ecfdf5" }}>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" style={{ color: "#059669" }} />
                  <span className="text-sm font-medium" style={{ color: "#065f46" }}>Tổng số lượng</span>
                  <span className="ml-auto text-lg font-bold" style={{ color: "#059669" }}>{detailPlant.total_quantity}</span>
                </div>
              </div>

              {/* Batches */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-2 text-sm">Các đợt trồng ({detailBatches.length})</h3>
                <div className="space-y-2">
                  {detailBatches.map((b) => (
                    <div key={b.id} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-2">
                      {editingBatchId === b.id ? (
                        <>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                              placeholder="SL"
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                            />
                            <input
                              type="number"
                              className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                              placeholder="Giá"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                            />
                            <select
                              className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                              value={editPotSize}
                              onChange={(e) => setEditPotSize(Number(e.target.value))}
                            >
                              {POT_SIZES.map((s) => <option key={s} value={s}>Chậu {s}</option>)}
                            </select>
                            <input
                              type="date"
                              className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                            />
                          </div>
                          <div className="relative">
                            <div
                              className="flex items-center border border-gray-200 rounded-lg bg-white px-2 h-9 gap-1 cursor-text"
                              onClick={() => setShowEditPlatformDropdown(true)}
                            >
                              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <input
                                className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0"
                                placeholder={editPlatformId ? platformLabelWithGarden(editPlatformId) : "— Sàn —"}
                                value={editPlatformSearch}
                                onChange={(e) => { setEditPlatformSearch(e.target.value); setShowEditPlatformDropdown(true); }}
                                onFocus={() => setShowEditPlatformDropdown(true)}
                                onBlur={() => setTimeout(() => setShowEditPlatformDropdown(false), 150)}
                              />
                              {editPlatformId && (
                                <button
                                  type="button"
                                  className="shrink-0 text-gray-400 hover:text-gray-600"
                                  onMouseDown={(e) => { e.preventDefault(); setEditPlatformId(""); setEditPlatformSearch(""); }}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {showEditPlatformDropdown && (
                              <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                                {(platforms ?? [])
                                  .filter((p) => {
                                    if (!editPlatformSearch.trim()) return true;
                                    const q = editPlatformSearch.toLowerCase();
                                    const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                                    const gardenName = gardens?.find((g) => g.id === p.garden_id)?.name ?? "";
                                    return `${gardenName} tầng ${p.floor} ${p.name} ${free}`.toLowerCase().includes(q);
                                  })
                                  .map((p) => {
                                    const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                                    const gardenName = gardens?.find((g) => g.id === p.garden_id)?.name;
                                    const label = `${gardenName ? gardenName + " | " : ""}Tầng ${p.floor} - ${p.name} (còn ${free})`;
                                    return (
                                      <li
                                        key={p.id}
                                        className={`px-3 py-2 cursor-pointer hover:bg-emerald-50 ${editPlatformId === p.id ? "bg-emerald-50 font-medium text-emerald-700" : "text-gray-800"}`}
                                        onMouseDown={() => { setEditPlatformId(p.id); setEditPlatformSearch(""); setShowEditPlatformDropdown(false); }}
                                      >
                                        {label}
                                      </li>
                                    );
                                  })}
                              </ul>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                              style={{ backgroundColor: "#059669" }}
                              onClick={() => confirm(
                                `Cập nhật đợt này thành ${editQty} tấm, chậu ${editPotSize}?`,
                                () => doUpdateBatch(b.id, b.quantity, b.plant_id)
                              )}
                            >
                              Lưu
                            </button>
                            <button
                              className="flex-1 h-9 rounded-lg text-sm border border-gray-200 text-gray-600"
                              onClick={() => setEditingBatchId(null)}
                            >
                              Huỷ
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="text-sm space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 text-gray-800 font-medium">
                              <Package className="w-3.5 h-3.5" style={{ color: "#059669" }} />
                              {b.quantity} tấm · chậu {b.pot_size}
                              {b.price != null && (
                                <span className="ml-1 text-emerald-700 font-semibold text-xs">
                                  · {b.price.toLocaleString("vi-VN")}₫
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{platformLabelWithGarden(b.platform_id)}</span>
                              <span>·</span>
                              <Calendar className="w-3 h-3" />
                              {fmtDate(b.planted_date)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: "#fff7ed" }}
                              onClick={() => startEditBatch(b)}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 shrink-0"
                              style={{ backgroundColor: "#fef2f2" }}
                              onClick={() => confirm(
                                `Xoá đợt ${b.quantity} tấm tại ${platformLabel(b.platform_id)}?`,
                                () => doDeleteBatch(b.id, b.quantity, b.plant_id)
                              )}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Delete all */}
              <button
                className="w-full h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: "#dc2626" }}
                onClick={() => confirm(
                  `Xoá toàn bộ cây "${detailPlant.name}" và tất cả ${detailBatches.length} đợt trồng?`,
                  () => doDeletePlant(detailPlant.id)
                )}
              >
                <Trash2 className="w-4 h-4" />
                Xoá toàn bộ cây
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#fffbeb" }}>
              <AlertCircle className="w-6 h-6" style={{ color: "#f59e0b" }} />
            </div>
            <p className="text-sm text-gray-700 mb-6 text-center leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium"
                onClick={() => setConfirmModal(null)}
              >
                Huỷ
              </button>
              <button
                className="flex-1 h-11 rounded-xl text-sm text-white font-semibold"
                style={{ backgroundColor: "#059669" }}
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
