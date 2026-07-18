"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type AnimationEvent, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ListFilter,
  MoreVertical,
  Package,
  Pencil,
  RefreshCw,
  Search,
  SquareCheckBig,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Collapse } from "@/components/ui/collapse";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Select } from "@/components/ui/select";
import { Toast, type ToastMsg } from "@/components/ui/toast";
import {
  buildStoreSaleStats,
  normalizeStoreSalesData,
  type StoreProduct,
  type StoreSale,
  type StoreSalesData,
} from "@/lib/store-sales";

type Granularity = "day" | "month";
type ChartMetric = "quantity" | "amount";
const PRODUCT_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#84cc16", "#f97316"];
type ProductSaleBatch = {
  id: string;
  soldDate: string;
  createdAt: string;
  customerName: string;
  quantity: number;
  amount: number;
};
type SaleEditLine = {
  id?: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: string;
};
type SaleEditForm = {
  customerName: string;
  soldDate: string;
  lines: SaleEditLine[];
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)}đ`;
}

function formatCompactMoney(value: number) {
  if (value >= 1_000_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000_000)} tỷ`;
  }
  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)} tr`;
  }
  if (value >= 1_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value / 1_000)}k`;
  }
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function formatQty(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodLabel(period: string, granularity: Granularity, monthStartDay: number) {
  if (granularity === "month") {
    const [year, month] = period.split("-");
    if (monthStartDay > 1) {
      const periodYear = Number(year);
      const periodMonth = Number(month);
      const startDay = Math.min(monthStartDay, daysInMonth(periodYear, periodMonth));
      const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
      const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
      const nextStartDay = Math.min(monthStartDay, daysInMonth(nextYear, nextMonth));
      const endDate = new Date(Date.UTC(nextYear, nextMonth - 1, nextStartDay - 1));
      return `${startDay}/${periodMonth}–${endDate.getUTCDate()}/${endDate.getUTCMonth() + 1}/${String(endDate.getUTCFullYear()).slice(2)}`;
    }
    return `T${Number(month)}/${year}`;
  }
  const [year, month, day] = period.split("-");
  return `${day}/${month}/${year}`;
}

async function getErrorText(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchSalesData(signal?: AbortSignal) {
  const response = await fetch("/api/store-sales", { cache: "no-store", signal });
  if (!response.ok) throw new Error(await getErrorText(response, "Lỗi tải thống kê"));
  return normalizeStoreSalesData(await response.json());
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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

function ProductFilterButton({
  products,
  selectedIds,
  onOpen,
  onClear,
}: {
  products: StoreProduct[];
  selectedIds: string[];
  onOpen: () => void;
  onClear: () => void;
}) {
  const allSelected = products.length > 0 && selectedIds.length === products.length;
  const label = allSelected
    ? `Tất cả ${products.length} mặt hàng`
    : selectedIds.length === 0
      ? "Chưa chọn mặt hàng"
      : `${selectedIds.length}/${products.length} mặt hàng`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 text-left transition-all active:scale-[0.99]"
        aria-haspopup="dialog"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ListFilter className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold text-gray-400">Mặt hàng</span>
            <span className="block truncate text-sm font-semibold text-gray-800">{label}</span>
          </span>
        </span>
        <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-600">
          Chọn
        </span>
      </button>
      {!allSelected && products.length > 0 && (
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400 transition-colors hover:text-gray-600"
          onClick={onClear}
          aria-label="Xoá bộ lọc mặt hàng"
          title="Xoá bộ lọc mặt hàng"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ProductFilterSheet({
  products,
  selectedIds,
  closing,
  onChange,
  onClose,
  onAnimationEnd,
}: {
  products: StoreProduct[];
  selectedIds: string[];
  closing: boolean;
  onChange: (ids: string[]) => void;
  onClose: () => void;
  onAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const productIds = useMemo(() => products.map((product) => product.id), [products]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = products.length > 0 && selectedIds.length === products.length;
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return products;
    return products.filter((product) => product.name.toLocaleLowerCase("vi").includes(query));
  }, [products, searchQuery]);

  function toggleProduct(productId: string) {
    const nextSet = new Set(selectedIds);
    if (nextSet.has(productId)) nextSet.delete(productId);
    else nextSet.add(productId);
    onChange(productIds.filter((id) => nextSet.has(id)));
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
        className={`sheet-panel${closing ? " closing" : ""} flex h-[72vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl`}
        style={{ marginBottom: "50px", overscrollBehavior: "contain" }}
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={onAnimationEnd}
      >
        <div className="shrink-0 border-b border-gray-100 px-5 pb-3 pt-4">
          <div className="mb-3 flex justify-center"><div className="h-1 w-10 rounded-full bg-gray-200" /></div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900">Mặt hàng</h3>
              <p className="text-xs text-gray-400">{selectedIds.length}/{products.length} đang chọn</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500" aria-label="Đóng chọn mặt hàng">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-indigo-300"
                placeholder="Tìm mặt hàng"
              />
              {searchQuery && (
                <button type="button" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" onClick={() => setSearchQuery("")} aria-label="Xoá tìm kiếm mặt hàng">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(allSelected ? [] : productIds)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-600 active:scale-[0.97]"
            >
              {allSelected ? <X className="h-3.5 w-3.5" /> : <SquareCheckBig className="h-3.5 w-3.5" />}
              {allSelected ? "Bỏ" : "Tất cả"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto px-5" style={{ overscrollBehavior: "contain" }}>
          {filteredProducts.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">Không tìm thấy mặt hàng</div>
          ) : filteredProducts.map((product) => {
            const checked = selectedIdSet.has(product.id);
            return (
              <label key={product.id} className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                <input type="checkbox" checked={checked} onChange={() => toggleProduct(product.id)} className="h-4 w-4 shrink-0 rounded border-gray-300 accent-indigo-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{product.name}</span>
                  <span className="block text-xs text-gray-400">{formatMoney(Number(product.unit_price))}</span>
                </span>
                {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
              </label>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-5 pb-5 pt-3">
          <button type="button" onClick={onClose} className="flex h-11 w-full items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white">
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

function SalesStatsPageContent() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") ?? "";
  const showAllDates = searchParams.get("range") === "all";
  const initialDate = showAllDates ? "" : todayInVietnam();
  const [data, setData] = useState<StoreSalesData>({ products: [], customers: [], sales: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("quantity");
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [fromDate, setFromDate] = useState(initialDate);
  const [toDate, setToDate] = useState(initialDate);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(initialProductId ? [initialProductId] : []);
  const [showProductFilter, setShowProductFilter] = useState(false);
  const [closingProductFilter, setClosingProductFilter] = useState(false);
  const [customerId, setCustomerId] = useState(searchParams.get("customerId") ?? "");
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(() => new Set());
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(() => new Set());
  const [openSaleActionId, setOpenSaleActionId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<StoreSale | null>(null);
  const [editSaleForm, setEditSaleForm] = useState<SaleEditForm>({ customerName: "", soldDate: "", lines: [] });
  const [closingEditSale, setClosingEditSale] = useState(false);
  const [savingEditSale, setSavingEditSale] = useState(false);
  const [openConfirm, confirmModal] = useConfirm();
  const backHref = searchParams.get("source") === "customers" ? "/customers" : "/sales";

  const openProductFilter = useCallback(() => {
    setClosingProductFilter(false);
    setShowProductFilter(true);
  }, []);

  const closeProductFilter = useCallback(() => {
    setClosingProductFilter(true);
  }, []);

  const handleProductFilterAnimEnd = useCallback((event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "sheetSlideDown") {
      setClosingProductFilter(false);
      setShowProductFilter(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const nextData = await fetchSalesData();
      const nextProductIds = new Set(nextData.products.map((product) => product.id));
      setData(nextData);
      setSelectedProductIds((current) => current.filter((id) => nextProductIds.has(id)));
      return true;
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi tải thống kê", type: "error" });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function initialLoad() {
      try {
        const nextData = await fetchSalesData(controller.signal);
        setData(nextData);
        setSelectedProductIds(
          initialProductId && nextData.products.some((product) => product.id === initialProductId)
            ? [initialProductId]
            : nextData.products.map((product) => product.id),
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setToast({ text: error instanceof Error ? error.message : "Lỗi tải thống kê", type: "error" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void initialLoad();
    return () => controller.abort();
  }, [initialProductId]);

  useEffect(() => {
    if (!showProductFilter) return;

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
  }, [showProductFilter]);

  useEffect(() => {
    if (!editingSale) return;

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
  }, [editingSale]);

  const selectedProductIdSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedProducts = useMemo(
    () => data.products.filter((product) => selectedProductIdSet.has(product.id)),
    [data.products, selectedProductIdSet],
  );
  const allProductsSelected = data.products.length > 0 && selectedProductIds.length === data.products.length;
  const editSaleProductIds = useMemo(
    () => new Set(editSaleForm.lines.map((line) => line.productId)),
    [editSaleForm.lines],
  );
  const availableEditProducts = useMemo(
    () => data.products.filter((product) => !editSaleProductIds.has(product.id)),
    [data.products, editSaleProductIds],
  );
  const editSaleTotal = useMemo(
    () => editSaleForm.lines.reduce((sum, line) => {
      const quantity = Number(line.quantity);
      return sum + (Number.isFinite(quantity) ? quantity * line.unitPrice : 0);
    }, 0),
    [editSaleForm.lines],
  );

  const filteredSales = useMemo<StoreSale[]>(() => {
    return data.sales.flatMap((sale) => {
      if (fromDate && sale.sold_date < fromDate) return [];
      if (toDate && sale.sold_date > toDate) return [];
      if (customerId && sale.customer_id !== customerId) return [];

      const items = sale.items.filter((item) => selectedProductIdSet.has(item.product_id));
      if (items.length === 0) return [];

      return [{
        ...sale,
        items,
        total_amount: items.reduce((sum, item) => sum + Number(item.line_total), 0),
      }];
    });
  }, [customerId, data.sales, fromDate, selectedProductIdSet, toDate]);

  const stats = useMemo(
    () => buildStoreSaleStats(filteredSales, granularity, monthStartDay),
    [filteredSales, granularity, monthStartDay],
  );
  const salesByCustomer = useMemo(() => {
    const customerSales = new Map<string, StoreSale[]>();

    for (const sale of filteredSales) {
      const customerKey = sale.customer_id ?? `deleted:${sale.customer_name_snapshot.trim().toLocaleLowerCase("vi")}`;
      const batches = customerSales.get(customerKey) ?? [];
      batches.push(sale);
      customerSales.set(customerKey, batches);
    }

    return new Map(
      Array.from(customerSales.entries()).map(([customerKey, batches]) => [
        customerKey,
        batches.sort((a, b) => b.sold_date.localeCompare(a.sold_date) || b.created_at.localeCompare(a.created_at)),
      ]),
    );
  }, [filteredSales]);
  const salesByProduct = useMemo(() => {
    const productBatches = new Map<string, ProductSaleBatch[]>();

    for (const sale of filteredSales) {
      for (const item of sale.items) {
        const batches = productBatches.get(item.product_id) ?? [];
        batches.push({
          id: item.id,
          soldDate: sale.sold_date,
          createdAt: sale.created_at,
          customerName: sale.customer_name_snapshot,
          quantity: Number(item.quantity),
          amount: Number(item.line_total),
        });
        productBatches.set(item.product_id, batches);
      }
    }

    return new Map(
      Array.from(productBatches.entries()).map(([productId, batches]) => [
        productId,
        batches.sort((a, b) => b.soldDate.localeCompare(a.soldDate) || b.createdAt.localeCompare(a.createdAt)),
      ]),
    );
  }, [filteredSales]);
  const maxPeriodValue = Math.max(
    ...stats.periods.flatMap((period) => selectedProductIds.map((productId) => {
      const product = period.products.find((item) => item.id === productId);
      return chartMetric === "quantity" ? product?.total_quantity ?? 0 : product?.total_amount ?? 0;
    })),
    0,
  );
  const productColorById = useMemo(
    () => new Map(data.products.map((product, index) => [product.id, PRODUCT_COLORS[index % PRODUCT_COLORS.length]])),
    [data.products],
  );
  const productBarsWidth = selectedProducts.length * 28 + Math.max(selectedProducts.length - 1, 0) * 2;
  const periodGroupWidth = Math.max(
    granularity === "month" && monthStartDay > 1 ? 72 : 54,
    productBarsWidth,
  );

  function toggleProductDetails(productId: string) {
    setExpandedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleCustomerDetails(customerKey: string) {
    setExpandedCustomerIds((current) => {
      const next = new Set(current);
      if (next.has(customerKey)) next.delete(customerKey);
      else next.add(customerKey);
      return next;
    });
  }

  function startEditSale(sale: StoreSale) {
    const fullSale = data.sales.find((item) => item.id === sale.id) ?? sale;
    setOpenSaleActionId(null);
    setClosingEditSale(false);
    setEditingSale(fullSale);
    setEditSaleForm({
      customerName: fullSale.customer_name_snapshot,
      soldDate: fullSale.sold_date,
      lines: fullSale.items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name_snapshot,
        unitPrice: Number(item.unit_price_snapshot),
        quantity: String(item.quantity),
      })),
    });
  }

  function requestCloseEditSale() {
    if (!savingEditSale) setClosingEditSale(true);
  }

  function finishCloseEditSale() {
    setClosingEditSale(false);
    setEditingSale(null);
    setEditSaleForm({ customerName: "", soldDate: "", lines: [] });
  }

  function setEditSaleLineQuantity(productId: string, quantity: string) {
    setEditSaleForm((current) => ({
      ...current,
      lines: current.lines.map((line) => line.productId === productId ? { ...line, quantity } : line),
    }));
  }

  function addEditSaleProduct(productId: string) {
    const product = data.products.find((item) => item.id === productId);
    if (!product) return;

    setEditSaleForm((current) => current.lines.some((line) => line.productId === product.id)
      ? current
      : {
        ...current,
        lines: [...current.lines, {
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.unit_price),
          quantity: "1",
        }],
      });
  }

  function removeEditSaleProduct(productId: string) {
    if (editSaleForm.lines.length <= 1) {
      setToast({ text: "Hóa đơn cần ít nhất một mặt hàng", type: "error" });
      return;
    }
    setEditSaleForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.productId !== productId),
    }));
  }

  async function saveSaleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSale || savingEditSale) return;

    const customerName = editSaleForm.customerName.trim();
    const invalidLine = editSaleForm.lines.some((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0);
    if (!customerName || !editSaleForm.soldDate || editSaleForm.lines.length === 0 || invalidLine) {
      setToast({ text: "Điền khách hàng, ngày bán và số lượng hợp lệ", type: "error" });
      return;
    }

    const exactCustomer = data.customers.find(
      (customer) => customer.name.toLocaleLowerCase("vi") === customerName.toLocaleLowerCase("vi"),
    );

    setSavingEditSale(true);
    try {
      const response = await fetch(`/api/store-sales?id=${encodeURIComponent(editingSale.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: exactCustomer?.id ?? "",
          customer_name: customerName,
          sold_date: editSaleForm.soldDate,
          items: editSaleForm.lines.map((line) => ({
            id: line.id,
            product_id: line.productId,
            quantity: Number(line.quantity),
          })),
        }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi cập nhật hóa đơn"));

      const refreshed = await loadData();
      if (refreshed) {
        setClosingEditSale(true);
        setToast({ text: "Đã cập nhật hóa đơn", type: "success" });
      }
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi cập nhật hóa đơn", type: "error" });
    } finally {
      setSavingEditSale(false);
    }
  }

  function requestDeleteSale(sale: StoreSale) {
    openConfirm(`Xóa đợt mua của “${sale.customer_name_snapshot}” ngày ${formatDate(sale.sold_date)}?`, async () => {
      try {
        const response = await fetch(`/api/store-sales?id=${encodeURIComponent(sale.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(await getErrorText(response, "Lỗi xóa đợt mua"));
        await loadData();
        setToast({ text: "Đã xóa đợt mua", type: "success" });
      } catch (error) {
        setToast({ text: error instanceof Error ? error.message : "Lỗi xóa đợt mua", type: "error" });
      }
    });
  }

  function resetFilters() {
    setFromDate("");
    setToDate("");
    setSelectedProductIds(data.products.map((product) => product.id));
    setCustomerId("");
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3 pt-1">
          <Link
            href={backHref}
            className="w-9 h-9 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-500 shrink-0"
            aria-label={backHref === "/customers" ? "Quay lại khách hàng" : "Quay lại bán hàng"}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
            <CircleDollarSign className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Thống kê bán hàng</h1>
            <p className="text-xs text-gray-400">Theo ngày, tháng, mặt hàng & khách</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadData();
            }}
            disabled={loading}
            className="w-9 h-9 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-indigo-600 disabled:opacity-50"
            aria-label="Tải lại thống kê"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

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

            <ProductFilterButton
              products={data.products}
              selectedIds={selectedProductIds}
              onOpen={openProductFilter}
              onClear={() => setSelectedProductIds(data.products.map((product) => product.id))}
            />
            <div className="relative">
              <Select className={`h-10 ${customerId ? "pr-11" : ""}`} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Tất cả khách hàng</option>
                {data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </Select>
              {customerId && (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  onClick={() => setCustomerId("")}
                  aria-label="Xoá bộ lọc khách hàng"
                  title="Xoá bộ lọc khách hàng"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              className="h-9 w-full rounded-xl bg-gray-100 text-xs font-semibold text-gray-600 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              onClick={resetFilters}
              disabled={!fromDate && !toDate && allProductsSelected && !customerId}
            >
              Xoá bộ lọc
            </button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <StatTile icon={<CircleDollarSign className="w-4 h-4 text-indigo-500" />} label="Doanh thu" value={formatMoney(stats.totals.total_amount)} />
          <StatTile icon={<UsersRound className="w-4 h-4 text-sky-500" />} label="Khách trong kỳ" value={String(stats.totals.customer_count)} />
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="min-w-0 flex items-center gap-2">
                <h2 className="font-bold text-gray-900 flex items-center gap-2 whitespace-nowrap">
                  <CalendarDays className="w-4 h-4 text-indigo-600" />
                  {chartMetric === "quantity" ? "Số lượng bán" : "Doanh thu"}
                </h2>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{stats.periods.length} kỳ</span>
              </div>
              <div className="inline-flex shrink-0 rounded-lg bg-gray-100 p-0.5">
                <button
                  type="button"
                  className={`h-7 rounded-md px-2 text-[10px] font-semibold transition-all ${chartMetric === "quantity" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}
                  onClick={() => setChartMetric("quantity")}
                  aria-pressed={chartMetric === "quantity"}
                  title="Xem số lượng"
                >
                  SL
                </button>
                <button
                  type="button"
                  className={`h-7 rounded-md px-2 text-[10px] font-semibold transition-all ${chartMetric === "amount" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}
                  onClick={() => setChartMetric("amount")}
                  aria-pressed={chartMetric === "amount"}
                  title="Xem doanh thu"
                >
                  Doanh thu
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="inline-flex shrink-0 rounded-lg bg-gray-100 p-0.5">
                <button
                  type="button"
                  className={`h-7 rounded-md px-2 text-[10px] font-semibold transition-all ${granularity === "day" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}
                  onClick={() => setGranularity("day")}
                  aria-pressed={granularity === "day"}
                >
                  Theo ngày
                </button>
                <button
                  type="button"
                  className={`h-7 rounded-md px-2 text-[10px] font-semibold transition-all ${granularity === "month" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}
                  onClick={() => setGranularity("month")}
                  aria-pressed={granularity === "month"}
                >
                  Theo tháng
                </button>
              </div>
              <label className={`flex items-center gap-1.5 text-[10px] font-medium text-gray-500 transition-opacity ${granularity === "month" ? "" : "opacity-40"}`}>
                Kỳ từ ngày
                <select
                  className="h-7 w-11 rounded-lg border border-gray-200 bg-white px-1 text-center text-xs font-semibold text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed"
                  value={monthStartDay}
                  onChange={(event) => setMonthStartDay(Number(event.target.value))}
                  disabled={granularity !== "month"}
                  aria-label="Ngày bắt đầu kỳ tháng"
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedProducts.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
                {selectedProducts.map((product) => (
                  <span key={product.id} className="inline-flex max-w-full items-center gap-1.5 text-[10px] font-medium text-gray-500">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: productColorById.get(product.id) }} />
                    <span className="truncate">{product.name}</span>
                  </span>
                ))}
              </div>
            )}

            {loading ? (
              <div className="h-44 flex items-center justify-center text-sm text-gray-400">Đang tải...</div>
            ) : selectedProducts.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-gray-400">Chưa chọn mặt hàng</div>
            ) : stats.periods.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-gray-400">Chưa có dữ liệu phù hợp</div>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div
                  className="flex h-52 items-end justify-center gap-0.5"
                  style={{ minWidth: Math.max(stats.periods.length * periodGroupWidth + Math.max(stats.periods.length - 1, 0) * 2, 320) }}
                >
                  {stats.periods.map((period) => {
                    const label = periodLabel(period.period, granularity, monthStartDay);
                    return (
                      <div
                        key={period.period}
                        className="flex h-full shrink-0 flex-col items-center justify-end gap-1"
                        style={{ width: periodGroupWidth }}
                      >
                        <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                          {selectedProducts.map((selectedProduct) => {
                            const product = period.products.find((item) => item.id === selectedProduct.id);
                            const value = chartMetric === "quantity" ? product?.total_quantity ?? 0 : product?.total_amount ?? 0;
                            const height = maxPeriodValue > 0 && value > 0 ? Math.max((value / maxPeriodValue) * 100, 5) : 0;
                            const color = productColorById.get(selectedProduct.id) ?? PRODUCT_COLORS[0];
                            return (
                              <div key={selectedProduct.id} className="flex h-full w-7 shrink-0 flex-col items-center justify-end gap-1">
                                <span
                                  className="max-w-12 whitespace-nowrap border-b px-0.5 py-px text-[9px] font-bold leading-none tabular-nums"
                                  style={{ color, borderColor: color, backgroundColor: `${color}18` }}
                                  title={selectedProduct.name}
                                >
                                  {value > 0 ? (chartMetric === "quantity" ? formatQty(value) : formatCompactMoney(value)) : ""}
                                </span>
                                <div className="flex w-full flex-1 items-end justify-center">
                                  <div
                                    className="w-4 rounded-t-md transition-[height]"
                                    style={{ height: `${height}%`, backgroundColor: color }}
                                    title={`${selectedProduct.name} · ${label}: ${chartMetric === "quantity" ? `${formatQty(value)} cây` : formatMoney(value)}`}
                                    aria-label={`${selectedProduct.name} · ${label}: ${chartMetric === "quantity" ? `${formatQty(value)} cây` : formatMoney(value)}`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <span className="h-8 text-[10px] text-gray-400 text-center leading-3">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-amber-500" />
              Theo mặt hàng
            </h2>
            <div className="divide-y divide-gray-100">
              {stats.products.length === 0 && <p className="py-5 text-center text-sm text-gray-400">Chưa có dữ liệu</p>}
              {stats.products.map((product, index) => {
                const batches = salesByProduct.get(product.id) ?? [];
                const expanded = expandedProductIds.has(product.id);
                const detailsId = `product-batches-${index}`;
                return (
                  <div key={product.id} className="py-3">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => toggleProductDetails(product.id)}
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                    >
                      <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{product.name}</p>
                        <p className="text-[11px] text-gray-400">sl: {formatQty(product.total_quantity)} · {product.sale_count} đợt bán</p>
                      </div>
                      <span className="max-w-[36%] text-sm font-bold text-indigo-600 break-all text-right">{formatMoney(product.total_amount)}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    <Collapse open={expanded}>
                      <div id={detailsId} className="mt-2 ml-10 overflow-hidden rounded-xl border border-amber-100/80 bg-amber-50/40">
                        {batches.map((batch) => (
                          <div
                            key={batch.id}
                            className="grid grid-cols-[minmax(0,1fr)_minmax(0,42%)] items-center gap-3 border-b border-amber-100/70 px-2.5 py-2 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-700">{formatDate(batch.soldDate)}</p>
                              <p className="truncate text-[10px] text-gray-400">{batch.customerName}</p>
                            </div>
                            <div className="min-w-0 text-right">
                              <p className="text-xs font-semibold text-gray-700">sl: {formatQty(batch.quantity)}</p>
                              <p className="break-all text-[10px] font-semibold text-amber-700">{formatMoney(batch.amount)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
              <UsersRound className="w-4 h-4 text-sky-500" />
              Theo khách hàng
            </h2>
            <div className="divide-y divide-gray-100">
              {stats.customers.length === 0 && <p className="py-5 text-center text-sm text-gray-400">Chưa có dữ liệu</p>}
              {stats.customers.map((customer, index) => {
                const batches = salesByCustomer.get(customer.id) ?? [];
                const expanded = expandedCustomerIds.has(customer.id);
                const detailsId = `customer-batches-${index}`;
                return (
                  <div key={customer.id} className="py-3">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => toggleCustomerDetails(customer.id)}
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                    >
                      <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{customer.name}</p>
                        <p className="text-[11px] text-gray-400">sl: {formatQty(customer.total_quantity)} · {customer.sale_count} đợt bán</p>
                      </div>
                      <span className="max-w-[36%] text-sm font-bold text-indigo-600 break-all text-right">{formatMoney(customer.total_amount)}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    <Collapse open={expanded}>
                      <div id={detailsId} className="mt-2 ml-10 space-y-2">
                        {batches.map((sale) => {
                          const batchQuantity = sale.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                          return (
                            <div key={sale.id} className="rounded-xl border border-sky-100 bg-sky-50/50">
                              <div className="flex items-center justify-between gap-3 px-2.5 py-2">
                                <div className="min-w-0 flex gap-2">
                                  <p className="text-xs font-semibold text-gray-700">{formatDate(sale.sold_date)}</p>
                                  <i className="text-[10px] text-gray-400">tổng: {formatQty(batchQuantity)}</i>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <span className="max-w-24 break-all text-right text-xs font-semibold text-sky-700">
                                    {formatMoney(Number(sale.total_amount))}
                                  </span>
                                  <div
                                    className="relative"
                                    onBlur={(event) => {
                                      const nextFocus = event.relatedTarget;
                                      if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                                        setOpenSaleActionId(null);
                                      }
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className=" flex h-6 w-6 items-center justify-center text-gray-500 hover:bg-gray-50"
                                      onClick={() => setOpenSaleActionId((current) => current === sale.id ? null : sale.id)}
                                      aria-label={`Mở thao tác cho đợt mua ngày ${formatDate(sale.sold_date)}`}
                                      aria-haspopup="menu"
                                      aria-expanded={openSaleActionId === sale.id}
                                      title="Thao tác"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {openSaleActionId === sale.id && (
                                      <div
                                        role="menu"
                                        className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
                                      >
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
                                          onClick={() => startEditSale(sale)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                          Sửa
                                        </button>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-red-500 hover:bg-red-50"
                                          onClick={() => {
                                            setOpenSaleActionId(null);
                                            requestDeleteSale(sale);
                                          }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Xóa
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-b-xl divide-y divide-sky-100/80 border-t border-sky-100/80 bg-white/60">
                                {sale.items.map((item) => (
                                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-1.5">
                                    <div className="min-w-0 ">
                                      <p className="truncate text-[11px] font-semibold text-gray-600">{item.product_name_snapshot}</p>
                                    </div>
                                    <div className="flex flex-col">
                                      <p className="text-[10px] text-gray-400 text-right"> sl: {formatQty(Number(item.quantity))}</p>

                                      <span className="max-w-28 break-all text-right text-[10px] font-semibold text-sky-700">
                                      {formatMoney(Number(item.line_total))}
                                    </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomSheet
        open={Boolean(editingSale)}
        closing={closingEditSale}
        title="Sửa hóa đơn"
        description={`${editSaleForm.lines.length} mặt hàng · ${formatMoney(editSaleTotal)}`}
        icon={<Pencil className="h-5 w-5" />}
        onCloseRequest={requestCloseEditSale}
        onClosed={finishCloseEditSale}
        closeLabel="Đóng form sửa hóa đơn"
        height="86vh"
        zIndex={50}
      >
        <form className="flex min-h-full flex-col gap-4" onSubmit={saveSaleEdit}>
          <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Khách hàng</span>
              <Input
                className="h-11"
                value={editSaleForm.customerName}
                onChange={(event) => setEditSaleForm((current) => ({ ...current, customerName: event.target.value }))}
                list="sales-stats-customer-options"
                autoComplete="off"
                autoFocus
              />
              <datalist id="sales-stats-customer-options">
                {data.customers.map((customer) => <option key={customer.id} value={customer.name} />)}
              </datalist>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ngày bán</span>
              <Input
                className="h-11 px-2"
                type="date"
                value={editSaleForm.soldDate}
                onChange={(event) => setEditSaleForm((current) => ({ ...current, soldDate: event.target.value }))}
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mặt hàng</span>
              <span className="text-xs font-semibold text-indigo-600">{editSaleForm.lines.length} đã chọn</span>
            </div>

            <select
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-indigo-400"
              value=""
              onChange={(event) => addEditSaleProduct(event.target.value)}
              disabled={availableEditProducts.length === 0}
              aria-label="Thêm mặt hàng vào hóa đơn"
            >
              <option value="" disabled>
                {availableEditProducts.length > 0 ? "+ Thêm mặt hàng" : "Đã chọn tất cả mặt hàng"}
              </option>
              {availableEditProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {formatMoney(Number(product.unit_price))}
                </option>
              ))}
            </select>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              {editSaleForm.lines.map((line) => (
                <div
                  key={line.id ?? line.productId}
                  className="flex min-h-16 items-center gap-2 border-t border-gray-100 px-3 py-2 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{line.productName}</p>
                    <p className="text-xs text-gray-400">
                      {formatMoney(line.unitPrice)} · {formatMoney(line.unitPrice * (Number(line.quantity) || 0))}
                    </p>
                  </div>
                  <FormattedNumberInput
                    className="h-9 w-20 px-2 text-center font-bold"
                    value={line.quantity}
                    onValueChange={(value) => setEditSaleLineQuantity(line.productId, value)}
                    aria-label={`Số lượng ${line.productName}`}
                  />
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 disabled:opacity-40"
                    onClick={() => removeEditSaleProduct(line.productId)}
                    disabled={editSaleForm.lines.length <= 1}
                    aria-label={`Xóa ${line.productName} khỏi hóa đơn`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-5 -mb-4 mt-auto border-t border-gray-100 bg-white px-5 pb-3 pt-3 shadow-[0_-8px_20px_rgba(255,255,255,0.95)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-600">Tổng hóa đơn</span>
              <span className="text-xl font-bold text-indigo-700">{formatMoney(editSaleTotal)}</span>
            </div>
            <button
              type="submit"
              disabled={savingEditSale}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:bg-indigo-300"
            >
              {savingEditSale ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </BottomSheet>

      {showProductFilter && (
        <ProductFilterSheet
          products={data.products}
          selectedIds={selectedProductIds}
          closing={closingProductFilter}
          onChange={setSelectedProductIds}
          onClose={closeProductFilter}
          onAnimationEnd={handleProductFilterAnimEnd}
        />
      )}

      {confirmModal}
    </>
  );
}

export default function SalesStatsPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto py-8 text-center text-sm text-gray-400">Đang tải thống kê...</div>}>
      <SalesStatsPageContent />
    </Suspense>
  );
}
