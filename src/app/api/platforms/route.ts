import { NextResponse } from "next/server";
import { isSheetsConfigured, readSheet, appendRow, deleteRow } from "@/lib/sheets";
import { v4 as uuidv4 } from "uuid";

// GET /api/platforms
export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured." },
      { status: 503 }
    );
  }

  try {
    const rows = await readSheet("platforms");
    const platforms = rows.slice(1).map((row) => ({
      id: row[0],
      floor: Number(row[1]),
      side: row[2],
      name: row[3],
      capacity: Number(row[4]),
    }));
    return NextResponse.json(platforms);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to read platforms: ${e}` },
      { status: 500 }
    );
  }
}

// POST /api/platforms
export async function POST(request: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { floor, side, name, capacity } = body;

    if (floor == null || !side || !name || capacity == null) {
      return NextResponse.json(
        { error: "floor, side, name, capacity are required" },
        { status: 400 }
      );
    }

    const id = body.id || uuidv4();
    await appendRow("platforms", [
      id,
      String(floor),
      side,
      name,
      String(capacity),
    ]);
    return NextResponse.json({ id, floor, side, name, capacity });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to create platform: ${e}` },
      { status: 500 }
    );
  }
}

// DELETE /api/platforms?id=xxx
export async function DELETE(request: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured." },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const rows = await readSheet("platforms");
    const rowIndex = rows.findIndex((row) => row[0] === id);
    if (rowIndex === -1) {
      return NextResponse.json(
        { error: "Platform not found" },
        { status: 404 }
      );
    }

    await deleteRow("platforms", rowIndex + 1); // 1-indexed
    return NextResponse.json({ deleted: id });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to delete platform: ${e}` },
      { status: 500 }
    );
  }
}
