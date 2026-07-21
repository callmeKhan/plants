"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { v4 as uuidv4 } from "uuid";
import {
  BarChart3,
  ChevronDown,
  FileText,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-modal";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Input } from "@/components/ui/input";
import { Toast, type ToastMsg } from "@/components/ui/toast";
import { invalidateAccessoryImportStatsCache } from "@/lib/accessory-import-stats-cache";

type AccessoryImport = {
  id: string;
  name: string;
  unit_cost: number;
  imported_date: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

type ImportLine = {
  id: string;
  key: string;
  name: string;
  unitCost: string;
  quantity: string;
};

type ImportForm = {
  importedDate: string;
  lines: ImportLine[];
};

type AccessoryImportGroup = {
  key: string;
  name: string;
  batches: AccessoryImport[];
  totalQuantity: number;
  totalValue: number;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emptyImportForm(): ImportForm {
  return { importedDate: todayStr(), lines: [] };
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)}đ`;
}

function sortImports(items: AccessoryImport[]) {
  return [...items].sort((a, b) => {
    const dateDiff = b.imported_date.localeCompare(a.imported_date);
    if (dateDiff) return dateDiff;
    return b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name, "vi");
  });
}

function sortBatches(items: AccessoryImport[]) {
  return [...items].sort((a, b) => {
    const dateDiff = b.imported_date.localeCompare(a.imported_date);
    if (dateDiff) return dateDiff;
    return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
  });
}

function accessoryKey(name: string) {
  return name.trim().toLocaleLowerCase("vi");
}

function normalizedSearch(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

async function getErrorText(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function ImportConfirmationModal({
  form,
  total,
  saving,
  onCancel,
  onConfirm,
}: {
  form: ImportForm;
  total: number;
  saving: boolean;
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
        aria-labelledby="import-confirmation-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 pb-3 pt-5 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <FileText className="h-5 w-5" />
          </div>
          <h2 id="import-confirmation-title" className="font-bold text-gray-900">
            Xác nhận đợt nhập
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">Kiểm tra lần cuối trước khi lưu</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <span className="text-gray-400">Ngày nhập</span>
            <span className="text-right font-semibold text-gray-800">{fmtDate(form.importedDate)}</span>
            <span className="text-gray-400">Mặt hàng</span>
            <span className="text-right font-semibold text-gray-800">{form.lines.length} sản phẩm</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <span>Mặt hàng</span>
              <span>Thành tiền</span>
            </div>
            <div className="divide-y divide-gray-100">
              {form.lines.map((line) => {
                const quantity = Number(line.quantity);
                const unitCost = Number(line.unitCost);
                return (
                  <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">{line.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {formatQty(quantity)} x {formatMoney(unitCost)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-800">
                      {formatMoney(quantity * unitCost)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-gray-200 pt-3">
            <span className="font-semibold text-gray-600">Tổng vốn đợt nhập</span>
            <span className="text-xl font-bold text-amber-700">{formatMoney(total)}</span>
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
            className="h-11 flex-1 rounded-xl bg-amber-500 text-sm font-semibold text-white disabled:bg-amber-300"
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

export default function ImportsPage() {
  const [items, setItems] = useState<AccessoryImport[]>([]);
  const [importForm, setImportForm] = useState<ImportForm>(emptyImportForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [importProductQuery, setImportProductQuery] = useState("");
  const [openImportSheet, setOpenImportSheet] = useState(false);
  const [closingImportSheet, setClosingImportSheet] = useState(false);
  const [showImportSummary, setShowImportSummary] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [openConfirm, confirmModal] = useConfirm();

  useEffect(() => {
    const controller = new AbortController();

    async function loadImports() {
      setLoading(true);
      try {
        const res = await fetch("/api/accessory-imports", { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to load accessory imports");
        const data = (await res.json()) as AccessoryImport[];
        setItems(sortImports(data));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setToast({ text: "Lỗi tải dữ liệu nhập kho", type: "error" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadImports();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!openImportSheet) return;

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
  }, [openImportSheet]);

  const accessoryGroups = useMemo<AccessoryImportGroup[]>(() => {
    const map = new Map<string, AccessoryImportGroup>();

    for (const item of items) {
      const key = accessoryKey(item.name);
      const existing = map.get(key);
      if (existing) {
        existing.batches.push(item);
        existing.totalQuantity += item.quantity;
        existing.totalValue += item.quantity * item.unit_cost;
      } else {
        map.set(key, {
          key,
          name: item.name,
          batches: [item],
          totalQuantity: item.quantity,
          totalValue: item.quantity * item.unit_cost,
        });
      }
    }

    return Array.from(map.values())
      .map((group) => ({ ...group, batches: sortBatches(group.batches) }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base", numeric: true }));
  }, [items]);

  const filteredGroups = useMemo(() => {
    const query = normalizedSearch(searchQuery);
    if (!query) return accessoryGroups;
    return accessoryGroups.filter((group) => normalizedSearch(group.name).includes(query));
  }, [accessoryGroups, searchQuery]);

  const importLineByKey = useMemo(
    () => new Map(importForm.lines.map((line) => [line.key, line])),
    [importForm.lines],
  );

  const quickImportProducts = useMemo(() => {
    const options = [...accessoryGroups];
    const existingKeys = new Set(options.map((option) => option.key));

    for (const line of importForm.lines) {
      if (existingKeys.has(line.key)) continue;
      options.push({
        key: line.key,
        name: line.name,
        batches: [],
        totalQuantity: 0,
        totalValue: 0,
      });
    }

    const query = normalizedSearch(importProductQuery);
    return options
      .filter((option) => !query || normalizedSearch(option.name).includes(query))
      .sort((a, b) => {
        const selectedOrder = Number(importLineByKey.has(b.key)) - Number(importLineByKey.has(a.key));
        return selectedOrder || a.name.localeCompare(b.name, "vi", { sensitivity: "base", numeric: true });
      });
  }, [accessoryGroups, importForm.lines, importLineByKey, importProductQuery]);

  const exactQueryGroup = useMemo(() => {
    const queryKey = accessoryKey(importProductQuery);
    if (!queryKey) return null;
    return accessoryGroups.find((group) => group.key === queryKey) ?? null;
  }, [accessoryGroups, importProductQuery]);

  const canCreateQueriedProduct = Boolean(
    importProductQuery.trim()
      && !exactQueryGroup
      && !importLineByKey.has(accessoryKey(importProductQuery)),
  );

  const importTotal = useMemo(() => importForm.lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const unitCost = Number(line.unitCost);
    return sum + (Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0);
  }, 0), [importForm.lines]);

  function startNewImport() {
    setImportForm(emptyImportForm());
    setImportProductQuery("");
    setClosingImportSheet(false);
    setShowImportSummary(false);
    setConfirmingImport(false);
    setOpenImportSheet(true);
  }

  function closeImportSheet() {
    setClosingImportSheet(false);
    setOpenImportSheet(false);
    setImportForm(emptyImportForm());
    setImportProductQuery("");
    setShowImportSummary(false);
    setConfirmingImport(false);
  }

  function requestCloseImportSheet() {
    setClosingImportSheet(true);
  }

  function clearImportDraft() {
    setImportForm(emptyImportForm());
    setImportProductQuery("");
    setShowImportSummary(false);
    setConfirmingImport(false);
  }

  function requestClearImportDraft() {
    openConfirm("Xóa toàn bộ nội dung đang nhập trong form nhập kho?", clearImportDraft);
  }

  function selectProductForImport(group: AccessoryImportGroup) {
    setImportForm((current) => current.lines.some((line) => line.key === group.key)
      ? current
      : {
        ...current,
        lines: [...current.lines, {
          id: uuidv4(),
          key: group.key,
          name: group.name,
          unitCost: group.batches[0] ? String(group.batches[0].unit_cost) : "",
          quantity: "1",
        }],
      });
  }

  function addQueriedProduct() {
    const name = importProductQuery.trim();
    if (!name) return;

    if (exactQueryGroup) {
      selectProductForImport(exactQueryGroup);
      setImportProductQuery("");
      return;
    }

    const key = accessoryKey(name);
    setImportForm((current) => current.lines.some((line) => line.key === key)
      ? current
      : {
        ...current,
        lines: [...current.lines, {
          id: uuidv4(),
          key,
          name,
          unitCost: "",
          quantity: "1",
        }],
      });
    setImportProductQuery("");
  }

  function updateImportLine(lineId: string, field: "quantity" | "unitCost", value: string) {
    setImportForm((current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? { ...line, [field]: value } : line),
    }));
  }

  function removeImportLine(lineId: string) {
    setImportForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== lineId),
    }));
  }

  function requestImportConfirmation(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (!importForm.importedDate) {
      setToast({ text: "Ngày nhập là bắt buộc", type: "error" });
      return;
    }
    if (importForm.lines.length === 0) {
      setToast({ text: "Hãy chọn ít nhất một mặt hàng", type: "error" });
      return;
    }

    const invalidLine = importForm.lines.find((line) => {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      return !line.name.trim()
        || !line.unitCost.trim()
        || !Number.isFinite(quantity)
        || quantity <= 0
        || !Number.isFinite(unitCost)
        || unitCost < 0;
    });
    if (invalidLine) {
      setToast({ text: `Kiểm tra số lượng và giá vốn của “${invalidLine.name}”`, type: "error" });
      return;
    }

    setConfirmingImport(true);
  }

  async function confirmAndSaveImport() {
    setSaving(true);
    try {
      const response = await fetch("/api/accessory-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: importForm.lines.map((line) => ({
            id: line.id,
            name: line.name.trim(),
            unit_cost: Number(line.unitCost),
            imported_date: importForm.importedDate,
            quantity: Number(line.quantity),
          })),
        }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi lưu nhập kho"));

      const saved = (await response.json()) as AccessoryImport[];
      invalidateAccessoryImportStatsCache();
      setItems((current) => sortImports([...current, ...saved]));
      setConfirmingImport(false);
      closeImportSheet();
      setToast({ text: `Đã lưu ${saved.length} mặt hàng nhập kho`, type: "success" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi lưu nhập kho", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-1">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
              <PackagePlus className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Nhập phụ kiện</h1>
              <p className="text-xs text-gray-400">Kéo cắt, chậu, dây, băng keo</p>
            </div>
          </div>
          <Link
            href="/imports/stats"
            prefetch={false}
            className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-sky-600 transition-all hover:border-sky-200 hover:shadow-md active:scale-[0.97] shrink-0"
            aria-label="Thống kê nhập phụ kiện"
            title="Thống kê"
          >
            <BarChart3 className="w-5 h-5" />
          </Link>
        </div>

        <Button
          type="button"
          className="h-11 w-full bg-amber-500 hover:bg-amber-600"
          onClick={startNewImport}
        >
          <PackagePlus className="w-4 h-4" />
          + Tạo mới
        </Button>

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
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              Danh sách
              <Badge variant="default">
                {searchQuery.trim() ? `${filteredGroups.length}/${accessoryGroups.length}` : accessoryGroups.length} mặt hàng
              </Badge>
            </h2>
          </div>

          {loading && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-6 text-center text-sm text-gray-400">
              Đang tải...
            </div>
          )}

          {!loading && filteredGroups.length === 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-8 text-center">
              <PackagePlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {items.length === 0 ? "Chưa có lần nhập nào" : "Không tìm thấy mặt hàng"}
              </p>
            </div>
          )}

          {!loading && filteredGroups.map((group) => (
            <Card key={group.key} className="hover:shadow-md hover:border-amber-200 transition-all duration-200">
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                  <PackagePlus className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1.5 justify-between">
                    <span className="font-semibold text-gray-900 truncate min-w-0">{group.name}</span>
                    <div className="flex items-center justify-end gap-1.5 shrink-0 flex-wrap max-w-[58%]">
                      <Badge variant="warning">{group.batches.length} lần nhập</Badge>
                      <Badge variant="default" className="max-w-full whitespace-normal break-all leading-tight text-right">
                        ×{formatQty(group.totalQuantity)}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.batches.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="text-xs text-gray-500 grid grid-cols-[minmax(0,1fr)_minmax(0,42%)] items-center gap-x-2 border-b border-gray-100 px-2 py-2 last:border-b-0"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-gray-800">{fmtDate(item.imported_date)}</span>
                          <span className="break-all leading-snug">sl: {formatQty(item.quantity)}</span>
                        </div>
                        <div className="min-w-0 flex flex-col items-end text-right leading-tight">
                          <span className="max-w-full break-all font-semibold text-gray-900">{formatMoney(item.unit_cost)}</span>
                          <span className="max-w-full break-all text-[11px] font-semibold text-emerald-600">
                            {formatMoney(item.quantity * item.unit_cost)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <Link
                      href={{ pathname: "/imports/stats", query: { itemKey: group.key } }}
                      prefetch={false}
                      className="flex h-8 items-center justify-center rounded-lg text-base font-bold tracking-[0.2em] text-amber-500 transition-colors hover:bg-amber-50"
                      aria-label={`Xem thống kê tất cả lần nhập của ${group.name}`}
                      title="Xem tất cả trong thống kê"
                    >
                      ...
                    </Link>
                    <div className="flex justify-end px-2 pt-1 text-[11px] font-semibold text-gray-500 text-right min-w-0">
                      <span className="min-w-0 break-words">
                        Tổng vốn: <span className="text-emerald-600 break-all">{formatMoney(group.totalValue)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <BottomSheet
        open={openImportSheet}
        closing={closingImportSheet}
        title="Tạo lần nhập"
        description={`${importForm.lines.length} mặt hàng đã chọn`}
        icon={<PackagePlus className="h-5 w-5" />}
        onCloseRequest={requestCloseImportSheet}
        onClosed={closeImportSheet}
        closeLabel="Đóng form nhập kho"
        height="88vh"
        zIndex={50}
      >
        <form className="flex min-h-full flex-col gap-4" onSubmit={requestImportConfirmation}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Đợt nhập mới</p>
              <p className="mt-0.5 text-xs text-gray-400">Chọn nhiều mặt hàng trong cùng một lần</p>
            </div>
            <div className="w-[155px] shrink-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ngày nhập
              </span>
              <AppDatePicker
                ariaLabel="Ngày nhập phụ kiện"
                height={44}
                value={importForm.importedDate}
                onValueChange={(value) => setImportForm((current) => ({ ...current, importedDate: value }))}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mặt hàng</label>
              <span className="text-[11px] font-semibold text-amber-600">{importForm.lines.length} đã chọn</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="h-10 pl-9 pr-9"
                value={importProductQuery}
                onChange={(event) => setImportProductQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || (!canCreateQueriedProduct && !exactQueryGroup)) return;
                  event.preventDefault();
                  addQueriedProduct();
                }}
                placeholder="Tìm hoặc nhập tên mặt hàng mới"
                autoComplete="off"
              />
              {importProductQuery && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
                  onClick={() => setImportProductQuery("")}
                  aria-label="Xóa tìm kiếm mặt hàng"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {canCreateQueriedProduct && (
              <button
                type="button"
                className="mb-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/70 px-3 py-2.5 text-left text-sm font-semibold text-amber-700"
                onClick={addQueriedProduct}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate">Thêm mặt hàng mới “{importProductQuery.trim()}”</span>
              </button>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              {quickImportProducts.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  {accessoryGroups.length === 0
                    ? "Nhập tên mặt hàng ở ô tìm kiếm để bắt đầu"
                    : "Không tìm thấy mặt hàng"}
                </p>
              )}
              {quickImportProducts.map((group, index) => {
                const line = importLineByKey.get(group.key);
                const previousGroup = quickImportProducts[index - 1];
                const previousWasSelected = previousGroup ? importLineByKey.has(previousGroup.key) : null;
                const startsGroup = importForm.lines.length > 0
                  && (index === 0 || previousWasSelected !== Boolean(line));

                return (
                  <Fragment key={group.key}>
                    {startsGroup && (
                      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${line
                        ? "bg-amber-100/80 text-amber-700"
                        : "border-t-4 border-gray-100 bg-gray-50 text-gray-400"}`}
                      >
                        {line ? `Đã chọn · ${importForm.lines.length}` : "Chưa chọn"}
                      </div>
                    )}
                    {line ? (
                      <div className="border-t border-amber-100 bg-amber-50/60 px-3 py-3 first:border-t-0">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">{line.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {group.batches.length > 0
                                ? `Giá gần nhất ${formatMoney(group.batches[0].unit_cost)}`
                                : "Mặt hàng mới"}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500"
                            onClick={() => removeImportLine(line.id)}
                            aria-label={`Xóa ${line.name} khỏi danh sách đã chọn`}
                            title="Xóa khỏi đã chọn"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Số lượng
                            <FormattedNumberInput
                              className="mt-1 h-9 w-full bg-white text-sm font-bold"
                              value={line.quantity}
                              onValueChange={(value) => updateImportLine(line.id, "quantity", value)}
                              aria-label={`Số lượng ${line.name}`}
                            />
                          </label>
                          <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Giá vốn
                            <FormattedNumberInput
                              className="mt-1 h-9 w-full bg-white text-sm font-bold"
                              value={line.unitCost}
                              onValueChange={(value) => updateImportLine(line.id, "unitCost", value)}
                              placeholder="0"
                              aria-label={`Giá vốn ${line.name}`}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-16 items-center gap-3 border-t border-gray-100 px-3 py-2 first:border-t-0">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{group.name}</span>
                          <span className="block text-xs text-gray-400">
                            {group.batches.length} lần nhập · gần nhất {formatMoney(group.batches[0]?.unit_cost ?? 0)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
                          onClick={() => selectProductForImport(group)}
                          aria-label={`Thêm ${group.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-5 -mb-4 mt-auto border-t border-gray-100 bg-white px-5 pb-2 pt-2 shadow-[0_-8px_20px_rgba(255,255,255,0.95)]">
            {showImportSummary && importForm.lines.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 px-5 pb-2">
                <div
                  id="import-summary"
                  className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg"
                >
                  {importForm.lines.map((line) => {
                    const quantity = Number(line.quantity);
                    const unitCost = Number(line.unitCost);
                    const validQuantity = Number.isFinite(quantity) ? quantity : 0;
                    const validUnitCost = Number.isFinite(unitCost) ? unitCost : 0;
                    return (
                      <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                        <span className="truncate text-gray-600" title={line.name}>
                          {line.name} x {formatQty(validQuantity)}
                        </span>
                        <span className="font-semibold text-gray-700">
                          = {formatMoney(validQuantity * validUnitCost)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-600">Tổng vốn đợt nhập</span>
              <button
                type="button"
                className="flex min-w-0 items-center justify-end gap-1 text-right text-xl font-bold text-amber-700 disabled:cursor-default"
                onClick={() => setShowImportSummary((current) => !current)}
                disabled={importForm.lines.length === 0}
                aria-expanded={showImportSummary}
                aria-controls="import-summary"
                title={showImportSummary ? "Ẩn chi tiết đợt nhập" : "Xem chi tiết đợt nhập"}
              >
                <span className="break-all">{formatMoney(importTotal)}</span>
                {importForm.lines.length > 0 && (
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showImportSummary ? "rotate-180" : ""}`} />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClearImportDraft}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition-all hover:bg-red-100"
                aria-label="Xoá nội dung lần nhập"
                title="Xoá form"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <Button
                type="submit"
                disabled={saving}
                className="h-12 min-w-0 flex-1 bg-amber-500 text-base hover:bg-amber-600"
              >
                <PackagePlus className="h-4 w-4" />
                {saving ? "Đang lưu" : `Lưu ${importForm.lines.length} mặt hàng`}
              </Button>
            </div>
          </div>
        </form>
      </BottomSheet>

      {confirmingImport && (
        <ImportConfirmationModal
          form={importForm}
          total={importTotal}
          saving={saving}
          onCancel={() => setConfirmingImport(false)}
          onConfirm={() => void confirmAndSaveImport()}
        />
      )}

      {confirmModal}
    </>
  );
}
