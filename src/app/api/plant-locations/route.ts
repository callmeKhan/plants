import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { round2 } from "@/lib/number";
import { isBatchColor, normalizeBatchColor } from "@/lib/batch-color";
import { getSpecialPlatformStatus } from "@/lib/special-platform-status";
import { currentDateString } from "@/lib/time";

function normalizeStatus(status: unknown) {
  return typeof status === "string" && status.trim() ? status.trim() : null;
}

async function getForcedStatusForPlatform(platformId: string) {
  const { data, error } = await supabase
    .from("platforms")
    .select("name")
    .eq("id", platformId)
    .maybeSingle();

  if (error) throw error;
  return getSpecialPlatformStatus(data);
}

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
    const { plant_id, platform_id, quantity, pot_size, planted_date, price, status, sort_order, color } = body;

    if (!plant_id || !platform_id || quantity == null) {
      return NextResponse.json(
        { error: "plant_id, platform_id, quantity are required" },
        { status: 400 }
      );
    }

    if (color != null && !isBatchColor(color)) {
      return NextResponse.json({ error: "color must be white, yellow, or red" }, { status: 400 });
    }

    const locationColor = normalizeBatchColor(color);
    const forcedStatus = await getForcedStatusForPlatform(platform_id);
    const locationStatus = forcedStatus ?? normalizeStatus(status);
    const locationPrice = price ?? null;
    const locationPotSize = pot_size || 14;
    const locationPlantedDate = planted_date || "";

    // Merge only if same plant + platform + pot_size + planted_date + color + status + price
    let existingQuery = supabase
      .from("plant_locations")
      .select("id, quantity")
      .eq("plant_id", plant_id)
      .eq("platform_id", platform_id)
      .eq("pot_size", locationPotSize)
      .eq("planted_date", locationPlantedDate)
      .eq("color", locationColor);

    existingQuery = locationStatus == null
      ? existingQuery.is("status", null)
      : existingQuery.eq("status", locationStatus);

    existingQuery = locationPrice == null
      ? existingQuery.is("price", null)
      : existingQuery.eq("price", locationPrice);

    const { data: existing, error: existingError } = await existingQuery
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    if (existing) {
      const newQty = round2(existing.quantity + quantity);
      const updates = forcedStatus
        ? { quantity: newQty, status: locationStatus }
        : { quantity: newQty };
      const { data, error } = await supabase
        .from("plant_locations")
        .update(updates)
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
        pot_size: locationPotSize,
        planted_date: locationPlantedDate,
        sort_order: locationSortOrder,
        color: locationColor,
        ...(locationPrice != null ? { price: locationPrice } : {}),
        ...(locationStatus ? { status: locationStatus } : {}),
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
    const { quantity, pot_size, planted_date, platform_id, plant_id, price, status, sort_order, color } = body;
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
    const hasPlantedDate = Object.prototype.hasOwnProperty.call(body, "planted_date");

    if (color != null && !isBatchColor(color)) {
      return NextResponse.json({ error: "color must be white, yellow, or red" }, { status: 400 });
    }

    const { data: current, error: currentError } = await supabase
      .from("plant_locations")
      .select("platform_id, planted_date, sort_order, color, status")
      .eq("id", id)
      .single();

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });

    const targetPlatformId = platform_id ?? current.platform_id;
    const locationColor = color == null ? normalizeBatchColor(current.color) : color;
    const forcedStatus = await getForcedStatusForPlatform(targetPlatformId);
    const isMovingToSpecialPlatform = Boolean(forcedStatus) && targetPlatformId !== current.platform_id;
    const locationStatus = forcedStatus ?? (hasStatus ? normalizeStatus(status) : normalizeStatus(current.status));
    const locationPlantedDate = isMovingToSpecialPlatform
      ? currentDateString()
      : hasPlantedDate
        ? planted_date || ""
        : current.planted_date;
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
        planted_date: locationPlantedDate,
        platform_id: targetPlatformId,
        plant_id,
        sort_order: locationSortOrder,
        color: locationColor,
        price: price ?? null,
        status: locationStatus,
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

// PATCH /api/plant-locations — reorder or recolor plant locations on a platform
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const platformId = body.platform_id;
    const orderedIds = body.ordered_ids;
    const colorUpdates = body.color_updates;

    if (typeof platformId === "string" && Array.isArray(colorUpdates)) {
      const hasValidColorUpdates = colorUpdates.every(
        (update) =>
          update &&
          typeof update === "object" &&
          typeof update.id === "string" &&
          isBatchColor(update.color)
      );

      if (!hasValidColorUpdates) {
        return NextResponse.json(
          { error: "color_updates must contain unique ids with white, yellow, or red colors" },
          { status: 400 }
        );
      }

      if (colorUpdates.length === 0) return NextResponse.json([]);

      const updateIds = colorUpdates.map((update) => update.id);
      if (new Set(updateIds).size !== updateIds.length) {
        return NextResponse.json(
          { error: "color_updates must contain unique ids with white, yellow, or red colors" },
          { status: 400 }
        );
      }

      const { data: existing, error: existingError } = await supabase
        .from("plant_locations")
        .select("id")
        .eq("platform_id", platformId)
        .in("id", updateIds);

      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
      if ((existing ?? []).length !== updateIds.length) {
        return NextResponse.json(
          { error: "Each color update must belong to the requested platform" },
          { status: 400 }
        );
      }

      const updateResults = await Promise.all(
        colorUpdates.map((update) =>
          supabase
            .from("plant_locations")
            .update({ color: update.color })
            .eq("id", update.id)
            .eq("platform_id", platformId)
        )
      );
      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

      const { data, error } = await supabase
        .from("plant_locations")
        .select("*")
        .in("id", updateIds);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

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
