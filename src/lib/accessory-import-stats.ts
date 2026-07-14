import { round2 } from "@/lib/number";

export type AccessoryImportPeriodStat = {
  period: string;
  year: string;
  total_quantity: number;
  total_value: number;
  batch_count: number;
  item_count: number;
  average_unit_cost: number;
};

export type AccessoryImportTotals = {
  total_quantity: number;
  total_value: number;
  batch_count: number;
  item_count: number;
  average_unit_cost: number;
  first_imported_date: string | null;
  latest_imported_date: string | null;
};

export type AccessoryImportItemStat = {
  key: string;
  name: string;
  total_quantity: number;
  total_value: number;
  batch_count: number;
  average_unit_cost: number;
  latest_imported_date: string | null;
};

export type AccessoryImportStatsRow = {
  key: string;
  name: string;
  unit_cost: number;
  imported_date: string;
  quantity: number;
  value: number;
};

export type AccessoryImportStatsInputRow = {
  name: string | null;
  unit_cost: number | string | null;
  imported_date: string | null;
  quantity: number | string | null;
};

export type AccessoryImportStatsPayload = {
  months: AccessoryImportPeriodStat[];
  years: AccessoryImportPeriodStat[];
  totals: AccessoryImportTotals;
  items: AccessoryImportItemStat[];
  rows: AccessoryImportStatsRow[];
  generated_at: string;
};

type MutablePeriodStat = {
  period: string;
  year: string;
  totalQuantity: number;
  totalValue: number;
  batchCount: number;
  itemKeys: Set<string>;
};

type MutableItemStat = {
  key: string;
  name: string;
  totalQuantity: number;
  totalValue: number;
  batchCount: number;
  latestImportedDate: string | null;
};

export function accessoryImportItemKey(name: string) {
  return name.trim().toLowerCase();
}

function emptyPeriodStat(period: string, year: string): MutablePeriodStat {
  return {
    period,
    year,
    totalQuantity: 0,
    totalValue: 0,
    batchCount: 0,
    itemKeys: new Set<string>(),
  };
}

function addToPeriod(
  periods: Map<string, MutablePeriodStat>,
  period: string,
  year: string,
  itemKey: string,
  quantity: number,
  value: number,
) {
  const stat = periods.get(period) ?? emptyPeriodStat(period, year);
  stat.totalQuantity = round2(stat.totalQuantity + quantity);
  stat.totalValue = round2(stat.totalValue + value);
  stat.batchCount += 1;
  stat.itemKeys.add(itemKey);
  periods.set(period, stat);
}

function finalizePeriod(stat: MutablePeriodStat): AccessoryImportPeriodStat {
  return {
    period: stat.period,
    year: stat.year,
    total_quantity: round2(stat.totalQuantity),
    total_value: round2(stat.totalValue),
    batch_count: stat.batchCount,
    item_count: stat.itemKeys.size,
    average_unit_cost: stat.totalQuantity > 0 ? round2(stat.totalValue / stat.totalQuantity) : 0,
  };
}

function finalizeItem(stat: MutableItemStat): AccessoryImportItemStat {
  return {
    key: stat.key,
    name: stat.name,
    total_quantity: round2(stat.totalQuantity),
    total_value: round2(stat.totalValue),
    batch_count: stat.batchCount,
    average_unit_cost: stat.totalQuantity > 0 ? round2(stat.totalValue / stat.totalQuantity) : 0,
    latest_imported_date: stat.latestImportedDate,
  };
}

function emptyTotals(): AccessoryImportTotals {
  return {
    total_quantity: 0,
    total_value: 0,
    batch_count: 0,
    item_count: 0,
    average_unit_cost: 0,
    first_imported_date: null,
    latest_imported_date: null,
  };
}

function normalizeStatsRow(row: AccessoryImportStatsInputRow): AccessoryImportStatsRow | null {
  const name = row.name?.trim();
  const importedDate = row.imported_date;
  const quantity = Number(row.quantity);
  const unitCost = Number(row.unit_cost);

  if (!name || !importedDate || !Number.isFinite(quantity) || !Number.isFinite(unitCost)) {
    return null;
  }

  return {
    key: accessoryImportItemKey(name),
    name,
    unit_cost: round2(unitCost),
    imported_date: importedDate,
    quantity: round2(quantity),
    value: round2(quantity * unitCost),
  };
}

export function buildAccessoryImportStatsPayload(
  rows: AccessoryImportStatsInputRow[],
  generatedAt = new Date().toISOString(),
): AccessoryImportStatsPayload {
  const monthStats = new Map<string, MutablePeriodStat>();
  const yearStats = new Map<string, MutablePeriodStat>();
  const itemStats = new Map<string, MutableItemStat>();
  const allItemKeys = new Set<string>();
  const normalizedRows: AccessoryImportStatsRow[] = [];
  const totals = emptyTotals();

  for (const row of rows) {
    const normalized = normalizeStatsRow(row);
    if (!normalized) continue;

    const { key, name, imported_date: importedDate, quantity, value } = normalized;
    const year = importedDate.slice(0, 4);
    const month = importedDate.slice(0, 7);

    normalizedRows.push(normalized);
    addToPeriod(monthStats, month, year, key, quantity, value);
    addToPeriod(yearStats, year, year, key, quantity, value);

    const item = itemStats.get(key) ?? {
      key,
      name,
      totalQuantity: 0,
      totalValue: 0,
      batchCount: 0,
      latestImportedDate: null,
    };

    item.totalQuantity = round2(item.totalQuantity + quantity);
    item.totalValue = round2(item.totalValue + value);
    item.batchCount += 1;

    if (!item.latestImportedDate || importedDate >= item.latestImportedDate) {
      item.latestImportedDate = importedDate;
      item.name = name;
    }

    itemStats.set(key, item);

    totals.total_quantity = round2(totals.total_quantity + quantity);
    totals.total_value = round2(totals.total_value + value);
    totals.batch_count += 1;
    allItemKeys.add(key);

    if (!totals.first_imported_date || importedDate < totals.first_imported_date) {
      totals.first_imported_date = importedDate;
    }
    if (!totals.latest_imported_date || importedDate > totals.latest_imported_date) {
      totals.latest_imported_date = importedDate;
    }
  }

  totals.item_count = allItemKeys.size;
  totals.average_unit_cost =
    totals.total_quantity > 0 ? round2(totals.total_value / totals.total_quantity) : 0;

  return {
    months: Array.from(monthStats.values())
      .map(finalizePeriod)
      .sort((a, b) => a.period.localeCompare(b.period)),
    years: Array.from(yearStats.values())
      .map(finalizePeriod)
      .sort((a, b) => a.period.localeCompare(b.period)),
    totals,
    items: Array.from(itemStats.values())
      .map(finalizeItem)
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base", numeric: true })),
    rows: normalizedRows,
    generated_at: generatedAt,
  };
}
