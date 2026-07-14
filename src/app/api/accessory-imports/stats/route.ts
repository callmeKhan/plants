import { NextResponse } from "next/server";
import {
  buildAccessoryImportStatsPayload,
  type AccessoryImportStatsInputRow,
} from "@/lib/accessory-import-stats";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("accessory_imports")
    .select("name, unit_cost, imported_date, quantity")
    .order("imported_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payload = buildAccessoryImportStatsPayload((data ?? []) as AccessoryImportStatsInputRow[]);

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
