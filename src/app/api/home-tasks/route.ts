import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

type HomeTask = {
  id: string;
  content: string;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function nextSortOrder() {
  const { data, error } = await supabase
    .from("home_tasks")
    .select("sort_order")
    .eq("done", false)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (error) throw error;
  return ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1;
}

async function firstSortOrder() {
  const { data, error } = await supabase
    .from("home_tasks")
    .select("sort_order")
    .eq("done", false)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (error) throw error;
  return ((data?.[0]?.sort_order as number | undefined) ?? 0) - 1;
}

// GET /api/home-tasks
export async function GET() {
  const { data, error } = await supabase
    .from("home_tasks")
    .select("*")
    .order("done", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/home-tasks
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const taskId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : uuidv4();

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const sortOrder = await firstSortOrder();
    const { data, error } = await supabase
      .from("home_tasks")
      .insert([{ id: taskId, content, done: false, sort_order: sortOrder }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies HomeTask);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/home-tasks?id=xxx
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await request.json();
    const hasContent = Object.prototype.hasOwnProperty.call(body, "content");
    const hasDone = Object.prototype.hasOwnProperty.call(body, "done");

    if (!hasContent && !hasDone) {
      return NextResponse.json({ error: "content or done is required" }, { status: 400 });
    }

    const { data: current, error: currentError } = await supabase
      .from("home_tasks")
      .select("done")
      .eq("id", id)
      .single();

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });

    const updates: { content?: string; done?: boolean; sort_order?: number } = {};
    if (hasContent) {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });
      updates.content = content;
    }

    if (hasDone) {
      if (typeof body.done !== "boolean") {
        return NextResponse.json({ error: "done must be a boolean" }, { status: 400 });
      }

      updates.done = body.done;
      if (current.done && !body.done) {
        updates.sort_order = await nextSortOrder();
      }
    }

    const { data, error } = await supabase
      .from("home_tasks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies HomeTask);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PATCH /api/home-tasks
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const orderedIds = body.ordered_ids;

    if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "ordered_ids is required" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("home_tasks")
      .select("id")
      .eq("done", false);

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const existingIds = new Set((existing ?? []).map((task) => task.id));
    const orderedIdSet = new Set(orderedIds);
    const includesAllOpenTasks =
      orderedIds.length === existingIds.size &&
      orderedIds.every((id) => existingIds.has(id)) &&
      orderedIdSet.size === orderedIds.length;

    if (!includesAllOpenTasks) {
      return NextResponse.json(
        { error: "ordered_ids must include each unfinished task exactly once" },
        { status: 400 },
      );
    }

    const updateResults = await Promise.all(
      orderedIds.map((taskId, index) =>
        supabase
          .from("home_tasks")
          .update({ sort_order: index })
          .eq("id", taskId)
          .eq("done", false),
      ),
    );
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { data, error } = await supabase
      .from("home_tasks")
      .select("*")
      .eq("done", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data satisfies HomeTask[]);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/home-tasks?id=xxx
// DELETE /api/home-tasks?done=true
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("done") === "true") {
    const { data, error } = await supabase
      .from("home_tasks")
      .delete()
      .eq("done", true)
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: (data ?? []).map((task) => task.id) });
  }

  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("home_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
