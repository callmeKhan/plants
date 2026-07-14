"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import {
  BarChart3,
  ChevronDown,
  MoreVertical,
  PackagePlus,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Toast, type ToastMsg } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Card, CardContent } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import { Badge } from "@/components/ui/badge";
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

type ImportForm = {
  name: string;
  unitCost: string;
  importedDate: string;
  quantity: string;
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
    return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
  });
}

function accessoryKey(name: string) {
  return name.trim().toLowerCase();
}

function toPayload(form: ImportForm) {
  const name = form.name.trim();
  const unitCost = Number(form.unitCost);
  const quantity = Number(form.quantity);

  if (!name) return { error: "Tên mặt hàng là bắt buộc" };
  if (!form.importedDate) return { error: "Ngày nhập là bắt buộc" };
  if (!Number.isFinite(unitCost) || unitCost < 0) return { error: "Giá thành không hợp lệ" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Số lượng phải lớn hơn 0" };

  return {
    payload: {
      name,
      unit_cost: unitCost,
      imported_date: form.importedDate,
      quantity,
    },
  };
}

export default function ImportsPage() {
  const [items, setItems] = useState<AccessoryImport[]>([]);
  const [form, setForm] = useState<ImportForm>({
    name: "",
    unitCost: "",
    importedDate: todayStr(),
    quantity: "",
  });
  const [editForm, setEditForm] = useState<ImportForm>({
    name: "",
    unitCost: "",
    importedDate: todayStr(),
    quantity: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
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
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setToast({ text: "Lỗi tải dữ liệu nhập kho", type: "error" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadImports();
    return () => controller.abort();
  }, []);

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
    const query = searchQuery.trim().toLowerCase();
    if (!query) return accessoryGroups;
    return accessoryGroups.filter((group) => group.name.toLowerCase().includes(query));
  }, [accessoryGroups, searchQuery]);

  const nameSuggestions = useMemo(() => {
    const query = form.name.trim().toLowerCase();
    return accessoryGroups
      .filter((group) => {
        if (!query) return false;
        return group.name.toLowerCase().includes(query) && group.name.toLowerCase() !== query;
      })
      .slice(0, 8);
  }, [accessoryGroups, form.name]);

  const updateForm = useCallback((field: keyof ImportForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const updateEditForm = useCallback((field: keyof ImportForm, value: string) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const parsed = toPayload(form);
    if (parsed.error) {
      setToast({ text: parsed.error, type: "error" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/accessory-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uuidv4(), ...parsed.payload }),
      });
      if (!res.ok) throw new Error("Failed to save accessory import");
      const saved = (await res.json()) as AccessoryImport;
      invalidateAccessoryImportStatsCache();
      setItems((current) => sortImports([...current, saved]));
      setForm({ name: "", unitCost: "", importedDate: todayStr(), quantity: "" });
      setToast({ text: "Đã lưu lần nhập phụ kiện", type: "success" });
    } catch {
      setToast({ text: "Lỗi lưu nhập kho", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: AccessoryImport) {
    setOpenActionId(null);
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      unitCost: String(item.unit_cost),
      importedDate: item.imported_date,
      quantity: String(item.quantity),
    });
  }

  async function saveEdit(itemId: string) {
    const parsed = toPayload(editForm);
    if (parsed.error) {
      setToast({ text: parsed.error, type: "error" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/accessory-imports?id=${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.payload),
      });
      if (!res.ok) throw new Error("Failed to update accessory import");
      const saved = (await res.json()) as AccessoryImport;
      invalidateAccessoryImportStatsCache();
      setItems((current) => sortImports(current.map((item) => (item.id === itemId ? saved : item))));
      setEditingId(null);
      setToast({ text: "Đã cập nhật lần nhập", type: "success" });
    } catch {
      setToast({ text: "Lỗi cập nhật nhập kho", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(item: AccessoryImport) {
    setOpenActionId(null);
    openConfirm(
      `Xoá lần nhập "${item.name}" ngày ${fmtDate(item.imported_date)}?`,
      async () => {
        try {
          const res = await fetch(`/api/accessory-imports?id=${item.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete accessory import");
          invalidateAccessoryImportStatsCache();
          setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
          if (editingId === item.id) setEditingId(null);
          setToast({ text: "Đã xoá lần nhập", type: "success" });
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
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpenForm((v) => !v)}
            className="min-w-0 flex-1 flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
              <PackagePlus className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Nhập phụ kiện</h1>
              <p className="text-xs text-gray-400">Kéo cắt, chậu, dây, băng keo</p>
            </div>
            <ChevronDown
              className="w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0"
              style={{ transform: openForm ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
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

        <Collapse open={openForm}>
          <Card>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      updateForm("name", e.target.value);
                      setShowNameSuggestions(true);
                    }}
                    onFocus={() => setShowNameSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                    placeholder="📦 Tên mặt hàng"
                    autoComplete="off"
                  />
                  {showNameSuggestions && nameSuggestions.length > 0 && (
                    <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl max-h-48 overflow-y-auto text-sm divide-y divide-gray-50 shadow-sm">
                      {nameSuggestions.map((group) => (
                        <li
                          key={group.key}
                          className="px-4 py-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between gap-3"
                          onMouseDown={() => {
                            updateForm("name", group.name);
                            setShowNameSuggestions(false);
                          }}
                        >
                          <span className="font-medium text-gray-800 truncate">{group.name}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {group.batches.length} lần nhập
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    className="w-1/3"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => updateForm("quantity", e.target.value)}
                    placeholder="Số lượng"
                  />
                  <Input
                    className="w-1/3"
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={form.unitCost}
                    onChange={(e) => updateForm("unitCost", e.target.value)}
                    placeholder="Giá tiền"
                  />
                  <Input
                    className="w-1/3 px-2"
                    type="date"
                    value={form.importedDate}
                    onChange={(e) => updateForm("importedDate", e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{ backgroundColor: "#d97706", color: "white" }}
                  className="w-full h-11 rounded-xl font-semibold text-base flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
                >
                  <PackagePlus className="w-4 h-4" />
                  {saving ? "Đang lưu" : "Lưu"}
                </button>
              </form>
            </CardContent>
          </Card>
        </Collapse>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
                    {group.batches.map((item) => {
                      const isEditing = editingId === item.id;

                      if (isEditing) {
                        return (
                          <div key={item.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-2 space-y-2">
                            <Input
                              value={editForm.name}
                              onChange={(e) => updateEditForm("name", e.target.value)}
                              className="h-10"
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={editForm.quantity}
                                onChange={(e) => updateEditForm("quantity", e.target.value)}
                                className="h-10"
                              />
                              <Input
                                type="number"
                                min={0}
                                inputMode="decimal"
                                value={editForm.unitCost}
                                onChange={(e) => updateEditForm("unitCost", e.target.value)}
                                className="h-10"
                              />
                              <Input
                                type="date"
                                value={editForm.importedDate}
                                onChange={(e) => updateEditForm("importedDate", e.target.value)}
                                className="h-10 px-2"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500"
                                onClick={() => setEditingId(null)}
                                aria-label="Huỷ sửa"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white disabled:bg-emerald-300"
                                disabled={saving}
                                onClick={() => saveEdit(item.id)}
                                aria-label="Lưu sửa"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          className="text-xs text-gray-500 grid grid-cols-[minmax(0,1fr)_minmax(0,42%)_2rem] items-center gap-x-2 border-b border-gray-100 px-2 py-2 last:border-b-0"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-gray-800">{fmtDate(item.imported_date)}</span>
                            <span className="break-all leading-snug">
                              sl: {formatQty(item.quantity)}
                            </span>
                          </div>
                          <div className="min-w-0 flex flex-col items-end text-right leading-tight">
                            <span className="max-w-full break-all font-semibold text-gray-900">{formatMoney(item.unit_cost)}</span>
                            <span className="max-w-full break-all text-[11px] font-semibold text-emerald-600">
                              {formatMoney(item.quantity * item.unit_cost)}
                            </span>
                          </div>
                          <div
                            className="relative justify-self-end"
                            onBlur={(e) => {
                              const nextFocus = e.relatedTarget;
                              if (!(nextFocus instanceof Node) || !e.currentTarget.contains(nextFocus)) {
                                setOpenActionId(null);
                              }
                            }}
                          >
                            <button
                              type="button"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
                              onClick={() => setOpenActionId((current) => (current === item.id ? null : item.id))}
                              aria-label={`Mở thao tác cho ${item.name} ngày ${fmtDate(item.imported_date)}`}
                              aria-haspopup="menu"
                              aria-expanded={openActionId === item.id}
                              title="Thao tác"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openActionId === item.id && (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="h-9 w-full px-3 flex items-center gap-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
                                  onClick={() => startEdit(item)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Sửa
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="h-9 w-full px-3 flex items-center gap-2 text-left text-xs font-medium text-red-500 hover:bg-red-50"
                                  onClick={() => requestDelete(item)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Xoá
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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

      {confirmModal}
    </>
  );
}
