import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createR2PutPresignedUrl } from "@/lib/r2-presign";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function extensionForContentType(contentType: string) {
  switch (contentType) {
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    default:
      return "jpg";
  }
}

function safePathSegment(value: unknown) {
  if (typeof value !== "string") return "unknown";
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

function publicUrlFor(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// POST /api/r2-upload-url
export async function POST(request: Request) {
  try {
    const accountId = envValue("R2_ACCOUNT_ID");
    const accessKeyId = envValue("R2_ACCESS_KEY_ID");
    const secretAccessKey = envValue("R2_SECRET_ACCESS_KEY");
    const bucketName = envValue("R2_BUCKET_NAME");
    const publicBaseUrl = envValue("R2_PUBLIC_BASE_URL") ?? envValue("NEXT_PUBLIC_R2_PUBLIC_BASE_URL");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
      return NextResponse.json(
        { error: "R2 upload is not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Unsupported image type" },
        { status: 400 },
      );
    }

    const plantPath = safePathSegment(body.plantId);
    const extension = extensionForContentType(contentType);
    const key = `plants/${plantPath}/${uuidv4()}.${extension}`;
    const uploadUrl = await createR2PutPresignedUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      key,
      contentType,
    });

    return NextResponse.json({
      uploadUrl,
      publicUrl: publicUrlFor(publicBaseUrl, key),
      key,
    });
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}
