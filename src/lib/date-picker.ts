import type { Dayjs } from "dayjs";

const VIETNAMESE_WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function formatVietnameseWeekday(date: Dayjs) {
  return VIETNAMESE_WEEKDAY_LABELS[date.day()];
}
