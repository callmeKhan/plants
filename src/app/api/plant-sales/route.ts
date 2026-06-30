import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { round2 } from "@/lib/number";
import { v4 as uuidv4 } from "uuid";

type PlantSaleInput = {
  id?: unknown;
  plant_id?: unknown;
  quantity?: unknown;
  created_at?: unknown;
};

function getSalesPayload(body: unknown): PlantSaleInput[] {
  if (Array.isArray(body)) return body as PlantSaleInput[];
  if (body && typeof body === "object" && Array.isArray((body as { sales?: unknown }).sales)) {
    return (body as { sales: PlantSaleInput[] }).sales;
  }
  return [body as PlantSaleInput];
}

// GET /api/plant-sales
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const plantId = searchParams.get("plant_id");

  let query = supabase
    .from("plant_sales")
    .select("*")
    .order("created_at", { ascending: false });

  if (plantId) query = query.eq("plant_id", plantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/plant-sales
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = getSalesPayload(body);

    if (payload.length === 0) {
      return NextResponse.json({ error: "sales are required" }, { status: 400 });
    }

    const rows = [];
    for (const item of payload) {
      const quantity = Number(item.quantity);
      if (typeof item.plant_id !== "string" || !item.plant_id || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "Each sale must include plant_id and positive quantity" },
          { status: 400 },
        );
      }

      rows.push({
        id: typeof item.id === "string" && item.id ? item.id : uuidv4(),
        plant_id: item.plant_id,
        quantity: round2(quantity),
        ...(typeof item.created_at === "string" && item.created_at ? { created_at: item.created_at } : {}),
      });
    }

    const { data, error } = await supabase
      .from("plant_sales")
      .insert(rows)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}
