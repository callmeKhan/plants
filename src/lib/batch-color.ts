export const BATCH_COLORS = ["white", "yellow", "red"] as const;

export type BatchColor = (typeof BATCH_COLORS)[number];

export const BATCH_COLOR_META: Record<
  BatchColor,
  { label: string; backgroundColor: string; borderColor: string }
> = {
  white: {
    label: "Trắng",
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
  },
  yellow: {
    label: "Vàng",
    backgroundColor: "#facc15",
    borderColor: "#eab308",
  },
  red: {
    label: "Đỏ",
    backgroundColor: "#ef4444",
    borderColor: "#dc2626",
  },
};

export const PLATFORM_HIGHLIGHT_BATCH_COLORS: BatchColor[] = ["red", "yellow"];

export function isBatchColor(value: unknown): value is BatchColor {
  return typeof value === "string" && BATCH_COLORS.includes(value as BatchColor);
}

export function normalizeBatchColor(value: unknown): BatchColor {
  return isBatchColor(value) ? value : "white";
}
