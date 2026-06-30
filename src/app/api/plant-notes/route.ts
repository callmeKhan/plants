import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

type PlantNote = {
  id: string;
  plant_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

// GET /api/plant-notes
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const plantId = searchParams.get("plant_id");

  let query = supabase
    .from("plant_notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (plantId) query = query.eq("plant_id", plantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/plant-notes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const plantId = typeof body.plant_id === "string" ? body.plant_id.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const noteId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : uuidv4();

    if (!plantId || !content) {
      return NextResponse.json(
        { error: "plant_id and note content are required" },
        { status: 400 },
      );
    }

    const { data: note, error: noteError } = await supabase
      .from("plant_notes")
      .insert([{ id: noteId, plant_id: plantId, content }])
      .select()
      .single();

    if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });
    return NextResponse.json(note satisfies PlantNote);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/plant-notes?id=xxx
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "note content is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("plant_notes")
      .update({ content })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies PlantNote);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/plant-notes?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("plant_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
