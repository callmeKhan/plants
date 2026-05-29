"use client";

import { useState, useCallback, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useData, type PlantLocation } from "@/lib/data";
import { v4 as uuidv4 } from "uuid";
import { round2 } from "@/lib/number";
import { useSellCart, sellCartStore } from "@/lib/sell-cart";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Toast } from "@/components/ui/toast";
import {
  X, Pencil, Check, Package, Leaf, Plus, Trash2,
  DollarSign, GripVertical, ListOrdered,
} from "lucide-react";
import { PlatformGridModal } from "@/components/platform-grid-modal";
import { PlantImage } from "@/components/plant-image";

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function syncLocationOrder(draftOrder: string[], currentOrder: string[]) {
  const currentIds = new Set(currentOrder);
  const keptDraftIds = draftOrder.filter((id) => currentIds.has(id));
  const missingIds = currentOrder.filter((id) => !keptDraftIds.includes(id));
  return [...keptDraftIds, ...missingIds];
}

type SortableBatchShellRenderArgs = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef" | "isDragging"
>;

function SortableBatchShell({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  children: (args: SortableBatchShellRenderArgs) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : undefined,
    touchAction: disabled ? undefined : "pan-y",
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners, setActivatorNodeRef, isDragging })}
    </div>
  );
}

interface PlatformDetailSheetProps {
  platformId: string;
  onClose: () => void;
  onShowPlantDetail?: (plantId: string, batchId?: string, label?: string) => void;
  highlightBatchId?: string;
  breadcrumb?: string[];
  zIndex?: number;
}

export function PlatformDetailSheet({ platformId, onClose, onShowPlantDetail, highlightBatchId, breadcrumb, zIndex = 50 }: PlatformDetailSheetProps) {
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

  // Reorder batches
  const [isReordering, setIsReordering] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const { platforms, gardens, plants, locationsByPlatform, locationsById, mutate, refresh } = useData();

  const detailPlatform = platforms.find((p) => p.id === platformId);
  const platformLocs = useMemo(() => locationsByPlatform.get(platformId) ?? [], [locationsByPlatform, platformId]);
  const platformLocIds = useMemo(() => platformLocs.map((loc) => loc.id), [platformLocs]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const activeOrder = useMemo(
    () => isReordering ? syncLocationOrder(draftOrder, platformLocIds) : platformLocIds,
    [draftOrder, isReordering, platformLocIds]
  );

  const orderedPlatformLocs = useMemo(() => {
    if (!isReordering) return platformLocs;

    const locsById = new Map(platformLocs.map((loc) => [loc.id, loc]));
    return activeOrder
      .map((id) => locsById.get(id))
      .filter((loc): loc is PlantLocation => Boolean(loc));
  }, [activeOrder, isReordering, platformLocs]);

  if (!detailPlatform) return null;

  const garden = gardens?.find((g) => g.id === detailPlatform.garden_id);
  const used = platformLocs.reduce((s, l) => s + l.quantity, 0);
  const free = round2(detailPlatform.capacity - used);
  const pct = detailPlatform.capacity > 0 ? Math.round((used / detailPlatform.capacity) * 100) : 0;

  function moveTargetFloorsForGarden(gardenId: string) {
    if (!gardenId) return [];
    return Array.from(new Set(
      platforms
        .filter((p) => p.garden_id === gardenId && p.id !== platformId)
        .map((p) => p.floor)
    )).sort((a, b) => a - b);
  }

  const moveTargetFloors = moveTargetFloorsForGarden(moveTargetGardenId);

  async function handleUpdatePlatformName() {
    if (!newPlatformName.trim() || !detailPlatform) return;
    const exists = platforms?.some(
      (x) => x.id !== platformId && x.garden_id === detailPlatform.garden_id && x.floor === detailPlatform.floor && x.name.trim().toLowerCase() === newPlatformName.trim().toLowerCase()
    );
    if (exists) {
      setToast({ text: "Tên sàn đã tồn tại ở tầng này!", type: "error" });
      return;
    }
    try {
      const res = await fetch(`/api/platforms?id=${platformId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...detailPlatform, name: newPlatformName.trim() }),
      });
      if (res.ok) { mutate.upsertPlatform(await res.json()); setEditingPlatformName(false); }
      else setToast({ text: "Lỗi cập nhật tên sàn", type: "error" });
    } catch {
      setToast({ text: "Lỗi kết nối", type: "error" });
    }
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
    try {
      const res = await fetch(`/api/platforms?id=${platformId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...detailPlatform, capacity: val }),
      });
      if (res.ok) { mutate.upsertPlatform(await res.json()); setEditingCapacity(false); }
      else setToast({ text: "Lỗi cập nhật sức chứa", type: "error" });
    } catch {
      setToast({ text: "Lỗi kết nối", type: "error" });
    }
  }

  async function doMoveBatch(locId: string) {
    if (!moveTargetPlatformId) return;
    if (!detailPlatform) return;
    const loc = locationsById.get(locId)
    if (!loc) return;
    const targetPlatform = platforms?.find((p) => p.id === moveTargetPlatformId);
    if (!targetPlatform) return;

    const qty = round2(Number(moveQty) || loc.quantity);

    const targetLocs = locationsByPlatform.get(moveTargetPlatformId) ?? [];
    const usedOnTarget = targetLocs.filter(l => l.id !== locId).reduce((s, l) => s + l.quantity, 0);
    const freeOnTarget = round2(targetPlatform.capacity - usedOnTarget);

    if (qty > freeOnTarget) {
      setToast({
        text: `Không đủ chỗ: cần ${qty} tấm nhưng sàn chỉ còn ${freeOnTarget}`,
        type: "error",
      });
      return;
    }

    // Check if destination has a matching batch
    const matchingBatch = targetLocs.find((l) =>
      l.id !== locId &&
      l.plant_id === loc.plant_id &&
      l.pot_size === loc.pot_size &&
      l.planted_date === loc.planted_date &&
      (l.price ?? null) === (loc.price ?? null) &&
      (l.status ?? null) === (loc.status ?? null)
    );

    try {
      if (matchingBatch) {
        const mergedQty = round2(matchingBatch.quantity + qty);
        const mergeRes = await fetch(`/api/plant-locations?id=${matchingBatch.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...matchingBatch, quantity: mergedQty }),
        });
        if (mergeRes.ok) mutate.upsertLocation(await mergeRes.json());

        if (qty === loc.quantity) {
          const delRes = await fetch(`/api/plant-locations?id=${locId}`, { method: "DELETE" });
          if (delRes.ok) mutate.removeLocation(locId);
        } else {
          const newOrigQty = round2(loc.quantity - qty);
          const origRes = await fetch(`/api/plant-locations?id=${locId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...loc, quantity: newOrigQty }),
          });
          if (origRes.ok) mutate.upsertLocation(await origRes.json());
        }
      } else if (qty === loc.quantity) {
        const moveRes = await fetch(`/api/plant-locations?id=${locId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...loc, platform_id: moveTargetPlatformId }),
        });
        if (moveRes.ok) mutate.upsertLocation(await moveRes.json());
      } else {
        const newOrigQty = round2(loc.quantity - qty);
        const origRes = await fetch(`/api/plant-locations?id=${locId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...loc, quantity: newOrigQty }),
        });
        if (origRes.ok) mutate.upsertLocation(await origRes.json());
        const newLoc = {
          id: uuidv4(), plant_id: loc.plant_id, platform_id: moveTargetPlatformId,
          quantity: qty, pot_size: loc.pot_size, planted_date: loc.planted_date,
          ...(loc.price != null ? { price: loc.price } : {}),
          ...(loc.status ? { status: loc.status } : {}),
        };
        const newRes = await fetch("/api/plant-locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLoc),
        });
        if (newRes.ok) mutate.upsertLocation(await newRes.json());
      }
    } catch {
      await refresh("locations");
      setToast({ text: "Lỗi kết nối", type: "error" });
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
    const moveRecord = {
      qty,
      src: { gardenName: srcGarden?.name ?? "", floor: detailPlatform.floor, platformName: detailPlatform.name },
      dst: { gardenName: dstGarden?.name ?? "", floor: targetPlatform.floor, platformName: targetPlatform.name },
    };
    setToast({ text: `Đã chuyển ${moveRecord.qty} cây từ ${srcLabel} → ${dstLabel}${mergeNote}`, type: "success" });
  }

  async function doDeleteBatch(locId: string) {
    const loc = locationsById.get(locId);
    if (!loc) return;
    try {
      const delRes = await fetch(`/api/plant-locations?id=${locId}`, { method: "DELETE" });
      if (delRes.ok) mutate.removeLocation(locId);
      const plant = plants.find((p) => p.id === loc.plant_id);
      if (plant) {
        const newTotal = Math.max(0, round2(plant.total_quantity - loc.quantity));
        const res = await fetch(`/api/plants?id=${loc.plant_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...plant, total_quantity: newTotal }),
        });
        if (res.ok) mutate.upsertPlant(await res.json());
      }
    } catch {
      await refresh("plants", "locations");
      setToast({ text: "Lỗi kết nối", type: "error" });
      return;
    }
    setToast({ text: "Đã xoá đợt khỏi sàn", type: "success" });
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
      targetPlatform.capacity - (locationsByPlatform.get(targetPlatform.id) ?? []).reduce((s, l) => s + l.quantity, 0)
    );

    if (freeSlots < requiredQty) {
      setMoveTargetPlatformId("");
    }
  }

  async function saveBatchOrder() {
    setSavingOrder(true);
    try {
      const res = await fetch("/api/plant-locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform_id: platformId, ordered_ids: activeOrder }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save order");
      }

      const updatedLocations = await res.json() as PlantLocation[];
      updatedLocations.forEach((loc) => mutate.upsertLocation(loc));
      setDraftOrder(updatedLocations.map((loc) => loc.id));
      setIsReordering(false);
      setToast({ text: "Đã lưu thứ tự đợt trồng", type: "success" });
    } catch {
      await refresh("locations");
      setToast({ text: "Lỗi lưu thứ tự đợt trồng", type: "error" });
    } finally {
      setSavingOrder(false);
    }
  }

  function handleToggleReorder() {
    if (!detailPlatform) return;
    if (savingOrder) return;

    if (!isReordering) {
      setSellingLocId(null);
      setSellQty("");
      setMovingLocId(null);
      setMoveTargetPlatformId("");
      setMoveQty("");
      setMoveTargetGardenId("");
      setMoveTargetFloor("");
      setShowPlatformGridModal(false);
      setDraftOrder(platformLocIds);
      setIsReordering(true);
      return;
    }

    if (sameStringArray(activeOrder, platformLocIds)) {
      setIsReordering(false);
      return;
    }

    openConfirm(
      `Lưu thứ tự ${activeOrder.length} đợt trồng trên sàn "${detailPlatform.name}"?`,
      () => { void saveBatchOrder(); }
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDraftOrder((currentOrder) => {
      const syncedOrder = syncLocationOrder(currentOrder, platformLocIds);
      const oldIndex = syncedOrder.indexOf(String(active.id));
      const newIndex = syncedOrder.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return currentOrder;
      return arrayMove(syncedOrder, oldIndex, newIndex);
    });
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
                {breadcrumb && breadcrumb.length > 0 && (
                  <div className="flex flex-col text-xs text-gray-400 mb-2">
                    {breadcrumb.map((label, i) => (
                      <div key={i} className="flex items-center gap-1 leading-snug" style={{ paddingLeft: `${i * 10}px` }}>
                        {i == 0 && "──"}
                        {i > 0 && "└─"}
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </div>
                )}
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
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className={`w-10 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isReordering
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:text-gray-700"
                  } disabled:opacity-40 disabled:hover:text-gray-500`}
                  onClick={handleToggleReorder}
                  disabled={savingOrder || (!isReordering && platformLocs.length < 2)}
                  aria-pressed={isReordering}
                  aria-label={isReordering ? "Lưu thứ tự đợt trồng" : "Sắp xếp đợt trồng"}
                  title={isReordering ? "Lưu thứ tự đợt trồng" : "Sắp xếp đợt trồng"}
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  className="w-12 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                  onClick={handleClose}
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={orderedPlatformLocs.map((loc) => loc.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {orderedPlatformLocs.map((loc) => {
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
                        const statusIcon = loc.status === "trồng lại" || loc.status === "sang chậu"
                          ? mapStatusIcons[loc.status]
                          : null;
                        return (
                          <SortableBatchShell
                            key={loc.id}
                            id={loc.id}
                            disabled={!isReordering}
                            className={`relative rounded-xl py-2.5 space-y-2 ${isReordering ? "min-h-[48px] w-[75%] px-3 bg-white shadow-sm" : "pl-3 pr-0 transition-colors duration-200"} ${loc.id === highlightBatchId ? "border-2 border-green-200" : "border border-transparent"} ${fullySold ? "opacity-40" : ""}`}
                          >
                            {({ attributes, listeners, setActivatorNodeRef, isDragging }) => (
                              <>
                        <div className="flex items-center gap-3">
                          <div className="relative w-10 h-10 shrink-0">
                            <div className="relative w-full h-full rounded-xl overflow-hidden bg-emerald-50">
                              <PlantImage src={plant?.image_url} alt={plant?.name ?? ""} sizes="40px" />
                            </div>
                            {statusIcon && (
                              <div
                                className="absolute -bottom-1 -left-1 z-10 rounded-lg w-5 h-5 flex border border-white items-center justify-center shadow-sm"
                                style={{ backgroundColor: statusIcon.bg_color }}
                              >
                                <span className="text-xs font-semibold leading-none">
                                  {statusIcon.text}
                                </span>
                              </div>
                            )}
                          </div>
                          <div
                            className={`flex-1 min-w-0 ${isReordering ? "cursor-default" : "cursor-pointer"}`}
                            onClick={() => {
                              if (!isReordering) onShowPlantDetail?.(loc.plant_id, loc.id, plant?.name ?? loc.plant_id);
                            }}
                          >
                            <p className="font-semibold text-gray-900 text-sm truncate">{plant?.name ?? loc.plant_id}</p>
                            {isReordering ? (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {inCartQty > 0 ? `${effectiveQty}/${loc.quantity}` : loc.quantity} tấm · chậu {loc.pot_size}
                              </p>
                            ) : (
                              <div className="flex justify-start items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                <span style={{ width: "65px" }}>
                                  {inCartQty > 0 ? `${effectiveQty}/${loc.quantity}` : loc.quantity} tấm
                                </span>
                                <span style={{ width: "65px" }}>chậu {loc.pot_size}</span>
                                <span>{fmtDate(loc.planted_date)}</span>
                              </div>
                            )}
                          </div>
                          {isReordering && (
                            <button
                              type="button"
                              ref={setActivatorNodeRef}
                              {...attributes}
                              {...listeners}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 touch-none ${
                                isDragging ? "cursor-grabbing bg-blue-50 text-blue-600" : "cursor-grab bg-gray-50 text-gray-400"
                              }`}
                              aria-label="Kéo để đổi vị trí"
                            >
                              <GripVertical className="w-4 h-4" />
                            </button>
                          )}
                          {!isReordering && (
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
                          )}
                        </div>

                        {/* Inline sell UI */}
                        {!isReordering && isSelling && (
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
                        {!isReordering && isMoving && (
                          <div className="space-y-2">
                            {/* Garden + Floor selects */}
                            <div className="flex gap-2">
                              <select
                                className="flex-1 h-8 rounded-xl border border-gray-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 appearance-none cursor-pointer"
                                value={moveTargetGardenId}
                                onChange={(e) => {
                                  const nextGardenId = e.target.value;
                                  const nextFloors = moveTargetFloorsForGarden(nextGardenId);
                                  const nextFloor = nextFloors.length === 1 ? nextFloors[0] : "";
                                  setMoveTargetGardenId(nextGardenId);
                                  setMoveTargetFloor(nextFloor);
                                  setMoveTargetPlatformId("");
                                  setShowPlatformGridModal(nextGardenId !== "" && nextFloor !== "");
                                }}
                              >
                                <option value="">— Chọn vườn —</option>
                                {[...(gardens ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
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
                                {moveTargetFloors.map((f) => (
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
                                        return p ? `${p.name} (còn ${round2(p.capacity - (locationsByPlatform.get(p.id) ?? []).reduce((s, l) => s + l.quantity, 0))} chỗ)` : "— Chọn sàn —";
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
                              </>
                            )}
                          </SortableBatchShell>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

      <PlatformGridModal
        locationsByPlatform={locationsByPlatform}
        open={showPlatformGridModal && movingLocId !== null}
        onClose={() => setShowPlatformGridModal(false)}
        platforms={platforms}
        gardens={gardens}
        moveTargetGardenId={moveTargetGardenId}
        moveTargetFloor={moveTargetFloor}
        excludePlatformId={platformId}
        moveQty={moveQty}
        maxMoveQty={movingLocId ? (locationsById.get(movingLocId)?.quantity ?? 0) : 0}
        onMoveQtyChange={(value) => {
          const maxQty = movingLocId ? (locationsById.get(movingLocId)?.quantity ?? 0) : 0;
          handleMoveQtyChange(value, maxQty);
        }}
        neededQty={round2(Number(moveQty) || (movingLocId ? (locationsById.get(movingLocId)?.quantity ?? 0) : 0))}
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
