"use client";

import { useState, useCallback, Suspense, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { processQueue } from "@/lib/sync";
import { Input } from "@/components/ui/input";
import { round2 } from "@/lib/number";
import { currentTimeMs } from "@/lib/time";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Leaf,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PlantDetailSheet } from "@/components/plant-detail-sheet";
import { PlatformDetailSheet } from "@/components/platform-detail-sheet";
import { Collapse } from "@/components/ui/collapse";

const PLACEHOLDER_IMAGE = "/plant-placeholder.png";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
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
        <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl  text-sm divide-y divide-gray-50 max-h-40 overflow-y-auto">
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

function PlantsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filterGarden = searchParams.get("garden") ?? "";
  const filterFloor = searchParams.get("floor") ?? "";
  const platformId = searchParams.get("platform") ?? "";

  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.replace(pathname + "?" + params.toString(), { scroll: false });
  }, [searchParams, router, pathname]);

  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [potSize, setPotSize] = useState<number>(14);
  const [plantedDate, setPlantedDate] = useState(todayStr());
  const [platformSearch, setPlatformSearch] = useState("");
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [openForm, setOpenForm] = useState(() => searchParams.get("openForm") === "1");

  const [detailPlantId, setDetailPlantId] = useState<string | null>(null);
  const [detailPlatformId, setDetailPlatformId] = useState<string | null>(null);
  const [openConfirm, confirmModal] = useConfirm();
  const [filterStock, setFilterStock] = useState<"all" | "out_of_stock">("all");
  const [filterPotSize, setFilterPotSize] = useState<number[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [closingFilters, setClosingFilters] = useState(false);

  const [highlightBatchId, setHighlightBatchId] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = detailPlantId ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [detailPlantId]);

  const handleCloseFilters = useCallback(() => {
    setClosingFilters(true);
  }, []);
  const handleFilterAnimEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName === "sheetSlideDown") {
      setClosingFilters(false);
      setShowFilters(false);
    }
  }, []);


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



  async function doSubmit() {
    if (!name || !quantity || !platformId) {
      setMsg({ text: "Tên cây, số lượng và sàn là bắt buộc", type: "error" });
      return;
    }

    const qty = Number(quantity);
    const resolvedId = selectedPlantId
      ?? plants?.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())?.id
      ?? null;

    let plant = resolvedId ? plants?.find((p) => p.id === resolvedId) ?? null : null;

    if (!plant) {
      const newPlant = { id: uuidv4(), name, total_quantity: qty, image_url: imageUrl };
      await db.plants.add(newPlant);
      await db.syncQueue.add({
        id: uuidv4(), type: "CREATE", entity: "plant",
        payload: newPlant as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: currentTimeMs(),
      });
      plant = newPlant;
    } else {
      const newTotal = round2(plant.total_quantity + qty);
      await db.plants.update(plant.id, { total_quantity: newTotal });
      await db.syncQueue.add({
        id: uuidv4(), type: "UPDATE", entity: "plant",
        payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: currentTimeMs(),
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
      status: "pending", retry_count: 0, created_at: currentTimeMs(),
    });

    setName(""); setSelectedPlantId(null); setQuantity(""); setPrice("");
    setImageUrl(""); setPlantedDate(todayStr());
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
    openConfirm(
      `Thêm ${qty} tấm "${name}" vào ${gardenOfPlatform ? gardenOfPlatform.name + " · " : ""}${platform ? `Tầng ${platform.floor} - ${platform.name}` : platformId}?`,
      doSubmit
    );
  }



  function platformLabel(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    const used = (locations ?? []).filter((l) => l.platform_id === id).reduce((s, l) => s + l.quantity, 0);
    return `S\u00e0n ${p.name} (${p.capacity - used})`;
  }

  function platformLabelWithGarden(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    return `${gardens?.find((g) => g.id === p.garden_id)?.name + " | "}T\u1ea7ng ${p.floor} - ${p.name}`;
  }

  const locationPlantIds = new Set(locations?.map((l) => l.plant_id) ?? []);
  let plantIds = [...new Set([
    ...locationPlantIds,
    ...(plants?.map((p) => p.id) ?? []),
  ])];
  if (searchQuery.trim()) {
    plantIds = plantIds.filter((pid) => {
      const plant = plants?.find((p) => p.id === pid);
      return plant?.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    });
  }
  if (filterStock === "out_of_stock") {
    plantIds = plantIds.filter((pid) => {
      const batches = (locations ?? []).filter((l) => l.plant_id === pid);
      return batches.length === 0;
    });
  }
  if (filterPotSize.length > 0) {
    plantIds = plantIds.filter((pid) => {
      const batches = (locations ?? []).filter((l) => l.plant_id === pid);
      return batches.some((b) => filterPotSize.includes(b.pot_size));
    });
  }
  if (filterStatus) {
    plantIds = plantIds.filter((pid) => {
      const batches = (locations ?? []).filter((l) => l.plant_id === pid);
      return batches.some((b) => b.status === filterStatus);
    });
  }
  const allPotSizes = [...new Set((locations ?? []).map((l) => l.pot_size))].sort((a, b) => a - b);
  const hasActiveFilter = searchQuery || filterStock !== "all" || filterPotSize.length > 0 || !!filterStatus;

  return (
    <>
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

        {/* Add plant form — collapse animated */}
        <Collapse open={openForm}>
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
                    <ul className="absolute z-10 w-full bg-white border border-gray-100 rounded-xl  mt-1 max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
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
                <div className="grid gap-2 mb-0" style={{ gridTemplateColumns: "1fr 2fr", gridTemplateRows: "auto auto" }}>
                  <div>
                    <PotSizeInput
                      value={potSize}
                      onChange={setPotSize}
                      usedSizes={(locations ?? []).map((l) => l.pot_size)}
                    />
                  </div>
                  <Input
                    type="date"
                    value={plantedDate}
                    onChange={(e) => setPlantedDate(e.target.value)}
                  />
                </div>

                {/* Location selects */}
                <div className="grid gap-2 mt-0 " style={{ gridTemplateColumns: "1fr 2fr", gridTemplateRows: "auto auto" }}>
                  <Select
                    value={filterGarden}
                    onChange={(e) => { setParams({ garden: e.target.value, floor: "", platform: "" }); }}
                  >
                    <option value="">Vườn</option>
                    {gardens?.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                  <div className="relative" style={{ gridRow: "1 / 3", gridColumn: "2" }}>
                    <div
                      className="flex items-center border border-gray-200 rounded-xl bg-white h-full px-3 gap-1 cursor-text"
                      onClick={() => setShowPlatformDropdown(true)}
                    >
                      <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <input
                        className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0 w-full"
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
                          onMouseDown={(e) => { e.preventDefault(); setParams({ platform: "" }); setPlatformSearch(""); }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {showPlatformDropdown && (
                      <ul className="absolute left-0 z-20 right-0 top-full mt-1 bg-white border border-gray-300 rounded-xl  max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                        {(filteredPlatforms ?? [])
                          .filter((p) => {
                            if (!platformSearch.trim()) return true;
                            const q = platformSearch.toLowerCase();
                            const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                            const label = `tầng ${p.floor} ${p.name} ${free}`;
                            return label.toLowerCase().includes(q);
                          })
                          // format label Vườn A | Tầng 1 - P9 (còn 2)
                          // order by gardern, then floor, then name
                          .sort((a, b) => {
                            const gA = gardens?.find((g) => g.id === a.garden_id)?.name ?? "";
                            const gB = gardens?.find((g) => g.id === b.garden_id)?.name ?? "";
                            if (gA !== gB) return gA.localeCompare(gB);
                            if (a.floor !== b.floor) return a.floor - b.floor;
                            return a.name.localeCompare(b.name, undefined, { numeric: true });
                          })
                          .map((p) => {
                            const free = p.capacity - ((locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0));
                            const label = filterFloor ? `${p.name} (còn ${free})` : `${gardens?.find((g) => g.id === p.garden_id)?.name + " | "}Tầng ${p.floor} - ${p.name} (${round2(free)})`;
                            return (
                              <li
                                key={p.id}
                                className={`px-3 py-2 cursor-pointer hover:bg-emerald-50 ${platformId === p.id ? "bg-emerald-50 font-medium text-emerald-700" : "text-gray-800"}`}
                                onMouseDown={() => { setParams({ platform: p.id }); setPlatformSearch(""); setShowPlatformDropdown(false); }}
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
                  <Select
                    value={filterFloor}
                    onChange={(e) => { setParams({ floor: e.target.value, platform: "" }); }}
                  >
                    <option value="">Tầng</option>
                    {floorsInGarden.map((f) => (
                      <option key={f} value={f}>Tầng {f}</option>
                    ))}
                  </Select>
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
        </Collapse>

        {/* List section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              Danh sách
              <Badge variant="default">
                {hasActiveFilter ? `${plantIds.length}/${plants?.length ?? 0}` : (plants?.length ?? 0)} loại hoa
              </Badge>
            </h2>
            {hasActiveFilter && (
              <button
                onClick={() => { setSearchQuery(""); setFilterStock("all"); setFilterPotSize([]); setFilterStatus(""); }}
                className="text-xs text-emerald-600 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Bỏ lọc
              </button>
            )}
          </div>

          {/* Search + Filter toggle */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 bg-white shadow-sm">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                className="flex-1 h-10 text-sm bg-transparent outline-none placeholder-gray-400"
                placeholder="Tìm kiếm cây..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all relative"
              style={{
                backgroundColor: showFilters ? "#2563eb" : "#f3f4f6",
                color: showFilters ? "#fff" : "#6b7280",
              }}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {(filterStock !== "all" || filterPotSize.length > 0 || !!filterStatus) && (
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
              )}
            </button>
          </div>

          {/* Filter modal */}
          {showFilters && (
            <div
              className={`fixed inset-0 z-50 flex items-end justify-center sheet-backdrop${closingFilters ? " closing" : ""}`}
              onClick={handleCloseFilters}
            >
              <div
                className={`bg-white rounded-t-2xl w-full max-w-lg px-5 pt-4 pb-6 space-y-4 sheet-panel${closingFilters ? " closing" : ""}`}
                style={{ marginBottom: "55px" }}
                onClick={(e) => e.stopPropagation()}
                onAnimationEnd={handleFilterAnimEnd}
              >
                <div className="flex justify-center mb-1">
                  <div className="w-10 h-1 rounded-full bg-gray-200" />
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Bộ lọc</h3>
                  <button
                    onClick={() => { setFilterStock("all"); setFilterPotSize([]); setFilterStatus(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Xóa tất cả
                  </button>
                </div>

                {/* Stock filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trạng thái</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterStock("all")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterStock === "all" ? "#059669" : "#f3f4f6",
                        color: filterStock === "all" ? "#fff" : "#6b7280",
                      }}
                    >
                      Tất cả
                    </button>
                    <button
                      onClick={() => setFilterStock("out_of_stock")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterStock === "out_of_stock" ? "#dc2626" : "#f3f4f6",
                        color: filterStock === "out_of_stock" ? "#fff" : "#6b7280",
                      }}
                    >
                      Hết hàng
                    </button>
                  </div>
                </div>

                {/* Pot size filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Chậu</p>
                  <div className="flex flex-wrap gap-2">
                    {allPotSizes.map((size) => {
                      const selected = filterPotSize.includes(size);
                      return (
                        <button
                          key={size}
                          onClick={() => setFilterPotSize((prev) =>
                            selected ? prev.filter((s) => s !== size) : [...prev, size]
                          )}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                          style={{
                            backgroundColor: selected ? "#2563eb" : "#f3f4f6",
                            color: selected ? "#fff" : "#6b7280",
                          }}
                        >
                          Chậu {size}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trạng thái batch</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterStatus("")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: !filterStatus ? "#059669" : "#f3f4f6",
                        color: !filterStatus ? "#fff" : "#6b7280",
                      }}
                    >
                      Tất cả
                    </button>
                    <button
                      onClick={() => setFilterStatus("trồng lại")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterStatus === "trồng lại" ? "#f59e0b" : "#f3f4f6",
                        color: filterStatus === "trồng lại" ? "#fff" : "#6b7280",
                      }}
                    >
                      🌱 Trồng lại
                    </button>
                    <button
                      onClick={() => setFilterStatus("sang chậu")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterStatus === "sang chậu" ? "#2563eb" : "#f3f4f6",
                        color: filterStatus === "sang chậu" ? "#fff" : "#6b7280",
                      }}
                    >
                      🪴 Sang chậu
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleCloseFilters}
                  className="w-full h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center"
                  style={{ backgroundColor: "#059669" }}
                >
                  Áp dụng
                </button>
              </div>
            </div>
          )}

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
              const total = round2(batches.reduce((s, l) => s + l.quantity, 0));
              return (
                <button
                  key={pid}
                  className="w-full text-left"
                  onClick={() => setDetailPlantId(pid)}
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
                          {total > 0 ? (
                            <Badge variant="default">×{total}</Badge>
                          ) : (
                            <Badge variant="alert" className="text-red-400 font-medium">Hết hàng</Badge>
                          )}
                        </div>
                        {batches.length > 0 && (
                          <div className="space-y-1">
                            {batches.map((b) => (
                              <div key={b.id} className="text-xs text-gray-500 flex flex-wrap items-start gap-x-1 gap-y-0 border-b border-gray-200">
                                {/* <MapPin className="w-3 h-3 shrink-0 text-gray-400" /> */}
                                <div className="flex flex-col">
                                  <span>{platformLabelWithGarden(b.platform_id)}</span>
                                  <span>{b.quantity} tấm, chậu {b.pot_size}</span>
                                </div>
                                <div className="flex items-center gap-1 ml-auto">
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
                                  <span className="text-gray-900 text-xs">{fmtDate(b.planted_date)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </div>

        {/* Plant detail sheet */}
        {detailPlantId && (
          <PlantDetailSheet
            plantId={detailPlantId}
            onClose={() => setDetailPlantId(null)}
            onShowPlatformDetail={(platformId, batchId) => {
              setDetailPlatformId(platformId);
              setHighlightBatchId(batchId ?? null);
            }}
          />
        )}

        {/* Confirm modal */}
        {confirmModal}
      </div>

      {/* Platform detail sheet */}
      {detailPlatformId && (
        <PlatformDetailSheet
          platformId={detailPlatformId}
          onClose={() => {
            setDetailPlatformId(null);
            setHighlightBatchId(null);
          }}
          zIndex={60}
          highlightBatchId={highlightBatchId ?? undefined}
        />
      )}
    </>
  );
}

export default function PlantsPage() {
  return (
    <Suspense>
      <PlantsPageInner />
    </Suspense>
  );
}
