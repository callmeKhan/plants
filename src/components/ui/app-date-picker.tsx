"use client";

import dayjs from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { formatVietnameseWeekday } from "@/lib/date-picker";

type AppDatePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  clearable?: boolean;
  height?: number;
};

export function AppDatePicker({
  value,
  onValueChange,
  ariaLabel,
  className,
  clearable = false,
  height = 44,
}: AppDatePickerProps) {
  return (
    <div className={className}>
      <DatePicker
        value={value ? dayjs(value) : null}
        onChange={(nextValue) => {
          if (nextValue === null) {
            onValueChange("");
            return;
          }

          if (nextValue.isValid()) {
            onValueChange(nextValue.format("YYYY-MM-DD"));
          }
        }}
        format="DD/MM/YYYY"
        dayOfWeekFormatter={formatVietnameseWeekday}
        slotProps={{
          field: {
            clearable,
          },
          textField: {
            "aria-label": ariaLabel,
            fullWidth: true,
            sx: {
              "& .MuiPickersInputBase-root": {
                minHeight: height,
                height,
                borderRadius: "0.75rem",
                backgroundColor: "#fff",
                fontFamily: "inherit",
                fontSize: "1rem",
              },
              "& .MuiPickersOutlinedInput-notchedOutline": {
                borderColor: "#e5e7eb",
              },
              "&:hover .MuiPickersOutlinedInput-notchedOutline": {
                borderColor: "#cbd5e1",
              },
              "& .MuiPickersSectionList-root": {
                paddingBlock: 0,
              },
              "& .MuiIconButton-root": {
                padding: height <= 32 ? "4px" : "8px",
              },
            },
          },
        }}
      />
    </div>
  );
}
