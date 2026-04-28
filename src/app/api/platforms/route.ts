import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

// GET /api/platforms
export async function GET() {
  const { data, error } = await supabase.from("platforms").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/platforms
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { floor, name, capacity, garden_id } = body;

    if (floor == null || !name || capacity == null) {
      return NextResponse.json(
        { error: "floor, name, capacity are required" },
        { status: 400 }
      );
    }

    const id = body.id || uuidv4();
    const { data, error } = await supabase
      .from("platforms")
      .insert([{ id, garden_id: garden_id || null, floor, name, capacity }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/platforms?id=xxx
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await request.json();
    const { name, garden_id, floor, capacity } = body;

    const { data, error } = await supabase
      .from("platforms")
      .update({ name, garden_id, floor, capacity })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/platforms?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("platforms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
