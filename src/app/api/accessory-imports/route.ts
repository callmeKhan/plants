import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { round2 } from "@/lib/number";
import { v4 as uuidv4 } from "uuid";

type AccessoryImport = {
  id: string;
  name: string;
  unit_cost: number;
  imported_date: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

type AccessoryImportRow = {
  id?: string;
  name?: string;
  unit_cost?: number;
  imported_date?: string;
  quantity?: number;
};

type ParseResult =
  | { row: AccessoryImportRow; error?: never }
  | { row?: never; error: string };

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseAccessoryImport(body: unknown, requireAll: boolean): ParseResult {
  if (!body || typeof body !== "object") {
    return { error: "body is required" };
  }

  const source = body as Record<string, unknown>;
  const row: AccessoryImportRow = {};

  if (hasOwn(source, "id")) {
    if (typeof source.id !== "string" || !source.id.trim()) {
      return { error: "id must be a string" };
    }
    row.id = source.id.trim();
  } else if (requireAll) {
    row.id = uuidv4();
  }

  if (hasOwn(source, "name") || requireAll) {
    const name = typeof source.name === "string" ? source.name.trim() : "";
    if (!name) return { error: "name is required" };
    row.name = name;
  }

  if (hasOwn(source, "unit_cost") || requireAll) {
    const unitCost = Number(source.unit_cost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return { error: "unit_cost must be a non-negative number" };
    }
    row.unit_cost = round2(unitCost);
  }

  if (hasOwn(source, "imported_date") || requireAll) {
    const importedDate = typeof source.imported_date === "string" ? source.imported_date : "";
    if (!isValidDateString(importedDate)) {
      return { error: "imported_date must use YYYY-MM-DD" };
    }
    row.imported_date = importedDate;
  }

  if (hasOwn(source, "quantity") || requireAll) {
    const quantity = Number(source.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "quantity must be a positive number" };
    }
    row.quantity = round2(quantity);
  }

  if (Object.keys(row).length === 0) {
    return { error: "at least one field is required" };
  }

  return { row };
}

// GET /api/accessory-imports
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();

  let query = supabase
    .from("accessory_imports")
    .select("*")
    .order("imported_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (name) query = query.ilike("name", `%${name}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data satisfies AccessoryImport[]);
}

// POST /api/accessory-imports
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseAccessoryImport(body, true);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const row = parsed.row;

    const { data, error } = await supabase
      .from("accessory_imports")
      .insert([row])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies AccessoryImport);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/accessory-imports?id=xxx
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await request.json();
    const parsed = parseAccessoryImport(body, false);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const row = parsed.row;

    const { data, error } = await supabase
      .from("accessory_imports")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies AccessoryImport);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/accessory-imports?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("accessory_imports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
