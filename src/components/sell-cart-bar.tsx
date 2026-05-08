"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { ShoppingCart, X, ChevronDown, ChevronUp } from "lucide-react";
import { db } from "@/lib/db";
import { round2 } from "@/lib/number";
import { processQueue } from "@/lib/sync";
import { useSellCart, sellCartStore } from "@/lib/sell-cart";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Toast } from "@/components/ui/toast";

export function SellCartBar() {
  const sellCart = useSellCart();
  const [openConfirm, confirmModal] = useConfirm();
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  const locations = useLiveQuery(() => db.plantLocations.toArray(), [], []);
  const plants = useLiveQuery(() => db.plants.toArray(), [], []);
  const platforms = useLiveQuery(() => db.platforms.toArray(), [], []);
  const gardens = useLiveQuery(() => db.gardens.toArray(), [], []);

  if (sellCart.length === 0) return null;

  async function processSell() {
    if (sellCart.length === 0 || processing) return;
    setProcessing(true);
    try {
      const month = new Date().toISOString().slice(0, 7);
      let cattAdd = 0;
      let tonghopAdd = 0;

      const byLoc = new Map<string, number>();
      for (const c of sellCart) byLoc.set(c.locId, (byLoc.get(c.locId) ?? 0) + c.qty);

      const plantQtyAgg = new Map<string, number>();

      for (const [locId, qty] of byLoc) {
        const loc = (locations ?? []).find((l) => l.id === locId);
        if (!loc) continue;
        const plant = plants?.find((p) => p.id === loc.plant_id);
        const sellAmt = Math.min(qty, loc.quantity);
        plantQtyAgg.set(loc.plant_id, (plantQtyAgg.get(loc.plant_id) ?? 0) + sellAmt);

        if (plant && plant.name.toLowerCase().includes("catt")) cattAdd += sellAmt;
        else tonghopAdd += sellAmt;

        if (sellAmt >= loc.quantity) {
          await db.plantLocations.delete(locId);
          await db.syncQueue.add({
            id: uuidv4(), type: "DELETE", entity: "plant_location",
            payload: { id: locId }, status: "pending", retry_count: 0, created_at: Date.now(),
          });
        } else {
          const newQty = round2(loc.quantity - sellAmt);
          await db.plantLocations.update(locId, { quantity: newQty });
          await db.syncQueue.add({
            id: uuidv4(), type: "UPDATE", entity: "plant_location",
            payload: { ...loc, quantity: newQty } as Record<string, unknown>,
            status: "pending", retry_count: 0, created_at: Date.now(),
          });
        }
      }

      for (const [plantId, soldQty] of plantQtyAgg) {
        const plant = await db.plants.get(plantId);
        if (!plant) continue;
        const newTotal = Math.max(0, round2(plant.total_quantity - soldQty));
        await db.plants.update(plantId, { total_quantity: newTotal });
        await db.syncQueue.add({
          id: uuidv4(), type: "UPDATE", entity: "plant",
          payload: { ...plant, total_quantity: newTotal } as Record<string, unknown>,
          status: "pending", retry_count: 0, created_at: Date.now(),
        });
      }

      const existing = await db.monthlySales.where("month").equals(month).first();
      const isEdit = !!existing;
      const sale = {
        id: existing?.id ?? uuidv4(),
        month,
        catt_quantity: round2((existing?.catt_quantity ?? 0) + cattAdd),
        tonghop_quantity: round2((existing?.tonghop_quantity ?? 0) + tonghopAdd),
      };
      await db.monthlySales.put(sale);
      await db.syncQueue.add({
        id: uuidv4(),
        type: "CREATE",
        entity: "monthly_sales",
        payload: sale as Record<string, unknown>,
        status: "pending", retry_count: 0, created_at: Date.now(),
      });

      const totalSold = cattAdd + tonghopAdd;
      sellCartStore.clear();
      setExpanded(false);
      setToast({ text: `Thêm ${round2(totalSold)} tấm vào giỏ!`, type: "success" });
      processQueue().catch(console.error);
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
        style={{ bottom: 64, zIndex: 55 }}
      >
        {expanded && (
          <div className="px-4 pt-3 pb-1 max-h-56 overflow-y-auto space-y-1 border-b border-gray-50">
            {sellCart.map((c, idx) => {
              const loc = (locations ?? []).find((l) => l.id === c.locId);
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
                  const loc = (locations ?? []).find((l) => l.id === c.locId);
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
