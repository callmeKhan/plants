import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/lib/supabase";
import type { StoreCustomer } from "@/lib/store-sales";

function parseCustomer(body: unknown, includeId: boolean) {
  if (!body || typeof body !== "object") return { error: "Dữ liệu khách hàng không hợp lệ" } as const;
  const source = body as Record<string, unknown>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) return { error: "Tên khách hàng là bắt buộc" } as const;

  return {
    row: {
      ...(includeId
        ? { id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : uuidv4() }
        : {}),
      name,
    },
  } as const;
}

function customerError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "Khách hàng này đã tồn tại" }, { status: 409 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET() {
  const { data, error } = await supabase
    .from("store_customers")
    .select("*")
    .order("name", { ascending: true });

  if (error) return customerError(error);
  return NextResponse.json(data satisfies StoreCustomer[]);
}

export async function POST(request: Request) {
  try {
    const parsed = parseCustomer(await request.json(), true);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase
      .from("store_customers")
      .insert([parsed.row])
      .select()
      .single();

    if (error) return customerError(error);
    return NextResponse.json(data satisfies StoreCustomer);
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const parsed = parseCustomer(await request.json(), false);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase
      .from("store_customers")
      .update(parsed.row)
      .eq("id", id)
      .select()
      .single();

    if (error) return customerError(error);
    return NextResponse.json(data satisfies StoreCustomer);
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${error}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("store_customers").delete().eq("id", id);
  if (error) return customerError(error);
  return NextResponse.json({ deleted: id });
}
