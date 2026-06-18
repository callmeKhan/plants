"use client";

import { useState, useEffect, Suspense } from "react";
import { useDetailStack } from "@/lib/use-detail-stack";
import { useSearchParams } from "next/navigation";
import { useData } from "@/lib/data";
import { v4 as uuidv4 } from "uuid";
import { Input } from "@/components/ui/input";
import { round2 } from "@/lib/number";
import { getPlatformCapacityStats, isHangingPlatform } from "@/lib/platform-capacity";
import {
  BATCH_COLOR_META,
  PLATFORM_HIGHLIGHT_BATCH_COLORS,
  normalizeBatchColor,
} from "@/lib/batch-color";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformCapacityBadge } from "@/components/platform-capacity-badge";
import { Trees, LayoutGrid, Trash2, Plus, ChevronDown } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PlantDetailSheet } from "@/components/plant-detail-sheet";
import { PlatformDetailSheet } from "@/components/platform-detail-sheet";
import { Collapse } from "@/components/ui/collapse";



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
  const initialDetail = searchParams.get("detail");
  const { stack, open, push, pop } = useDetailStack(
    initialDetail ? [{ type: "platform", id: initialDetail }] : []
  );

  useEffect(() => {
    document.body.style.overflow = stack.length > 0 ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [stack.length]);

  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  const toggleFloor = (gardenId: string, floorNum: number) => {
    const key = `${gardenId}-${floorNum}`;
    setExpandedFloors(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { gardens, platforms, locationsByPlatform, locationsByPlant, refresh, mutate } = useData();

  async function handleAddGarden(e: React.FormEvent) {
    e.preventDefault();
    if (!gardenName) { setToast({ text: "Tên vườn là bắt buộc", type: "error" }); return; }
    const garden = { id: uuidv4(), name: gardenName };
    const res = await fetch("/api/gardens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(garden),
    });
    if (!res.ok) { setToast({ text: "Lỗi thêm vườn", type: "error" }); return; }
    mutate.upsertGarden(await res.json());
    setGardenName("");
    setToast({ text: `Đã thêm vườn: ${garden.name}`, type: "success" });
    setTimeout(() => setToast(null), 3000);
  }

  async function doDeleteGarden(id: string) {
    const pts = platforms.filter((p) => p.garden_id === id);
    const deletedPlantIds = new Set<string>();
    for (const p of pts) {
      const locs = locationsByPlatform.get(p.id) ?? [];
      for (const loc of locs) {
        deletedPlantIds.add(loc.plant_id);
        await fetch(`/api/plant-locations?id=${loc.id}`, { method: "DELETE" });
      }
      await fetch(`/api/platforms?id=${p.id}`, { method: "DELETE" });
    }
    await fetch(`/api/gardens?id=${id}`, { method: "DELETE" });
    for (const plantId of deletedPlantIds) {
      const remaining = (locationsByPlant.get(plantId) ?? []).filter((l) => !pts.some((p) => p.id === l.platform_id)).length;
      if (remaining === 0) {
        await fetch(`/api/plants?id=${plantId}`, { method: "DELETE" });
      }
    }
    setToast({ text: "Đã xoá vườn", type: "success" });
    await refresh("gardens", "platforms", "plants", "locations");
  }

  function handleDeleteGarden(id: string, gardenName: string) {
    const gardenPlatformIds = platforms.filter((p) => p.garden_id === id).map((p) => p.id);
    const plantCount = gardenPlatformIds.reduce((s, pid) => s + (locationsByPlatform.get(pid) ?? []).reduce((a, l) => a + l.quantity, 0), 0);
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
    const res = await fetch("/api/platforms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(platform),
    });
    if (!res.ok) { setToast({ text: "Lỗi thêm sàn", type: "error" }); return; }
    mutate.upsertPlatform(await res.json());
    setFloor(""); setName(""); setCapacity("");
    setToast({ text: `Đã thêm sàn: ${platform.name}`, type: "success" });
    setTimeout(() => setToast(null), 3000);
  }

  async function doDeletePlatform(id: string) {
    const locs = locationsByPlatform.get(id) ?? [];
    const deletedPlantIds = new Set(locs.map((l) => l.plant_id));
    for (const loc of locs) {
      await fetch(`/api/plant-locations?id=${loc.id}`, { method: "DELETE" });
    }
    await fetch(`/api/platforms?id=${id}`, { method: "DELETE" });
    for (const plantId of deletedPlantIds) {
      const remaining = (locationsByPlant.get(plantId) ?? []).filter((l) => l.platform_id !== id).length;
      if (remaining === 0) {
        await fetch(`/api/plants?id=${plantId}`, { method: "DELETE" });
      }
    }
    setToast({ text: "Đã xoá sàn", type: "success" });
    await refresh("platforms", "plants", "locations");
  }

  function handleDelete(id: string, platformName: string) {
    const plantCount = (locationsByPlatform.get(id) ?? []).reduce((s, l) => s + l.quantity, 0);
    openConfirm(
      `Xoá sàn "${platformName}"?\nHiện có ${plantCount} tấm đang được trồng trên sàn này.`,
      () => doDeletePlatform(id)
    );
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

            {gardens.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {gardens?.map((g) => {
                  const gardenPlatformIds = platforms.filter((p) => p.garden_id === g.id).map((p) => p.id);
                  const gardenPlatformsArr = platforms.filter((p) => p.garden_id === g.id);
                  const totalCapacity = getPlatformCapacityStats(gardenPlatformsArr, locationsByPlatform).total;
                  const platformCount = gardenPlatformIds.length;
                  return (
                    <Card key={g.id} className="shrink-0">
                      <CardContent className="py-2 px-3 flex items-center gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm whitespace-nowrap">{g.name}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            <Badge variant="secondary">{platformCount} sàn</Badge>
                            <Badge variant="default">{totalCapacity} tấm</Badge>
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
                      className="w-[65px] h-8"
                      placeholder="Tầng"
                      type="number"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                    />
                    <Input
                      className="w-[120px] h-8"
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
          {platforms.length > 0 && (
            <div className="space-y-4 mt-3">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                Danh sách sàn
                <Badge variant="secondary">{platforms?.length ?? 0}</Badge>
              </p>
              {/* garden sort by name */}
              {[...gardens].sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
                const gardenPlatforms = platforms?.filter((p) => p.garden_id === g.id) || [];
                if (gardenPlatforms.length === 0) return null;
                const floors = [...new Set(gardenPlatforms.map((p) => p.floor))].sort((a, b) => a - b);
                return (
                  <div key={g.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                      <span className="font-bold text-gray-800 text-sm">
                        {g.name} &nbsp;  &nbsp;
                        {floors.length > 1 && (
                          <PlatformCapacityBadge
                            platforms={gardenPlatforms}
                            locationsByPlatform={locationsByPlatform}
                            className="h-4"
                          />
                        )}
                      </span>
                    </div>
                    {floors.map((floorNum) => {
                      const floorPlatforms = gardenPlatforms.filter((p) => p.floor === floorNum);
                      const floorKey = `${g.id}-${floorNum}`;
                      const isExpanded = expandedFloors[floorKey];
                      const treoPlatforms = floorPlatforms.filter((p) =>
                        p.name.toLocaleUpperCase("vi").startsWith("TREO")
                      );
                      const sideColumns = [
                        {
                          key: "T",
                          label: "Trái",
                          items: floorPlatforms.filter((p) => {
                            const nameKey = p.name.toLocaleUpperCase("vi");
                            return nameKey.startsWith("T") && !nameKey.startsWith("TREO");
                          }),
                        },
                        {
                          key: "P",
                          label: "Phải",
                          items: floorPlatforms.filter((p) => p.name.toLocaleUpperCase("vi").startsWith("P")),
                        },
                        {
                          key: "Khác",
                          label: "Khác",
                          items: floorPlatforms.filter((p) => {
                            const nameKey = p.name.toLocaleUpperCase("vi");
                            return !nameKey.startsWith("T") && !nameKey.startsWith("P") && !nameKey.startsWith("TREO");
                          }),
                        },
                      ].filter((col) => col.items.length > 0);
                      const renderPlatformCard = (p: typeof floorPlatforms[number]) => {
                        const platformLocs = locationsByPlatform.get(p.id) ?? [];
                        const used = platformLocs.reduce((s, l) => s + l.quantity, 0);
                        const free = round2(p.capacity - used);
                        const pct = p.capacity > 0 ? Math.round((used / p.capacity) * 100) : 0;
                        const highlightColors = PLATFORM_HIGHLIGHT_BATCH_COLORS.filter((color) =>
                          platformLocs.some((loc) => normalizeBatchColor(loc.color) === color)
                        );

                        return (
                          <div
                            key={p.id}
                            className="w-full text-left cursor-pointer"
                            onClick={() => open({ type: "platform", id: p.id, label: `${g.name} | Tầng ${floorNum} - ${p.name}` })}
                          >
                            <Card className="hover:shadow-md hover:border-blue-200 transition-all duration-200 active:scale-[0.99]">
                              <CardContent className="py-2.5 px-3">
                                <div className="flex items-center justify-between shrink-0">
                                  <div className="flex items-center gap-1.5 min-w-0 mr-1">
                                    <span className="font-semibold text-gray-900 text-sm truncate">{p.name}</span>
                                    {highlightColors.map((color) => {
                                      const colorMeta = BATCH_COLOR_META[color];
                                      return (
                                        <span
                                          key={color}
                                          className="w-2.5 h-2.5 rounded-full border shadow-sm shrink-0"
                                          style={{
                                            backgroundColor: colorMeta.backgroundColor,
                                            borderColor: colorMeta.borderColor,
                                          }}
                                          title={`Có đợt đánh dấu ${colorMeta.label}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  {isHangingPlatform(p) ? (
                                    <div className="w-45/100 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: pct == 100 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981",
                                      }}
                                    />
                                  </div>
                                  ): <></>}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge variant={free === 0 ? "warning" : "secondary"} className="text-[10px] px-1.5 py-0 h-5">
                                      {isHangingPlatform(p) ? round2(p.capacity - free) : `${round2(free)}/${p.capacity}`}
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
                                {!isHangingPlatform(p) ? (
                                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: pct == 100 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981",
                                    }}
                                  />
                                </div>
                                ) : <></>}
                              </CardContent>
                            </Card>
                          </div>
                        );
                      };

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
                            <Badge variant="secondary" className="h-4">{floorPlatforms.length} sàn</Badge>
                            <PlatformCapacityBadge
                              platforms={floorPlatforms}
                              locationsByPlatform={locationsByPlatform}
                              className="h-4"
                            />
                          </button>
                          <Collapse open={!!isExpanded}>
                            <div className="space-y-3">
                              {treoPlatforms.length > 0 && (
                                <div className="w-full space-y-1.5">
                                  {treoPlatforms
                                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                                    .map(renderPlatformCard)}
                                </div>
                              )}
                              {sideColumns.length > 0 && (
                                <div className="flex gap-3 items-start">
                                  {sideColumns.map((col) => (
                                    <div key={col.key} className="flex-1 min-w-0 space-y-1.5">
                                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">{col.label}</h3>
                                      {col.items
                                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                                        .map(renderPlatformCard)}
                                    </div>
                                  ))}
                                </div>
                              )}
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

        {/* Confirm modal */}
        {confirmModal}
      </div>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      {/* Detail sheets stack */}
      {stack.map((item, index) => {
        const zIdx = 50 + index * 10;
        const breadcrumb = stack.slice(0, index).map((s) => s.label ?? (s.type === "platform" ? "Sàn" : "Cây"));
        if (item.type === "platform") {
          return (
            <PlatformDetailSheet
              key={`platform-${item.id}-${index}`}
              platformId={item.id}
              highlightBatchId={item.highlightBatchId}
              onClose={pop}
              onShowPlantDetail={(plantId, batchId, label) =>
                push({ type: "plant", id: plantId, highlightBatchId: batchId, label })
              }
              breadcrumb={breadcrumb}
              zIndex={zIdx}
            />
          );
        }
        return (
          <PlantDetailSheet
            key={`plant-${item.id}-${index}`}
            plantId={item.id}
            highlightBatchId={item.highlightBatchId}
            onClose={pop}
            onShowPlatformDetail={(platformId, batchId, label) =>
              push({ type: "platform", id: platformId, highlightBatchId: batchId, label })
            }
            breadcrumb={breadcrumb}
            zIndex={zIdx}
          />
        );
      })}
    </>
  );
}
