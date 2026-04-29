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
  if (pct === 0) return "#ebedf0";       // empty — gray
  if (pct < 30) return "#9be9a8";        // light green
  if (pct < 60) return "#40c463";        // medium green
  if (pct < 80) return "#30a14e";        // dark green
  if (pct < 95) return "#f59e0b";        // amber — getting full
  return "#ef4444";                       // red — full
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
  const tooltipRef = useRef<HTMLDivElement>(null);

  const openTooltip = useCallback((id: string, btnEl: HTMLButtonElement) => {
    setTooltipId(id);
    setTooltipRect(btnEl.getBoundingClientRect());
  }, []);

  // Close tooltip on outside tap
  useEffect(() => {
    if (!tooltipId) return;
    function handleClick(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltipId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tooltipId]);

  // ── Derived stats ──
  const totalPlants = (locations ?? []).reduce((s, l) => s + l.quantity, 0);
  const totalPlatforms = platforms?.length ?? 0;
  const fullPlatforms = (platforms ?? []).filter((p) => {
    const used = (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0);
    return p.capacity > 0 && used >= p.capacity;
  }).length;
  const totalGardens = gardens?.length ?? 0;

  // ── Top plants by quantity ──
  const plantStats = (plants ?? [])
    .map((p) => {
      const batches = (locations ?? []).filter((l) => l.plant_id === p.id);
      const total = batches.reduce((s, l) => s + l.quantity, 0);
      const platformCount = new Set(batches.map((b) => b.platform_id)).size;
      return { ...p, total, platformCount };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <>
      <div className="max-w-lg mx-auto space-y-5">
        {/* ── Title ── */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Tổng quan</h1>
            <p className="text-xs text-gray-400">Bản đồ vườn & thống kê</p>
          </div>
        </div>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <div className="flex justify-center mb-1">
              <Package className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">{totalPlants}</p>
            <p className="text-[11px] text-gray-400">Tổng tấm</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <div className="flex justify-center mb-1">
              <Trees className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">
              {totalPlatforms}
              {fullPlatforms > 0 && (
                <span className="text-xs font-medium text-red-400 ml-1">({fullPlatforms} đầy)</span>
              )}
            </p>
            <p className="text-[11px] text-gray-400">Sàn</p>
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

          {(gardens ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((garden) => {
            const gardenPlatforms = (platforms ?? []).filter((p) => p.garden_id === garden.id);
            if (gardenPlatforms.length === 0) return null;
            const floors = [...new Set(gardenPlatforms.map((p) => p.floor))].sort((a, b) => a - b);

            return (
              <div key={garden.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-bold text-gray-800 text-sm">{garden.name}</span>
                </div>

                {floors.map((floorNum) => {
                  const floorPlatforms = gardenPlatforms
                    .filter((p) => p.floor === floorNum)
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                  return (
                    <div key={floorNum} className="flex items-start gap-2 pl-4">
                      <span className="text-[11px] text-gray-400 font-medium w-8 pt-1.5 shrink-0">T{floorNum}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {floorPlatforms.map((p) => {
                          const used = (locations ?? [])
                            .filter((l) => l.platform_id === p.id)
                            .reduce((s, l) => s + l.quantity, 0);
                          const pct = p.capacity > 0 ? Math.round((used / p.capacity) * 100) : 0;
                          const isActive = tooltipId === p.id;

                          return (
                            <div key={p.id}>
                              <button
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
                                <span className="text-[9px] font-bold leading-none" style={{
                                  color: pct === 0 ? "#9ca3af" : pct >= 80 ? "#fff" : "#166534",
                                }}>
                                  {p.name}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

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
            <h2 className="font-semibold text-gray-800 text-sm">Top cây</h2>
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
                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {p.total} tấm · {p.platformCount} sàn
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
      {tooltipId && tooltipRect && (() => {
        const p = platforms?.find((pl) => pl.id === tooltipId);
        if (!p) return null;
        const used = (locations ?? []).filter((l) => l.platform_id === p.id).reduce((s, l) => s + l.quantity, 0);
        const pct = p.capacity > 0 ? Math.round((used / p.capacity) * 100) : 0;
        const tooltipW = 208; // w-52 = 13rem = 208px
        const pad = 8;
        const anchorCenterX = tooltipRect.left + tooltipRect.width / 2;
        // Clamp tooltip left so it stays within viewport
        let left = anchorCenterX - tooltipW / 2;
        if (left < pad) left = pad;
        if (left + tooltipW > window.innerWidth - pad) left = window.innerWidth - pad - tooltipW;
        const top = tooltipRect.top - 8; // 8px gap above button
        // Arrow offset: distance from tooltip center to anchor center
        const arrowLeft = anchorCenterX - left;

        return (
          <div
            ref={tooltipRef}
            className="fixed z-50 w-52 bg-white rounded-xl shadow-lg border border-gray-100 p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200"
            style={{ left, top, transform: "translateY(-100%)" }}
          >
            {/* Arrow */}
            <div
              className="absolute top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"
              style={{ left: arrowLeft, transform: "translateX(-50%)" }}
            />

            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 text-sm">{p.name}</span>
              <Badge variant={pct >= 70 ? "warning" : "secondary"} className="text-[10px]">
                {fillLabel(pct)}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{used}/{p.capacity} tấm</span>
              <span className="font-semibold" style={{ color: fillColor(pct) }}>{pct}%</span>
            </div>

            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: fillColor(pct) }}
              />
            </div>

            {(() => {
              const platformLocs = (locations ?? []).filter((l) => l.platform_id === p.id);
              if (platformLocs.length === 0) return (
                <p className="text-[11px] text-gray-300 text-center py-1">Chưa có cây</p>
              );
              return (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {platformLocs.map((loc) => {
                    const plant = plants?.find((pl) => pl.id === loc.plant_id);
                    return (
                      <div key={loc.id} className="flex items-center gap-2 text-[11px]">
                        <div className="w-5 h-5 rounded overflow-hidden bg-emerald-50 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={plant?.image_url || PLACEHOLDER_IMAGE}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                          />
                        </div>
                        <span className="text-gray-700 truncate flex-1">{plant?.name ?? "?"}</span>
                        <span className="text-gray-400 shrink-0">×{loc.quantity}</span>
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
