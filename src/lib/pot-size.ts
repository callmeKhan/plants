export type PotUnit = "pot" | "basket";

export const POT_UNIT_LABELS: Record<PotUnit, string> = {
  pot: "Chậu",
  basket: "Rổ",
};

// Signed int4 encoding keeps the existing schema backward-compatible:
// positive values are pots, negative values are baskets.
export function decodePotSize(value: number) {
  return {
    unit: value < 0 ? "basket" as const : "pot" as const,
    size: Math.abs(value),
  };
}

export function encodePotSize(size: number, unit: PotUnit) {
  const normalizedSize = Math.abs(Math.trunc(size));
  return unit === "basket" ? -normalizedSize : normalizedSize;
}

export function formatPotSize(value: number) {
  const { unit, size } = decodePotSize(value);
  return `${POT_UNIT_LABELS[unit].toLocaleLowerCase("vi")} ${size}`;
}

export function comparePotSizes(a: number, b: number) {
  const decodedA = decodePotSize(a);
  const decodedB = decodePotSize(b);

  if (decodedA.unit !== decodedB.unit) return decodedA.unit === "pot" ? -1 : 1;
  return decodedA.size - decodedB.size;
}

export function isValidEncodedPotSize(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value !== 0
    && value >= -2_147_483_648
    && value <= 2_147_483_647;
}
