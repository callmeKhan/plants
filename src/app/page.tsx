"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useState, useRef, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { PlantDetailSheet } from "@/components/plant-detail-sheet";
import { Leaf, Package, Trees, ChevronRight } from "lucide-react";

const PLACEHOLDER_IMAGE = "/plant-placeholder.png";

/** Map fill percentage → GitHub-style green color */
function fillColor(pct: number): string {
  if (pct === 0) return "#ebedf0"; // empty — gray
  if (pct < 30) return "#9be9a8"; // light green
  if (pct < 60) return "#40c463"; // medium green
  if (pct < 80) return "#30a14e"; // dark green
  if (pct < 95) return "#f59e0b"; // amber — getting full
  return "#ef4444"; // red — full
}

function fillLabel(pct: number): string {
  if (pct === 0) return "Trống";
  if (pct < 70) return "Còn chỗ";
  if (pct < 95) return "Gần đầy";
  return "Đầy";
}

export default function Dashboard() {
  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);
  const plants = useLiveQuery(() => db.plants.toArray(), [], []);

  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [detailPlantId, setDetailPlantId] = useState<string | null>(null);
  const [activeGardenId, setActiveGardenId] = useState<string | null>(null);
  const [topN, setTopN] = useState(5);
  const [sortMode, setSortMode] = useState<"quantity" | "platforms" | "price" | "batches">("quantity");
  const [sortAsc, setSortAsc] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const openTooltip = useCallback((id: string, btnEl: HTMLButtonElement) => {
    setTooltipId(id);
    setTooltipRect(btnEl.getBoundingClientRect());
  }, []);

  // Close tooltip on outside tap
  useEffect(() => {
    if (!tooltipId) return;
    function handleClick(e: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setTooltipId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tooltipId]);

  // ── Derived stats ──
  const totalPlants = (locations ?? []).reduce((s, l) => s + l.quantity, 0);
  const totalCapacity = (platforms ?? []).reduce((s, p) => s + p.capacity, 0);
  const fillPct = totalCapacity > 0 ? Math.round((totalPlants / totalCapacity) * 100) : 0;
  const totalPlatforms = platforms?.length ?? 0;
  const fullPlatforms = (platforms ?? []).filter((p) => {
    const used = (locations ?? [])
      .filter((l) => l.platform_id === p.id)
      .reduce((s, l) => s + l.quantity, 0);
    return p.capacity > 0 && used >= p.capacity;
  }).length;
  const totalGardens = gardens?.length ?? 0;

  // ── Top plants ──
  const plantStats = (plants ?? [])
    .map((p) => {
      const batches = (locations ?? []).filter((l) => l.plant_id === p.id);
      const total = batches.reduce((s, l) => s + l.quantity, 0);
      const platformCount = new Set(batches.map((b) => b.platform_id)).size;
      const maxPrice = batches.reduce((m, l) => Math.max(m, l.price ?? 0), 0);
      const batchCount = batches.length;
      return { ...p, total, platformCount, maxPrice, batchCount };
    })
    .sort((a, b) => {
      let diff = 0;
      if (sortMode === "platforms") diff = b.platformCount - a.platformCount;
      else if (sortMode === "price") diff = b.maxPrice - a.maxPrice;
      else if (sortMode === "batches") diff = b.batchCount - a.batchCount;
      else diff = b.total - a.total;
      return sortAsc ? -diff : diff;
    })
    .slice(0, topN);

  return (
    <>
      <div className="max-w-lg mx-auto space-y-5">
        {/* ── Title ── */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              Tổng quan
            </h1>
            <p className="text-xs text-gray-400">Bản đồ vườn & thống kê</p>
          </div>
        </div>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <div className="flex justify-center mb-1">
              <Package className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">
              {totalPlants}
              <span className="text-sm font-medium text-gray-400">/{totalCapacity}</span>
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <div className="flex-1 max-w-[60px] h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(fillPct, 100)}%`, backgroundColor: fillColor(fillPct) }}
                />
              </div>
              <span className="text-[10px] font-semibold" style={{ color: fillColor(fillPct) }}>
                {fillPct}%
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <div className="flex justify-center mb-1">
              <Trees className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">
              {fullPlatforms}
              <span className="text-sm font-medium text-gray-400">/{totalPlatforms}</span>
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <div className="flex-1 max-w-[60px] h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${totalPlatforms > 0 ? Math.round((fullPlatforms / totalPlatforms) * 100) : 0}%`,
                    backgroundColor: fillColor(totalPlatforms > 0 ? Math.round((fullPlatforms / totalPlatforms) * 100) : 0),
                  }}
                />
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: fillColor(totalPlatforms > 0 ? Math.round((fullPlatforms / totalPlatforms) * 100) : 0) }}
              >
                {totalPlatforms > 0 ? Math.round((fullPlatforms / totalPlatforms) * 100) : 0}%
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <div className="flex justify-center mb-1">
              <Trees className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-xl font-bold text-gray-900">{totalGardens}</p>
            <p className="text-[11px] text-gray-400">Vườn</p>
          </div>
        </div>

        {/* ── Heatmap Grid ── */}
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            Bản đồ sàn
          </h2>

          {/* Legend */}
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <span>Trống</span>
            {[0, 15, 45, 70, 95].map((pct) => (
              <div
                key={pct}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: fillColor(pct) }}
              />
            ))}
            <span>Đầy</span>
          </div>

          {/* Garden tabs */}
          {(() => {
            const sortedGardens = (gardens ?? [])
              .filter((g) => (platforms ?? []).some((p) => p.garden_id === g.id))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (sortedGardens.length === 0) return null;
            const selectedId = activeGardenId && sortedGardens.find((g) => g.id === activeGardenId)
              ? activeGardenId
              : sortedGardens[0]?.id;
            const garden = sortedGardens.find((g) => g.id === selectedId)!;
            const gardenPlatforms = (platforms ?? []).filter((p) => p.garden_id === garden.id);
            const floors = [...new Set(gardenPlatforms.map((p) => p.floor))].sort((a, b) => a - b);

            return (
              <>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {sortedGardens.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => { setActiveGardenId(g.id); setTooltipId(null); }}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all"
                      style={{
                        backgroundColor: g.id === selectedId ? "#059669" : "#f3f4f6",
                        color: g.id === selectedId ? "#fff" : "#6b7280",
                      }}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {floors.map((floorNum) => {
                    const floorPlatforms = gardenPlatforms
                      .filter((p) => p.floor === floorNum)
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                    const tPlatforms = floorPlatforms.filter((p) => p.name.toUpperCase().startsWith("T"));
                    const pPlatforms = floorPlatforms.filter((p) => p.name.toUpperCase().startsWith("P"));
                    const otherPlatforms = floorPlatforms.filter(
                      (p) => !p.name.toUpperCase().startsWith("T") && !p.name.toUpperCase().startsWith("P"),
                    );

                    const renderCell = (p: (typeof floorPlatforms)[0]) => {
                      const used = (locations ?? [])
                        .filter((l) => l.platform_id === p.id)
                        .reduce((s, l) => s + l.quantity, 0);
                      const pct = p.capacity > 0 ? Math.round((used / p.capacity) * 100) : 0;
                      const isActive = tooltipId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={(e) => isActive ? setTooltipId(null) : openTooltip(p.id, e.currentTarget)}
                          className="relative flex items-center justify-center rounded-md transition-all duration-150 hover:scale-110 active:scale-95"
                          style={{
                            width: 36,
                            height: 36,
                            backgroundColor: fillColor(pct),
                            boxShadow: isActive ? "0 0 0 2px #059669" : "none",
                          }}
                          title={`${p.name}: ${used}/${p.capacity}`}
                        >
                          <span
                            className="text-[9px] font-bold leading-none"
                            style={{ color: pct === 0 ? "#9ca3af" : pct >= 80 ? "#fff" : "#166534" }}
                          >
                            {p.name}
                          </span>
                        </button>
                      );
                    };

                    return (
                      <div key={floorNum}>
                        <span className="text-[11px] text-gray-400 font-medium w-8 pt-1.5 shrink-0">
                          Tầng {floorNum}
                        </span>
                        <div className="flex-1 flex divide-x divide-gray-200">
                          {tPlatforms.length > 0 && (
                            <div className="flex-1 pr-3">
                              <div className="flex flex-wrap gap-1.5">{tPlatforms.map(renderCell)}</div>
                            </div>
                          )}
                          {pPlatforms.length > 0 && (
                            <div className="flex-1 pl-3">
                              <div className="flex flex-wrap gap-1.5">{pPlatforms.map(renderCell)}</div>
                            </div>
                          )}
                          {otherPlatforms.length > 0 && (
                            <div className="flex-1 pl-3">
                              <div className="flex flex-wrap gap-1.5">{otherPlatforms.map(renderCell)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {totalPlatforms === 0 && (
            <div className="flex flex-col items-center py-8 text-gray-400">
              <Trees className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Chưa có sàn nào</p>
            </div>
          )}
        </div>

        {/* ── Top Plants ── */}
        {plantStats.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">Top cây</h2>
              <div className="flex items-center gap-1">
                {[5, 10, 15].map((n) => (
                  <button
                    key={n}
                    onClick={() => setTopN(n)}
                    className="px-2 py-0.5 rounded-md text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: topN === n ? "#059669" : "#f3f4f6",
                      color: topN === n ? "#fff" : "#6b7280",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {([
                { key: "quantity", label: "Số tấm" },
                { key: "platforms", label: "Số sàn" },
                { key: "price", label: "Giá nhập" },
                { key: "batches", label: "Số đợt" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    if (sortMode === opt.key) setSortAsc((v) => !v);
                    else { setSortMode(opt.key); setSortAsc(false); }
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                  style={{
                    backgroundColor: sortMode === opt.key ? "#2563eb" : "#f3f4f6",
                    color: sortMode === opt.key ? "#fff" : "#6b7280",
                  }}
                >
                  {opt.label}
                  <span className="ml-0.5">{sortMode === opt.key && sortAsc ? "↑" : "↓"}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {plantStats.map((p, i) => (
                <button
                  key={p.id}
                  className="w-full text-left"
                  onClick={() => setDetailPlantId(p.id)}
                >
                  <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2.5 hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.99]">
                    <span className="text-sm font-bold text-gray-300 w-5 text-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-emerald-50 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image_url || PLACEHOLDER_IMAGE}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {p.total} tấm · {p.platformCount} sàn
                        {sortMode === "price" && p.maxPrice > 0 && ` · ${p.maxPrice.toLocaleString()}đ`}
                        {sortMode === "batches" && ` · ${p.batchCount} đợt`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Plant detail sheet */}
      {detailPlantId && (
        <PlantDetailSheet
          plantId={detailPlantId}
          onClose={() => setDetailPlantId(null)}
        />
      )}

      {/* Fixed-position tooltip */}
      {tooltipId &&
        tooltipRect &&
        (() => {
          const p = platforms?.find((pl) => pl.id === tooltipId);
          if (!p) return null;
          const used = (locations ?? [])
            .filter((l) => l.platform_id === p.id)
            .reduce((s, l) => s + l.quantity, 0);
          const pct =
            p.capacity > 0 ? Math.round((used / p.capacity) * 100) : 0;
          const tooltipW = 208; // w-52 = 13rem = 208px
          const pad = 8;
          const anchorCenterX = tooltipRect.left + tooltipRect.width / 2;
          // Clamp tooltip left so it stays within viewport
          let left = anchorCenterX - tooltipW / 2;
          if (left < pad) left = pad;
          if (left + tooltipW > window.innerWidth - pad)
            left = window.innerWidth - pad - tooltipW;
          const top = tooltipRect.top - 8; // 8px gap above button

          return (
            <div
              ref={tooltipRef}
              className="fixed z-50 w-48 bg-white rounded-xl shadow-lg border border-gray-100 p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200"
              style={{ left, top, transform: "translateY(-100%)" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 text-sm">
                  {p.name}
                </span>
                <Badge
                  variant={pct >= 70 ? "warning" : "secondary"}
                  className="text-[10px]"
                >
                  {fillLabel(pct)}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>
                  {used}/{p.capacity} tấm
                </span>
                <span>·</span>
                <span>
                  {new Set((locations ?? []).filter((l) => l.platform_id === p.id).map((l) => l.plant_id)).size} cây
                </span>
                <span
                  className="font-semibold"
                  style={{ color: fillColor(pct) }}
                >
                  {pct}%
                </span>
              </div>

              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: fillColor(pct) }}
                />
              </div>

              {(() => {
                const platformLocs = (locations ?? []).filter(
                  (l) => l.platform_id === p.id,
                );
                if (platformLocs.length === 0)
                  return (
                    <p className="text-[11px] text-gray-300 text-center py-1">
                      Chưa có cây
                    </p>
                  );
                return (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {[...platformLocs].sort((a, b) => b.quantity - a.quantity).map((loc) => {
                      const plant = plants?.find(
                        (pl) => pl.id === loc.plant_id,
                      );
                      return (
                        <div
                          key={loc.id}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          <div className="w-5 h-5 rounded overflow-hidden bg-emerald-50 shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={plant?.image_url || PLACEHOLDER_IMAGE}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  PLACEHOLDER_IMAGE;
                              }}
                            />
                          </div>
                          <span className="text-gray-700 truncate flex-1">
                            {plant?.name ?? "?"}
                          </span>
                          <span className="text-gray-400 shrink-0">
                            ×{loc.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}
    </>
  );
}
