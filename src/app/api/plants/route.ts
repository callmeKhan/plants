import { NextResponse } from "next/server";
import { isSheetsConfigured, readSheet, appendRow } from "@/lib/sheets";
import { v4 as uuidv4 } from "uuid";

// GET /api/plants — list all plants from Google Sheets
export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured. Using offline mode." },
      { status: 503 }
    );
  }

  try {
    const rows = await readSheet("plants");
    // First row is header
    const plants = rows.slice(1).map((row) => ({
      id: row[0],
      name: row[1],
      total_quantity: Number(row[2]),
      image_url: row[3] || "",
    }));
    return NextResponse.json(plants);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to read plants: ${e}` },
      { status: 500 }
    );
  }
}

// POST /api/plants — create a new plant
export async function POST(request: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured. Using offline mode." },
      { status: 503 }
    );
  }

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
    await appendRow("plants", [
      id,
      name,
      String(total_quantity),
      image_url || "",
    ]);
    return NextResponse.json({ id, name, total_quantity, image_url });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to create plant: ${e}` },
      { status: 500 }
    );
  }
}
