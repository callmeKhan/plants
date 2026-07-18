import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { round2 } from "@/lib/number";
import { supabase } from "@/lib/supabase";
import type { StoreProduct } from "@/lib/store-sales";

type ProductRow = {
  id?: string;
  name: string;
  unit_price: number;
};

function parseProduct(body: unknown, includeId: boolean) {
  if (!body || typeof body !== "object") return { error: "Dữ liệu mặt hàng không hợp lệ" } as const;
  const source = body as Record<string, unknown>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const unitPrice = Number(source.unit_price);

  if (!name) return { error: "Tên mặt hàng là bắt buộc" } as const;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { error: "Giá bán phải là số không âm" } as const;
  }

  const row: ProductRow = {
    name,
    unit_price: round2(unitPrice),
  };
  if (includeId) {
    row.id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : uuidv4();
  }
  return { row } as const;
}

function productError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "Mặt hàng này đã tồn tại" }, { status: 409 });
  }
  if (error.code === "23503") {
    return NextResponse.json(
      { error: "Mặt hàng đã có lịch sử bán nên không thể xoá" },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET() {
  const { data, error } = await supabase
    .from("store_products")
    .select("*")
    .order("name", { ascending: true });

  if (error) return productError(error);
  return NextResponse.json(data satisfies StoreProduct[]);
}

export async function POST(request: Request) {
  try {
    const parsed = parseProduct(await request.json(), true);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase
      .from("store_products")
      .insert([parsed.row])
      .select()
      .single();

    if (error) return productError(error);
    return NextResponse.json(data satisfies StoreProduct);
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const parsed = parseProduct(await request.json(), false);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase
      .from("store_products")
      .update(parsed.row)
      .eq("id", id)
      .select()
      .single();

    if (error) return productError(error);
    return NextResponse.json(data satisfies StoreProduct);
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("store_products").delete().eq("id", id);
  if (error) return productError(error);
  return NextResponse.json({ deleted: id });
}
