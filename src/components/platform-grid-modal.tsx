"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { round2 } from "@/lib/number";

interface Platform {
  id: string;
  name: string;
  capacity: number;
  garden_id: string;
  floor: number;
}

interface PlantLocation {
  id: string;
  platform_id: string;
  quantity: number;
}

interface Garden {
  id: string;
  name: string;
}

interface PlatformGridModalProps {
  locationsByPlatform: Map<string, PlantLocation[]>
  open: boolean;
  onClose: () => void;
  platforms: Platform[] | undefined;
  gardens: Garden[] | undefined;
  moveTargetGardenId: string;
  moveTargetFloor: number | "";
  excludePlatformId: string;
  moveQty: string;
  maxMoveQty: number;
  onMoveQtyChange: (value: string) => void;
  neededQty: number;
  moveTargetPlatformId: string;
  onSelectPlatform: (platformId: string) => void;
  zIndex: number;
}

export function PlatformGridModal({
  locationsByPlatform,
  open,
  onClose,
  platforms,
  gardens,
  moveTargetGardenId,
  moveTargetFloor,
  excludePlatformId,
  moveQty,
  maxMoveQty,
  onMoveQtyChange,
  neededQty,
  moveTargetPlatformId,
  onSelectPlatform,
  zIndex,
}: PlatformGridModalProps) {
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

  if (!open) return null;

  const selectedGarden = gardens?.find((g) => g.id === moveTargetGardenId);
  const floorPlatforms = (platforms ?? []).filter(
    (p) => p.garden_id === moveTargetGardenId && p.floor === moveTargetFloor && p.id !== excludePlatformId
  );
  const platformOptions = floorPlatforms.map((p) => {
    const freeSlots = round2(
      p.capacity -
        (locationsByPlatform.get(p.id) ?? []).reduce((s, l) => s + l.quantity, 0)
    );

    return {
      ...p,
      freeSlots,
      isAvailable: freeSlots >= neededQty,
    };
  });
  const availableCount = platformOptions.filter((p) => p.isAvailable).length;
  const visiblePlatforms = showOnlyAvailable
    ? platformOptions.filter((p) => p.isAvailable)
    : platformOptions;

  const cols = [
    { prefix: "T", label: "Trái" },
    { prefix: "P", label: "Phải" },
  ]
    .map((col) => ({
      ...col,
      items: visiblePlatforms
        .filter((p) => p.name.toUpperCase().startsWith(col.prefix))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    }))
    .filter((col) => col.items.length > 0);

  const others = visiblePlatforms
    .filter((p) => !p.name.toUpperCase().startsWith("T") && !p.name.toUpperCase().startsWith("P"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (others.length > 0) cols.push({ prefix: "Khác", label: "Khác", items: others });

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-white rounded-t-3xl shadow-[0_0_15px_-3px_rgba(0,0,0,0.5)] w-[90vw] h-[75vh] flex flex-col"
        style={{ marginBottom: "64px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Chọn sàn đích</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Chuyển tới: {selectedGarden?.name} · Tầng {moveTargetFloor}
              </p>
            </div>
            <button
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
              onClick={onClose}
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-0.5">
            Cần <span className="text-emerald-600">{neededQty} tấm</span>
          </p>

          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-gray-500 shrink-0">Số lượng chuyển:</label>
            <input
              type="number"
              min={0}
              max={maxMoveQty}
              className="w-20 h-7 border border-blue-200 rounded-lg px-2 text-sm bg-white outline-none text-center"
              value={moveQty}
              onChange={(e) => onMoveQtyChange(e.target.value)}
            />
            <span className="text-xs text-gray-400">/ {maxMoveQty} tấm</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400 mt-0.5">
              Khả dụng: <span className="font-semibold text-emerald-600">{availableCount}</span>/{floorPlatforms.length} sàn
            </p>
            <div className="flex h-8 rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                className={`px-3 rounded-md transition-colors ${
                  showOnlyAvailable ? "text-gray-500" : "bg-white text-gray-900 shadow-sm"
                }`}
                onClick={() => setShowOnlyAvailable(false)}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={`px-3 rounded-md transition-colors ${
                  showOnlyAvailable ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"
                }`}
                onClick={() => setShowOnlyAvailable(true)}
              >
                Khả dụng
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {visiblePlatforms.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {floorPlatforms.length === 0 ? "Không có sàn nào" : "Không có sàn available"}
            </p>
          ) : (
            <div className="flex gap-3">
              {cols.map((col) => (
                <div key={col.prefix} className="flex-1 min-w-0 space-y-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {col.label}
                  </div>
                  {col.items.map((p) => {
                    const isFull = !p.isAvailable;
                    const isSelected = moveTargetPlatformId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isFull}
                        onClick={() => onSelectPlatform(p.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : isFull
                            ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed opacity-40"
                            : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                        }`}
                      >
                        <div className="font-semibold text-sm">{p.name}</div>
                        <div className="text-[10px] text-gray-400">còn {p.freeSlots} tấm</div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
