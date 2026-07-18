"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BarChart3,
  ChevronDown,
  Pencil,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Toast, type ToastMsg } from "@/components/ui/toast";
import {
  normalizeStoreSalesData,
  sortStoreSales,
  type StoreCustomer,
  type StoreSale,
  type StoreSalesData,
} from "@/lib/store-sales";

type CustomerGroup = { customer: StoreCustomer; sales: StoreSale[] };

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

async function fetchSalesData(signal?: AbortSignal) {
  const response = await fetch("/api/store-sales", { cache: "no-store", signal });
  if (!response.ok) throw new Error(await getErrorText(response, "Lỗi tải khách hàng"));
  return normalizeStoreSalesData(await response.json());
}

export default function CustomersPage() {
  const [data, setData] = useState<StoreSalesData>({ products: [], customers: [], sales: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [openConfirm, confirmModal] = useConfirm();

  const loadData = useCallback(async () => {
    try {
      setData(await fetchSalesData());
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi tải khách hàng", type: "error" });
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
          setToast({ text: error instanceof Error ? error.message : "Lỗi tải khách hàng", type: "error" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void initialLoad();
    return () => controller.abort();
  }, []);

  const groups = useMemo<CustomerGroup[]>(() => {
    const sales = sortStoreSales(data.sales);
    const byCustomer = new Map<string, StoreSale[]>();
    for (const sale of sales) {
      if (!sale.customer_id) continue;
      const entries = byCustomer.get(sale.customer_id) ?? [];
      entries.push(sale);
      byCustomer.set(sale.customer_id, entries);
    }
    return data.customers
      .map((customer) => ({ customer, sales: byCustomer.get(customer.id) ?? [] }))
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name, "vi", { sensitivity: "base", numeric: true }));
  }, [data.customers, data.sales]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return groups;
    return groups.filter((group) => group.customer.name.toLocaleLowerCase("vi").includes(query));
  }, [groups, searchQuery]);

  async function submitCustomer(event: FormEvent) {
    event.preventDefault();
    const customerName = name.trim();
    if (!customerName) {
      setToast({ text: "Tên khách hàng là bắt buộc", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/store-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uuidv4(), name: customerName }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi lưu khách hàng"));
      setName("");
      await loadData();
      setToast({ text: "Đã thêm khách hàng", type: "success" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi lưu khách hàng", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(customer: StoreCustomer) {
    setEditingId(customer.id);
    setEditName(customer.name);
  }

  async function saveEdit(customerId: string) {
    const customerName = editName.trim();
    if (!customerName) {
      setToast({ text: "Tên khách hàng là bắt buộc", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/store-customers?id=${encodeURIComponent(customerId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customerName }),
      });
      if (!response.ok) throw new Error(await getErrorText(response, "Lỗi cập nhật khách hàng"));
      setEditingId(null);
      await loadData();
      setToast({ text: "Đã cập nhật khách hàng; hóa đơn cũ giữ nguyên tên", type: "success" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Lỗi cập nhật khách hàng", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(group: CustomerGroup) {
    const historyNote = group.sales.length > 0
      ? `\n\n${group.sales.length} đợt mua và các hóa đơn cũ vẫn được giữ nguyên.`
      : "";
    openConfirm(`Xoá khách hàng “${group.customer.name}”?${historyNote}`, async () => {
      try {
        const response = await fetch(`/api/store-customers?id=${encodeURIComponent(group.customer.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(await getErrorText(response, "Lỗi xoá khách hàng"));
        await loadData();
        setToast({ text: "Đã xoá khách hàng", type: "success" });
      } catch (error) {
        setToast({ text: error instanceof Error ? error.message : "Lỗi xoá khách hàng", type: "error" });
      }
    });
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpenForm((current) => !current)}
            className="min-w-0 flex-1 flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center shadow-sm shrink-0">
              <UsersRound className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Khách hàng</h1>
              <p className="text-xs text-gray-400">Danh sách & lịch sử mua hàng</p>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openForm ? "rotate-180" : ""}`} />
          </button>
          <Link
            href="/sales/stats"
            prefetch={false}
            className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-sky-600 transition-all hover:border-sky-200 hover:shadow-md active:scale-[0.97] shrink-0"
            aria-label="Thống kê khách hàng"
            title="Thống kê"
          >
            <BarChart3 className="w-5 h-5" />
          </Link>
        </div>

        <Collapse open={openForm}>
          <Card>
            <CardContent className="pt-4">
              <form className="space-y-3" onSubmit={submitCustomer}>
                <Input
                  className="h-11"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tên khách hàng"
                />
                <Button type="submit" disabled={saving} className="w-full h-11 bg-sky-600 hover:bg-sky-700">
                  <UserPlus className="w-4 h-4" />
                  {saving ? "Đang lưu" : "Thêm khách hàng"}
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
            placeholder="Tìm khách hàng"
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
              {searchQuery.trim() ? `${filteredGroups.length}/${groups.length}` : groups.length} khách
            </Badge>
          </h2>

          {loading && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-6 text-center text-sm text-gray-400">
              Đang tải...
            </div>
          )}

          {!loading && filteredGroups.length === 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-8 text-center">
              <UsersRound className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {data.customers.length === 0 ? "Chưa có khách hàng nào" : "Không tìm thấy khách hàng"}
              </p>
            </div>
          )}

          {!loading && filteredGroups.map((group) => {
            const total = group.sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
            const isEditing = editingId === group.customer.id;

            return (
              <Card key={group.customer.id} className="hover:shadow-md hover:border-sky-200 transition-all duration-200">
                <CardContent className="py-3 px-4">
                  {isEditing ? (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-2 space-y-2">
                      <Input className="h-10" value={editName} onChange={(event) => setEditName(event.target.value)} />
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
                          disabled={saving}
                          onClick={() => void saveEdit(group.customer.id)}
                          className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center text-white disabled:bg-sky-300"
                          aria-label="Lưu sửa"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                          <UsersRound className="w-6 h-6 text-sky-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{group.customer.name}</p>
                              <p className="text-sm font-bold text-sky-700 break-all">{formatMoney(total)}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant="secondary">{group.sales.length} đợt mua</Badge>
                              <button
                                type="button"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
                                onClick={() => startEdit(group.customer)}
                                aria-label={`Sửa ${group.customer.name}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50"
                                onClick={() => requestDelete(group)}
                                aria-label={`Xoá ${group.customer.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1 border-t border-gray-100 pt-1">
                        {group.sales.slice(0, 3).map((sale) => {
                          const quantity = sale.items.reduce((sum, item) => sum + Number(item.quantity), 0);
                          return (
                              <div key={sale.id} className="px-1 py-2 border-b border-gray-100 last:border-b-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-800">{fmtDate(sale.sold_date)}</p>
                                    <p className="text-[11px] text-gray-400">
                                      {sale.items.length} mặt hàng · sl: {formatQty(quantity)}
                                    </p>
                                  </div>
                                  <span className="text-xs font-bold text-sky-600 break-all text-right">
                                    {formatMoney(Number(sale.total_amount))}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {sale.items.map((item) => (
                                    <span key={item.id} className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2 py-1 text-[10px] text-gray-500">
                                      <ShoppingBag className="w-3 h-3" />
                                      {item.product_name_snapshot} ×{formatQty(Number(item.quantity))}
                                    </span>
                                  ))}
                                </div>
                              </div>
                          );
                        })}
                        <Link
                          href={{
                            pathname: "/sales/stats",
                            query: { customerId: group.customer.id, range: "all", source: "customers" },
                          }}
                          prefetch={false}
                          className="flex h-8 items-center justify-center rounded-lg text-base font-bold tracking-[0.2em] text-sky-500 transition-colors hover:bg-sky-50"
                          aria-label={`Xem thống kê tất cả đợt mua của ${group.customer.name}`}
                          title="Xem tất cả trong thống kê"
                        >
                          ...
                        </Link>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {confirmModal}
    </>
  );
}
