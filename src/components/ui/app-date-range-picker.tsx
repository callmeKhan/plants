"use client";

import { createContext, useContext, useState, type MouseEvent } from "react";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import Popover from "@mui/material/Popover";
import dayjs, { type Dayjs } from "dayjs";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickerDay, type PickerDayProps } from "@mui/x-date-pickers/PickerDay";
import { CalendarDays, X } from "lucide-react";
import { formatVietnameseWeekday } from "@/lib/date-picker";

type AppDateRangePickerProps = {
  startValue: string;
  endValue: string;
  onRangeChange: (startValue: string, endValue: string) => void;
  ariaLabel: string;
  className?: string;
  height?: number;
};

type SelectionStep = "start" | "end";

const RangeContext = createContext<{ start: Dayjs | null; end: Dayjs | null }>({
  start: null,
  end: null,
});

function parseDate(value: string) {
  return value ? dayjs(value) : null;
}

function formatDate(value: string) {
  return dayjs(value).format("DD/MM/YYYY");
}

function formatDraftDate(value: Dayjs | null) {
  return value?.isValid() ? value.format("DD/MM/YYYY") : "Chưa chọn";
}

function RangePickerDay(props: PickerDayProps) {
  const { start, end } = useContext(RangeContext);
  const day = props.day as Dayjs;
  const isStart = Boolean(start && day.isSame(start, "day"));
  const isEnd = Boolean(end && day.isSame(end, "day"));
  const isBetween = Boolean(
    start && end && day.isAfter(start, "day") && day.isBefore(end, "day"),
  );

  return (
    <PickerDay
      {...props}
      selected={isStart || isEnd}
      isVisuallySelected={isStart || isEnd}
      sx={{
        ...(isBetween && !props.outsideCurrentMonth
          ? {
              borderRadius: 0,
              backgroundColor: "#eef2ff",
              color: "#3730a3",
              "&:hover, &:focus": {
                backgroundColor: "#e0e7ff",
              },
            }
          : {}),
        ...((isStart || isEnd) && !props.outsideCurrentMonth
          ? {
              "&&": {
                borderRadius: "50%",
                backgroundColor: "#4f46e5",
                color: "#fff",
              },
              "&&:hover, &&:focus": {
                backgroundColor: "#4338ca",
              },
            }
          : {}),
      }}
    />
  );
}

export function AppDateRangePicker({
  startValue,
  endValue,
  onRangeChange,
  ariaLabel,
  className,
  height = 40,
}: AppDateRangePickerProps) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [draftStart, setDraftStart] = useState<Dayjs | null>(null);
  const [draftEnd, setDraftEnd] = useState<Dayjs | null>(null);
  const [selectionStep, setSelectionStep] = useState<SelectionStep>("start");
  const isOpen = Boolean(anchorElement);
  const hasValue = Boolean(startValue || endValue);
  const displayValue = startValue && endValue
    ? `${formatDate(startValue)} – ${formatDate(endValue)}`
    : startValue
      ? `Từ ${formatDate(startValue)}`
      : endValue
        ? `Đến ${formatDate(endValue)}`
        : "Chọn khoảng ngày";

  function openPicker(event: MouseEvent<HTMLButtonElement>) {
    const start = parseDate(startValue);
    const end = parseDate(endValue);
    setDraftStart(start);
    setDraftEnd(end);
    setSelectionStep(start && !end ? "end" : "start");
    setAnchorElement(event.currentTarget);
  }

  function closePicker() {
    setAnchorElement(null);
  }

  function selectDate(value: Dayjs | null) {
    if (!value?.isValid()) return;
    const selectedDate = value.startOf("day");

    if (selectionStep === "start" || !draftStart) {
      setDraftStart(selectedDate);
      setDraftEnd(null);
      setSelectionStep("end");
      return;
    }

    setDraftEnd(selectedDate);
  }

  function acceptRange() {
    if (!draftStart?.isValid() || !draftEnd?.isValid()) return;
    onRangeChange(draftStart.format("YYYY-MM-DD"), draftEnd.format("YYYY-MM-DD"));
    closePicker();
  }

  function clearRange() {
    setDraftStart(null);
    setDraftEnd(null);
    setSelectionStep("start");
    onRangeChange("", "");
    closePicker();
  }

  return (
    <div className={className}>
      <div className="relative">
        <button
          type="button"
          className="flex w-full items-center rounded-xl border border-gray-200 bg-white pl-3 pr-20 text-left text-base text-gray-900 outline-none transition hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          style={{ height }}
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={openPicker}
        >
          <span className={hasValue ? "truncate" : "truncate text-gray-400"}>{displayValue}</span>
        </button>

        {hasValue && (
          <button
            type="button"
            className="absolute right-10 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Xóa khoảng ngày"
            onClick={clearRange}
          >
            <X className="size-4" />
          </button>
        )}

        <CalendarDays
          className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-gray-500"
          aria-hidden="true"
        />
      </div>

      <Popover
        open={isOpen}
        anchorEl={anchorElement}
        onClose={closePicker}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          backdrop: {
            invisible: false,
            sx: {
              backgroundColor: "rgba(15, 23, 42, 0.45)",
            },
          },
          paper: {
            sx: {
              mt: 1,
              width: "min(360px, calc(100vw - 24px))",
              maxWidth: "calc(100vw - 24px)",
              overflow: "hidden",
              borderRadius: 1,
            },
          },
        }}
      >
        <div className="border-b border-gray-100 px-4 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {draftStart && draftEnd
              ? "Khoảng ngày đã chọn"
              : selectionStep === "start"
                ? "Chọn ngày bắt đầu"
                : "Chọn ngày kết thúc"}
          </p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-left ${selectionStep === "start" ? "bg-indigo-50 ring-1 ring-indigo-200" : "bg-gray-50"}`}
              onClick={() => setSelectionStep("start")}
            >
              <span className="block text-[10px] font-semibold uppercase text-gray-400">Từ ngày</span>
              <span className="mt-0.5 block text-sm font-semibold text-gray-800">{formatDraftDate(draftStart)}</span>
            </button>
            <span className="text-gray-300">–</span>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${selectionStep === "end" ? "bg-indigo-50 ring-1 ring-indigo-200" : "bg-gray-50"}`}
              disabled={!draftStart}
              onClick={() => setSelectionStep("end")}
            >
              <span className="block text-[10px] font-semibold uppercase text-gray-400">Đến ngày</span>
              <span className="mt-0.5 block text-sm font-semibold text-gray-800">{formatDraftDate(draftEnd)}</span>
            </button>
          </div>
        </div>

        <RangeContext.Provider value={{ start: draftStart, end: draftEnd }}>
          <DateCalendar
            value={selectionStep === "end" ? draftEnd ?? draftStart : draftStart ?? draftEnd}
            onChange={selectDate}
            minDate={selectionStep === "end" && draftStart ? draftStart : undefined}
            dayOfWeekFormatter={formatVietnameseWeekday}
            slots={{ day: RangePickerDay }}
            sx={{
              width: "100%",
              maxWidth: 360,
              "& .MuiDayCalendar-slideTransition": {
                minHeight: 230,
              },
            }}
          />
        </RangeContext.Provider>

        <DialogActions sx={{ borderTop: "1px solid #f3f4f6", px: 2, py: 1 }}>
          <Button onClick={closePicker}>Hủy</Button>
          <Button disabled={!draftStart || !draftEnd} onClick={acceptRange}>OK</Button>
        </DialogActions>
      </Popover>
    </div>
  );
}
