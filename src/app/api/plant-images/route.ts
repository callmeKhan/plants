import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlantMaxImages } from "@/lib/plant-notes-config";
import { deleteR2Objects } from "@/lib/r2-delete";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PlantImageInput = {
  id?: unknown;
  image_url?: unknown;
  object_key?: unknown;
  content_type?: unknown;
  width?: unknown;
  height?: unknown;
  size_bytes?: unknown;
};

type PlantImage = {
  id: string;
  plant_id: string;
  image_url: string;
  object_key: string;
  content_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
  created_at?: string;
};

function optionalPositiveInteger(value: unknown) {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function getImagePayload(body: unknown): PlantImageInput[] {
  if (Array.isArray(body)) return body as PlantImageInput[];
  if (body && typeof body === "object" && Array.isArray((body as { images?: unknown }).images)) {
    return (body as { images: PlantImageInput[] }).images;
  }
  return [body as PlantImageInput];
}

function normalizeImage(input: PlantImageInput, plantId: string, sortOrder: number): Omit<PlantImage, "created_at"> {
  const imageUrl = typeof input.image_url === "string" ? input.image_url.trim() : "";
  const objectKey = typeof input.object_key === "string" ? input.object_key.trim() : "";
  const contentType = typeof input.content_type === "string" ? input.content_type.trim() : "";

  if (!imageUrl || !objectKey || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Each image must include image_url, object_key, and supported content_type");
  }

  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : uuidv4(),
    plant_id: plantId,
    image_url: imageUrl,
    object_key: objectKey,
    content_type: contentType,
    width: optionalPositiveInteger(input.width),
    height: optionalPositiveInteger(input.height),
    size_bytes: optionalPositiveInteger(input.size_bytes),
    sort_order: sortOrder,
  };
}

// GET /api/plant-images
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const plantId = searchParams.get("plant_id");

  let query = supabase
    .from("plant_note_images")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (plantId) query = query.eq("plant_id", plantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/plant-images
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const plantId = typeof body.plant_id === "string" ? body.plant_id.trim() : "";
    const payload = getImagePayload(body);

    if (!plantId || payload.length === 0) {
      return NextResponse.json({ error: "plant_id and images are required" }, { status: 400 });
    }

    const plantMaxImages = getPlantMaxImages();
    const { data: existingImages, error: existingImagesError } = await supabase
      .from("plant_note_images")
      .select("id, sort_order")
      .eq("plant_id", plantId)
      .limit(plantMaxImages);

    if (existingImagesError) return NextResponse.json({ error: existingImagesError.message }, { status: 500 });

    const existingImageCount = (existingImages ?? []).length;
    const remainingImageSlots = Math.max(0, plantMaxImages - existingImageCount);

    if (remainingImageSlots <= 0) {
      return NextResponse.json(
        { error: `Each plant can only have ${plantMaxImages} images for now` },
        { status: 409 },
      );
    }

    if (payload.length > remainingImageSlots) {
      return NextResponse.json(
        { error: `Only ${remainingImageSlots} image slot${remainingImageSlots === 1 ? "" : "s"} remaining for this plant` },
        { status: 409 },
      );
    }

    const nextSortOrder = (existingImages ?? []).reduce((max, image) => {
      const sortOrder = Number(image.sort_order);
      return Number.isInteger(sortOrder) ? Math.max(max, sortOrder) : max;
    }, -1) + 1;
    const rows = payload.map((item, index) => normalizeImage(item, plantId, nextSortOrder + index));
    const { data, error } = await supabase
      .from("plant_note_images")
      .insert(rows)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const images = data ?? [];
    images.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    return NextResponse.json(images);
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}

// DELETE /api/plant-images?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: image, error: imageError } = await supabase
    .from("plant_note_images")
    .select("object_key")
    .eq("id", id)
    .single();

  if (imageError) return NextResponse.json({ error: imageError.message }, { status: 500 });

  let deletedImages = 0;
  try {
    deletedImages = await deleteR2Objects([image.object_key]);
  } catch (e) {
    return NextResponse.json({ error: `Failed to delete R2 image: ${e}` }, { status: 502 });
  }

  const { error } = await supabase.from("plant_note_images").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id, deleted_images: deletedImages });
}
