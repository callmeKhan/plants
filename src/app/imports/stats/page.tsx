"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CircleDollarSign,
  ListFilter,
  MoreVertical,
  PackagePlus,
  Pencil,
  RefreshCw,
  Search,
  SquareCheckBig,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Toast, type ToastMsg } from "@/components/ui/toast";
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
  type AccessoryImportStatsRow,
} from "@/lib/accessory-import-stats";

type ViewMode = "day" | "month";
type ImportEditForm = {
  name: string;
  quantity: string;
  unitCost: string;
  importedDate: string;
};

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

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function chartPeriodLabel(period: string, mode: ViewMode) {
  const [year, month, day] = period.split("-");
  return mode === "day" ? `${day}/${month}/${year}` : `Tháng ${Number(month)}/${year}`;
}

function chartPeriodShortLabel(period: string, mode: ViewMode) {
  const [year, month, day] = period.split("-");
  return mode === "day" ? `${day}/${month}` : `T${Number(month)}/${year.slice(2)}`;
}

function buildMonthlyRows(stats: AccessoryImportStatsPayload): ChartRow[] {
  return stats.months.map((stat) => ({
    ...stat,
    label: chartPeriodLabel(stat.period, "month"),
    shortLabel: chartPeriodShortLabel(stat.period, "month"),
  }));
}

function buildDailyRows(stats: AccessoryImportStatsPayload): ChartRow[] {
  const days = new Map<string, {
    totalQuantity: number;
    totalValue: number;
    batchCount: number;
    itemKeys: Set<string>;
  }>();

  for (const row of stats.rows) {
    const day = days.get(row.imported_date) ?? {
      totalQuantity: 0,
      totalValue: 0,
      batchCount: 0,
      itemKeys: new Set<string>(),
    };
    day.totalQuantity += row.quantity;
    day.totalValue += row.value;
    day.batchCount += 1;
    day.itemKeys.add(row.key);
    days.set(row.imported_date, day);
  }

  return Array.from(days.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, day]) => ({
      period,
      year: period.slice(0, 4),
      total_quantity: day.totalQuantity,
      total_value: day.totalValue,
      batch_count: day.batchCount,
      item_count: day.itemKeys.size,
      average_unit_cost: day.totalQuantity > 0 ? day.totalValue / day.totalQuantity : 0,
      label: chartPeriodLabel(period, "day"),
      shortLabel: chartPeriodShortLabel(period, "day"),
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

function ImportStatsPageContent() {
  const searchParams = useSearchParams();
  const initialItemKey = searchParams.get("itemKey") ?? "";
  const currentDate = useMemo(() => todayInVietnam(), []);
  const initialFromDate = searchParams.get("fromDate") ?? "";
  const initialToDate = searchParams.get("toDate") ?? "";
  const initialMode: ViewMode = searchParams.get("mode") === "day" ? "day" : "month";
  const [stats, setStats] = useState<AccessoryImportStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [showItemFilter, setShowItemFilter] = useState(false);
  const [closingItemFilter, setClosingItemFilter] = useState(false);
  const [openImportActionId, setOpenImportActionId] = useState<string | null>(null);
  const [editingImport, setEditingImport] = useState<AccessoryImportStatsRow | null>(null);
  const [editImportForm, setEditImportForm] = useState<ImportEditForm>({ name: "", quantity: "", unitCost: "", importedDate: "" });
  const [closingEditImport, setClosingEditImport] = useState(false);
  const [savingEditImport, setSavingEditImport] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [openConfirm, confirmModal] = useConfirm();

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
        setSelectedItemKeys(
          initialItemKey && data.items.some((item) => item.key === initialItemKey)
            ? [initialItemKey]
            : statsItemKeys(data),
        );
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
  }, [initialItemKey]);

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

  useEffect(() => {
    if (!editingImport) return;

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
  }, [editingImport]);

  async function retry(selectedKeyChange?: { from: string; to: string }) {
    invalidateAccessoryImportStatsCache();
    setLoading(true);
    setError(null);
    try {
      const data = await loadAccessoryImportStats();
      setStats(data);
      const nextItemKeys = statsItemKeys(data);
      const nextItemKeySet = new Set(nextItemKeys);
      setSelectedItemKeys((current) => {
        const remappedCurrent = selectedKeyChange
          ? current.map((key) => key === selectedKeyChange.from ? selectedKeyChange.to : key)
          : current;
        const validCurrent = Array.from(new Set(remappedCurrent.filter((key) => nextItemKeySet.has(key))));
        return validCurrent.length > 0 ? validCurrent : nextItemKeys;
      });
      return true;
    } catch {
      setError("Lỗi tải thống kê nhập kho");
      return false;
    } finally {
      setLoading(false);
    }
  }

  const selectedItemKeySet = useMemo(() => new Set(selectedItemKeys), [selectedItemKeys]);
  const allItemsSelected = stats !== null && stats.items.length > 0 && selectedItemKeys.length === stats.items.length;
  const filteredStats = useMemo(() => {
    if (!stats) return null;
    if (!fromDate && !toDate && selectedItemKeys.length === stats.items.length) return stats;

    return buildAccessoryImportStatsPayload(
      stats.rows.filter((row) => {
        if (!selectedItemKeySet.has(row.key)) return false;
        if (fromDate && row.imported_date < fromDate) return false;
        if (toDate && row.imported_date > toDate) return false;
        return true;
      }),
      stats.generated_at,
    );
  }, [fromDate, selectedItemKeySet, selectedItemKeys.length, stats, toDate]);

  const chartRows = useMemo(() => {
    if (!filteredStats) return [];
    return mode === "day" ? buildDailyRows(filteredStats) : buildMonthlyRows(filteredStats);
  }, [filteredStats, mode]);

  const detailRows = useMemo(
    () => [...(filteredStats?.rows ?? [])].sort((a, b) => {
      const dateDiff = b.imported_date.localeCompare(a.imported_date);
      if (dateDiff) return dateDiff;
      return a.name.localeCompare(b.name, "vi", { sensitivity: "base", numeric: true });
    }),
    [filteredStats],
  );

  function resetFilters() {
    setFromDate("");
    setToDate("");
    setSelectedItemKeys(stats?.items.map((item) => item.key) ?? []);
  }

  function startEditImport(row: AccessoryImportStatsRow) {
    if (!row.id) return;

    setOpenImportActionId(null);
    setClosingEditImport(false);
    setEditingImport(row);
    setEditImportForm({
      name: row.name,
      quantity: String(row.quantity),
      unitCost: String(row.unit_cost),
      importedDate: row.imported_date,
    });
  }

  function requestCloseEditImport() {
    if (!savingEditImport) setClosingEditImport(true);
  }

  function finishCloseEditImport() {
    setClosingEditImport(false);
    setEditingImport(null);
  }

  async function saveImportEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingImport?.id || savingEditImport) return;

    const name = editImportForm.name.trim();
    const quantity = Number(editImportForm.quantity);
    const unitCost = Number(editImportForm.unitCost);
    if (!name || !editImportForm.importedDate || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setToast({ text: "Nhập đầy đủ tên, ngày, số lượng và giá hợp lệ", type: "error" });
      return;
    }

    setSavingEditImport(true);
    try {
      const response = await fetch(`/api/accessory-imports?id=${encodeURIComponent(editingImport.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, unit_cost: unitCost, imported_date: editImportForm.importedDate }),
      });
      if (!response.ok) throw new Error("Failed to update accessory import");

      const refreshed = await retry({ from: editingImport.key, to: name.toLowerCase() });
      if (refreshed) {
        setClosingEditImport(true);
        setToast({ text: "Đã cập nhật lần nhập", type: "success" });
      }
    } catch {
      setToast({ text: "Lỗi cập nhật nhập kho", type: "error" });
    } finally {
      setSavingEditImport(false);
    }
  }

  function requestDeleteImport(row: AccessoryImportStatsRow) {
    const importId = row.id;
    if (!importId) return;

    setOpenImportActionId(null);
    openConfirm(
      `Xoá lần nhập “${row.name}” ngày ${chartPeriodLabel(row.imported_date, "day")}?`,
      async () => {
        try {
          const response = await fetch(`/api/accessory-imports?id=${encodeURIComponent(importId)}`, { method: "DELETE" });
          if (!response.ok) throw new Error("Failed to delete accessory import");

          const refreshed = await retry();
          if (refreshed) setToast({ text: "Đã xoá lần nhập", type: "success" });
        } catch {
          setToast({ text: "Lỗi xoá nhập kho", type: "error" });
        }
      },
    );
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

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
          <p className="text-xs text-gray-400">Theo ngày, tháng và mặt hàng</p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-100 shadow-sm px-4 py-6 text-center">
          <p className="text-sm text-red-500 font-semibold mb-3">{error}</p>
          <button
            type="button"
            onClick={() => { void retry(); }}
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
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400">Từ ngày</span>
                  <Input className="h-10 px-2" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400">Đến ngày</span>
                  <Input className="h-10 px-2" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
                </label>
              </div>

              {stats.items.length > 1 && (
                <ItemFilterButton
                  items={stats.items}
                  selectedKeys={selectedItemKeys}
                  onOpen={openItemFilter}
                />
              )}

              <button
                type="button"
                className="h-9 w-full rounded-xl bg-gray-100 text-xs font-semibold text-gray-600 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                onClick={resetFilters}
                disabled={!fromDate && !toDate && allItemsSelected}
              >
                Xoá bộ lọc
              </button>
            </CardContent>
          </Card>

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

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("day")}
                className="h-10 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: mode === "day" ? "#d97706" : "#f3f4f6",
                  color: mode === "day" ? "#fff" : "#6b7280",
                }}
              >
                Theo ngày
              </button>
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
            </div>
          </div>

          {chartRows.length === 0 ? (
            <div className="h-44 rounded-2xl border border-gray-100 bg-white shadow-sm flex items-center justify-center text-sm text-gray-400">
              {selectedItemKeys.length === 0 ? "Chưa chọn mặt hàng" : "Chưa có dữ liệu phù hợp"}
            </div>
          ) : (
            <ImportBarChart
              rows={chartRows}
              focusPeriod={mode === "day" ? currentDate : currentDate.slice(0, 7)}
            />
          )}

          <div className="space-y-2">
            <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              Chi tiết các lần nhập
              <span className="text-[11px] font-semibold text-gray-400">{detailRows.length} lần</span>
            </h2>
            {detailRows.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-6 text-center text-sm text-gray-400">
                {selectedItemKeys.length === 0 ? "Chưa chọn mặt hàng" : "Không có lần nhập phù hợp"}
              </div>
            ) : (
              detailRows.map((row, index) => (
                <div
                  key={row.id ?? `${row.key}-${row.imported_date}-${index}`}
                  className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{row.name}</p>
                    <p className="text-xs text-gray-400">
                      {chartPeriodLabel(row.imported_date, "day")} · sl: {formatQty(row.quantity)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="text-right min-w-0">
                      <p className="text-sm font-bold text-emerald-600 break-all">{formatMoney(row.value)}</p>
                      <p className="text-xs text-gray-400 break-all">{formatMoney(row.unit_cost)}/món</p>
                    </div>
                    {row.id && (
                      <div
                        className="relative"
                        onBlur={(event) => {
                          const nextFocus = event.relatedTarget;
                          if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                            setOpenImportActionId(null);
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"
                          onClick={() => setOpenImportActionId((current) => current === row.id ? null : row.id)}
                          aria-label={`Mở thao tác cho lần nhập ${row.name} ngày ${chartPeriodLabel(row.imported_date, "day")}`}
                          aria-haspopup="menu"
                          aria-expanded={openImportActionId === row.id}
                          title="Thao tác"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openImportActionId === row.id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
                              onClick={() => startEditImport(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Sửa
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-red-500 hover:bg-red-50"
                              onClick={() => requestDeleteImport(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Xoá
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

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
      </div>

      <BottomSheet
        open={Boolean(editingImport)}
        closing={closingEditImport}
        title="Sửa lần nhập"
        description={editingImport ? `${editingImport.name} · ${chartPeriodLabel(editingImport.imported_date, "day")}` : undefined}
        icon={<Pencil className="h-5 w-5" />}
        onCloseRequest={requestCloseEditImport}
        onClosed={finishCloseEditImport}
        closeLabel="Đóng form sửa lần nhập"
        height="70vh"
        zIndex={50}
      >
        <form className="flex min-h-full flex-col gap-4" onSubmit={saveImportEdit}>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mặt hàng</span>
            <Input
              className="h-11"
              value={editImportForm.name}
              onChange={(event) => setEditImportForm((current) => ({ ...current, name: event.target.value }))}
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Số lượng</span>
              <FormattedNumberInput
                className="h-11"
                value={editImportForm.quantity}
                onValueChange={(value) => setEditImportForm((current) => ({ ...current, quantity: value }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Giá nhập</span>
              <FormattedNumberInput
                className="h-11"
                value={editImportForm.unitCost}
                onValueChange={(value) => setEditImportForm((current) => ({ ...current, unitCost: value }))}
              />
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ngày nhập</span>
            <Input
              className="h-11 px-2"
              type="date"
              value={editImportForm.importedDate}
              onChange={(event) => setEditImportForm((current) => ({ ...current, importedDate: event.target.value }))}
            />
          </label>

          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tổng vốn: <span className="font-bold">{formatMoney((Number(editImportForm.quantity) || 0) * (Number(editImportForm.unitCost) || 0))}</span>
          </div>

          <div className="sticky bottom-0 -mx-5 -mb-4 mt-auto border-t border-gray-100 bg-white px-5 pb-3 pt-3">
            <button
              type="submit"
              disabled={savingEditImport}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:bg-amber-300"
            >
              {savingEditImport ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </BottomSheet>

      {confirmModal}
    </>
  );
}

function ImportStatsPageRoute() {
  const searchParams = useSearchParams();
  return <ImportStatsPageContent key={searchParams.toString()} />;
}

export default function ImportStatsPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto py-8 text-center text-sm text-gray-400">Đang tải thống kê...</div>}>
      <ImportStatsPageRoute />
    </Suspense>
  );
}
