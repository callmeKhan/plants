import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { round2 } from "@/lib/number";
import { supabase } from "@/lib/supabase";
import type {
  StoreCustomer,
  StoreProduct,
  StoreSale,
  StoreSalesData,
} from "@/lib/store-sales";

type SalePayload = {
  id: string;
  customerId: string;
  customerName: string;
  soldDate: string;
  items: Array<{ id: string; product_id: string; quantity: number }>;
};

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseSale(body: unknown, fallbackId?: string) {
  if (!body || typeof body !== "object") return { error: "Dữ liệu hóa đơn không hợp lệ" } as const;
  const source = body as Record<string, unknown>;
  const customerName = typeof source.customer_name === "string" ? source.customer_name.trim() : "";
  const customerId = typeof source.customer_id === "string" ? source.customer_id.trim() : "";
  const soldDate = typeof source.sold_date === "string" ? source.sold_date : "";
  const rawItems = Array.isArray(source.items) ? source.items : [];

  if (!customerName) return { error: "Tên khách hàng là bắt buộc" } as const;
  if (!isValidDateString(soldDate)) return { error: "Ngày bán không hợp lệ" } as const;
  if (rawItems.length === 0) return { error: "Hóa đơn cần ít nhất một mặt hàng" } as const;

  const productIds = new Set<string>();
  const items: SalePayload["items"] = [];
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") return { error: "Mặt hàng không hợp lệ" } as const;
    const item = rawItem as Record<string, unknown>;
    const productId = typeof item.product_id === "string" ? item.product_id.trim() : "";
    const quantity = Number(item.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      return { error: "Mỗi mặt hàng cần số lượng lớn hơn 0" } as const;
    }
    if (productIds.has(productId)) return { error: "Một mặt hàng chỉ được chọn một lần" } as const;
    productIds.add(productId);
    items.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : uuidv4(),
      product_id: productId,
      quantity: round2(quantity),
    });
  }

  return {
    payload: {
      id: fallbackId ?? (typeof source.id === "string" && source.id.trim() ? source.id.trim() : uuidv4()),
      customerId,
      customerName,
      soldDate,
      items,
    },
  } as const;
}

function saleError(error: { code?: string; message: string }) {
  if (error.code === "23503") {
    return NextResponse.json({ error: "Mặt hàng hoặc khách hàng không còn tồn tại" }, { status: 409 });
  }
  if (error.code === "23505") {
    return NextResponse.json({ error: "Hóa đơn hoặc mặt hàng bị trùng" }, { status: 409 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET() {
  const [productsResult, customersResult, salesResult] = await Promise.all([
    supabase.from("store_products").select("*").order("name", { ascending: true }),
    supabase.from("store_customers").select("*").order("name", { ascending: true }),
    supabase
      .from("store_sales")
      .select("*, items:store_sale_items(*)")
      .order("sold_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const error = productsResult.error ?? customersResult.error ?? salesResult.error;
  if (error) return saleError(error);

  const payload: StoreSalesData = {
    products: (productsResult.data ?? []) as StoreProduct[],
    customers: (customersResult.data ?? []) as StoreCustomer[],
    sales: (salesResult.data ?? []) as StoreSale[],
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

async function saveSale(payload: SalePayload, isUpdate: boolean) {
  const { data, error } = await supabase.rpc("save_store_sale", {
    p_sale_id: payload.id,
    p_customer_id: payload.customerId || null,
    p_customer_name: payload.customerName,
    p_sold_date: payload.soldDate,
    p_items: payload.items,
    p_is_update: isUpdate,
  });

  if (error) return { response: saleError(error) } as const;
  return { sale: data as StoreSale } as const;
}

export async function POST(request: Request) {
  try {
    const parsed = parseSale(await request.json());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await saveSale(parsed.payload, false);
    if ("response" in result) return result.response;
    return NextResponse.json(result.sale);
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const parsed = parseSale(await request.json(), id);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await saveSale(parsed.payload, true);
    if ("response" in result) return result.response;
    return NextResponse.json(result.sale);
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("store_sales").delete().eq("id", id);
  if (error) return saleError(error);
  return NextResponse.json({ deleted: id });
}
