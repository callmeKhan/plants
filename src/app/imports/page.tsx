"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  CalendarDays,
  ChevronDown,
  Coins,
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

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, searchQuery]);

  const totals = useMemo(() => {
    const uniqueNames = new Set(filteredItems.map((item) => item.name.trim().toLowerCase())).size;
    const totalQuantity = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = filteredItems.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
    return { uniqueNames, totalQuantity, totalValue };
  }, [filteredItems]);

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
    openConfirm(
      `Xoá lần nhập "${item.name}" ngày ${fmtDate(item.imported_date)}?`,
      async () => {
        try {
          const res = await fetch(`/api/accessory-imports?id=${item.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete accessory import");
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
        <button
          type="button"
          onClick={() => setOpenForm((v) => !v)}
          className="w-full flex items-center gap-3 pt-1 text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
            <PackagePlus className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Nhập phụ kiện</h1>
            <p className="text-xs text-gray-400">Kéo cắt, chậu, dây, băng keo</p>
          </div>
          <ChevronDown
            className="w-5 h-5 text-gray-400 transition-transform duration-200"
            style={{ transform: openForm ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        <Collapse open={openForm}>
          <Card>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder="📦 Tên mặt hàng"
                />

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

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <PackagePlus className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{totals.uniqueNames}</p>
            <p className="text-[11px] text-gray-400">Mặt hàng</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <CalendarDays className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{formatQty(totals.totalQuantity)}</p>
            <p className="text-[11px] text-gray-400">Số lượng</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3 text-center">
            <Coins className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-base font-bold text-gray-900 leading-6">{formatMoney(totals.totalValue)}</p>
            <p className="text-[11px] text-gray-400">Tổng vốn</p>
          </div>
        </div>

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
          <h2 className="font-semibold text-gray-800 text-sm">Danh sách nhập</h2>

          {loading && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-6 text-center text-sm text-gray-400">
              Đang tải...
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-8 text-center">
              <PackagePlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {items.length === 0 ? "Chưa có lần nhập nào" : "Không tìm thấy mặt hàng"}
              </p>
            </div>
          )}

          {!loading && filteredItems.map((item) => {
            const isEditing = editingId === item.id;

            if (isEditing) {
              return (
                <div key={item.id} className="rounded-2xl bg-white border border-amber-100 shadow-sm p-3 space-y-3">
                  <Input
                    value={editForm.name}
                    onChange={(e) => updateEditForm("name", e.target.value)}
                    className="h-10"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={editForm.unitCost}
                      onChange={(e) => updateEditForm("unitCost", e.target.value)}
                      className="h-10"
                    />
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
                      type="date"
                      value={editForm.importedDate}
                      onChange={(e) => updateEditForm("importedDate", e.target.value)}
                      className="h-10 px-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500"
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
                className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-3 py-3"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <PackagePlus className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {fmtDate(item.imported_date)} · {formatQty(item.quantity)} cái · {formatMoney(item.unit_cost)}
                  </p>
                  <p className="text-[11px] font-semibold text-emerald-600">
                    {formatMoney(item.quantity * item.unit_cost)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
                    onClick={() => startEdit(item)}
                    aria-label={`Sửa ${item.name}`}
                    title="Sửa"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50"
                    onClick={() => requestDelete(item)}
                    aria-label={`Xoá ${item.name}`}
                    title="Xoá"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirmModal}
    </>
  );
}
