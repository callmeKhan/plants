"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trees, LayoutGrid, Trash2, AlertCircle, Plus, ChevronDown, X, Package, Calendar, Leaf } from "lucide-react";
import { Toast } from "@/components/ui/toast";

type ConfirmModal = { message: string; onConfirm: () => void } | null;

const PLACEHOLDER_IMAGE = "/plant-placeholder.png";
function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function PlatformsPage() {
  const [gardenName, setGardenName] = useState("");
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [openGarden, setOpenGarden] = useState(false);

  const [gardenId, setGardenId] = useState("");
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [openPlatform, setOpenPlatform] = useState(false);

  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [detailPlatformId, setDetailPlatformId] = useState<string | null>(null);

  function confirm(message: string, onConfirm: () => void) {
    setConfirmModal({ message, onConfirm });
  }

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
    confirm(
      `Xoá vườn "${gardenName}"?\nHiện có ${plantCount} khay đang được trồng trong vườn này.`,
      () => doDeleteGarden(id)
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!gardenId || !floor || !name || !capacity) {
      setToast({ text: "Vườn, tầng, tên và sức chứa là bắt buộc", type: "error" });
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
    confirm(
      `Xoá sàn "${platformName}"?\nHiện có ${plantCount} khay đang được trồng trên sàn này.`,
      () => doDeletePlatform(id)
    );
  }

  return (
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

        {openGarden && (
          <>
            <form onSubmit={handleAddGarden} className="flex gap-2 mb-3">
              <Input
                placeholder="🌳 Tên vườn mới"
                value={gardenName}
                onChange={(e) => setGardenName(e.target.value)}
                className="flex-1"
              />
              <button
                type="submit"
                className="justify-center w-1/4 h-10 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-1 shrink-0 hover:opacity-90 active:scale-[0.97] transition-all"
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
                            <Badge variant="default">{plantCount} khay</Badge>
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
          </>
        )}
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

        {openPlatform && (
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
                    className="w-[65px]"
                    placeholder="Tầng"
                    type="number"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                  />
                  <Input
                    className="w-[120px]"
                    placeholder="📦 Sức chứa"
                    type="number"
                    min={0}
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
        )}

        {/* Platform list by garden */}
        {(platforms?.length ?? 0) > 0 && (
          <div className="space-y-4 mt-3">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              Danh sách sàn
              <Badge variant="secondary">{platforms?.length ?? 0}</Badge>
            </p>
            {gardens?.map((g) => {
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
                    return (
                      <div key={floorNum} className="pl-4 border-l-2 border-gray-100 space-y-1.5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tầng {floorNum}</p>
                        {floorPlatforms.map((p) => {
                          const used = (locations ?? [])
                            .filter((l) => l.platform_id === p.id)
                            .reduce((s, l) => s + l.quantity, 0);
                          const free = p.capacity - used;
                          const pct = Math.round((used / p.capacity) * 100);
                          return (
                            <div
                              key={p.id}
                              className="w-full text-left cursor-pointer"
                              onClick={() => setDetailPlatformId(p.id)}
                            >
                              <Card className="hover:shadow-md hover:border-blue-200 transition-all duration-200 active:scale-[0.99]">
                                <CardContent className="py-3 px-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={free === 0 ? "warning" : "secondary"}>
                                        còn {free}/{p.capacity}
                                      </Badge>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
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
        const free = detailPlatform.capacity - used;
        const pct = detailPlatform.capacity > 0 ? Math.round((used / detailPlatform.capacity) * 100) : 0;
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => setDetailPlatformId(null)}
          >
            <div
              className="bg-white rounded-t-3xl shadow-2xl min-h-[85vh] flex flex-col"
              style={{ marginBottom: "64px" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-white rounded-t-3xl z-10 px-5 pt-3 pb-3 border-b border-gray-100">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-1 rounded-full bg-gray-200" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{detailPlatform.name}</h2>
                    {garden && <p className="text-xs text-gray-400">{garden.name} · Tầng {detailPlatform.floor}</p>}
                  </div>
                  <button
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                    onClick={() => setDetailPlatformId(null)}
                  >
                    <X className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto px-5 pb-6 space-y-4 pt-4">

                {/* Capacity stats */}
                <div className="rounded-2xl p-4 space-y-2" style={{ backgroundColor: "#eff6ff" }}>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" style={{ color: "#2563eb" }} />
                    <span className="text-sm font-medium" style={{ color: "#1e3a8a" }}>Sức chứa</span>
                    <span className="ml-auto text-lg font-bold" style={{ color: "#2563eb" }}>{used}/{detailPlatform.capacity}</span>
                  </div>
                  <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#2563eb" }}
                    />
                  </div>
                  <p className="text-xs text-blue-400">Còn trống: {free} khay</p>
                </div>

                {/* Plants list */}
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2 text-sm">Cây đang trồng ({platformLocs.length} đợt)</h3>
                  {platformLocs.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-gray-400">
                      <Leaf className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">Chưa có cây nào trên sàn này</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {platformLocs.map((loc) => {
                        const plant = plants?.find((p) => p.id === loc.plant_id);
                        return (
                          <div key={loc.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-emerald-50 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={plant?.image_url || PLACEHOLDER_IMAGE}
                                alt={plant?.name ?? ""}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">{plant?.name ?? loc.plant_id}</p>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                <Package className="w-3 h-3" />
                                <span>{loc.quantity} khay · chậu {loc.pot_size}</span>
                                <span>·</span>
                                <Calendar className="w-3 h-3" />
                                <span>{fmtDate(loc.planted_date)}</span>
                              </div>
                            </div>
                            <Badge variant="default">×{loc.quantity}</Badge>
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
      {confirmModal && (
        <div
          className="fixed inset-0 flex items-center justify-center px-5"
          style={{ zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#fff7ed" }}>
              <AlertCircle className="w-6 h-6" style={{ color: "#f97316" }} />
            </div>
            <p className="text-sm text-gray-700 mb-6 text-center leading-relaxed whitespace-pre-line">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium"
                onClick={() => setConfirmModal(null)}
              >
                Huỷ
              </button>
              <button
                className="flex-1 h-11 rounded-xl text-sm text-white font-semibold"
                style={{ backgroundColor: "#dc2626" }}
                onClick={() => { confirmModal!.onConfirm(); setConfirmModal(null); }}
              >
                Xoá
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
