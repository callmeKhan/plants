import { NextResponse } from "next/server";
import { isSheetsConfigured, readSheet, appendRow, updateRow } from "@/lib/sheets";
import { v4 as uuidv4 } from "uuid";

// GET /api/plant-locations
export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured." },
      { status: 503 }
    );
  }

  try {
    const rows = await readSheet("plant_locations");
    const locations = rows.slice(1).map((row) => ({
      id: row[0],
      plant_id: row[1],
      platform_id: row[2],
      quantity: Number(row[3]),
    }));
    return NextResponse.json(locations);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to read plant_locations: ${e}` },
      { status: 500 }
    );
  }
}

// POST /api/plant-locations — assign a plant to a platform
export async function POST(request: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { plant_id, platform_id, quantity } = body;

    if (!plant_id || !platform_id || quantity == null) {
      return NextResponse.json(
        { error: "plant_id, platform_id, quantity are required" },
        { status: 400 }
      );
    }

    // Validate inventory constraint
    const plants = await readSheet("plants");
    const plantRow = plants.find((r) => r[0] === plant_id);
    if (!plantRow) {
      return NextResponse.json(
        { error: "Plant not found" },
        { status: 404 }
      );
    }
    const totalQuantity = Number(plantRow[2]);

    const locations = await readSheet("plant_locations");
    const usedQuantity = locations
      .slice(1)
      .filter((r) => r[1] === plant_id)
      .reduce((sum, r) => sum + Number(r[3]), 0);

    if (usedQuantity + quantity > totalQuantity) {
      return NextResponse.json(
        {
          error: `Inventory exceeded: used ${usedQuantity} + ${quantity} > total ${totalQuantity}`,
        },
        { status: 400 }
      );
    }

    // Validate platform capacity
    const platforms = await readSheet("platforms");
    const platformRow = platforms.find((r) => r[0] === platform_id);
    if (!platformRow) {
      return NextResponse.json(
        { error: "Platform not found" },
        { status: 404 }
      );
    }
    const capacity = Number(platformRow[4]);

    const usedCapacity = locations
      .slice(1)
      .filter((r) => r[2] === platform_id)
      .reduce((sum, r) => sum + Number(r[3]), 0);

    if (usedCapacity + quantity > capacity) {
      return NextResponse.json(
        {
          error: `Capacity exceeded: used ${usedCapacity} + ${quantity} > capacity ${capacity}`,
        },
        { status: 400 }
      );
    }

    // Upsert: if same plant+platform exists, update quantity instead of new row
    const existingIdx = locations
      .slice(1)
      .findIndex((r) => r[1] === plant_id && r[2] === platform_id);

    if (existingIdx !== -1) {
      const rowIndex = existingIdx + 2; // +1 header, +1 for 1-indexed
      const existingQty = Number(locations[existingIdx + 1][3]);
      const newQty = existingQty + quantity;
      await updateRow("plant_locations", rowIndex, [
        locations[existingIdx + 1][0],
        plant_id,
        platform_id,
        String(newQty),
      ]);
      return NextResponse.json({
        id: locations[existingIdx + 1][0],
        plant_id,
        platform_id,
        quantity: newQty,
      });
    }

    const id = body.id || uuidv4();
    await appendRow("plant_locations", [
      id,
      plant_id,
      platform_id,
      String(quantity),
    ]);
    return NextResponse.json({ id, plant_id, platform_id, quantity });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to create plant location: ${e}` },
      { status: 500 }
    );
  }
}
