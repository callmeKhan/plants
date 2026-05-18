"use client";

import { useState } from "react";
import { ShoppingCart, X, ChevronDown, ChevronUp } from "lucide-react";
import { useData } from "@/lib/data";
import { round2 } from "@/lib/number";
import { useSellCart, sellCartStore } from "@/lib/sell-cart";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Toast } from "@/components/ui/toast";

export function SellCartBar() {
  const sellCart = useSellCart();
  const [openConfirm, confirmModal] = useConfirm();
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  const { locations, plants, platforms, gardens, mutate, refresh } = useData();

  if (sellCart.length === 0) return null;

  async function processSell() {
    if (sellCart.length === 0 || processing) return;
    setProcessing(true);
    try {
      let cattAdd = 0;
      let tonghopAdd = 0;

      const byLoc = new Map<string, number>();
      for (const c of sellCart) byLoc.set(c.locId, (byLoc.get(c.locId) ?? 0) + c.qty);

      const plantQtyAgg = new Map<string, number>();

      for (const [locId, qty] of byLoc) {
        const loc = locations.find((l) => l.id === locId);
        if (!loc) continue;
        const plant = plants?.find((p) => p.id === loc.plant_id);
        const sellAmt = Math.min(qty, loc.quantity);
        plantQtyAgg.set(loc.plant_id, (plantQtyAgg.get(loc.plant_id) ?? 0) + sellAmt);

        if (plant && plant.name.toLowerCase().includes("catt")) cattAdd += sellAmt;
        else tonghopAdd += sellAmt;

        if (sellAmt >= loc.quantity) {
          const delRes = await fetch(`/api/plant-locations?id=${locId}`, { method: "DELETE" });
          if (delRes.ok) mutate.removeLocation(locId);
        } else {
          const newQty = round2(loc.quantity - sellAmt);
          const res = await fetch(`/api/plant-locations?id=${locId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...loc, quantity: newQty }),
          });
          if (res.ok) mutate.upsertLocation(await res.json());
        }
      }

      for (const [plantId, soldQty] of plantQtyAgg) {
        const plant = plants.find((p) => p.id === plantId);
        if (!plant) continue;
        const newTotal = Math.max(0, round2(plant.total_quantity - soldQty));
        const res = await fetch(`/api/plants?id=${plantId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...plant, total_quantity: newTotal }),
        });
        if (res.ok) mutate.upsertPlant(await res.json());
      }

      const totalSold = cattAdd + tonghopAdd;
      sellCartStore.clear();
      setExpanded(false);
      setToast({ text: `Thêm ${round2(totalSold)} tấm!`, type: "success" });
    } catch {
      await refresh("plants", "locations");
      setToast({ text: "Lỗi kết nối", type: "error" });
    } finally {
      setProcessing(false);
    }
  }

  const totalQty = round2(sellCart.reduce((s, c) => s + c.qty, 0));

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div
        className="fixed left-0 right-0 bg-white border-t border-emerald-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
        style={{ bottom: 64, zIndex: 95 }}
      >
        {expanded && (
          <div className="px-4 pt-3 pb-1 max-h-56 overflow-y-auto space-y-1 border-b border-gray-50">
            {sellCart.map((c, idx) => {
              const loc = locations.find((l) => l.id === c.locId);
              const plant = loc ? plants?.find((p) => p.id === loc.plant_id) : null;
              const pf = loc ? platforms?.find((p) => p.id === loc.platform_id) : null;
              const g = pf ? gardens?.find((gl) => gl.id === pf.garden_id) : null;
              const locLabel = pf ? `${g ? g.name + " · " : ""}T${pf.floor}-${pf.name}` : "";
              return (
                <div key={idx} className="flex items-center gap-2 text-xs text-gray-700 py-1">
                  <span className="flex-1 truncate">
                    {plant?.name ?? "?"}
                    {locLabel && <span className="text-gray-400"> · {locLabel}</span>}
                  </span>
                  <span className="font-medium">{c.qty} tấm</span>
                  <button
                    className="text-red-400 hover:text-red-600 p-0.5"
                    onClick={() => sellCartStore.removeAt(idx)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-4 py-2 flex items-center gap-2">
          <button
            className="flex items-center gap-2 flex-1 min-w-0"
            onClick={() => setExpanded((v) => !v)}
          >
            <ShoppingCart className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold text-emerald-800 truncate">
              Giỏ bán ({sellCart.length} đợt · {totalQty} tấm)
            </span>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            className="text-xs text-gray-400 hover:text-gray-600 px-2"
            onClick={() => sellCartStore.clear()}
          >
            Xoá
          </button>
          <button
            className="px-4 rounded-lg text-sm font-semibold text-white bg-emerald-600 disabled:bg-emerald-300"
            disabled={processing}
            onClick={() => {
              openConfirm(
                `Xác nhận bán ${totalQty} tấm (${sellCart.length} đợt)?

                ${sellCart.map((c) => {
                  const loc = locations.find((l) => l.id === c.locId);
                  const plant = loc ? plants?.find((p) => p.id === loc.plant_id) : null;
                  const pf = loc ? platforms?.find((p) => p.id === loc.platform_id) : null;
                  const g = pf ? gardens?.find((gl) => gl.id === pf.garden_id) : null;
                  const locLabel = pf ? `${g ? g.name + " · " : ""}T${pf.floor}-${pf.name}` : "";
                  return ` ─ ${plant?.name ?? "?"} (${locLabel}) - ${c.qty} tấm`;
                }).join("\n")}
                `,
                () => processSell()
              );
            }}
          >
            {processing ? "..." : "Bán"}
          </button>
        </div>
      </div>

      {confirmModal}
    </>
  );
}
