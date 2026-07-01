import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

type PlatformNote = {
  id: string;
  platform_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

// GET /api/platform-notes
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformId = searchParams.get("platform_id");

  let query = supabase
    .from("platform_notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (platformId) query = query.eq("platform_id", platformId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/platform-notes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const platformId = typeof body.platform_id === "string" ? body.platform_id.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const noteId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : uuidv4();

    if (!platformId || !content) {
      return NextResponse.json(
        { error: "platform_id and note content are required" },
        { status: 400 },
      );
    }

    const { data: note, error: noteError } = await supabase
      .from("platform_notes")
      .insert([{ id: noteId, platform_id: platformId, content }])
      .select()
      .single();

    if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });
    return NextResponse.json(note satisfies PlatformNote);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/platform-notes?id=xxx
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "note content is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("platform_notes")
      .update({ content })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies PlatformNote);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/platform-notes?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("platform_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
