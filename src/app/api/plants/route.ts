import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

// GET /api/plants
export async function GET() {
  const { data, error } = await supabase.from("plants").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/plants
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, total_quantity, image_url } = body;

    if (!name || total_quantity == null) {
      return NextResponse.json(
        { error: "name and total_quantity are required" },
        { status: 400 }
      );
    }

    const id = body.id || uuidv4();
    const { data, error } = await supabase
      .from("plants")
      .insert([{ id, name, total_quantity, image_url: image_url || "" }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/plants?id=xxx — update a plant
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await request.json();
    const { name, total_quantity, image_url } = body;

    const { data, error } = await supabase
      .from("plants")
      .update({ name, total_quantity, image_url })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/plants?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("plants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
