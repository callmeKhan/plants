"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Plus, X, Loader2, Pencil } from "lucide-react";

interface SalesRecord {
  id: string;
  month: string; // "YYYY-MM"
  catt_quantity: number;
  tonghop_quantity: number;
}

export function MonthlySalesChart() {
  const [data, setData] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [showEditList, setShowEditList] = useState(false);
  const [filterYears, setFilterYears] = useState<Set<string>>(() => new Set([String(new Date().getFullYear())]));

  // Form state — default to current month
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [cattQty, setCattQty] = useState("");
  const [tonghopQty, setTonghopQty] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/monthly-sales");
      if (res.ok) setData(await res.json());
    } catch {
      console.error("Failed to fetch monthly sales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!month || cattQty === "" || tonghopQty === "") return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/monthly-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          catt_quantity: Number(cattQty),
          tonghop_quantity: Number(tonghopQty),
        }),
      });
      if (res.ok) {
        await fetchData();
        closeForm();

      }
    } catch {
      console.error("Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Derived: available years and filtered chart data
  const years = [...new Set(data.map((d) => d.month.split("-")[0]))].sort();

  const chartData = data
    .filter((d) => filterYears.has(d.month.split("-")[0]))
    .map((d) => {
      const [y, m] = d.month.split("-");
      return {
        label: `T${parseInt(m)}/${y.slice(2)}`,
        "Cây Catt": d.catt_quantity,
        "Tổng Hợp": d.tonghop_quantity,
      };
    });

  const startEdit = (record: SalesRecord) => {
    setMonth(record.month);
    setCattQty(String(record.catt_quantity));
    setTonghopQty(String(record.tonghop_quantity));
    setEditingMonth(record.month);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setShowEditList(false);
    setEditingMonth(null);
    setCattQty("");
    setTonghopQty("");
    setMonth(defaultMonth);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">
          Thống kê bán hàng
        </h2>
        <div className="flex items-center gap-1.5">
          {!showForm && chartData.length > 0 && (
            <button
              onClick={() => setShowEditList((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: showEditList ? "#f59e0b" : "#f3f4f6",
                color: showEditList ? "#fff" : "#6b7280",
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => showForm ? closeForm() : setShowForm(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: showForm ? "#ef4444" : "#059669",
              color: "#fff",
            }}
          >
            {showForm ? (
              <>
                <X className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {showForm ? (
        /* ── Input form ── */
        <div>
          <div className="flex gap-1 overflow-x-auto pb-2"> &nbsp; </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3 " style={{ height: 254 }}>
          <div>
            <label className="text-xs text-gray-500 font-medium">Tháng {editingMonth && <span className="text-emerald-600">(sửa)</span>}</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={!!editingMonth}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 disabled:opacity-60 disabled:bg-gray-50"
            />
            {!editingMonth && data.some((d) => d.month === month) && (
              <p className="text-xs text-amber-500 mt-1">⚠ Tháng này đã có dữ liệu — sẽ ghi đè nếu lưu</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">
                Cây Catt
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={cattQty}
                onChange={(e) => setCattQty(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">
                Tổng Hợp
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={tonghopQty}
                onChange={(e) => setTonghopQty(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !month || cattQty === "" || tonghopQty === ""}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: "#059669" }}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              "Lưu"
            )}
          </button>
        </div>
        </div>
      ) : /* ── Chart + data list ── */
      loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Chưa có dữ liệu bán hàng
        </div>
      ) : (
        <div style={{ height: 286 }}>
          {/* ── Year tabs (shared) ── */}
          {years.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-2">
              {years.map((y) => {
                const active = filterYears.has(y);
                return (
                  <button
                    key={y}
                    onClick={() => {
                      setFilterYears((prev) => {
                        const next = new Set(prev);
                        if (next.has(y) && next.size > 1) next.delete(y);
                        else next.add(y);
                        return next;
                      });
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                    style={{
                      backgroundColor: active ? (showEditList ? "#f59e0b" : "#2563eb") : "#f3f4f6",
                      color: active ? "#fff" : "#6b7280",
                    }}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {!showEditList && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 pb-0">
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar
                      dataKey="Cây Catt"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Tổng Hợp"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Data list with edit ── */}
          {showEditList && (() => {
            const filtered = data.filter((d) => filterYears.has(d.month.split("-")[0]));
            return (
              <div className="space-y-1 overflow-y-auto" style={{ maxHeight: years.length > 1 ? 256 : 286 }}>
                  {filtered.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-4">Không có dữ liệu</p>
                  ) : filtered.map((d) => {
                    const [y, m] = d.month.split("-");
                    return (
                      <button
                        key={d.id}
                        onClick={() => startEdit(d)}
                        className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2 hover:border-emerald-200 hover:shadow-md transition-all active:scale-[0.99] text-left"
                      >
                        <span className="text-sm font-semibold text-gray-700">
                          T{parseInt(m)}/{y.slice(2)}
                        </span>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                            {d.catt_quantity}
                          </span>
                          <span>
                            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />
                            {d.tonghop_quantity}
                          </span>
                          <Pencil className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                      </button>
                    );
                  })}
                </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
