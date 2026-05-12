"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { round2 } from "@/lib/number";
import { useSellCart, sellCartStore } from "@/lib/sell-cart";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Toast } from "@/components/ui/toast";
import {
  X, Pencil, Check, Package, Leaf, Plus, Trash2,
  DollarSign,
} from "lucide-react";
import { PlatformGridModal } from "@/components/platform-grid-modal";

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

  // Sell batch
  const [sellingLocId, setSellingLocId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState("");
  const sellCart = useSellCart();

  // Move batch
  const [movingLocId, setMovingLocId] = useState<string | null>(null);
  const [moveTargetPlatformId, setMoveTargetPlatformId] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [moveTargetGardenId, setMoveTargetGardenId] = useState("");
  const [moveTargetFloor, setMoveTargetFloor] = useState<number | "">("");
  const [showPlatformGridModal, setShowPlatformGridModal] = useState(false);

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
    if (!detailPlatform) return;
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
    setMoveTargetGardenId("");
    setMoveTargetFloor("");

    const srcGarden = gardens?.find((g) => g.id === detailPlatform.garden_id);
    const dstGarden = gardens?.find((g) => g.id === targetPlatform.garden_id);
    const srcLabel = `${srcGarden?.name ?? ""} Tầng ${detailPlatform.floor} ${detailPlatform.name}`;
    const dstLabel = `${dstGarden?.name ?? ""} Tầng ${targetPlatform.floor} ${targetPlatform.name}`;
    const mergeNote = matchingBatch && qty === loc.quantity ? " (Gộp vào đợt cũ)" : "";
    // moveRecord: tách ra để dễ mở rộng lưu audit log sau này
    const moveRecord = {
      qty,
      src: { gardenName: srcGarden?.name ?? "", floor: detailPlatform.floor, platformName: detailPlatform.name },
      dst: { gardenName: dstGarden?.name ?? "", floor: targetPlatform.floor, platformName: targetPlatform.name },
    };
    setToast({ text: `Đã chuyển ${moveRecord.qty} cây từ ${srcLabel} → ${dstLabel}${mergeNote}`, type: "success" });
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

  const cartQtyByLoc = (locId: string) =>
    sellCart.filter((c) => c.locId === locId).reduce((s, c) => s + c.qty, 0);

  function handleMoveQtyChange(rawValue: string, maxQty: number) {
    const nextQty = Math.min(Number(rawValue), maxQty);
    const nextMoveQty = nextQty > 0 ? String(nextQty) : "";
    setMoveQty(nextMoveQty);

    if (!moveTargetPlatformId) return;

    const targetPlatform = platforms?.find((p) => p.id === moveTargetPlatformId);
    if (!targetPlatform) return;

    const requiredQty = round2(nextQty || maxQty);
    const freeSlots = round2(
      targetPlatform.capacity -
        (locations ?? [])
          .filter((l) => l.platform_id === targetPlatform.id)
          .reduce((s, l) => s + l.quantity, 0)
    );

    if (freeSlots < requiredQty) {
      setMoveTargetPlatformId("");
    }
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
                    const isSelling = sellingLocId === loc.id;
                    const inCartQty = cartQtyByLoc(loc.id);
                    const effectiveQty = round2(loc.quantity - inCartQty);
                    const fullySold = effectiveQty <= 0;
                    const mapStatusIcons: Record<string, { text: string, bg_color: string }> = {
                      "trồng lại": {
                        text: '🌱',
                        bg_color: 'rgba(255, 237, 164, 1)',
                      },
                      "sang chậu": {
                        text: '🪴',
                        bg_color: 'rgba(162, 203, 255, 1)',
                      }
                    }
                    return (
                      <div key={loc.id} className={`relative rounded-xl px-3 pr-0 py-2.5 space-y-2 transition-all duration-500 ${loc.id === highlightBatchId ? "border-2 border-green-200" : "border border-transparent"} ${fullySold ? "opacity-40" : ""}`}>
                        {loc.status && ["trồng lại", "sang chậu"].includes(loc.status) && (
                          // icon status at bottom left of div
                          <div className="absolute bottom-0 left-0 flex items-center">
                            <div className={`rounded-lg w-5 h-5 flex border-1 border-white items-center justify-center`}
                              style={{
                                backgroundColor: loc.status && mapStatusIcons[loc.status].bg_color,
                              }}>
                              <span className="text-xs font-semibold">
                                {loc.status && mapStatusIcons[loc.status].text}
                              </span>
                            </div>
                          </div>
                        )}
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
                              <span style={{ width: "65px" }}>
                                {inCartQty > 0 ? `${effectiveQty}/${loc.quantity}` : loc.quantity} tấm
                              </span>
                              <span style={{ width: "65px" }}>chậu {loc.pot_size}</span>
                              <span>{fmtDate(loc.planted_date)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: isSelling ? "#dcfce7" : "#ecfdf5", color: isSelling ? "#15803d" : "#34d399" }}
                              disabled={fullySold && !isSelling}
                              onClick={() => {
                                if (isSelling) {
                                  setSellingLocId(null);
                                  setSellQty("");
                                } else {
                                  setSellingLocId(loc.id);
                                  setSellQty(String(effectiveQty));
                                  setMovingLocId(null);
                                }
                              }}
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: isMoving ? "#dbeafe" : "#fff7ed" }}
                              onClick={() => {
                                if (isMoving) {
                                  setMovingLocId(null);
                                  setMoveTargetPlatformId("");
                                  setMoveQty("");
                                  setMoveTargetGardenId("");
                                  setMoveTargetFloor("");
                                  setShowPlatformGridModal(false);
                                } else {
                                  setMovingLocId(loc.id);
                                  setMoveTargetPlatformId("");
                                  setMoveQty(String(loc.quantity));
                                  setMoveTargetGardenId("");
                                  setMoveTargetFloor("");
                                  setShowPlatformGridModal(false);
                                }
                              }}
                            >
                              <Pencil className="w-4 h-4" style={{ color: isMoving ? "#2563eb" : "#f97316" }} />
                            </button>
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 bg-red-50"
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

                        {/* Inline sell UI */}
                        {isSelling && (
                          <div className="space-y-2 rounded-lg bg-emerald-50 p-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-emerald-800 shrink-0">Số lượng bán:</label>
                              <input
                                type="number"
                                min={1}
                                max={effectiveQty}
                                step="any"
                                autoFocus
                                className="w-20 h-7 border border-emerald-200 rounded-lg px-2 text-sm bg-white outline-none text-center"
                                value={sellQty}
                                onChange={(e) => setSellQty(e.target.value)}
                              />
                              <span className="text-xs text-emerald-700">/ {effectiveQty} tấm</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="flex-1 h-9 rounded-lg text-sm font-semibold text-white bg-emerald-600 disabled:bg-emerald-300"
                                disabled={(() => {
                                  const v = Number(sellQty);
                                  return !v || v <= 0 || v > effectiveQty;
                                })()}
                                onClick={() => {
                                  const v = round2(Number(sellQty));
                                  if (!v || v <= 0 || v > effectiveQty) return;
                                  sellCartStore.add({ locId: loc.id, qty: v });
                                  setSellingLocId(null);
                                  setSellQty("");
                                }}
                              >
                                Thêm vào giỏ bán
                              </button>
                              <button
                                className="flex-1 h-9 rounded-lg text-sm border border-gray-200 text-gray-600"
                                onClick={() => { setSellingLocId(null); setSellQty(""); }}
                              >
                                Huỷ
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Inline move UI */}
                        {isMoving && (
                          <div className="space-y-2">
                            {/* <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500 shrink-0">Số lượng chuyển:</label>
                              <input
                                type="number"
                                min={1}
                                max={loc.quantity}
                                className="w-16 h-6 border border-blue-200 rounded-lg px-2 text-sm bg-white outline-none text-center"
                                value={moveQty}
                                onChange={(e) => handleMoveQtyChange(e.target.value, loc.quantity)}
                              />
                              <span className="text-xs text-gray-400">/ {loc.quantity} tấm</span>
                            </div> */}
                            {/* Garden + Floor selects */}
                            <div className="flex gap-2">
                              <select
                                className="flex-1 h-8 rounded-xl border border-gray-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 appearance-none cursor-pointer"
                                value={moveTargetGardenId}
                                onChange={(e) => {
                                  setMoveTargetGardenId(e.target.value);
                                  setMoveTargetFloor("");
                                  setMoveTargetPlatformId("");
                                }}
                              >
                                <option value="">— Chọn vườn —</option>
                                {(gardens ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                              <select
                                className="flex-1 h-8 rounded-xl border border-gray-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 appearance-none cursor-pointer disabled:opacity-40"
                                value={moveTargetFloor === "" ? "" : String(moveTargetFloor)}
                                disabled={!moveTargetGardenId}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? "" : Number(e.target.value);
                                  setMoveTargetFloor(val);
                                  setMoveTargetPlatformId("");
                                  if (val !== "") setShowPlatformGridModal(true);
                                }}
                              >
                                <option value="">— Tầng —</option>
                                {Array.from(new Set(
                                  (platforms ?? [])
                                    .filter((p) => p.garden_id === moveTargetGardenId && p.id !== platformId)
                                    .map((p) => p.floor)
                                )).sort((a, b) => a - b).map((f) => (
                                  <option key={f} value={f}>Tầng {f}</option>
                                ))}
                              </select>
                            </div>

                            {/* Sàn đã chọn + trigger mở modal */}
                            {moveTargetGardenId && moveTargetFloor !== "" && (
                              <button
                                type="button"
                                className={`w-full h-9 rounded-xl border text-sm px-3 flex items-center justify-between transition-colors ${
                                  moveTargetPlatformId
                                    ? "border-blue-400 bg-blue-50 text-blue-700"
                                    : "border-gray-200 bg-white text-gray-400 hover:border-blue-300"
                                }`}
                                onClick={() => setShowPlatformGridModal(true)}
                              >
                                <span className="font-medium">
                                  {moveTargetPlatformId
                                    ? (() => {
                                        const p = platforms?.find((pl) => pl.id === moveTargetPlatformId);
                                        return p ? `${p.name} (còn ${round2(p.capacity - (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0))} chỗ)` : "— Chọn sàn —";
                                      })()
                                    : "— Chọn sàn —"}
                                </span>
                                <span className="text-[11px] text-gray-400">Xem sơ đồ →</span>
                              </button>
                            )}

                            <div className="flex gap-2">
                              <button
                                className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                                style={{ backgroundColor: moveTargetPlatformId ? "#2563eb" : "#93c5fd" }}
                                disabled={!moveTargetPlatformId}
                                onClick={() => {
                                  const target = platforms?.find((pl) => pl.id === moveTargetPlatformId);
                                  const g = gardens?.find((gl) => gl.id === target?.garden_id);
                                  const targetLabel = target ? `${g ? g.name + " " : ""}Tầng ${target.floor} ${target.name}` : "";
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
                                onClick={() => {
                                  setMovingLocId(null);
                                  setMoveTargetPlatformId("");
                                  setMoveTargetGardenId("");
                                  setMoveTargetFloor("");
                                  setShowPlatformGridModal(false);
                                }}
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
        
      <PlatformGridModal
        open={showPlatformGridModal && movingLocId !== null}
        onClose={() => setShowPlatformGridModal(false)}
        platforms={platforms}
        locations={locations}
        gardens={gardens}
        moveTargetGardenId={moveTargetGardenId}
        moveTargetFloor={moveTargetFloor}
        excludePlatformId={platformId}
        moveQty={moveQty}
        maxMoveQty={movingLocId ? ((locations ?? []).find((l) => l.id === movingLocId)?.quantity ?? 0) : 0}
        onMoveQtyChange={(value) => {
          const maxQty = movingLocId ? ((locations ?? []).find((l) => l.id === movingLocId)?.quantity ?? 0) : 0;
          handleMoveQtyChange(value, maxQty);
        }}
        neededQty={round2(Number(moveQty) || (movingLocId ? ((locations ?? []).find((l) => l.id === movingLocId)?.quantity ?? 0) : 0))}
        moveTargetPlatformId={moveTargetPlatformId}
        onSelectPlatform={(pid) => {
          const selecting = moveTargetPlatformId !== pid;
          setMoveTargetPlatformId(selecting ? pid : "");
          if (selecting) setShowPlatformGridModal(false);
        }}
        zIndex={zIndex + 10}
      />
      </div>


      {confirmModal}
    </>
  );
}
