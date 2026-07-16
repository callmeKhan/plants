"use client";

import { useState, useCallback, Suspense, useEffect } from "react";
import { useDetailStack } from "@/lib/use-detail-stack";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useData } from "@/lib/data";
import { v4 as uuidv4 } from "uuid";
import { Input } from "@/components/ui/input";
import { round2 } from "@/lib/number";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Leaf,
  Plus,
  Search,
  X,
  ChevronRight,
  SlidersHorizontal,
  FileText,
} from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PlantDetailSheet } from "@/components/plant-detail-sheet";
import { PlatformDetailSheet } from "@/components/platform-detail-sheet";
import { PlantImage } from "@/components/plant-image";
import { PotSizeInput } from "@/components/pot-size-input";
import { PLANT_LOCATION_STATUSES, getPlantLocationStatusMeta } from "@/lib/plant-location-status";
import {
  BATCH_COLORS,
  BATCH_COLOR_META,
  getBatchColorRowClass,
  type BatchColor,
} from "@/lib/batch-color";
import { comparePotSizes, formatPotSize } from "@/lib/pot-size";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
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
  const [locationStatus, setLocationStatus] = useState("");
  const [batchColor, setBatchColor] = useState<BatchColor>("white");
  const [plantedDate, setPlantedDate] = useState(todayStr());
  const [platformSearch, setPlatformSearch] = useState("");
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [openForm, setOpenForm] = useState(() => searchParams.get("openForm") === "1");
  const [closingForm, setClosingForm] = useState(false);

  const { stack, open, push, pop } = useDetailStack();
  const [openConfirm, confirmModal] = useConfirm();
  const [filterStock, setFilterStock] = useState<"all" | "out_of_stock">("all");
  const [filterPotSize, setFilterPotSize] = useState<number[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterImage, setFilterImage] = useState<"all" | "has_image" | "no_image">("all");
  const [filterNotes, setFilterNotes] = useState<"all" | "has_note">("all");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterNoTags, setFilterNoTags] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [closingFilters, setClosingFilters] = useState(false);
  const shouldLockPageScroll = stack.length > 0 || openForm || showFilters;

  useEffect(() => {
    if (!shouldLockPageScroll) return;

    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBodyPosition = bodyStyle.position;
    const previousBodyTop = bodyStyle.top;
    const previousBodyLeft = bodyStyle.left;
    const previousBodyRight = bodyStyle.right;
    const previousBodyWidth = bodyStyle.width;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousBodyOverscroll = bodyStyle.overscrollBehavior;
    const previousHtmlOverscroll = htmlStyle.overscrollBehavior;

    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";
    htmlStyle.overscrollBehavior = "none";

    return () => {
      bodyStyle.position = previousBodyPosition;
      bodyStyle.top = previousBodyTop;
      bodyStyle.left = previousBodyLeft;
      bodyStyle.right = previousBodyRight;
      bodyStyle.width = previousBodyWidth;
      bodyStyle.overflow = previousBodyOverflow;
      bodyStyle.overscrollBehavior = previousBodyOverscroll;
      htmlStyle.overscrollBehavior = previousHtmlOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [shouldLockPageScroll]);

  const handleOpenForm = useCallback(() => {
    setClosingForm(false);
    setOpenForm(true);
  }, []);
  const handleCloseForm = useCallback(() => {
    setClosingForm(true);
  }, []);
  const handleFormClosed = useCallback(() => {
    setClosingForm(false);
    setOpenForm(false);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setClosingFilters(true);
  }, []);
  const handleFilterAnimEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName === "sheetSlideDown") {
      setClosingFilters(false);
      setShowFilters(false);
    }
  }, []);


  const { plants, gardens, platforms, locations, locationsByPlatform, locationsByPlant, notesByPlant, mutate } = useData();

  function floorsForGarden(gardenId: string) {
    return Array.from(new Set(
      (platforms ?? [])
        .filter((p) => !gardenId || p.garden_id === gardenId)
        .map((p) => p.floor)
    )).sort((a, b) => a - b);
  }

  const floorsInGarden = floorsForGarden(filterGarden);

  const filteredPlatforms = platforms?.filter((p) => {
    if (filterGarden && p.garden_id !== filterGarden) return false;
    if (filterFloor && p.floor !== Number(filterFloor)) return false;
    return true;
  });

  function handleGardenChange(gardenId: string) {
    const gardenFloors = floorsForGarden(gardenId);
    setParams({
      garden: gardenId,
      floor: gardenId && gardenFloors.length === 1 ? String(gardenFloors[0]) : "",
      platform: "",
    });
  }



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
      const res = await fetch("/api/plants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uuidv4(), name, total_quantity: qty, image_url: imageUrl }),
      });
      if (!res.ok) { setMsg({ text: "Lỗi tạo cây mới", type: "error" }); return; }
      plant = await res.json();
      mutate.upsertPlant(plant!);
    } else {
      const newTotal = round2(plant.total_quantity + qty);
      const res = await fetch(`/api/plants?id=${plant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plant, total_quantity: newTotal }),
      });
      if (!res.ok) { setMsg({ text: "Lỗi cập nhật cây", type: "error" }); return; }
      plant = await res.json();
      mutate.upsertPlant(plant!);
    }

    const platform = platforms?.find((p) => p.id === platformId);
    if (!platform) { setMsg({ text: "Không tìm thấy sàn", type: "error" }); return; }
    const usedCap = (locationsByPlatform.get(platformId) ?? []).reduce((s, l) => s + l.quantity, 0);
    if (usedCap + qty > platform.capacity) {
      setMsg({ text: `Vượt sức chứa: đã dùng ${usedCap} + ${qty} > cap ${platform.capacity}`, type: "error" });
      return;
    }

    const loc = {
      id: uuidv4(), plant_id: plant!.id, platform_id: platformId,
      quantity: qty, pot_size: potSize, planted_date: plantedDate,
      status: locationStatus || null,
      color: batchColor,
      ...(price ? { price: Number(price) } : {}),
    };
    const locRes = await fetch("/api/plant-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loc),
    });
    if (!locRes.ok) { setMsg({ text: "Lỗi lưu vị trí", type: "error" }); return; }
    mutate.upsertLocation(await locRes.json());

    setName(""); setSelectedPlantId(null); setQuantity(""); setPrice("");
    setImageUrl(""); setPotSize(14); setLocationStatus(""); setBatchColor("white"); setPlantedDate(todayStr());
    setMsg({ text: "Đã lưu cây và vị trí thành công!", type: "success" });
    handleCloseForm();
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
    const used = (locationsByPlatform.get(id) ?? []).reduce((s, l) => s + l.quantity, 0);
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
      const batches = locationsByPlant.get(pid) ?? [];
      return batches.length === 0;
    });
  }
  if (filterPotSize.length > 0) {
    plantIds = plantIds.filter((pid) => {
      const batches = locationsByPlant.get(pid) ?? [];
      return batches.some((b) => filterPotSize.includes(b.pot_size));
    });
  }
  if (filterStatus) {
    plantIds = plantIds.filter((pid) => {
      const batches = locationsByPlant.get(pid) ?? [];
      return batches.some((b) => b.status === filterStatus);
    });
  }
  if (filterImage === "has_image") {
    plantIds = plantIds.filter((pid) => {
      const plant = plants?.find((p) => p.id === pid);
      return !!plant?.image_url;
    });
  } 
  
  if (filterImage === "no_image") {
    plantIds = plantIds.filter((pid) => {
      const plant = plants?.find((p) => p.id === pid);
      return !plant?.image_url;
    });
  }
  if (filterNotes === "has_note") {
    plantIds = plantIds.filter((pid) => (notesByPlant.get(pid)?.length ?? 0) > 0);
  }
  if (filterNoTags) {
    plantIds = plantIds.filter((pid) => {
      const tags = plants?.find((p) => p.id === pid)?.tags ?? [];
      return tags.length === 0;
    });
  } else if (filterTags.length > 0) {
    plantIds = plantIds.filter((pid) => {
      const tags = plants?.find((p) => p.id === pid)?.tags ?? [];
      return filterTags.every((tag) => tags.includes(tag));
    });
  }

  plantIds = plantIds.sort((a, b) => {
    const nameA = plants?.find((p) => p.id === a)?.name ?? a;
    const nameB = plants?.find((p) => p.id === b)?.name ?? b;
    return nameA.localeCompare(nameB, "vi", { sensitivity: "base", numeric: true });
  });
  const allPotSizes = [...new Set((locations ?? []).map((l) => l.pot_size))].sort(comparePotSizes);
  const allTags = [...new Set((plants ?? []).flatMap((p) => p.tags ?? []))].sort((a, b) => a.localeCompare(b, "vi"));
  const hasActiveFilter = searchQuery || filterStock !== "all" || filterPotSize.length > 0 || !!filterStatus || filterImage !== "all" || filterNotes !== "all" || filterTags.length > 0 || filterNoTags;

  return (
    <>
      <div className="max-w-lg mx-auto space-y-4">
        {/* Add plant sheet trigger */}
        <button
          onClick={handleOpenForm}
          className="w-full flex items-center gap-3 pt-1 text-left"
          aria-haspopup="dialog"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Thêm cây mới</h1>
            <p className="text-xs text-gray-400">Nhập thông tin và vị trí trồng</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Plus className="h-4 w-4" />
          </div>
        </button>

        {/* Toast */}
        {msg && <Toast msg={msg} onClose={() => setMsg(null)} />}

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
                onClick={() => { setSearchQuery(""); setFilterStock("all"); setFilterPotSize([]); setFilterStatus(""); setFilterImage("all"); setFilterNotes("all"); setFilterTags([]); setFilterNoTags(false); setTagSearch("");}}
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
              {(filterStock !== "all" || filterPotSize.length > 0 || !!filterStatus || filterImage !== "all" || filterNotes !== "all" || filterTags.length > 0 || filterNoTags) && (
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
                    onClick={() => { setFilterStock("all"); setFilterPotSize([]); setFilterStatus(""); setFilterImage("all"); setFilterNotes("all"); setFilterTags([]); setFilterNoTags(false); setTagSearch(""); }}
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

                {/* Container size filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Loại & cỡ</p>
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
                          {formatPotSize(size)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tag filter */}
                {allTags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Đặc điểm cây</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        onClick={() => setFilterNoTags((v) => {
                          const next = !v;
                          if (next) { setFilterTags([]); setTagSearch(""); }
                          return next;
                        })}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          backgroundColor: filterNoTags ? "#dc2626" : "#f3f4f6",
                          color: filterNoTags ? "#fff" : "#6b7280",
                        }}
                      >
                        Chưa có đặc điểm
                      </button>
                    </div>
                    {!filterNoTags && (
                      <>
                        {filterTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {filterTags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                                style={{ backgroundColor: "#0d9488" }}
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => setFilterTags((prev) => prev.filter((t) => t !== tag))}
                                  aria-label={`Bỏ đặc điểm ${tag}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative">
                          <div className="flex items-center border border-gray-200 rounded-xl bg-white px-3 h-10 gap-2">
                            <Search className="w-4 h-4 text-gray-400 shrink-0" />
                            <input
                              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0"
                              placeholder="Tìm đặc điểm cây..."
                              value={tagSearch}
                              onChange={(e) => { setTagSearch(e.target.value); setShowTagDropdown(true); }}
                              onFocus={() => setShowTagDropdown(true)}
                              onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                            />
                          </div>
                          {showTagDropdown && (() => {
                            const tagOptions = allTags.filter((tag) =>
                              !filterTags.includes(tag) &&
                              tag.toLowerCase().includes(tagSearch.trim().toLowerCase())
                            );
                            return (
                              <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl max-h-40 overflow-y-auto text-sm divide-y divide-gray-50 shadow">
                                {tagOptions.length === 0 ? (
                                  <li className="px-3 py-2 text-gray-400 text-center">Không tìm thấy</li>
                                ) : tagOptions.map((tag) => (
                                  <li
                                    key={tag}
                                    className="px-3 py-2 cursor-pointer hover:bg-emerald-50 text-gray-800"
                                    onMouseDown={() => { setFilterTags((prev) => [...prev, tag]); setTagSearch(""); }}
                                  >
                                    {tag}
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Status filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trạng thái batch</p>
                  <div className="flex flex-wrap gap-2">
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
                    {PLANT_LOCATION_STATUSES.map((status) => (
                      <button
                        key={status.value}
                        onClick={() => setFilterStatus(status.value)}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          backgroundColor: filterStatus === status.value ? status.filterActiveBgColor : "#f3f4f6",
                          color: filterStatus === status.value ? "#fff" : "#6b7280",
                        }}
                      >
                        {status.icon} {status.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Image filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hình ảnh</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterImage("all")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterImage === "all" ? "#059669" : "#f3f4f6",
                        color: filterImage === "all" ? "#fff" : "#6b7280",
                      }}
                    >
                      Tất cả
                    </button>
                    <button
                      onClick={() => setFilterImage("has_image")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterImage === "has_image" ? "#2563eb" : "#f3f4f6",
                        color: filterImage === "has_image" ? "#fff" : "#6b7280",
                      }}
                    >
                      Có hình
                    </button>
                    <button
                      onClick={() => setFilterImage("no_image")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterImage === "no_image" ? "#f59e0b" : "#f3f4f6",
                        color: filterImage === "no_image" ? "#fff" : "#6b7280",
                      }}
                    >
                      Chưa có hình
                    </button>
                  </div>
                </div>

                {/* Note filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ghi chú</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterNotes("all")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterNotes === "all" ? "#059669" : "#f3f4f6",
                        color: filterNotes === "all" ? "#fff" : "#6b7280",
                      }}
                    >
                      Tất cả
                    </button>
                    <button
                      onClick={() => setFilterNotes("has_note")}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: filterNotes === "has_note" ? "#7c3aed" : "#f3f4f6",
                        color: filterNotes === "has_note" ? "#fff" : "#6b7280",
                      }}
                    >
                      Có ghi chú
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
              const batches = locationsByPlant.get(pid) ?? [];
              const noteCount = notesByPlant.get(pid)?.length ?? 0;
              const total = round2(batches.reduce((s, l) => s + l.quantity, 0));
              return (
                <button
                  key={pid}
                  className="w-full text-left"
                  onClick={() => open({ type: "plant", id: pid, label: "Cây " + (plants?.find((p) => p.id === pid)?.name ?? pid) })}
                >
                  <Card className="hover:shadow-md hover:border-emerald-200 transition-all duration-200 active:scale-[0.99]">
                    <CardContent className="py-3 px-4 flex items-start gap-3">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-emerald-50 shrink-0 mt-0.5">
                        <PlantImage src={plant?.image_url} alt={plant?.name ?? ""} sizes="48px" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 justify-between">
                          <span className="font-semibold text-gray-900 truncate">{plant?.name ?? pid}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {noteCount > 0 && (
                              <Badge variant="warning" className="gap-1 px-2">
                                <FileText className="h-3 w-3" />
                                {noteCount}
                              </Badge>
                            )}
                            {total > 0 ? (
                              <Badge variant="default">×{total}</Badge>
                            ) : (
                              <Badge variant="alert" className="text-red-400 font-medium">Hết hàng</Badge>
                            )}
                          </div>
                        </div>
                        {batches.length > 0 && (
                          <div className="space-y-1">
                            {batches.map((b) => {
                              const statusMeta = getPlantLocationStatusMeta(b.status);
                              const batchColorRowClass = getBatchColorRowClass(b.color);
                              return (
                                <div
                                  key={b.id}
                                  className={`text-xs text-gray-500 flex flex-wrap items-start gap-x-1 gap-y-0  border-b border-gray-200 px-2 py-1 ${
                                    batchColorRowClass ? `${batchColorRowClass} border-transparent` : "border-gray-100"
                                  }`}
                                >
                                  {/* <MapPin className="w-3 h-3 shrink-0 text-gray-400" /> */}
                                  <div className="flex flex-col">
                                    <span>{platformLabelWithGarden(b.platform_id)}</span>
                                    <span>{b.quantity} tấm, {formatPotSize(b.pot_size)}</span>
                                  </div>
                                  <div className="flex flex-col items-center gap-1 ml-auto">
                                    {statusMeta && (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
                                        style={{
                                          backgroundColor: statusMeta.badgeBgColor,
                                          color: statusMeta.badgeTextColor,
                                        }}
                                      >
                                        {statusMeta.icon && `${statusMeta.icon} `}{statusMeta.label}
                                      </span>
                                    )}
                                    <span className="text-gray-900 text-xs">{fmtDate(b.planted_date)}</span>
                                  </div>
                                </div>
                              );
                            })}
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

        {/* Confirm modal */}
        {confirmModal}
      </div>

      <BottomSheet
        open={openForm}
        closing={closingForm}
        title="Thêm cây"
        description="Nhập thông tin và vị trí trồng"
        icon={<Leaf className="h-5 w-5" />}
        onCloseRequest={handleCloseForm}
        onClosed={handleFormClosed}
        closeLabel="Đóng form thêm cây"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tên cây
                  </label>
                  <Input
                    className="h-10"
                    placeholder="🌿 Nhập tên cây"
                    value={name}
                    autoComplete="off"
                    onChange={(event) => {
                      setName(event.target.value);
                      setSelectedPlantId(null);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  />
                  {showSuggestions && name && (
                    <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white text-sm shadow-lg divide-y divide-gray-50">
                      {plants
                        ?.filter((plant) => plant.name.toLowerCase().includes(name.toLowerCase()))
                        .map((plant) => (
                          <li
                            key={plant.id}
                            className="flex cursor-pointer items-center justify-between px-4 py-2.5 hover:bg-emerald-50"
                            onMouseDown={() => {
                              setName(plant.name);
                              setSelectedPlantId(plant.id);
                              setShowSuggestions(false);
                            }}
                          >
                            <span className="font-medium text-gray-800">{plant.name}</span>
                            <Badge variant="secondary">tổng: {plant.total_quantity}</Badge>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Số lượng
                    </label>
                    <Input
                      className="h-10"
                      placeholder="📦 Số lượng"
                      type="number"
                      min={1}
                      step="any"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Giá tiền
                    </label>
                    <Input
                      className="h-10"
                      placeholder="💰 Tuỳ chọn"
                      type="number"
                      min={0}
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    URL hình ảnh
                  </label>
                  <Input
                    className="h-10"
                    placeholder="🖼 Tuỳ chọn"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-[minmax(0,3fr)_minmax(132px,2fr)] gap-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Loại & cỡ
                    </label>
                    <PotSizeInput
                      value={potSize}
                      onChange={setPotSize}
                      usedSizes={locations.map((location) => location.pot_size)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Ngày trồng
                    </label>
                    <Input
                      className="h-9"
                      type="date"
                      value={plantedDate}
                      onChange={(event) => setPlantedDate(event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,2fr)_132px] gap-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Trạng thái
                    </label>
                    <Select
                      className="h-10"
                      value={locationStatus}
                      onChange={(event) => setLocationStatus(event.target.value)}
                    >
                      <option value="">Không có</option>
                      {PLANT_LOCATION_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.icon} {status.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Màu
                    </label>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-2">
                      {BATCH_COLORS.map((color) => {
                        const colorMeta = BATCH_COLOR_META[color];
                        const selected = batchColor === color;
                        return (
                          <button
                            key={color}
                            type="button"
                            className={`h-7 w-7 rounded-full border shadow-sm transition-all ${selected ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
                            style={{
                              backgroundColor: colorMeta.backgroundColor,
                              borderColor: colorMeta.borderColor,
                            }}
                            aria-label={`Màu ${colorMeta.label}`}
                            aria-pressed={selected}
                            title={colorMeta.label}
                            onClick={() => setBatchColor(color)}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Vị trí trồng
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      className="h-10"
                      value={filterGarden}
                      onChange={(event) => handleGardenChange(event.target.value)}
                    >
                      <option value="">Vườn</option>
                      {gardens?.map((garden) => (
                        <option key={garden.id} value={garden.id}>{garden.name}</option>
                      ))}
                    </Select>
                    <Select
                      className="h-10"
                      value={filterFloor}
                      onChange={(event) => setParams({ floor: event.target.value, platform: "" })}
                    >
                      <option value="">Tầng</option>
                      {floorsInGarden.map((floor) => (
                        <option key={floor} value={floor}>Tầng {floor}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative mt-2">
                    <div
                      className="flex h-10 cursor-text items-center gap-2 rounded-xl border border-gray-200 bg-white px-3"
                      onClick={() => setShowPlatformDropdown(true)}
                    >
                      <Search className="h-4 w-4 shrink-0 text-gray-400" />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                        placeholder={platformId ? platformLabel(platformId) : "Chọn sàn"}
                        value={platformSearch}
                        onChange={(event) => {
                          setPlatformSearch(event.target.value);
                          setShowPlatformDropdown(true);
                        }}
                        onFocus={() => setShowPlatformDropdown(true)}
                        onBlur={() => setTimeout(() => setShowPlatformDropdown(false), 150)}
                      />
                      {platformId && (
                        <button
                          type="button"
                          className="shrink-0 text-gray-400 hover:text-gray-600"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setParams({ platform: "" });
                            setPlatformSearch("");
                          }}
                          aria-label="Bỏ chọn sàn"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {showPlatformDropdown && (
                      <ul className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white text-sm shadow-lg divide-y divide-gray-50">
                        {(filteredPlatforms ?? [])
                          .filter((platform) => {
                            if (!platformSearch.trim()) return true;
                            const query = platformSearch.toLowerCase();
                            const free = platform.capacity - ((locationsByPlatform.get(platform.id) ?? []).reduce((sum, location) => sum + location.quantity, 0));
                            return `tầng ${platform.floor} ${platform.name} ${free}`.toLowerCase().includes(query);
                          })
                          .sort((a, b) => {
                            const gardenA = gardens?.find((garden) => garden.id === a.garden_id)?.name ?? "";
                            const gardenB = gardens?.find((garden) => garden.id === b.garden_id)?.name ?? "";
                            if (gardenA !== gardenB) return gardenA.localeCompare(gardenB);
                            if (a.floor !== b.floor) return a.floor - b.floor;
                            return a.name.localeCompare(b.name, undefined, { numeric: true });
                          })
                          .map((platform) => {
                            const free = platform.capacity - ((locationsByPlatform.get(platform.id) ?? []).reduce((sum, location) => sum + location.quantity, 0));
                            const gardenName = gardens?.find((garden) => garden.id === platform.garden_id)?.name;
                            const label = `${gardenName ? `${gardenName} | ` : ""}Tầng ${platform.floor} - ${platform.name} (còn ${round2(free)})`;
                            return (
                              <li
                                key={platform.id}
                                className={`cursor-pointer px-3 py-2 hover:bg-emerald-50 ${platformId === platform.id ? "bg-emerald-50 font-medium text-emerald-700" : "text-gray-800"}`}
                                onMouseDown={() => {
                                  setParams({ platform: platform.id });
                                  setPlatformSearch("");
                                  setShowPlatformDropdown(false);
                                }}
                              >
                                {label}
                              </li>
                            );
                          })}
                        {(filteredPlatforms ?? []).length === 0 && (
                          <li className="px-3 py-2 text-center text-gray-400">Không tìm thấy</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
                >
                  <Leaf className="h-4 w-4" />
                  Lưu cây
                </button>
        </form>
      </BottomSheet>

      {/* Detail sheets stack */}
      {stack.map((item, index) => {
        const zIdx = 50 + index * 10;
        const breadcrumb = stack.slice(0, index).map((s) => s.label ?? (s.type === "plant" ? "Cây" : "Sàn"));
        if (item.type === "plant") {
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
        }
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
      })}
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
