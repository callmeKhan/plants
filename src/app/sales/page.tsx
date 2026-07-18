"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Mic,
  MicOff,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Collapse } from "@/components/ui/collapse";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Toast, type ToastMsg } from "@/components/ui/toast";
import {
  normalizeStoreSalesData,
  sortStoreSales,
  type StoreProduct,
  type StoreSale,
  type StoreSaleItem,
  type StoreSalesData,
} from "@/lib/store-sales";

type ProductForm = { name: string; unitPrice: string };
type SaleLine = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: string;
};
type SaleForm = {
  customerId: string;
  customerName: string;
  soldDate: string;
  lines: SaleLine[];
};
type ProductBatch = { sale: StoreSale; item: StoreSaleItem };
type ProductGroup = { product: StoreProduct; batches: ProductBatch[] };
type VoiceLineOperation = "replace" | "add" | "remove";
type VoiceProductMatch = {
  product: StoreProduct;
  quantity: number;
  index: number;
  operation: VoiceLineOperation;
};
type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type BrowserSpeechRecognitionErrorEvent = { error: string };
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const SPOKEN_QUANTITIES: Array<[string, number]> = [
  ["hai muoi", 20],
  ["muoi chin", 19],
  ["muoi tam", 18],
  ["muoi bay", 17],
  ["muoi sau", 16],
  ["muoi lam", 15],
  ["muoi nam", 15],
  ["muoi bon", 14],
  ["muoi tu", 14],
  ["muoi ba", 13],
  ["muoi hai", 12],
  ["muoi mot", 11],
  ["muoi", 10],
  ["chin", 9],
  ["tam", 8],
  ["bay", 7],
  ["sau", 6],
  ["lam", 5],
  ["nam", 5],
  ["bon", 4],
  ["tu", 4],
  ["ba", 3],
  ["hai", 2],
  ["mot", 1],
];

function normalizeSpeechText(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/(\d)[,.](\d)/g, "$1.$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPhraseOccurrences(text: string, phrase: string) {
  const occurrences: number[] = [];
  let fromIndex = 0;

  while (fromIndex <= text.length - phrase.length) {
    const index = text.indexOf(phrase, fromIndex);
    if (index < 0) break;
    const before = index === 0 ? " " : text[index - 1];
    const after = index + phrase.length === text.length ? " " : text[index + phrase.length];
    if (before === " " && after === " ") occurrences.push(index);
    fromIndex = index + phrase.length;
  }

  return occurrences;
}

function spokenQuantityBefore(text: string, index: number, startIndex = 0) {
  const prefix = text.slice(startIndex, index).trim()
    .replace(/\s+(?:cay|mon|san pham)$/, "");
  const numericMatch = prefix.match(/(\d+(?:[.,]\d+)?)$/);
  if (numericMatch) {
    const quantity = Number(numericMatch[1].replace(",", "."));
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
  }

  for (const [phrase, quantity] of SPOKEN_QUANTITIES) {
    if (prefix === phrase || prefix.endsWith(` ${phrase}`)) return quantity;
  }

  return 1;
}

function spokenQuantityAfter(text: string, index: number) {
  const suffix = text.slice(index).trimStart();
  const quantityText = suffix.match(/^(?:so luong|sl)\s+(.+)$/)?.[1];
  if (!quantityText) return null;

  const numericMatch = quantityText.match(/^(\d+(?:[.,]\d+)?)(?:\s|$)/);
  if (numericMatch) {
    const quantity = Number(numericMatch[1].replace(",", "."));
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
  }

  for (const [phrase, quantity] of SPOKEN_QUANTITIES) {
    if (quantityText === phrase || quantityText.startsWith(`${phrase} `)) return quantity;
  }

  return null;
}

function spokenQuantityBetween(text: string, startIndex: number, endIndex: number) {
  let segment = text.slice(startIndex, endIndex).trim();
  const operationMatches = Array.from(segment.matchAll(/(?:^|\s)(?:them|bo|xoa)(?=\s|$)/g));
  const lastOperation = operationMatches.at(-1);
  if (lastOperation) {
    segment = segment.slice((lastOperation.index ?? 0) + lastOperation[0].length).trim();
  }
  segment = segment
    .replace(/^(?:va|voi)\s+/, "")
    .replace(/\s+(?:cay|mon|san pham)$/, "");
  const numericMatch = segment.match(/^(\d+(?:[.,]\d+)?)$/);
  if (numericMatch) {
    const quantity = Number(numericMatch[1].replace(",", "."));
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
  }

  return SPOKEN_QUANTITIES.find(([phrase]) => segment === phrase)?.[1] ?? 1;
}

function voiceOperationBefore(text: string, index: number, startIndex = 0): VoiceLineOperation {
  const prefix = text.slice(startIndex, index);
  const operationMatches = Array.from(prefix.matchAll(/(?:^|\s)(them|bo|xoa)(?=\s|$)/g));
  const operation = operationMatches.at(-1)?.[1];
  if (operation === "them") return "add";
  if (operation === "bo" || operation === "xoa") return "remove";
  return "replace";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emptySaleForm(): SaleForm {
  return { customerId: "", customerName: "", soldDate: todayStr(), lines: [] };
}

function fmtDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)}đ`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

async function getErrorText(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function SaleConfirmationModal({
  form,
  total,
  saving,
  editing,
  onCancel,
  onConfirm,
}: {
  form: SaleForm;
  total: number;
  saving: boolean;
  editing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 px-4 py-5"
      style={{ zIndex: 60 }}
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      <div
        className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-confirmation-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 pb-3 pt-5 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <FileText className="h-5 w-5" />
          </div>
          <h2 id="sale-confirmation-title" className="font-bold text-gray-900">
            {editing ? "Xác nhận cập nhật hóa đơn" : "Xác nhận hóa đơn"}
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">Kiểm tra lần cuối trước khi lưu</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <span className="text-gray-400">Khách hàng</span>
            <span className="truncate text-right font-semibold text-gray-800">{form.customerName.trim()}</span>
            <span className="text-gray-400">Ngày bán</span>
            <span className="text-right font-semibold text-gray-800">{fmtDate(form.soldDate)}</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <span>Mặt hàng</span>
              <span>Thành tiền</span>
            </div>
            <div className="divide-y divide-gray-100">
              {form.lines.map((line) => {
                const quantity = Number(line.quantity);
                return (
                  <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">{line.productName}</p>
                      <p className="text-[11px] text-gray-400">
                        {formatQty(quantity)} x {formatMoney(line.unitPrice)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-800">
                      {formatMoney(quantity * line.unitPrice)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-gray-200 pt-3">
            <span className="font-semibold text-gray-600">Tổng hóa đơn</span>
            <span className="text-xl font-bold text-indigo-700">{formatMoney(total)}</span>
          </div>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 pb-5 pt-3">
          <button
            type="button"
            className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50"
            onClick={onCancel}
            disabled={saving}
          >
            Quay lại sửa
          </button>
          <button
            type="button"
            className="h-11 flex-1 rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:bg-indigo-300"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? "Đang lưu..." : "Xác nhận & lưu"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

async function fetchSalesData(signal?: AbortSignal) {
  const response = await fetch("/api/store-sales", { cache: "no-store", signal });
  if (!response.ok) throw new Error(await getErrorText(response, "Lỗi tải dữ liệu bán hàng"));
  return normalizeStoreSalesData(await response.json());
}

export default function SalesPage() {
  const [data, setData] = useState<StoreSalesData>({ products: [], customers: [], sales: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>({ name: "", unitPrice: "" });
  const [editProductForm, setEditProductForm] = useState<ProductForm>({ name: "", unitPrice: "" });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [openProductForm, setOpenProductForm] = useState(false);
  const [openSaleForm, setOpenSaleForm] = useState(false);
  const [closingSaleSheet, setClosingSaleSheet] = useState(false);
  const [confirmingSale, setConfirmingSale] = useState(false);
  const [showSaleSummary, setShowSaleSummary] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [saleForm, setSaleForm] = useState<SaleForm>(emptySaleForm);
  const [saleProductQuery, setSaleProductQuery] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const editSaleRequestHandledRef = useRef(false);
  const quantityInputRefs = useRef(new Map<string, HTMLInputElement>());
  const [openConfirm, confirmModal] = useConfirm();

  const loadData = useCallback(async () => {
    try {
      setData(await fetchSalesData());
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi tải dữ liệu bán hàng", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function initialLoad() {
      try {
        setData(await fetchSalesData(controller.signal));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setToast({ text: error instanceof Error ? error.message : "Lỗi tải dữ liệu bán hàng", type: "error" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void initialLoad();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (loading || editSaleRequestHandledRef.current) return;

    const url = new URL(window.location.href);
    const editSaleId = url.searchParams.get("editSaleId")?.trim();
    editSaleRequestHandledRef.current = true;
    if (!editSaleId) return;

    url.searchParams.delete("editSaleId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    const sale = data.sales.find((item) => item.id === editSaleId);
    if (!sale) {
      window.setTimeout(() => {
        setToast({ text: "Không tìm thấy hóa đơn cần sửa", type: "error" });
      }, 0);
      return;
    }

    window.setTimeout(() => {
      setOpenProductForm(false);
      setClosingSaleSheet(false);
      setConfirmingSale(false);
      setShowSaleSummary(false);
      setEditingSaleId(sale.id);
      setSaleForm({
        customerId: sale.customer_id ?? "",
        customerName: sale.customer_name_snapshot,
        soldDate: sale.sold_date,
        lines: sale.items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name_snapshot,
          unitPrice: Number(item.unit_price_snapshot),
          quantity: String(item.quantity),
        })),
      });
      setSaleProductQuery("");
      setVoiceTranscript("");
      setOpenSaleForm(true);
    }, 0);
  }, [data.sales, loading]);

  useEffect(() => {
    if (!openSaleForm) return;

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
  }, [openSaleForm]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const sales = useMemo(() => sortStoreSales(data.sales), [data.sales]);
  const productGroups = useMemo<ProductGroup[]>(() => {
    const batchesByProduct = new Map<string, ProductBatch[]>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const batches = batchesByProduct.get(item.product_id) ?? [];
        batches.push({ sale, item });
        batchesByProduct.set(item.product_id, batches);
      }
    }
    return data.products
      .map((product) => ({ product, batches: batchesByProduct.get(product.id) ?? [] }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name, "vi", { sensitivity: "base", numeric: true }));
  }, [data.products, sales]);

  const filteredGroups = useMemo(() => {
    const query = normalizeSpeechText(searchQuery);
    if (!query) return productGroups;
    return productGroups.filter((group) => normalizeSpeechText(
      `${group.product.name} ${group.product.product_code ? `ma ${group.product.product_code}` : ""}`,
    ).includes(query));
  }, [productGroups, searchQuery]);

  const customerSuggestions = useMemo(() => {
    const query = saleForm.customerName.trim().toLocaleLowerCase("vi");
    if (!query) return data.customers.slice(0, 8);
    return data.customers
      .filter((customer) => customer.name.toLocaleLowerCase("vi").includes(query))
      .slice(0, 8);
  }, [data.customers, saleForm.customerName]);

  const quickSaleProducts = useMemo(() => {
    const query = normalizeSpeechText(saleProductQuery);
    const selectedProductIds = new Set(saleForm.lines.map((line) => line.productId));
    return data.products
      .filter((product) => !query || normalizeSpeechText(
        `${product.name} ${product.product_code ? `ma ${product.product_code}` : ""}`,
      ).includes(query))
      .sort((a, b) => {
        const selectedOrder = Number(selectedProductIds.has(b.id)) - Number(selectedProductIds.has(a.id));
        return selectedOrder || a.name.localeCompare(b.name, "vi", { sensitivity: "base", numeric: true });
      });
  }, [data.products, saleForm.lines, saleProductQuery]);

  const voiceExampleCode = useMemo(
    () => data.products.find((product) => product.product_code)?.product_code ?? null,
    [data.products],
  );

  const saleLineByProductId = useMemo(
    () => new Map(saleForm.lines.map((line) => [line.productId, line])),
    [saleForm.lines],
  );

  const saleTotal = useMemo(() => saleForm.lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    return sum + (Number.isFinite(quantity) ? quantity * line.unitPrice : 0);
  }, 0), [saleForm.lines]);

  function showProductForm() {
    setOpenSaleForm(false);
    setEditingSaleId(null);
    setOpenProductForm((current) => !current);
  }

  function startNewSale() {
    if (data.products.length === 0) {
      setOpenProductForm(true);
      setToast({ text: "Hãy tạo mặt hàng trước khi bán", type: "error" });
      return;
    }
    setOpenProductForm(false);
    setClosingSaleSheet(false);
    setConfirmingSale(false);
    setShowSaleSummary(false);
    setEditingSaleId(null);
    setSaleForm(emptySaleForm());
    setSaleProductQuery("");
    setVoiceTranscript("");
    setOpenSaleForm(true);
  }

  function closeSaleForm() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setVoiceListening(false);
    setClosingSaleSheet(false);
    setConfirmingSale(false);
    setShowSaleSummary(false);
    setOpenSaleForm(false);
    setEditingSaleId(null);
    setSaleForm(emptySaleForm());
    setSaleProductQuery("");
    setVoiceTranscript("");
  }

  function requestCloseSaleSheet() {
    recognitionRef.current?.abort();
    setVoiceListening(false);
    setClosingSaleSheet(true);
  }

  function clearSaleDraft() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setVoiceListening(false);
    setConfirmingSale(false);
    setShowSaleSummary(false);
    setSaleForm(emptySaleForm());
    setSaleProductQuery("");
    setVoiceTranscript("");
    setShowCustomerSuggestions(false);
  }

  function requestClearSaleDraft() {
    openConfirm("Xóa toàn bộ nội dung đang nhập trong form bán nhanh?", clearSaleDraft);
  }

  function focusQuantityInput(productId: string) {
    const input = quantityInputRefs.current.get(productId);
    input?.focus();
    input?.select();
  }

  function selectProductForSale(product: StoreProduct) {
    flushSync(() => {
      setSaleForm((current) => current.lines.some((line) => line.productId === product.id)
        ? current
        : {
          ...current,
          lines: [...current.lines, {
            id: uuidv4(),
            productId: product.id,
            productName: product.name,
            unitPrice: Number(product.unit_price),
            quantity: "0",
          }],
        });
    });
    focusQuantityInput(product.id);
  }

  function setSaleLineQuantity(productId: string, quantity: string) {
    setSaleForm((current) => ({
      ...current,
      lines: current.lines.map((line) => line.productId === productId ? { ...line, quantity } : line),
    }));
  }

  function requestResetSaleLineQuantity(productId: string, productName: string) {
    openConfirm(`Đưa số lượng “${productName}” về 0?`, () => {
      setSaleLineQuantity(productId, "0");
    });
  }

  function requestRemoveSaleLine(productId: string, productName: string) {
    const line = saleForm.lines.find((item) => item.productId === productId);
    if (!line) return;
    if (line.quantity.trim() === "" || Number(line.quantity) !== 0) {
      setToast({ text: "Chỉ có thể xóa mặt hàng khi số lượng bằng 0", type: "error" });
      return;
    }

    openConfirm(`Xóa “${productName}” khỏi danh sách đã chọn?`, () => {
      setSaleForm((current) => ({
        ...current,
        lines: current.lines.filter((item) => item.productId !== productId),
      }));
    });
  }

  function setCustomerName(name: string) {
    const exact = data.customers.find(
      (customer) => customer.name.toLocaleLowerCase("vi") === name.trim().toLocaleLowerCase("vi"),
    );
    setSaleForm((current) => ({ ...current, customerName: name, customerId: exact?.id ?? "" }));
  }

  function applyVoiceDraft(transcript: string) {
    const normalizedTranscript = normalizeSpeechText(transcript);
    const matchedCustomerEntry = [...data.customers]
      .sort((a, b) => normalizeSpeechText(b.name).length - normalizeSpeechText(a.name).length)
      .map((customer) => ({
        customer,
        normalizedName: normalizeSpeechText(customer.name),
      }))
      .map((entry) => ({
        ...entry,
        index: findPhraseOccurrences(normalizedTranscript, entry.normalizedName)[0] ?? -1,
      }))
      .find((entry) => entry.index >= 0);
    const matchedCustomer = matchedCustomerEntry?.customer;
    const quantityStartIndex = matchedCustomerEntry
      ? matchedCustomerEntry.index + matchedCustomerEntry.normalizedName.length
      : 0;
    const occupiedRanges: Array<{ start: number; end: number }> = [];
    const productMatches: VoiceProductMatch[] = [];

    const codeMatches = data.products
      .flatMap((product) => {
        if (!product.product_code) return [];
        const codePhrases = [`ma ${product.product_code}`, `ma so ${product.product_code}`];
        return codePhrases.flatMap((phrase) => findPhraseOccurrences(normalizedTranscript, phrase)
          .map((index) => ({ product, index, end: index + phrase.length })));
      })
      .sort((a, b) => a.index - b.index);

    if (codeMatches.length > 0) {
      let previousEnd = quantityStartIndex;
      for (const match of codeMatches) {
        productMatches.push({
          product: match.product,
          quantity: spokenQuantityAfter(normalizedTranscript, match.end)
            ?? spokenQuantityBetween(normalizedTranscript, previousEnd, match.index),
          index: match.index,
          operation: voiceOperationBefore(normalizedTranscript, match.index, quantityStartIndex),
        });
        previousEnd = match.end;
      }
    } else {
      const productsByLongestName = [...data.products].sort(
        (a, b) => normalizeSpeechText(b.name).length - normalizeSpeechText(a.name).length,
      );

      for (const product of productsByLongestName) {
        const normalizedName = normalizeSpeechText(product.name);
        if (!normalizedName) continue;
        for (const index of findPhraseOccurrences(normalizedTranscript, normalizedName)) {
          const end = index + normalizedName.length;
          if (occupiedRanges.some((range) => index < range.end && end > range.start)) continue;
          occupiedRanges.push({ start: index, end });
          productMatches.push({
            product,
            quantity: spokenQuantityBefore(normalizedTranscript, index, quantityStartIndex),
            index,
            operation: voiceOperationBefore(normalizedTranscript, index, quantityStartIndex),
          });
        }
      }
    }

    if (productMatches.length === 0) {
      setToast({
        text: voiceExampleCode
          ? `Chưa nhận ra mặt hàng. Hãy nói “mã ${voiceExampleCode} số lượng 2” hoặc đúng tên mặt hàng.`
          : "Chưa nhận ra mặt hàng. Hãy nói đúng tên trong danh sách.",
        type: "error",
      });
      return;
    }

    const sortedMatches = [...productMatches].sort((a, b) => a.index - b.index);
    const hasUpdateOperation = sortedMatches.some((match) => match.operation !== "replace");
    const affectedProductCount = new Set(sortedMatches.map((match) => match.product.id)).size;

    if (hasUpdateOperation) {
      setSaleForm((current) => {
        const nextLines = [...current.lines];

        for (const match of sortedMatches) {
          const lineIndex = nextLines.findIndex((line) => line.productId === match.product.id);
          const currentQuantity = lineIndex >= 0 ? Number(nextLines[lineIndex].quantity) || 0 : 0;
          const nextQuantity = Math.round((match.operation === "add"
            ? currentQuantity + match.quantity
            : match.operation === "remove"
              ? currentQuantity - match.quantity
              : match.quantity) * 100) / 100;

          if (nextQuantity <= 0) {
            if (lineIndex >= 0 && match.operation === "remove") {
              nextLines[lineIndex] = { ...nextLines[lineIndex], quantity: "0" };
            }
            continue;
          }

          const nextLine: SaleLine = {
            id: lineIndex >= 0 ? nextLines[lineIndex].id : uuidv4(),
            productId: match.product.id,
            productName: match.product.name,
            unitPrice: Number(match.product.unit_price),
            quantity: String(nextQuantity),
          };
          if (lineIndex >= 0) nextLines[lineIndex] = nextLine;
          else nextLines.push(nextLine);
        }

        return {
          ...current,
          customerId: matchedCustomer?.id ?? current.customerId,
          customerName: matchedCustomer?.name ?? current.customerName,
          lines: nextLines,
        };
      });

      const operations = new Set(sortedMatches.map((match) => match.operation));
      setToast({
        text: operations.size === 1 && operations.has("add")
          ? `Đã thêm ${affectedProductCount} mặt hàng vào hóa đơn hiện tại.`
          : operations.size === 1 && operations.has("remove")
            ? `Đã giảm số lượng ${affectedProductCount} mặt hàng trong hóa đơn.`
            : `Đã cập nhật ${affectedProductCount} mặt hàng trong hóa đơn.`,
        type: "success",
      });
      return;
    }

    const quantityByProduct = new Map<string, { product: StoreProduct; quantity: number; index: number }>();
    for (const match of sortedMatches) {
      const current = quantityByProduct.get(match.product.id);
      quantityByProduct.set(match.product.id, {
        product: match.product,
        quantity: (current?.quantity ?? 0) + match.quantity,
        index: Math.min(current?.index ?? match.index, match.index),
      });
    }

    const matchedProducts = Array.from(quantityByProduct.values()).sort((a, b) => a.index - b.index);
    setSaleForm((current) => ({
      ...current,
      customerId: matchedCustomer?.id ?? current.customerId,
      customerName: matchedCustomer?.name ?? current.customerName,
      lines: matchedProducts.map(({ product, quantity }) => {
        const existingLine = current.lines.find((line) => line.productId === product.id);
        return {
          id: existingLine?.id ?? uuidv4(),
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.unit_price),
          quantity: String(quantity),
        };
      }),
    }));
    setToast({
      text: matchedCustomer
        ? `Đã tạo nháp: ${matchedProducts.length} mặt hàng cho ${matchedCustomer.name}`
        : `Đã nhận ${matchedProducts.length} mặt hàng. Hãy chọn khách hàng trước khi lưu.`,
      type: "success",
    });
  }

  function startVoiceDraft() {
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setToast({ text: "Trình duyệt này chưa hỗ trợ nhập hóa đơn bằng giọng nói", type: "error" });
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setVoiceTranscript(transcript);
      if (transcript) applyVoiceDraft(transcript);
    };
    recognition.onerror = (event) => {
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Hãy cấp quyền microphone để dùng nhập bằng giọng nói"
        : event.error === "no-speech"
          ? "Không nghe thấy nội dung. Hãy thử nói lại gần microphone hơn."
          : "Không thể nhận giọng nói. Hãy thử lại.";
      setToast({ text: message, type: "error" });
    };
    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceListening(false);
      setToast({ text: "Không thể mở microphone. Hãy thử lại.", type: "error" });
    }
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    const name = productForm.name.trim();
    const unitPrice = Number(productForm.unitPrice);
    if (!name || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setToast({ text: "Nhập tên mặt hàng và giá bán hợp lệ", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/store-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uuidv4(), name, unit_price: unitPrice }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi lưu mặt hàng"));
      setProductForm({ name: "", unitPrice: "" });
      await loadData();
      setToast({ text: "Đã thêm mặt hàng", type: "success" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi lưu mặt hàng", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function startEditProduct(product: StoreProduct) {
    setEditingProductId(product.id);
    setEditProductForm({ name: product.name, unitPrice: String(product.unit_price) });
  }

  async function saveProduct(productId: string) {
    const name = editProductForm.name.trim();
    const unitPrice = Number(editProductForm.unitPrice);
    if (!name || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setToast({ text: "Nhập tên mặt hàng và giá bán hợp lệ", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/store-products?id=${encodeURIComponent(productId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unit_price: unitPrice }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi cập nhật mặt hàng"));
      setEditingProductId(null);
      await loadData();
      setToast({ text: "Đã cập nhật mặt hàng; hóa đơn cũ giữ nguyên giá", type: "success" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi cập nhật mặt hàng", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function requestSaleConfirmation(event: FormEvent) {
    event.preventDefault();
    const customerName = saleForm.customerName.trim();
    const invalidLine = saleForm.lines.some((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0);
    if (!customerName || !saleForm.soldDate || saleForm.lines.length === 0 || invalidLine) {
      setToast({ text: "Điền khách hàng, ngày bán và số lượng hợp lệ", type: "error" });
      return;
    }

    recognitionRef.current?.stop();
    setConfirmingSale(true);
  }

  async function confirmAndSaveSale() {
    const customerName = saleForm.customerName.trim();
    setSaving(true);
    try {
      const url = editingSaleId
        ? `/api/store-sales?id=${encodeURIComponent(editingSaleId)}`
        : "/api/store-sales";
      const response = await fetch(url, {
        method: editingSaleId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: saleForm.customerId,
          customer_name: customerName,
          sold_date: saleForm.soldDate,
          items: saleForm.lines.map((line) => ({
            id: line.id,
            product_id: line.productId,
            quantity: Number(line.quantity),
          })),
        }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi lưu hóa đơn"));
      const wasEditing = Boolean(editingSaleId);
      setConfirmingSale(false);
      closeSaleForm();
      await loadData();
      setToast({ text: wasEditing ? "Đã cập nhật hóa đơn" : "Đã lưu hóa đơn bán hàng", type: "success" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi lưu hóa đơn", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteProduct(group: ProductGroup) {
    openConfirm(`Xoá mặt hàng “${group.product.name}”?`, async () => {
      try {
        const response = await fetch(`/api/store-products?id=${encodeURIComponent(group.product.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(await getErrorText(response, "Lỗi xoá mặt hàng"));
        await loadData();
        setToast({ text: "Đã xoá mặt hàng", type: "success" });
      } catch (error) {
        setToast({ text: error instanceof Error ? error.message : "Lỗi xoá mặt hàng", type: "error" });
      }
    });
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-1">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
              <CircleDollarSign className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Bán hàng</h1>
              <p className="text-xs text-gray-400">Mặt hàng, hóa đơn & doanh thu</p>
            </div>
          </div>
          <Link
            href="/sales/stats"
            prefetch={false}
            className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-indigo-600 transition-all hover:border-indigo-200 hover:shadow-md active:scale-[0.97] shrink-0"
            aria-label="Thống kê bán hàng"
            title="Thống kê"
          >
            <BarChart3 className="w-5 h-5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={showProductForm}>
            <PackagePlus className="w-4 h-4 text-indigo-600" />
            Mặt hàng
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openProductForm ? "rotate-180" : ""}`} />
          </Button>
          <Button type="button" className="h-11 bg-indigo-600 hover:bg-indigo-700" onClick={startNewSale}>
            <ShoppingCart className="w-4 h-4" />
            + Bán
          </Button>
        </div>

        <Collapse open={openProductForm}>
          <Card>
            <CardContent className="pt-4">
              <form className="space-y-3" onSubmit={submitProduct}>
                <h2 className="text-sm font-bold text-gray-800">Thêm mặt hàng bán</h2>
                <Input
                  className="h-11"
                  value={productForm.name}
                  onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Tên mặt hàng, ví dụ: catt nhỏ"
                />
                <FormattedNumberInput
                  className="h-11"
                  value={productForm.unitPrice}
                  onValueChange={(value) => setProductForm((current) => ({ ...current, unitPrice: value }))}
                  placeholder="Giá bán"
                />
                <Button type="submit" disabled={saving} className="w-full h-11 bg-indigo-600 hover:bg-indigo-700">
                  <Save className="w-4 h-4" />
                  {saving ? "Đang lưu" : "Lưu mặt hàng"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Collapse>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm mặt hàng"
            className="h-10 pl-9 pr-9"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
              onClick={() => setSearchQuery("")}
              aria-label="Xoá tìm kiếm"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            Danh sách
            <Badge variant="default">
              {searchQuery.trim() ? `${filteredGroups.length}/${productGroups.length}` : productGroups.length} mặt hàng
            </Badge>
          </h2>

          {loading && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-6 text-center text-sm text-gray-400">
              Đang tải...
            </div>
          )}

          {!loading && filteredGroups.length === 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-8 text-center">
              <ShoppingCart className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {data.products.length === 0 ? "Chưa có mặt hàng nào" : "Không tìm thấy mặt hàng"}
              </p>
            </div>
          )}

          {!loading && filteredGroups.map((group) => {
            const totalQuantity = group.batches.reduce((sum, batch) => sum + Number(batch.item.quantity), 0);
            const totalValue = group.batches.reduce((sum, batch) => sum + Number(batch.item.line_total), 0);
            const isEditing = editingProductId === group.product.id;

            return (
              <Card key={group.product.id} className="hover:shadow-md hover:border-indigo-200 transition-all duration-200">
                <CardContent className="py-3 px-4">
                  {isEditing ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2 space-y-2">
                      <Input
                        className="h-10"
                        value={editProductForm.name}
                        onChange={(event) => setEditProductForm((current) => ({ ...current, name: event.target.value }))}
                      />
                      <FormattedNumberInput
                        className="h-10"
                        value={editProductForm.unitPrice}
                        onValueChange={(value) => setEditProductForm((current) => ({ ...current, unitPrice: value }))}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500"
                          onClick={() => setEditingProductId(null)}
                          aria-label="Huỷ sửa"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white disabled:bg-indigo-300"
                          disabled={saving}
                          onClick={() => void saveProduct(group.product.id)}
                          aria-label="Lưu sửa"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <ShoppingCart className="w-6 h-6 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="min-w-0 truncate font-semibold text-gray-900">{group.product.name}</p>
                                {group.product.product_code && (
                                  <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                    Mã {group.product.product_code}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-indigo-700">{formatMoney(Number(group.product.unit_price))}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant="secondary">{group.batches.length} đợt bán</Badge>
                              <button
                                type="button"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
                                onClick={() => startEditProduct(group.product)}
                                aria-label={`Sửa ${group.product.name}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {group.batches.length === 0 && (
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50"
                                  onClick={() => requestDeleteProduct(group)}
                                  aria-label={`Xoá ${group.product.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1 border-t border-gray-100 pt-1">
                        {group.batches.slice(0, 3).map(({ sale, item }) => (
                            <div
                              key={item.id}
                              className="text-xs text-gray-500 grid grid-cols-[minmax(0,1fr)_minmax(0,38%)] items-center gap-x-2 border-b border-gray-100 px-1 py-2 last:border-b-0"
                            >
                              <div className="min-w-0 flex flex-col">
                                <span className="font-semibold text-gray-800">{fmtDate(sale.sold_date)}</span>
                                <span className="truncate">{sale.customer_name_snapshot}</span>
                              </div>
                              <div className="min-w-0 flex flex-col items-end text-right leading-tight">
                                <span className="font-semibold text-gray-800">sl: {formatQty(Number(item.quantity))}</span>
                                <span className="text-[11px] font-semibold text-indigo-600 break-all">
                                  {formatMoney(Number(item.line_total))}
                                </span>
                              </div>
                            </div>
                        ))}
                        <Link
                          href={{
                            pathname: "/sales/stats",
                            query: { productId: group.product.id, range: "all", source: "sales" },
                          }}
                          prefetch={false}
                          className="flex h-8 items-center justify-center rounded-lg text-base font-bold tracking-[0.2em] text-indigo-500 transition-colors hover:bg-indigo-50"
                          aria-label={`Xem thống kê tất cả đợt bán của ${group.product.name}`}
                          title="Xem tất cả trong thống kê"
                        >
                          ...
                        </Link>
                        <div className="flex justify-between gap-3 px-1 pt-1 text-[11px] font-semibold text-gray-500">
                          <span>Đã bán: {formatQty(totalQuantity)}</span>
                          <span className="text-indigo-600 text-right break-all">{formatMoney(totalValue)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <BottomSheet
        open={openSaleForm}
        closing={closingSaleSheet}
        title={editingSaleId ? "Sửa hóa đơn" : "Bán nhanh"}
        description={`${saleForm.lines.length} mặt hàng đã chọn`}
        icon={<ShoppingCart className="h-5 w-5" />}
        onCloseRequest={requestCloseSaleSheet}
        onClosed={closeSaleForm}
        closeLabel="Đóng hóa đơn"
        height="88vh"
        zIndex={50}
      >
        <form className="flex min-h-full flex-col gap-2" onSubmit={requestSaleConfirmation}>
          {voiceTranscript && (
            <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Đã nghe: <span className="font-semibold text-gray-700">“{voiceTranscript}”</span>
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_155px] gap-2">
            <div className="relative">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Khách hàng
              </label>
              <Input
                className="h-11 pr-9"
                value={saleForm.customerName}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  setShowCustomerSuggestions(true);
                }}
                onFocus={() => setShowCustomerSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                placeholder="Tên khách"
                autoComplete="off"
              />
              {saleForm.customerName && (
                <button
                  type="button"
                  className="absolute right-2 top-[2.6rem] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  onClick={() => {
                    setSaleForm((current) => ({ ...current, customerId: "", customerName: "" }));
                    setShowCustomerSuggestions(false);
                  }}
                  aria-label="Xoá tên khách hàng"
                  title="Xoá tên khách"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {showCustomerSuggestions && customerSuggestions.length > 0 && (
                <ul className="absolute z-30 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg divide-y divide-gray-50">
                  {customerSuggestions.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-indigo-50"
                        onMouseDown={() => {
                          setSaleForm((current) => ({
                            ...current,
                            customerId: customer.id,
                            customerName: customer.name,
                          }));
                          setShowCustomerSuggestions(false);
                        }}
                      >
                        <span className="text-sm font-medium text-gray-800 truncate">{customer.name}</span>
                        <Badge variant="secondary">Đã lưu</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ngày bán
              </span>
              <AppDatePicker
                ariaLabel="Ngày bán"
                height={44}
                value={saleForm.soldDate}
                onValueChange={(value) => setSaleForm((current) => ({ ...current, soldDate: value }))}
              />
            </div>
          </div>
          <p
            className={`-mt-2 min-h-4 text-[11px] text-indigo-600 ${saleForm.customerName.trim() && !saleForm.customerId ? "visible" : "invisible"}`}
            aria-hidden={!saleForm.customerName.trim() || Boolean(saleForm.customerId)}
          >
            Tên mới sẽ tự động được thêm vào Khách hàng.
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mặt hàng</label>
              <span className="text-[11px] font-semibold text-indigo-600">{saleForm.lines.length} đã chọn</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="h-10 pl-9 pr-9"
                value={saleProductQuery}
                onChange={(event) => setSaleProductQuery(event.target.value)}
                placeholder="Tìm theo tên hoặc mã"
              />
              {saleProductQuery && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
                  onClick={() => setSaleProductQuery("")}
                  aria-label="Xóa tìm kiếm mặt hàng"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {voiceExampleCode && (
              <p className="mb-2 text-[11px] text-gray-400">
                Voice: “mã {voiceExampleCode} số lượng 2” · “thêm 10 mã {voiceExampleCode}” · “xóa 2 mã {voiceExampleCode}”
              </p>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              {quickSaleProducts.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">Không tìm thấy mặt hàng</p>
              )}
              {quickSaleProducts.map((product, index) => {
                const line = saleLineByProductId.get(product.id);
                const lineHasZeroQuantity = Boolean(
                  line && line.quantity.trim() !== "" && Number(line.quantity) === 0,
                );
                const previousProduct = quickSaleProducts[index - 1];
                const previousWasSelected = previousProduct
                  ? saleLineByProductId.has(previousProduct.id)
                  : null;
                const startsGroup = saleForm.lines.length > 0
                  && (index === 0 || previousWasSelected !== Boolean(line));
                return (
                  <Fragment key={product.id}>
                    {startsGroup && (
                      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${line
                        ? "bg-indigo-100/70 text-indigo-700"
                        : "border-t-4 border-gray-100 bg-gray-50 text-gray-400"}`}
                      >
                        {line ? `Đã chọn · ${saleForm.lines.length}` : "Chưa chọn"}
                      </div>
                    )}
                    <div className={`flex min-h-16 items-center gap-3 border-t border-gray-100 px-3 py-2 first:border-t-0 ${line ? "bg-indigo-50/60" : ""}`}>
                      <div className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-gray-900">{product.name}</span>
                        <span className="block text-xs text-gray-400">
                          {product.product_code && (
                            <span className="font-bold text-indigo-600">Mã {product.product_code} · </span>
                          )}
                          {formatMoney(Number(product.unit_price))}
                          {line ? ` · ${formatMoney(line.unitPrice * (Number(line.quantity) || 0))}` : ""}
                        </span>
                      </div>
                      {line ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <FormattedNumberInput
                            ref={(input) => {
                              if (input) quantityInputRefs.current.set(product.id, input);
                              else quantityInputRefs.current.delete(product.id);
                            }}
                            className="h-9 w-16 px-1 text-center font-bold"
                            value={line.quantity}
                            onValueChange={(value) => setSaleLineQuantity(product.id, value)}
                            aria-label={`Số lượng ${product.name}`}
                          />
                          <button
                            type="button"
                            className={`flex h-9 w-9 items-center justify-center rounded-xl border ${lineHasZeroQuantity
                              ? "border-red-100 bg-red-50 text-red-500"
                              : "border-indigo-100 bg-white text-indigo-600"}`}
                            onClick={() => lineHasZeroQuantity
                              ? requestRemoveSaleLine(product.id, product.name)
                              : requestResetSaleLineQuantity(product.id, product.name)}
                            aria-label={lineHasZeroQuantity
                              ? `Xóa ${product.name} khỏi danh sách đã chọn`
                              : `Đưa số lượng ${product.name} về 0`}
                            title={lineHasZeroQuantity ? "Xóa khỏi đã chọn" : "Đưa số lượng về 0"}
                          >
                            {lineHasZeroQuantity
                              ? <Trash2 className="h-4 w-4" />
                              : <RotateCcw className="h-4 w-4" />}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
                          onClick={() => selectProductForSale(product)}
                          aria-label={`Thêm ${product.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-5 -mb-4 mt-auto border-t border-gray-100 bg-white px-5 pb-2 pt-1 shadow-[0_-8px_20px_rgba(255,255,255,0.95)]">
            {showSaleSummary && saleForm.lines.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 px-5 pb-2">
                <div
                  id="sale-summary"
                  className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg"
                >
                  {saleForm.lines.map((line) => {
                    const quantity = Number(line.quantity);
                    const validQuantity = Number.isFinite(quantity) ? quantity : 0;
                    return (
                      <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                        <span className="truncate text-gray-600" title={line.productName}>
                          {line.productName} x {formatQty(validQuantity)}
                        </span>
                        <span className="font-semibold text-gray-700">
                          = {formatMoney(validQuantity * line.unitPrice)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-600">Tổng hóa đơn</span>
              <button
                type="button"
                className="flex min-w-0 items-center justify-end gap-1 text-right text-xl font-bold text-indigo-700 disabled:cursor-default"
                onClick={() => setShowSaleSummary((current) => !current)}
                disabled={saleForm.lines.length === 0}
                aria-expanded={showSaleSummary}
                aria-controls="sale-summary"
                title={showSaleSummary ? "Ẩn chi tiết hóa đơn" : "Xem chi tiết hóa đơn"}
              >
                <span className="break-all">{formatMoney(saleTotal)}</span>
                {saleForm.lines.length > 0 && (
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showSaleSummary ? "rotate-180" : ""}`} />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClearSaleDraft}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition-all hover:bg-red-100"
                aria-label="Xoá nội dung hóa đơn"
                title="Xoá form"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={startVoiceDraft}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all ${voiceListening ? "animate-pulse bg-red-500 text-white" : "border border-indigo-200 bg-indigo-50 text-indigo-600"}`}
                aria-label={voiceListening ? "Dừng nhập hóa đơn bằng giọng nói" : "Tạo hóa đơn bằng giọng nói"}
                aria-pressed={voiceListening}
                title={voiceListening ? "Đang nghe — bấm để dừng" : "Nhập bằng giọng nói"}
              >
                {voiceListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <Button type="submit" disabled={saving} className="h-12 min-w-0 flex-1 bg-indigo-600 text-base hover:bg-indigo-700">
                <ShoppingCart className="h-4 w-4" />
                {saving ? "Đang lưu" : editingSaleId ? `Lưu thay đổi · ${formatMoney(saleTotal)}` : `Lưu hóa đơn · ${formatMoney(saleTotal)}`}
              </Button>
            </div>
          </div>
        </form>
      </BottomSheet>

      {confirmingSale && (
        <SaleConfirmationModal
          form={saleForm}
          total={saleTotal}
          saving={saving}
          editing={Boolean(editingSaleId)}
          onCancel={() => setConfirmingSale(false)}
          onConfirm={() => void confirmAndSaveSale()}
        />
      )}

      {confirmModal}
    </>
  );
}
