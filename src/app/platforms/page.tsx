"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trees, LayoutGrid, Trash2, Plus, ChevronDown, X, Package, Calendar, Leaf, Pencil, Search, Check } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PlantDetailSheet } from "@/components/plant-detail-sheet";
import { Collapse } from "@/components/ui/collapse";


const PLACEHOLDER_IMAGE = "/plant-placeholder.png";
function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function PlatformsPage() {
  return (
    <Suspense>
      <PlatformsPageInner />
    </Suspense>
  );
}

function PlatformsPageInner() {
  const searchParams = useSearchParams();

  const [gardenName, setGardenName] = useState("");
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [openGarden, setOpenGarden] = useState(false);

  const [gardenId, setGardenId] = useState("");
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [openPlatform, setOpenPlatform] = useState(false);

  const [openConfirm, confirmModal] = useConfirm();
  const [detailPlatformId, setDetailPlatformId] = useState<string | null>(searchParams.get("detail"));
  const [closingSheet, setClosingSheet] = useState(false);
  const [detailPlantIdFromPlatform, setDetailPlantIdFromPlatform] = useState<string | null>(null);

  const handleCloseSheet = useCallback(() => {
    setClosingSheet(true);
  }, []);
  const handleSheetAnimEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName === "sheetSlideDown") {
      setClosingSheet(false);
      setDetailPlatformId(null);
      setEditingPlatformName(false);
      setEditingCapacity(false);
    }
  }, []);

  const [editingPlatformName, setEditingPlatformName] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");

  const [editingCapacity, setEditingCapacity] = useState(false);
  const [newCapacity, setNewCapacity] = useState("");

  useEffect(() => {
    document.body.style.overflow = detailPlatformId ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [detailPlatformId]);

  async function handleUpdatePlatformName() {
    if (!detailPlatformId || !newPlatformName.trim()) return;
    const p = platforms?.find((x) => x.id === detailPlatformId);
    if (!p) return;

    const exists = platforms?.some(x => x.id !== detailPlatformId && x.garden_id === p.garden_id && x.floor === p.floor && x.name.trim().toLowerCase() === newPlatformName.trim().toLowerCase());
    if (exists) {
      setToast({ text: "Tên sàn đã tồn tại ở tầng này!", type: "error" });
      return;
    }

    const updated = { ...p, name: newPlatformName.trim() };
    await db.platforms.update(detailPlatformId, { name: newPlatformName.trim() });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "platform",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingPlatformName(false);
    processQueue().catch(console.error);
  }

  async function handleUpdateCapacity() {
    if (!detailPlatformId) return;
    const val = Number(newCapacity);
    if (isNaN(val) || val < 0) { setToast({ text: "Sức chứa không hợp lệ", type: "error" }); return; }
    const p = platforms?.find((x) => x.id === detailPlatformId);
    if (!p) return;
    const currentUsed = (locations ?? [])
      .filter((l) => l.platform_id === detailPlatformId)
      .reduce((s, l) => s + l.quantity, 0);
    if (val < currentUsed) {
      setToast({ text: `Sức chứa không được nhỏ hơn số cây hiện có (${currentUsed} tấm)`, type: "error" });
      return;
    }
    const updated = { ...p, capacity: val };
    await db.platforms.update(detailPlatformId, { capacity: val });
    await db.syncQueue.add({
      id: uuidv4(), type: "UPDATE", entity: "platform",
      payload: updated as Record<string, unknown>,
      status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setEditingCapacity(false);
    processQueue().catch(console.error);
  }

  // Move batch state
  const [movingLocId, setMovingLocId] = useState<string | null>(null);
  const [moveTargetPlatformId, setMoveTargetPlatformId] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [movePlatformSearch, setMovePlatformSearch] = useState("");
  const [showMovePlatformDropdown, setShowMovePlatformDropdown] = useState(false);

  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  const toggleFloor = (gardenId: string, floorNum: number) => {
    const key = `${gardenId}-${floorNum}`;
    setExpandedFloors(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);
  const plants = useLiveQuery(() => db.plants.toArray(), [], []);

  async function handleAddGarden(e: React.FormEvent) {
    e.preventDefault();
    if (!gardenName) { setToast({ text: "Tên vườn là bắt buộc", type: "error" }); return; }
    const garden = { id: uuidv4(), name: gardenName };
    await db.gardens.add(garden);
    await db.syncQueue.add({
      id: uuidv4(), type: "CREATE", entity: "garden",
      payload: garden, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setGardenName("");
    setToast({ text: `Đã thêm vườn: ${garden.name}`, type: "success" });
    setTimeout(() => setToast(null), 3000);
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
          payload: { id: loc.id }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
      await db.platforms.delete(p.id);
      await db.syncQueue.add({
        id: uuidv4(), type: "DELETE", entity: "platform",
        payload: { id: p.id }, status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
    await db.gardens.delete(id);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "garden",
      payload: { id }, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    for (const plantId of deletedPlantIds) {
      const remaining = await db.plantLocations.where("plant_id").equals(plantId).count();
      if (remaining === 0) {
        await db.plants.delete(plantId);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant",
          payload: { id: plantId }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
    }
    setToast({ text: "Đã xoá vườn", type: "success" });
    processQueue().catch(console.error);
  }

  function handleDeleteGarden(id: string, gardenName: string) {
    const gardenPlatformIds = (platforms ?? []).filter((p) => p.garden_id === id).map((p) => p.id);
    const plantCount = (locations ?? [])
      .filter((l) => gardenPlatformIds.includes(l.platform_id))
      .reduce((s, l) => s + l.quantity, 0);
    openConfirm(
      `Xoá vườn "${gardenName}"?\nHiện có ${plantCount} tấm đang được trồng trong vườn này.`,
      () => doDeleteGarden(id)
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!gardenId || !floor || !name || !capacity) {
      setToast({ text: "Vườn, tầng, tên và sức chứa là bắt buộc", type: "error" });
      return;
    }

    const exists = platforms?.some(p => p.garden_id === gardenId && p.floor === Number(floor) && p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      setToast({ text: "Tên sàn đã tồn tại ở tầng này!", type: "error" });
      return;
    }

    const platform = {
      id: uuidv4(), garden_id: gardenId, floor: Number(floor),
      name, capacity: Number(capacity),
    };
    await db.platforms.add(platform);
    await db.syncQueue.add({
      id: uuidv4(), type: "CREATE", entity: "platform",
      payload: platform, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    setFloor(""); setName(""); setCapacity("");
    setToast({ text: `Đã thêm sàn: ${platform.name}`, type: "success" });
    setTimeout(() => setToast(null), 3000);
    processQueue().catch(console.error);
  }

  async function doDeletePlatform(id: string) {
    const locs = await db.plantLocations.where("platform_id").equals(id).toArray();
    const deletedPlantIds = new Set(locs.map((l) => l.plant_id));
    for (const loc of locs) {
      await db.plantLocations.delete(loc.id);
      await db.syncQueue.add({
        id: uuidv4(), type: "DELETE", entity: "plant_location",
        payload: { id: loc.id }, status: "pending", retry_count: 0, created_at: Date.now(),
      });
    }
    await db.platforms.delete(id);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "platform",
      payload: { id }, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    for (const plantId of deletedPlantIds) {
      const remaining = await db.plantLocations.where("plant_id").equals(plantId).count();
      if (remaining === 0) {
        await db.plants.delete(plantId);
        await db.syncQueue.add({
          id: uuidv4(), type: "DELETE", entity: "plant",
          payload: { id: plantId }, status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }
    }
    setToast({ text: "Đã xoá sàn", type: "success" });
    processQueue().catch(console.error);
  }

  function handleDelete(id: string, platformName: string) {
    const plantCount = (locations ?? [])
      .filter((l) => l.platform_id === id)
      .reduce((s, l) => s + l.quantity, 0);
    openConfirm(
      `Xoá sàn "${platformName}"?\nHiện có ${plantCount} tấm đang được trồng trên sàn này.`,
      () => doDeletePlatform(id)
    );
  }

  async function doMoveBatch(locId: string) {
    if (!moveTargetPlatformId) return;
    const loc = (locations ?? []).find((l) => l.id === locId);
    if (!loc) return;
    const targetPlatform = platforms?.find((p) => p.id === moveTargetPlatformId);
    if (!targetPlatform) return;

    const qty = Number(moveQty) || loc.quantity;

    const usedOnTarget = (locations ?? [])
      .filter((l) => l.platform_id === moveTargetPlatformId && l.id !== locId)
      .reduce((s, l) => s + l.quantity, 0);
    const freeOnTarget = parseFloat((targetPlatform.capacity - usedOnTarget).toFixed(2));

    if (qty > freeOnTarget) {
      setToast({
        text: `Không đủ chỗ: cần ${qty} tấm nhưng sàn chỉ còn ${freeOnTarget}`,
        type: "error",
      });
      return;
    }

    if (qty === loc.quantity) {
      // Chuyển toàn bộ: đổi platform_id bậch gốc
      await db.plantLocations.update(locId, { platform_id: moveTargetPlatformId });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant_location",
        payload: { ...loc, platform_id: moveTargetPlatformId } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
    } else {
      // Chuyển một phần: giảm qty bậch gốc + tạo bậch mới ở đích
      const newOrigQty = loc.quantity - qty;
      await db.plantLocations.update(locId, { quantity: newOrigQty });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant_location",
        payload: { ...loc, quantity: newOrigQty } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });
      const newLoc = {
        id: uuidv4(), plant_id: loc.plant_id, platform_id: moveTargetPlatformId,
        quantity: qty, pot_size: loc.pot_size, planted_date: loc.planted_date,
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
    setToast({ text: `Đã chuyển ${qty} tấm thành công!`, type: "success" });
    processQueue().catch(console.error);
  }

  async function doDeleteBatchFromPlatform(locId: string) {
    const loc = (locations ?? []).find((l) => l.id === locId);
    if (!loc) return;
    await db.plantLocations.delete(locId);
    await db.syncQueue.add({
      id: uuidv4(), type: "DELETE", entity: "plant_location",
      payload: { id: locId }, status: "pending", retry_count: 0, created_at: Date.now(),
    });
    const plant = await db.plants.get(loc.plant_id);
    if (plant) {
      const newTotal = Math.max(0, plant.total_quantity - loc.quantity);
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
    <div className="max-w-lg mx-auto space-y-5">

      {/* ── VƯỜN ── */}
      <div>
        <button
          onClick={() => setOpenGarden((v) => !v)}
          className="w-full flex items-center gap-3 pt-1 mb-3 text-left"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ backgroundColor: "#16a34a" }}>
            <Trees className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Vườn</h1>
            <p className="text-xs text-gray-400">Quản lý danh sách vườn</p>
          </div>
          <ChevronDown
            className="w-5 h-5 text-gray-400 transition-transform duration-200"
            style={{ transform: openGarden ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        <Collapse open={openGarden}>
            <form onSubmit={handleAddGarden} className="flex gap-2 mb-3">
              <Input
                placeholder="🌳 Tên vườn mới"
                value={gardenName}
                onChange={(e) => setGardenName(e.target.value)}
                className="flex-1"
              />
              <button
                type="submit"
                className="justify-center w-1/4 h-8 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-1 shrink-0 hover:opacity-90 active:scale-[0.97] transition-all"
                style={{ backgroundColor: "#059669" }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {(gardens?.length ?? 0) > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {gardens?.map((g) => {
                  const gardenPlatformIds = (platforms ?? []).filter((p) => p.garden_id === g.id).map((p) => p.id);
                  const plantCount = (locations ?? [])
                    .filter((l) => gardenPlatformIds.includes(l.platform_id))
                    .reduce((s, l) => s + l.quantity, 0);
                  const platformCount = gardenPlatformIds.length;
                  return (
                    <Card key={g.id} className="shrink-0">
                      <CardContent className="py-2 px-3 flex items-center gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm whitespace-nowrap">{g.name}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            <Badge variant="secondary">{platformCount} sàn</Badge>
                            <Badge variant="default">{plantCount} tấm</Badge>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteGarden(g.id, g.name)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
        </Collapse>
      </div>

      {/* ── SÀN ── */}
      <div>
        <button
          onClick={() => setOpenPlatform((v) => !v)}
          className="w-full flex items-center gap-3 mb-3 text-left"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ backgroundColor: "#2563eb" }}>
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Sàn</h2>
            <p className="text-xs text-gray-400">Thêm sàn trồng vào vườn</p>
          </div>
          <ChevronDown
            className="w-5 h-5 text-gray-400 transition-transform duration-200"
            style={{ transform: openPlatform ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        <Collapse open={openPlatform}>
          <Card className="mb-1">
            <CardContent className="pt-4">
              <form onSubmit={handleAdd} className="space-y-3">
                <div className="flex gap-2">
                  <Select
                    value={gardenId}
                    onChange={(e) => setGardenId(e.target.value)}
                  >
                    <option value="">🌳 Chọn vườn</option>
                    {gardens?.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                  <Input
                    className="w-[65px] h-10"
                    placeholder="Tầng"
                    type="number"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                  />
                  <Input
                    className="w-[120px] h-10"
                    placeholder="📦 Sức chứa"
                    type="number"
                    min={0}
                    step="any"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    className="w-2/3"
                    placeholder="Tên sàn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="w-1/3 rounded-xl text-white text-base font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                    style={{ backgroundColor: "#2563eb" }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </Collapse>

        {/* Platform list by garden */}
        {(platforms?.length ?? 0) > 0 && (
          <div className="space-y-4 mt-3">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              Danh sách sàn
              <Badge variant="secondary">{platforms?.length ?? 0}</Badge>
            </p>
            {/* garden sort by name */}
            {gardens?.sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
              const gardenPlatforms = platforms?.filter((p) => p.garden_id === g.id) || [];
              if (gardenPlatforms.length === 0) return null;
              const floors = [...new Set(gardenPlatforms.map((p) => p.floor))].sort((a, b) => a - b);
              return (
                <div key={g.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                    <span className="font-bold text-gray-800 text-sm">{g.name}</span>
                  </div>
                  {floors.map((floorNum) => {
                    const floorPlatforms = gardenPlatforms.filter((p) => p.floor === floorNum);
                    const floorKey = `${g.id}-${floorNum}`;
                    const isExpanded = expandedFloors[floorKey];
                    return (
                      <div key={floorNum} className="pl-4 border-l-2 border-gray-100 space-y-1.5 mb-4">
                        <button
                          onClick={() => toggleFloor(g.id, floorNum)}
                          className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 w-full text-left"
                        >
                          <ChevronDown
                            className="w-3.5 h-3.5 transition-transform"
                            style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                          />
                          Tầng {floorNum}
                          <Badge variant="secondary" className="h-4">{floorPlatforms.length}</Badge>
                        </button>
                        <Collapse open={!!isExpanded}>
                          <div className="flex gap-3 items-start">
                            {[
                              { prefix: 'T', items: floorPlatforms.filter(p => p.name.toUpperCase().startsWith('T')) },
                              { prefix: 'P', items: floorPlatforms.filter(p => p.name.toUpperCase().startsWith('P')) },
                              { prefix: 'Khác', items: floorPlatforms.filter(p => !p.name.toUpperCase().startsWith('T') && !p.name.toUpperCase().startsWith('P')) }
                            ].filter(col => col.items.length > 0)
                            .map((col) => (
                              <div key={col.prefix} className="flex-1 min-w-0 space-y-1.5">
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">{col.prefix === 'T' ? "Trái" : "Phải"}</h3>
                                {col.items
                                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                                  .map((p) => {
                                    const used = (locations ?? [])
                                      .filter((l) => l.platform_id === p.id)
                                      .reduce((s, l) => s + l.quantity, 0);
                                    const free = parseFloat((p.capacity - used).toFixed(2));
                                    const pct = p.capacity > 0 ? Math.round((used / p.capacity) * 100) : 0;
                                    return (
                                      <div
                                        key={p.id}
                                        className="w-full text-left cursor-pointer"
                                        onClick={() => setDetailPlatformId(p.id)}
                                      >
                                        <Card className="hover:shadow-md hover:border-blue-200 transition-all duration-200 active:scale-[0.99]">
                                          <CardContent className="py-2.5 px-3">
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="font-semibold text-gray-900 text-sm truncate mr-1">{p.name}</span>
                                              <div className="flex items-center gap-1 shrink-0">
                                                <Badge variant={free === 0 ? "warning" : "secondary"} className="text-[10px] px-1.5 py-0 h-5">
                                                  {parseFloat(free.toFixed(2))}/{p.capacity}
                                                </Badge>
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                                                  className="w-6 h-6 rounded-md flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                            {/* Capacity bar */}
                                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                              <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                  width: `${pct}%`,
                                                  backgroundColor: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981",
                                                }}
                                              />
                                            </div>
                                          </CardContent>
                                        </Card>
                                      </div>
                                    );
                                  })}
                              </div>
                            ))}
                          </div>
                        </Collapse>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Orphaned platforms */}
            {(() => {
              const orphaned = platforms?.filter((p) => !gardens?.find((g) => g.id === p.garden_id)) || [];
              if (orphaned.length === 0) return null;
              return (
                <div className="space-y-2 opacity-70">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="font-bold text-gray-500 text-sm">Không rõ vườn</span>
                  </div>
                  {orphaned.map((p) => (
                    <Card key={p.id}>
                      <CardContent className="py-3 px-4 flex items-center justify-between">
                        <span className="text-sm text-gray-600">{p.name} — chứa {p.capacity}</span>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Platform detail bottom sheet */}
      {(() => {
        const detailPlatform = detailPlatformId ? platforms?.find((p) => p.id === detailPlatformId) : null;
        if (!detailPlatform) return null;
        const garden = gardens?.find((g) => g.id === detailPlatform.garden_id);
        const platformLocs = (locations ?? []).filter((l) => l.platform_id === detailPlatform.id);
        const used = platformLocs.reduce((s, l) => s + l.quantity, 0);
        const free = parseFloat((detailPlatform.capacity - used).toFixed(2));
        const pct = detailPlatform.capacity > 0 ? Math.round((used / detailPlatform.capacity) * 100) : 0;
        return (
          <div
            className={`fixed inset-0 z-50 flex flex-col justify-end sheet-backdrop${closingSheet ? " closing" : ""}`}
            onClick={handleCloseSheet}
          >
            <div
              className={`bg-white rounded-t-3xl shadow-2xl min-h-[85vh] flex flex-col sheet-panel${closingSheet ? " closing" : ""}`}
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
                        <button type="submit" className="text-blue-600 p-1 shrink-0"><Check className="w-5 h-5"/></button>
                        <button type="button" onClick={() => setEditingPlatformName(false)} className="text-gray-400 p-1 shrink-0"><X className="w-5 h-5"/></button>
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
                    onClick={handleCloseSheet}
                  >
                    <X className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="h-full overflow-y-auto px-5 pb-6 space-y-4 pt-4">

                {/* Capacity stats */}
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
                          <button type="submit" className="text-blue-600 p-1"><Check className="w-4 h-4"/></button>
                          <button type="button" onClick={() => setEditingCapacity(false)} className="text-gray-400 p-1"><X className="w-4 h-4"/></button>
                        </form>
                      ) : (
                        <>
                          <span className="text-lg font-bold" style={{ color: "#2563eb" }}>{parseFloat(used.toFixed(2))}/{detailPlatform.capacity}</span>
                          <button
                            onClick={() => { setNewCapacity(String(detailPlatform.capacity)); setEditingCapacity(true); }}
                            className="text-blue-300 hover:text-blue-500 p-0.5"
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
                  <p className="text-xs text-blue-400">Còn trống: {free} tấm</p>
                </div>

                {/* Plants list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800 text-sm">Cây đang trồng ({platformLocs.length} đợt)</h3>
                    {free > 0 ? (
                      <Link
                        href={`/plants?garden=${detailPlatform.garden_id}&floor=${detailPlatform.floor}&platform=${detailPlatform.id}&openForm=1`}
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
                          <div key={loc.id} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-2">
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
                                onClick={() => setDetailPlantIdFromPlatform(loc.plant_id)}
                              >
                                <p className="font-semibold text-gray-900 text-sm truncate">{plant?.name ?? loc.plant_id}</p>
                                <div className="flex justify-start items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                  <span className="w-[65px]">{loc.quantity} tấm</span>
                                  <span className="w-[65px]">chậu {loc.pot_size}</span>
                                  <span className="">{fmtDate(loc.planted_date)}</span>
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
                                      () => doDeleteBatchFromPlatform(loc.id)
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
                                {/* Quantity input */}
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
                                      placeholder={moveTargetPlatformId
                                        ? (() => {
                                            const p = platforms?.find((p) => p.id === moveTargetPlatformId);
                                            const g = gardens?.find((g) => g.id === p?.garden_id);
                                            return p ? `${g ? g.name + " | " : ""}Tầng ${p.floor} - ${p.name}` : "";
                                          })()
                                        : "— Chọn sàn đích —"}
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
                                    <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl  max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                                      {(platforms ?? [])
                                        .filter((p) => p.id !== detailPlatformId)
                                        .filter((p) => {
                                          if (!movePlatformSearch.trim()) return true;
                                          const q = movePlatformSearch.toLowerCase();
                                          const g = gardens?.find((g) => g.id === p.garden_id);
                                          const freeSlots = parseFloat((p.capacity - (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0)).toFixed(2));
                                          return `${g?.name ?? ""} tầng ${p.floor} ${p.name} ${freeSlots}`.toLowerCase().includes(q);
                                        })
                                        .map((p) => {
                                          const g = gardens?.find((g) => g.id === p.garden_id);
                                          const freeSlots = parseFloat((p.capacity - (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0)).toFixed(2));
                                          const label = `${g ? g.name + " | " : ""}Tầng ${p.floor} - ${p.name} (còn ${freeSlots})`;
                                          return (
                                            <li
                                              key={p.id}
                                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                                                moveTargetPlatformId === p.id ? "bg-blue-50 font-medium text-blue-700" : "text-gray-800"
                                              } ${freeSlots < loc.quantity ? "opacity-50" : ""}`}
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
                                      const target = platforms?.find((p) => p.id === moveTargetPlatformId);
                                      const g = gardens?.find((g) => g.id === target?.garden_id);
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
        );
      })()}

      {/* Confirm modal */}
      {confirmModal}
    </div>

    {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

    {/* Plant detail sheet (opened from platform sheet) */}
    {detailPlantIdFromPlatform && (
      <PlantDetailSheet
        plantId={detailPlantIdFromPlatform}
        onClose={() => setDetailPlantIdFromPlatform(null)}
      />
    )}
    </>
  );
}
