import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

// GET /api/plant-locations
export async function GET() {
  const { data, error } = await supabase.from("plant_locations").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/plant-locations — assign a plant to a platform (upsert by plant+platform)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plant_id, platform_id, quantity, pot_size, planted_date } = body;

    if (!plant_id || !platform_id || quantity == null) {
      return NextResponse.json(
        { error: "plant_id, platform_id, quantity are required" },
        { status: 400 }
      );
    }

    // Merge only if same plant + platform + pot_size + planted_date
    const { data: existing } = await supabase
      .from("plant_locations")
      .select("id, quantity")
      .eq("plant_id", plant_id)
      .eq("platform_id", platform_id)
      .eq("pot_size", pot_size || 14)
      .eq("planted_date", planted_date || "")
      .maybeSingle();

    if (existing) {
      const newQty = existing.quantity + quantity;
      const { data, error } = await supabase
        .from("plant_locations")
        .update({ quantity: newQty })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    const id = body.id || uuidv4();
    const { data, error } = await supabase
      .from("plant_locations")
      .insert([{
        id,
        plant_id,
        platform_id,
        quantity,
        pot_size: pot_size || 14,
        planted_date: planted_date || "",
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/plant-locations?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("plant_locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
