import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

// GET /api/monthly-sales
export async function GET() {
  const { data, error } = await supabase
    .from("monthly_sales")
    .select("*")
    .order("month", { ascending: true });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/monthly-sales — upsert by month
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { month, catt_quantity, tonghop_quantity } = body;

    if (!month || catt_quantity == null || tonghop_quantity == null) {
      return NextResponse.json(
        { error: "month, catt_quantity, tonghop_quantity are required" },
        { status: 400 },
      );
    }

    const id = body.id || uuidv4();
    const { data, error } = await supabase
      .from("monthly_sales")
      .upsert(
        { id, month, catt_quantity, tonghop_quantity },
        { onConflict: "month" },
      )
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

