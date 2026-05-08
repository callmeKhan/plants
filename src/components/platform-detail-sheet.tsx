"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { round2 } from "@/lib/number";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Toast } from "@/components/ui/toast";
import {
  X, Pencil, Check, Package, Search, Leaf, Plus, Trash2,
} from "lucide-react";

const PLACEHOLDER_IMAGE = "/plant-placeholder.png";

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

interface PlatformDetailSheetProps {
  platformId: string;
  onClose: () => void;
  onShowPlantDetail?: (plantId: string, batchId?: string) => void;
  highlightBatchId?: string;
  zIndex?: number;
}

export function PlatformDetailSheet({ platformId, onClose, onShowPlantDetail, highlightBatchId, zIndex = 50 }: PlatformDetailSheetProps) {
  const [openConfirm, confirmModal] = useConfirm();
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Close animation
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

  // Edit platform name
  const [editingPlatformName, setEditingPlatformName] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");

  // Edit capacity
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [newCapacity, setNewCapacity] = useState("");

  // Move batch
  const [movingLocId, setMovingLocId] = useState<string | null>(null);
  const [moveTargetPlatformId, setMoveTargetPlatformId] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [movePlatformSearch, setMovePlatformSearch] = useState("");
  const [showMovePlatformDropdown, setShowMovePlatformDropdown] = useState(false);

  const detailPlatform = useLiveQuery(() => db.platforms.get(platformId), [platformId]);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);
  const plants = useLiveQuery(() => db.plants.toArray(), [], []);

  if (!detailPlatform) return null;

  const garden = gardens?.find((g) => g.id === detailPlatform.garden_id);
  const platformLocs = (locations ?? []).filter((l) => l.platform_id === platformId);
  const used = platformLocs.reduce((s, l) => s + l.quantity, 0);
  const free = round2(detailPlatform.capacity - used);
  const pct = detailPlatform.capacity > 0 ? Math.round((used / detailPlatform.capacity) * 100) : 0;

  async function handleUpdatePlatformName() {
    if (!newPlatformName.trim() || !detailPlatform) return;
    const exists = platforms?.some(
      (x) => x.id !== platformId && x.garden_id === detailPlatform.garden_id && x.floor === detailPlatform.floor && x.name.trim().toLowerCase() === newPlatformName.trim().toLowerCase()
    );
    if (exists) {
      setToast({ text: "Tên sàn đã tồn tại ở tầng này!", type: "error" });
      return;
    }
    const updated = { ...detailPlatform, name: newPlatformName.trim() };
    await db.platforms.update(platformId, { name: newPlatformName.trim() });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "platform",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingPlatformName(false);
    processQueue().catch(console.error);
  }

  async function handleUpdateCapacity() {
    if (!detailPlatform) return;
    const val = Number(newCapacity);
    if (isNaN(val) || val < 0) {
      setToast({ text: "Sức chứa không hợp lệ", type: "error" });
      return;
    }
    if (val < used) {
      setToast({ text: `Sức chứa không được nhỏ hơn số cây hiện có (${used} tấm)`, type: "error" });
      return;
    }
    const updated = { ...detailPlatform, capacity: val };
    await db.platforms.update(platformId, { capacity: val });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "platform",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingCapacity(false);
    processQueue().catch(console.error);
  }

  async function doMoveBatch(locId: string) {
    if (!moveTargetPlatformId) return;
    const loc = (locations ?? []).find((l) => l.id === locId);
    if (!loc) return;
    const targetPlatform = platforms?.find((p) => p.id === moveTargetPlatformId);
    if (!targetPlatform) return;

    const qty = round2(Number(moveQty) || loc.quantity);

    const usedOnTarget = (locations ?? [])
      .filter((l) => l.platform_id === moveTargetPlatformId && l.id !== locId)
      .reduce((s, l) => s + l.quantity, 0);
    const freeOnTarget = round2(targetPlatform.capacity - usedOnTarget);

    if (qty > freeOnTarget) {
      setToast({
        text: `Không đủ chỗ: cần ${qty} tấm nhưng sàn chỉ còn ${freeOnTarget}`,
        type: "error",
      });
      return;
    }

    // Check if destination has a matching batch
    const matchingBatch = (locations ?? []).find((l) =>
      l.id !== locId &&
      l.plant_id === loc.plant_id &&
      l.platform_id === moveTargetPlatformId &&
      l.pot_size === loc.pot_size &&
      l.planted_date === loc.planted_date &&
      (l.price ?? null) === (loc.price ?? null) &&
      (l.status ?? null) === (loc.status ?? null)
    );

    if (matchingBatch) {
      const mergedQty = round2(matchingBatch.quantity + qty);
      await db.plantLocations.update(matchingBatch.id, { quantity: mergedQty });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant_location",
        payload: { ...matchingBatch, quantity: mergedQty } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });

      if (qty === loc.quantity) {
        await db.plantLocations.delete(locId);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant_location",
          payload: { id: locId }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      } else {
        const newOrigQty = round2(loc.quantity - qty);
        await db.plantLocations.update(locId, { quantity: newOrigQty });
        await db.syncQueue.add({
          id: uuidv4(), type: "UPDATE", entity: "plant_location",
          payload: { ...loc, quantity: newOrigQty } as Record<string, unknown>,
          status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
    } else if (qty === loc.quantity) {
      await db.plantLocations.update(locId, { platform_id: moveTargetPlatformId });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant_location",
        payload: { ...loc, platform_id: moveTargetPlatformId } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    } else {
      const newOrigQty = round2(loc.quantity - qty);
      await db.plantLocations.update(locId, { quantity: newOrigQty });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant_location",
        payload: { ...loc, quantity: newOrigQty } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
      const newLoc = {
        id: uuidv4(), plant_id: loc.plant_id, platform_id: moveTargetPlatformId,
        quantity: qty, pot_size: loc.pot_size, planted_date: loc.planted_date,
        ...(loc.price != null ? { price: loc.price } : {}),
        ...(loc.status ? { status: loc.status } : {}),
      };
      await db.plantLocations.add(newLoc);
      await db.syncQueue.add({
        id: uuidv4(), type: "CREATE", entity: "plant_location",
        payload: newLoc as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }

    setMovingLocId(null);
    setMoveTargetPlatformId("");
    setMoveQty("");
    setMovePlatformSearch("");
    setToast({ text: `Đã chuyển ${qty} tấm thành công!${matchingBatch && qty === loc.quantity ? " (Gộp vào đợt cũ)" : ""}`, type: "success" });
    processQueue().catch(console.error);
  }

  async function doDeleteBatch(locId: string) {
    const loc = (locations ?? []).find((l) => l.id === locId);
    if (!loc) return;
    await db.plantLocations.delete(locId);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "plant_location",
      payload: { id: locId }, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    const plant = await db.plants.get(loc.plant_id);
    if (plant) {
      const newTotal = Math.max(0, round2(plant.total_quantity - loc.quantity));
      await db.plants.update(loc.plant_id, { total_quantity: newTotal });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant",
        payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
    setToast({ text: "Đã xoá đợt khỏi sàn", type: "success" });
    processQueue().catch(console.error);
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div
        className={`fixed inset-0 flex flex-col justify-end sheet-backdrop${isClosing ? " closing" : ""}`}
        style={{ zIndex }}
        onClick={handleClose}
      >
        <div
          className={`bg-white rounded-t-3xl shadow-2xl h-[85vh] flex flex-col sheet-panel${isClosing ? " closing" : ""}`}
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
                {editingPlatformName ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleUpdatePlatformName(); }} className="flex items-center gap-2">
                    <Input
                      autoFocus
                      className="h-8 text-lg font-bold px-2 py-0 w-full"
                      value={newPlatformName}
                      onChange={(e) => setNewPlatformName(e.target.value)}
                    />
                    <button type="submit" className="p-1 shrink-0" style={{ color: "#2563eb" }}><Check className="w-5 h-5" /></button>
                    <button type="button" onClick={() => setEditingPlatformName(false)} className="text-gray-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 text-gray-900">
                    <h2 className="text-xl font-bold truncate">{detailPlatform.name}</h2>
                    <button
                      onClick={() => { setNewPlatformName(detailPlatform.name); setEditingPlatformName(true); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {garden && <p className="text-xs text-gray-400 mt-1">{garden.name} · Tầng {detailPlatform.floor}</p>}
              </div>
              <button
                className="w-12 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
                onClick={handleClose}
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto px-5 pb-6 space-y-4 pt-4">
            {/* Capacity */}
            <div className="rounded-2xl p-4 space-y-2" style={{ backgroundColor: "#eff6ff" }}>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" style={{ color: "#2563eb" }} />
                <span className="text-sm font-medium" style={{ color: "#1e3a8a" }}>Sức chứa</span>
                <div className="ml-auto flex items-center gap-1">
                  {editingCapacity ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleUpdateCapacity(); }} className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        step="any"
                        className="w-20 h-7 border border-blue-300 rounded-lg px-2 text-sm font-bold text-blue-700 bg-white outline-none text-center"
                        value={newCapacity}
                        onChange={(e) => setNewCapacity(e.target.value)}
                      />
                      <button type="submit" className="p-1" style={{ color: "#2563eb" }}><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setEditingCapacity(false)} className="text-gray-400 p-1"><X className="w-4 h-4" /></button>
                    </form>
                  ) : (
                    <>
                      <span className="text-lg font-bold" style={{ color: "#2563eb" }}>{round2(used)}/{detailPlatform.capacity}</span>
                      <button
                        onClick={() => { setNewCapacity(String(detailPlatform.capacity)); setEditingCapacity(true); }}
                        className="p-0.5"
                        style={{ color: "#93c5fd" }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#2563eb" }}
                />
              </div>
              <p className="text-xs" style={{ color: "#60a5fa" }}>Còn trống: {free} tấm</p>
            </div>

            {/* Plants list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800 text-sm">Cây đang trồng ({platformLocs.length} đợt)</h3>
                {free > 0 ? (
                  <Link
                    href={`/plants?garden=${detailPlatform.garden_id}&floor=${detailPlatform.floor}&platform=${platformId}&openForm=1`}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm cây
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-gray-300 px-2 py-1 cursor-not-allowed">
                    <Plus className="w-3.5 h-3.5" />
                    Đã đầy
                  </span>
                )}
              </div>
              {platformLocs.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-gray-400">
                  <Leaf className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Chưa có cây nào trên sàn này</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {platformLocs.map((loc) => {
                    const plant = plants?.find((p) => p.id === loc.plant_id);
                    const isMoving = movingLocId === loc.id;
                    return (
                      <div key={loc.id} className={`rounded-xl px-3 py-2.5 space-y-2 transition-all duration-500 ${loc.id === highlightBatchId ? "border-2 border-green-200" : "border border-transparent"}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-emerald-50 shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={plant?.image_url || PLACEHOLDER_IMAGE}
                              alt={plant?.name ?? ""}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                            />
                          </div>
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => onShowPlantDetail?.(loc.plant_id, loc.id)}
                          >
                            <p className="font-semibold text-gray-900 text-sm truncate">{plant?.name ?? loc.plant_id}</p>
                            <div className="flex justify-start items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                              <span style={{ width: "65px" }}>{loc.quantity} tấm</span>
                              <span style={{ width: "65px" }}>chậu {loc.pot_size}</span>
                              <span>{fmtDate(loc.planted_date)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: isMoving ? "#dbeafe" : "#fff7ed" }}
                              onClick={() => {
                                if (isMoving) {
                                  setMovingLocId(null);
                                  setMoveTargetPlatformId("");
                                  setMoveQty("");
                                  setMovePlatformSearch("");
                                } else {
                                  setMovingLocId(loc.id);
                                  setMoveTargetPlatformId("");
                                  setMoveQty(String(loc.quantity));
                                  setMovePlatformSearch("");
                                }
                              }}
                            >
                              <Pencil className="w-4 h-4" style={{ color: isMoving ? "#2563eb" : "#f97316" }} />
                            </button>
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                              onClick={() => {
                                openConfirm(
                                  `Xoá ${loc.quantity} tấm "${plant?.name ?? ""}" khỏi sàn?`,
                                  () => doDeleteBatch(loc.id)
                                );
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Inline move UI */}
                        {isMoving && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500 shrink-0">Số lượng chuyển:</label>
                              <input
                                type="number"
                                min={1}
                                max={loc.quantity}
                                className="w-16 h-6 border border-blue-200 rounded-lg px-2 text-sm bg-white outline-none text-center"
                                value={moveQty}
                                onChange={(e) => {
                                  const v = Math.min(Number(e.target.value), loc.quantity);
                                  setMoveQty(String(v > 0 ? v : ""));
                                }}
                              />
                              <span className="text-xs text-gray-400">/ {loc.quantity} tấm</span>
                            </div>
                            <div className="relative">
                              <div
                                className="flex items-center border border-blue-200 rounded-lg bg-white px-2 h-9 gap-1 cursor-text"
                                onClick={() => setShowMovePlatformDropdown(true)}
                              >
                                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <input
                                  className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0"
                                  placeholder={
                                    moveTargetPlatformId
                                      ? (() => {
                                        const p = platforms?.find((pl) => pl.id === moveTargetPlatformId);
                                        const g = gardens?.find((gl) => gl.id === p?.garden_id);
                                        return p ? `${g ? g.name + " | " : ""}Tầng ${p.floor} - ${p.name}` : "";
                                      })()
                                      : "— Chọn sàn đích —"
                                  }
                                  value={movePlatformSearch}
                                  onChange={(e) => { setMovePlatformSearch(e.target.value); setShowMovePlatformDropdown(true); }}
                                  onFocus={() => setShowMovePlatformDropdown(true)}
                                  onBlur={() => setTimeout(() => setShowMovePlatformDropdown(false), 150)}
                                />
                                {moveTargetPlatformId && (
                                  <button
                                    type="button"
                                    className="shrink-0 text-gray-400 hover:text-gray-600"
                                    onMouseDown={(e) => { e.preventDefault(); setMoveTargetPlatformId(""); setMovePlatformSearch(""); }}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              {showMovePlatformDropdown && (
                                <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                                  {(platforms ?? [])
                                    .filter((p) => p.id !== platformId)
                                    // format label Vườn A | Tầng 1 - P9 (còn 2)
                                    // order by gardern, then floor, then name
                                    .sort((a, b) => {
                                      const gA = gardens?.find((g) => g.id === a.garden_id)?.name ?? "";
                                      const gB = gardens?.find((g) => g.id === b.garden_id)?.name ?? "";
                                      if (gA !== gB) return gA.localeCompare(gB);
                                      if (a.floor !== b.floor) return a.floor - b.floor;
                                      return a.name.localeCompare(b.name, undefined, { numeric: true });
                                    })
                                    .filter((p) => {
                                      if (!movePlatformSearch.trim()) return true;
                                      const q = movePlatformSearch.toLowerCase();
                                      const g = gardens?.find((gl) => gl.id === p.garden_id);
                                      const freeSlots = round2(p.capacity - (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                                      return `${g?.name ?? ""} tầng ${p.floor} ${p.name} ${freeSlots}`.toLowerCase().includes(q);
                                    })
                                    .map((p) => {
                                      const g = gardens?.find((gl) => gl.id === p.garden_id);
                                      const freeSlots = round2(p.capacity - (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                                      const label = `${g ? g.name + " | " : ""}Tầng ${p.floor} - ${p.name} (còn ${freeSlots})`;
                                      return (
                                        <li
                                          key={p.id}
                                          className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${moveTargetPlatformId === p.id ? "bg-blue-50 font-medium text-blue-700" : "text-gray-800"} ${freeSlots < loc.quantity ? "opacity-50" : ""}`}
                                          onMouseDown={() => { setMoveTargetPlatformId(p.id); setMovePlatformSearch(""); setShowMovePlatformDropdown(false); }}
                                        >
                                          {label}
                                          {freeSlots < loc.quantity && <span className="ml-1 text-red-400 text-xs">(không đủ)</span>}
                                        </li>
                                      );
                                    })}
                                </ul>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                                style={{ backgroundColor: moveTargetPlatformId ? "#2563eb" : "#93c5fd" }}
                                disabled={!moveTargetPlatformId}
                                onClick={() => {
                                  const target = platforms?.find((pl) => pl.id === moveTargetPlatformId);
                                  const g = gardens?.find((gl) => gl.id === target?.garden_id);
                                  const targetLabel = target ? `${g ? g.name + " | " : ""}Tầng ${target.floor} - ${target.name}` : "";
                                  openConfirm(
                                    `Chuyển ${moveQty} tấm "${plant?.name ?? ""}" sang ${targetLabel}?`,
                                    () => doMoveBatch(loc.id)
                                  );
                                }}
                              >
                                Xác nhận chuyển
                              </button>
                              <button
                                className="flex-1 h-9 rounded-lg text-sm border border-gray-200 text-gray-600"
                                onClick={() => { setMovingLocId(null); setMoveTargetPlatformId(""); setMovePlatformSearch(""); }}
                              >
                                Huỷ
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmModal}
    </>
  );
}
