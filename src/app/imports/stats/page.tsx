"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CircleDollarSign,
  ListFilter,
  PackagePlus,
  RefreshCw,
  Search,
  SquareCheckBig,
  X,
} from "lucide-react";
import {
  getCachedAccessoryImportStats,
  invalidateAccessoryImportStatsCache,
  loadAccessoryImportStats,
} from "@/lib/accessory-import-stats-cache";
import {
  buildAccessoryImportStatsPayload,
  type AccessoryImportItemStat,
  type AccessoryImportPeriodStat,
  type AccessoryImportStatsPayload,
} from "@/lib/accessory-import-stats";

type ViewMode = "month" | "year";

type ChartRow = AccessoryImportPeriodStat & {
  label: string;
  shortLabel: string;
};

function formatQty(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)}đ`;
}

function formatAxisMoney(value: number) {
  if (value <= 0) return "0";

  if (value >= 1_000_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000_000)} tỷ`;
  }

  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)} tr`;
  }

  if (value >= 1_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value / 1_000)}k`;
  }

  return formatMoney(value);
}

function niceChartMax(value: number) {
  if (value <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return niceNormalized * magnitude;
}

function emptyMonthStat(year: string, month: number): AccessoryImportPeriodStat {
  const monthText = String(month).padStart(2, "0");
  return {
    period: `${year}-${monthText}`,
    year,
    total_quantity: 0,
    total_value: 0,
    batch_count: 0,
    item_count: 0,
    average_unit_cost: 0,
  };
}

function monthLabel(period: string) {
  const [, month] = period.split("-");
  return `Tháng ${Number(month)}`;
}

function monthShortLabel(period: string) {
  const [, month] = period.split("-");
  return `T${Number(month)}`;
}

function buildMonthlyRows(stats: AccessoryImportStatsPayload, year: string): ChartRow[] {
  const monthMap = new Map(stats.months.map((stat) => [stat.period, stat]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const stat = monthMap.get(period) ?? emptyMonthStat(year, month);
    return {
      ...stat,
      label: monthLabel(period),
      shortLabel: monthShortLabel(period),
    };
  });
}

function buildYearlyRows(stats: AccessoryImportStatsPayload): ChartRow[] {
  return stats.years.map((stat) => ({
    ...stat,
    label: `Năm ${stat.period}`,
    shortLabel: stat.period,
  }));
}

function statsItemKeys(stats: AccessoryImportStatsPayload) {
  return stats.items.map((item) => item.key);
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 min-w-0">
      <div className="flex items-center gap-2 text-gray-400 mb-1">
        {icon}
        <span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className="text-base font-bold text-gray-900 leading-tight break-words">{value}</p>
    </div>
  );
}

function ImportBarChart({ rows, focusPeriod }: { rows: ChartRow[]; focusPeriod?: string }) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const focusRowRef = useRef<HTMLDivElement | null>(null);
  const maxValue = Math.max(...rows.map((row) => row.total_value), 0);
  const chartMax = niceChartMax(maxValue);
  const yTicks = Array.from({ length: 5 }, (_, index) => chartMax * (1 - index / 4));
  const minWidth = Math.max(rows.length * 42, 320);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const focusRow = focusRowRef.current;
    if (!focusPeriod || !scrollArea || !focusRow) return;

    const left = focusRow.offsetLeft - scrollArea.clientWidth / 2 + focusRow.clientWidth / 2;
    scrollArea.scrollTo({ left: Math.max(left, 0), behavior: "smooth" });
  }, [focusPeriod, rows]);

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-4">
      <div className="flex gap-2">
        <div className="w-8 h-64 shrink-0 flex flex-col">
          <div className="relative flex-1">
            {yTicks.map((tick, index) => (
              <span
                key={`${tick}-${index}`}
                className="absolute right-0 -translate-y-1/2 text-[10px] font-semibold text-gray-400 tabular-nums"
                style={{ top: chartMax > 0 ? `${100 - (tick / chartMax) * 100}%` : "100%" }}
              >
                {formatAxisMoney(tick)}
              </span>
            ))}
          </div>
          <div className="h-10" />
        </div>

        <div ref={scrollAreaRef} className="pb-2 min-w-0 flex-1 overflow-x-auto">
          <div className="relative h-64" style={{ minWidth }}>
            <div className="absolute inset-x-0 top-0 bottom-10" aria-hidden="true">
              {yTicks.map((tick, index) => (
                <div
                  key={`${tick}-${index}`}
                  className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ top: chartMax > 0 ? `${100 - (tick / chartMax) * 100}%` : "100%" }}
                />
              ))}
            </div>

            <div className="relative z-10 h-full flex items-end gap-2">
              {rows.map((row) => {
                const percent = chartMax > 0 ? (row.total_value / chartMax) * 100 : 0;
                const height = row.total_value > 0 ? Math.max(percent, 5) : 0;

                return (
                  <div
                    key={row.period}
                    ref={row.period === focusPeriod ? focusRowRef : undefined}
                    className="h-full flex-1 min-w-9 flex flex-col items-center justify-end gap-1"
                  >
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        className="w-full max-w-8 rounded-t-lg transition-all"
                        style={{
                          height: `${height}%`,
                          backgroundColor: row.total_value > 0 ? "#d97706" : "#e5e7eb",
                        }}
                        title={`${row.label}: ${formatMoney(row.total_value)}`}
                        aria-label={`${row.label}: ${formatMoney(row.total_value)}`}
                      />
                    </div>
                    <span className="h-4 text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                      {row.shortLabel}
                    </span>
                    <span className="h-4 max-w-full text-[10px] font-semibold text-gray-500 leading-4 truncate">
                      {row.total_value > 0 ? formatAxisMoney(row.total_value) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-400">
        <span className="font-semibold text-amber-600">Vốn nhập</span>
        <span>{maxValue > 0 ? `Cao nhất ${formatMoney(maxValue)}` : "Chưa có dữ liệu"}</span>
      </div>
    </div>
  );
}

function ItemFilterButton({
  items,
  selectedKeys,
  onOpen,
}: {
  items: AccessoryImportItemStat[];
  selectedKeys: string[];
  onOpen: () => void;
}) {
  const allSelected = items.length > 0 && selectedKeys.length === items.length;
  const label = allSelected
    ? `Tất cả ${items.length} mặt hàng`
    : selectedKeys.length === 0
      ? "Chưa chọn mặt hàng"
      : `${selectedKeys.length}/${items.length} mặt hàng`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full h-12 rounded-2xl bg-white border border-gray-100 shadow-sm px-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all"
      aria-haspopup="dialog"
    >
      <span className="min-w-0 flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <ListFilter className="w-4 h-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold text-gray-400">Mặt hàng</span>
          <span className="block text-sm font-bold text-gray-900 truncate">{label}</span>
        </span>
      </span>
      <span className="h-8 px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold inline-flex items-center justify-center shrink-0">
        Chọn
      </span>
    </button>
  );
}

function ItemFilterSheet({
  items,
  selectedKeys,
  closing,
  onChange,
  onClose,
  onAnimationEnd,
}: {
  items: AccessoryImportItemStat[];
  selectedKeys: string[];
  closing: boolean;
  onChange: (keys: string[]) => void;
  onClose: () => void;
  onAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const itemKeys = useMemo(() => items.map((item) => item.key), [items]);
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const allSelected = items.length > 0 && selectedKeys.length === items.length;
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, searchQuery]);

  function toggleItem(key: string) {
    const nextSet = new Set(selectedKeys);
    if (nextSet.has(key)) {
      nextSet.delete(key);
    } else {
      nextSet.add(key);
    }
    onChange(itemKeys.filter((itemKey) => nextSet.has(itemKey)));
  }

  function toggleAll() {
    onChange(allSelected ? [] : itemKeys);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center sheet-backdrop${closing ? " closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Chọn mặt hàng thống kê"
      style={{ overscrollBehavior: "none" }}
    >
      <div
        className={`bg-white rounded-t-2xl w-full max-w-lg shadow-2xl sheet-panel${closing ? " closing" : ""} flex h-[72vh] flex-col`}
        style={{ marginBottom: "50px", overscrollBehavior: "contain" }}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onAnimationEnd}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900">Mặt hàng</h3>
              <p className="text-xs text-gray-400">
                {selectedKeys.length}/{items.length} đang chọn
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"
              aria-label="Đóng chọn mặt hàng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-amber-300"
                placeholder="Tìm mặt hàng"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
                  onClick={() => setSearchQuery("")}
                  aria-label="Xoá tìm kiếm mặt hàng"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="h-10 px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 active:scale-[0.97]"
            >
              {allSelected ? <X className="w-3.5 h-3.5" /> : <SquareCheckBig className="w-3.5 h-3.5" />}
              {allSelected ? "Bỏ" : "Tất cả"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-100 px-5" style={{ overscrollBehavior: "contain" }}>
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">Không tìm thấy mặt hàng</div>
          ) : (
            filteredItems.map((item) => {
              const checked = selectedKeySet.has(item.key);
              return (
                <label
                  key={item.key}
                  className="min-h-14 flex items-center gap-3 py-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.key)}
                    className="w-4 h-4 rounded border-gray-300 accent-amber-600 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                    <span className="block text-xs text-gray-400">
                      {formatQty(item.total_quantity)} món · {formatQty(item.batch_count)} lần
                    </span>
                  </span>
                  {checked && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                </label>
              );
            })
          )}
        </div>

        <div className="px-5 pt-3 pb-5 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-amber-600 text-white text-sm font-semibold flex items-center justify-center"
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-8 text-center text-sm text-gray-400">
      Đang tải thống kê...
    </div>
  );
}

export default function ImportStatsPage() {
  const [stats, setStats] = useState<AccessoryImportStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("month");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [showItemFilter, setShowItemFilter] = useState(false);
  const [closingItemFilter, setClosingItemFilter] = useState(false);
  const currentPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const currentYear = currentPeriod.slice(0, 4);

  const openItemFilter = useCallback(() => {
    setClosingItemFilter(false);
    setShowItemFilter(true);
  }, []);

  const closeItemFilter = useCallback(() => {
    setClosingItemFilter(true);
  }, []);

  const handleItemFilterAnimEnd = useCallback((event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "sheetSlideDown") {
      setClosingItemFilter(false);
      setShowItemFilter(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    Promise.resolve()
      .then(() => getCachedAccessoryImportStats() ?? loadAccessoryImportStats())
      .then((data) => {
        if (!active) return;
        setStats(data);
        setSelectedItemKeys(statsItemKeys(data));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Lỗi tải thống kê nhập kho");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showItemFilter) return;

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
  }, [showItemFilter]);

  async function retry() {
    invalidateAccessoryImportStatsCache();
    setLoading(true);
    setError(null);
    try {
      const data = await loadAccessoryImportStats();
      setStats(data);
      const nextItemKeys = statsItemKeys(data);
      const nextItemKeySet = new Set(nextItemKeys);
      setSelectedItemKeys((current) => {
        const validCurrent = current.filter((key) => nextItemKeySet.has(key));
        return validCurrent.length > 0 ? validCurrent : nextItemKeys;
      });
    } catch {
      setError("Lỗi tải thống kê nhập kho");
    } finally {
      setLoading(false);
    }
  }

  const selectedItemKeySet = useMemo(() => new Set(selectedItemKeys), [selectedItemKeys]);
  const filteredStats = useMemo(() => {
    if (!stats) return null;
    if (selectedItemKeys.length === stats.items.length) return stats;

    return buildAccessoryImportStatsPayload(
      stats.rows.filter((row) => selectedItemKeySet.has(row.key)),
      stats.generated_at,
    );
  }, [selectedItemKeySet, selectedItemKeys.length, stats]);

  const years = useMemo(() => filteredStats?.years.map((year) => year.period) ?? [], [filteredStats]);
  const effectiveYear = years.includes(selectedYear)
    ? selectedYear
    : years[years.length - 1] ?? selectedYear;

  const chartRows = useMemo(() => {
    if (!filteredStats) return [];
    return mode === "month" ? buildMonthlyRows(filteredStats, effectiveYear) : buildYearlyRows(filteredStats);
  }, [effectiveYear, filteredStats, mode]);

  const visibleRows = chartRows.filter((row) => row.batch_count > 0);
  const periodTotalValue = chartRows.reduce((sum, row) => sum + row.total_value, 0);
  const periodTotalQuantity = chartRows.reduce((sum, row) => sum + row.total_quantity, 0);
  const periodBatchCount = chartRows.reduce((sum, row) => sum + row.batch_count, 0);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <Link
          href="/imports"
          className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-500 transition-all hover:border-amber-200 hover:text-amber-600 active:scale-[0.97] shrink-0"
          aria-label="Quay lại nhập phụ kiện"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Thống kê nhập</h1>
          <p className="text-xs text-gray-400">Theo tháng và năm</p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-100 shadow-sm px-4 py-6 text-center">
          <p className="text-sm text-red-500 font-semibold mb-3">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="h-10 px-4 rounded-xl bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Tải lại
          </button>
        </div>
      ) : !stats || stats.totals.batch_count === 0 || !filteredStats ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-8 text-center">
          <PackagePlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Chưa có dữ liệu nhập kho</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)_minmax(0,0.78fr)] gap-3">
            <StatTile
              icon={<CircleDollarSign className="w-4 h-4 text-emerald-500 shrink-0" />}
              label="Tổng vốn"
              value={formatMoney(filteredStats.totals.total_value)}
            />
            <StatTile
              icon={<PackagePlus className="w-4 h-4 text-amber-500 shrink-0" />}
              label="Số lượng"
              value={formatQty(filteredStats.totals.total_quantity)}
            />
            <StatTile
              icon={<CalendarDays className="w-4 h-4 text-amber-500 shrink-0" />}
              label="Lần nhập"
              value={formatQty(filteredStats.totals.batch_count)}
            />
          </div>

          {stats.items.length > 1 && (
            <>
              <ItemFilterButton
                items={stats.items}
                selectedKeys={selectedItemKeys}
                onOpen={openItemFilter}
              />
              {showItemFilter && (
                <ItemFilterSheet
                  items={stats.items}
                  selectedKeys={selectedItemKeys}
                  closing={closingItemFilter}
                  onChange={setSelectedItemKeys}
                  onClose={closeItemFilter}
                  onAnimationEnd={handleItemFilterAnimEnd}
                />
              )}
            </>
          )}

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("month")}
                className="h-10 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: mode === "month" ? "#d97706" : "#f3f4f6",
                  color: mode === "month" ? "#fff" : "#6b7280",
                }}
              >
                Theo tháng
              </button>
              <button
                type="button"
                onClick={() => setMode("year")}
                className="h-10 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: mode === "year" ? "#d97706" : "#f3f4f6",
                  color: mode === "year" ? "#fff" : "#6b7280",
                }}
              >
                Theo năm
              </button>
            </div>
          </div>

          {mode === "month" && years.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {years.map((year) => {
                const active = year === effectiveYear;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setSelectedYear(year)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all"
                    style={{
                      backgroundColor: active ? "#d97706" : "#f3f4f6",
                      color: active ? "#fff" : "#6b7280",
                    }}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}

          <ImportBarChart
            rows={chartRows}
            focusPeriod={mode === "month" && effectiveYear === currentYear ? currentPeriod : undefined}
          />

          <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)_minmax(0,0.78fr)] gap-3">
            <StatTile
              icon={<CircleDollarSign className="w-4 h-4 text-emerald-500 shrink-0" />}
              label={mode === "month" ? effectiveYear : "Tất cả năm"}
              value={formatMoney(periodTotalValue)}
            />
            <StatTile
              icon={<PackagePlus className="w-4 h-4 text-amber-500 shrink-0" />}
              label="Số lượng"
              value={formatQty(periodTotalQuantity)}
            />
            <StatTile
              icon={<CalendarDays className="w-4 h-4 text-amber-500 shrink-0" />}
              label="Lần nhập"
              value={formatQty(periodBatchCount)}
            />
          </div>

          <div className="space-y-2">
            {visibleRows.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-6 text-center text-sm text-gray-400">
                {selectedItemKeys.length === 0 ? "Chưa chọn mặt hàng" : "Không có dữ liệu trong kỳ này"}
              </div>
            ) : (
              visibleRows.map((row) => (
                <div
                  key={row.period}
                  className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{row.label}</p>
                    <p className="text-xs text-gray-400">
                      {formatQty(row.total_quantity)} món · {formatQty(row.batch_count)} lần
                    </p>
                  </div>
                  <div className="text-right min-w-0">
                    <p className="text-sm font-bold text-emerald-600 break-all">{formatMoney(row.total_value)}</p>
                    <p className="text-xs text-gray-400 break-all">{formatMoney(row.average_unit_cost)}/món</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
