import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { round2 } from "@/lib/number";

async function nextSortOrder(platformId: string) {
  const { data, error } = await supabase
    .from("plant_locations")
    .select("sort_order")
    .eq("platform_id", platformId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (error) throw error;
  return ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1;
}

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
    const { plant_id, platform_id, quantity, pot_size, planted_date, price, status, sort_order } = body;

    if (!plant_id || !platform_id || quantity == null) {
      return NextResponse.json(
        { error: "plant_id, platform_id, quantity are required" },
        { status: 400 }
      );
    }

    // Merge only if same plant + platform + pot_size + planted_date
    const { data: existing, error: existingError } = await supabase
      .from("plant_locations")
      .select("id, quantity")
      .eq("plant_id", plant_id)
      .eq("platform_id", platform_id)
      .eq("pot_size", pot_size || 14)
      .eq("planted_date", planted_date || "")
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    if (existing) {
      const newQty = round2(existing.quantity + quantity);
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
    const locationSortOrder = typeof sort_order === "number" ? sort_order : await nextSortOrder(platform_id);
    const { data, error } = await supabase
      .from("plant_locations")
      .insert([{
        id,
        plant_id,
        platform_id,
        quantity,
        pot_size: pot_size || 14,
        planted_date: planted_date || "",
        sort_order: locationSortOrder,
        ...(price != null ? { price } : {}),
        ...(status ? { status } : {}),
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PUT /api/plant-locations?id=xxx — update an existing plant_location
export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const body = await request.json();
    const { quantity, pot_size, planted_date, platform_id, plant_id, price, status, sort_order } = body;

    const { data: current, error: currentError } = await supabase
      .from("plant_locations")
      .select("platform_id, sort_order")
      .eq("id", id)
      .single();

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });

    const targetPlatformId = platform_id ?? current.platform_id;
    const locationSortOrder =
      typeof sort_order === "number"
        ? sort_order
        : targetPlatformId !== current.platform_id
          ? await nextSortOrder(targetPlatformId)
          : current.sort_order;

    const { data, error } = await supabase
      .from("plant_locations")
      .update({
        quantity,
        pot_size,
        planted_date,
        platform_id: targetPlatformId,
        plant_id,
        sort_order: locationSortOrder,
        price: price ?? null,
        status: status || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// PATCH /api/plant-locations — reorder all plant locations on a platform
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const platformId = body.platform_id;
    const orderedIds = body.ordered_ids;

    if (typeof platformId !== "string" || !Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "string")) {
      return NextResponse.json(
        { error: "platform_id and ordered_ids are required" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("plant_locations")
      .select("id")
      .eq("platform_id", platformId);

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const existingIds = new Set((existing ?? []).map((loc) => loc.id));
    const orderedIdSet = new Set(orderedIds);
    const includesAllCurrentLocations =
      orderedIds.length === existingIds.size &&
      orderedIds.every((id) => existingIds.has(id)) &&
      orderedIdSet.size === orderedIds.length;

    if (!includesAllCurrentLocations) {
      return NextResponse.json(
        { error: "ordered_ids must include each batch on the platform exactly once" },
        { status: 400 }
      );
    }

    const updateResults = await Promise.all(
      orderedIds.map((locationId, index) =>
        supabase
          .from("plant_locations")
          .update({ sort_order: index })
          .eq("id", locationId)
          .eq("platform_id", platformId)
      )
    );
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { data, error } = await supabase
      .from("plant_locations")
      .select("*")
      .eq("platform_id", platformId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

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
