"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { round2 } from "@/lib/number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import {
  X, Pencil, Check, Package, MapPin, Calendar, Trash2, Search, ImageIcon,
  DollarSign,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-modal";

const PLACEHOLDER_IMAGE = "/plant-placeholder.png";

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function PotSizeInput({ value, onChange, usedSizes }: { value: number; onChange: (v: number) => void; usedSizes: number[] }) {
  const [inputVal, setInputVal] = useState(String(value));
  const [showDrop, setShowDrop] = useState(false);

  const suggestions = [...new Set([...usedSizes, 14, 16, 21])]
    .filter((s) => String(s).startsWith(inputVal))
    .sort((a, b) => a - b)
    .slice(0, 6);

  function commit(val: string) {
    const n = Number(val);
    if (n > 0) { onChange(n); setInputVal(String(n)); }
    setShowDrop(false);
  }

  return (
    <div className="relative">
      <input
        type="number"
        min={1}
        className="w-full h-8 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-center"
        placeholder="🪴 Chậu"
        value={inputVal}
        onChange={(e) => { setInputVal(e.target.value); setShowDrop(true); }}
        onFocus={() => setShowDrop(true)}
        onBlur={() => setTimeout(() => { commit(inputVal); setShowDrop(false); }, 150)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(inputVal); } }}
      />
      {showDrop && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl text-sm divide-y divide-gray-50 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <li
              key={s}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 text-gray-800"
              onMouseDown={() => { onChange(s); setInputVal(String(s)); setShowDrop(false); }}
            >
              Chậu {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PlantDetailSheetProps {
  plantId: string;
  onClose: () => void;
  highlightBatchId?: string;
}

export function PlantDetailSheet({ plantId, onClose, highlightBatchId }: PlantDetailSheetProps) {
  const [openConfirm, confirmModal] = useConfirm();
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const router = useRouter();

  // Exit animation
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);
  const handleSheetAnimEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName === "sheetSlideDown") {
      setIsClosing(false);
      onClose();
    }
  }, [onClose]);

  // Edit name
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  // Edit image
  const [editingImage, setEditingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");

  // Edit batch
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editPotSize, setEditPotSize] = useState<number>(14);
  const [editDate, setEditDate] = useState("");
  const [editPlatformId, setEditPlatformId] = useState("");
  const [editPlatformSearch, setEditPlatformSearch] = useState("");
  const [showEditPlatformDropdown, setShowEditPlatformDropdown] = useState(false);
  const [editStatus, setEditStatus] = useState("");

  const plant = useLiveQuery(() => db.plants.get(plantId), [plantId]);
  const plants = useLiveQuery(() => db.plants.toArray(), [], []);
  const batches = useLiveQuery(
    () => db.plantLocations.where("plant_id").equals(plantId).toArray(),
    [plantId], []
  );
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);

  if (!plant) return null;

  function platformLabelFull(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    const g = gardens?.find((g) => g.id === p.garden_id);
    return `${g ? g.name + " | " : ""}Tầng ${p.floor} - ${p.name}`;
  }

  function platformLabelShort(id: string) {
    const p = platforms?.find((p) => p.id === id);
    return p ? `Sàn ${p.name}` : id;
  }

  async function handleUpdateName() {
    if (!newName.trim() || !plant) return;
    const exists = plants?.some((p) => p.id !== plantId && p.name.trim().toLowerCase() === newName.trim().toLowerCase());
    if (exists) return; // tên đã tồn tại — caller có thể show toast nếu muốn
    const updated = { ...plant, name: newName.trim() };
    await db.plants.update(plantId, { name: newName.trim() });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "plant",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingName(false);
    processQueue().catch(console.error);
  }

  async function handleUpdateImage() {
    if (!newImageUrl.trim() || !plant) return;
    const updated = { ...plant, image_url: newImageUrl.trim() };
    await db.plants.update(plantId, { image_url: newImageUrl.trim() });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "plant",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingImage(false);
    setNewImageUrl("");
    processQueue().catch(console.error);
  }

  function startEditBatch(b: { id: string; quantity: number; pot_size: number; planted_date: string; platform_id: string; price?: number; status?: string }) {
    setEditingBatchId(b.id);
    setEditQty(String(b.quantity));
    setEditPrice(b.price != null ? String(b.price) : "");
    setEditPotSize(b.pot_size);
    setEditDate(b.planted_date);
    setEditPlatformId(b.platform_id);
    setEditPlatformSearch("");
    setEditStatus(b.status || "");
  }

  async function doUpdateBatch(batchId: string, oldQty: number) {
    const newQty = Number(editQty);
    if (!newQty || !editPlatformId || !plant) return;

    // If destination has a matching batch (same plant_id, platform_id, pot_size, planted_date, price, status),
    // merge quantities and delete the current batch
    const currentBatch = (batches ?? []).find((b) => b.id === batchId);
    if (currentBatch) {
      const targetPrice = editPrice ? Number(editPrice) : undefined;
      const targetStatus = editStatus || undefined;

      const existingBatch = (batches ?? []).find((b) =>
        b.id !== batchId &&
        b.platform_id === editPlatformId &&
        b.pot_size === editPotSize &&
        b.planted_date === editDate &&
        (targetPrice ? b.price === targetPrice : true) &&
        (targetStatus ? b.status === targetStatus : true)
      );

      if (existingBatch) {
        // Merge: add current quantity to existing batch, then delete current
        const mergedQty = round2(existingBatch.quantity + newQty);
        await db.plantLocations.update(existingBatch.id, { quantity: mergedQty });
        await db.syncQueue.add({
          id: uuidv4(), type: "UPDATE", entity: "plant_location",
          payload: { ...existingBatch, quantity: mergedQty } as Record<string, unknown>,
          status: "pending", retry_count: 0, created_at: Date.now(),
        });

        await db.plantLocations.delete(batchId);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant_location",
          payload: { id: batchId } as Record<string, unknown>,
          status: "pending", retry_count: 0, created_at: Date.now(),
        });

        // Update plant total_quantity if quantity value changed
        if (newQty !== oldQty) {
          const newTotal = Math.max(0, round2(plant.total_quantity - oldQty + newQty));
          await db.plants.update(plantId, { total_quantity: newTotal });
          await db.syncQueue.add({
            id: uuidv4(), type: "UPDATE", entity: "plant",
            payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
            status: "pending", retry_count: 0, created_at: Date.now(),
          });
        }

        setEditingBatchId(null);
        processQueue().catch(console.error);
        setToast({ text: `Đã chuyển ${newQty} tấm sang sàn ${platformLabelFull(editPlatformId)} thành công! (Gộp vào đợt cũ)`, type: "success" });
        return;
      }
    }

    // No merge needed — standard update
    const updates = {
      quantity: newQty, pot_size: editPotSize, planted_date: editDate, platform_id: editPlatformId,
      ...(editPrice ? { price: Number(editPrice) } : { price: undefined }),
      ...(editStatus ? { status: editStatus } : { status: undefined }),
    };
    await db.plantLocations.update(batchId, updates);
    const batch = (locations ?? []).find((l) => l.id === batchId);
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "plant_location",
      payload: { ...(batch ?? {}), ...updates, id: batchId } as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    if (newQty !== oldQty) {
      const newTotal = Math.max(0, round2(plant.total_quantity - oldQty + newQty));
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

  async function doDeleteBatch(batchId: string, qty: number) {
    if (!plant) return;
    await db.plantLocations.delete(batchId);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "plant_location",
      payload: { id: batchId } as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    const newTotal = Math.max(0, round2(plant.total_quantity - qty));
    await db.plants.update(plantId, { total_quantity: newTotal });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "plant",
      payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    processQueue().catch(console.error);
  }

  async function doDeletePlant() {
    for (const b of batches ?? []) {
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
    onClose();
  }

  const usedSizes = (locations ?? []).map((l) => l.pot_size);

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] flex flex-col justify-end sheet-backdrop${isClosing ? " closing" : ""}`}
        onClick={() => { handleClose(); setEditingName(false); setEditingImage(false); }}
      >
        <div
          className={`bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col sheet-panel${isClosing ? " closing" : ""}`}
          style={{ marginBottom: "64px" }}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={handleSheetAnimEnd}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white rounded-t-3xl z-10 px-5 pt-3 pb-3 border-b border-gray-100">
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-2">
                {editingName ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleUpdateName(); }} className="flex items-center gap-2">
                    <Input
                      autoFocus
                      className="h-8 text-lg font-bold px-2 py-0 w-full"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <button type="submit" className="text-emerald-600 p-1 shrink-0"><Check className="w-5 h-5" /></button>
                    <button type="button" onClick={() => setEditingName(false)} className="text-gray-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 text-gray-900">
                    <h2 className="text-xl font-bold truncate">{plant.name}</h2>
                    <button
                      onClick={() => { setNewName(plant.name); setEditingName(true); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <button
                className="w-12 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
                onClick={() => { handleClose(); setEditingName(false); setEditingImage(false); }}
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
                src={plant.image_url || PLACEHOLDER_IMAGE}
                alt={plant.name}
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
                <Button size="sm" onClick={() => openConfirm("Cập nhật hình ảnh cho cây này?", handleUpdateImage)}>Lưu</Button>
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
                <span className="ml-auto text-lg font-bold" style={{ color: "#059669" }}>{plant.total_quantity}</span>
              </div>
            </div>

            {/* Batches */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">Các đợt trồng ({(batches ?? []).length})</h3>
              <div className="space-y-2">
                {(batches ?? []).map((b) => (
                  <div
                    key={b.id}
                    className={`rounded-xl px-3 py-2.5 space-y-2 transition-all duration-500 ${b.id === highlightBatchId
                      ? "border-2 border-green-200"
                      : "border border-transparent"
                      }`}
                  >
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
                          <div className="w-1/4">
                            <PotSizeInput value={editPotSize} onChange={setEditPotSize} usedSizes={usedSizes} />
                          </div>
                          <input
                            type="date"
                            className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                        </div>
                        {/* Status select */}
                        <select
                          className="w-full h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none text-gray-700"
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                        >
                          <option value="">— Trạng thái —</option>
                          <option value="trồng lại">🌱 Trồng lại</option>
                          <option value="sang chậu">🪴 Sang chậu</option>
                        </select>
                        {/* Platform search */}
                        <div className="relative">
                          <div
                            className="flex items-center border border-gray-200 rounded-lg bg-white px-2 h-9 gap-1 cursor-text"
                            onClick={() => setShowEditPlatformDropdown(true)}
                          >
                            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <input
                              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0"
                              placeholder={editPlatformId ? platformLabelFull(editPlatformId) : "— Sàn —"}
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
                            <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                              {(platforms ?? [])
                                .filter((p) => {
                                  if (!editPlatformSearch.trim()) return true;
                                  const q = editPlatformSearch.toLowerCase();
                                  const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                                  const g = gardens?.find((g) => g.id === p.garden_id)?.name ?? "";
                                  return `${g} tầng ${p.floor} ${p.name} ${free}`.toLowerCase().includes(q);
                                })
                                .map((p) => {
                                  const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                                  const g = gardens?.find((g) => g.id === p.garden_id)?.name;
                                  const label = `${g ? g + " | " : ""}Tầng ${p.floor} - ${p.name} (còn ${round2(free)})`;
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
                            onClick={() => openConfirm(
                              `Cập nhật đợt này thành ${editQty} tấm, chậu ${editPotSize}?`,
                              () => doUpdateBatch(b.id, b.quantity)
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
                        <div className="text-sm space-y-0.5 min-w-0 w-full">
                          <div className="flex items-center justify-between gap-1.5 text-gray-800 font-medium">
                            <div className="flex items-center gap-1.5" >
                              <Package className="w-3.5 h-3.5" style={{ color: "#059669" }} />
                              {b.quantity} tấm · chậu {b.pot_size}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {b.status && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
                                  style={{
                                    backgroundColor: b.status === 'sang chậu' ? '#dbeafe' : '#fef3c7',
                                    color: b.status === 'sang chậu' ? '#1d4ed8' : '#92400e',
                                  }}
                                >
                                  {b.status === 'sang chậu' ? '🪴' : '🌱'} {b.status}
                                </span>
                              )}
                              {b.price != null && (
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                                  <DollarSign className="w-3 h-3" />
                                  {b.price.toLocaleString("vi-VN")}₫
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="w-full flex items-center justify-between gap-1.5 text-xs text-gray-500">
                            <div className="flex items-center gap-1.5 cursor-pointer underline"
                              onClick={() => {
                                if (window.location.pathname.includes("platforms")) return
                                router.push(`/platforms?detail=${b.platform_id}&highlight=${b.id}`)
                              }}
                            >
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{platformLabelFull(b.platform_id)}</span>
                            </div>
                            {b.planted_date && (<div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              {fmtDate(b.planted_date)}
                            </div>)
                            }
                          </div>
                        </div>
                        <div className="flex items-center">
                          <button
                            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: "#fff7ed" }}
                            onClick={() => startEditBatch(b)}
                          >
                            <Pencil className="w-4 h-4" style={{ color: "#f97316" }} />
                          </button>
                          <button
                            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 shrink-0"
                            style={{ backgroundColor: "#fef2f2" }}
                            onClick={() => openConfirm(
                              `Xoá đợt ${b.quantity} tấm tại ${platformLabelShort(b.platform_id)}?`,
                              () => doDeleteBatch(b.id, b.quantity)
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

            {/* Delete plant */}
            <button
              className="w-full h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: "#dc2626" }}
              onClick={() => openConfirm(
                `Xoá toàn bộ cây "${plant.name}" và tất cả ${(batches ?? []).length} đợt trồng?`,
                doDeletePlant
              )}
            >
              <Trash2 className="w-4 h-4" />
              Xoá toàn bộ cây
            </button>
          </div>
        </div>
      </div>
      {confirmModal}
    </>
  );
}
