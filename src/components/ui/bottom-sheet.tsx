"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  closing?: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  onCloseRequest: () => void;
  onClosed: () => void;
  closeLabel?: string;
  zIndex?: number;
  height?: string;
  wrapTitle?: boolean;
}

export function BottomSheet({
  open,
  closing = false,
  title,
  description,
  icon,
  children,
  onCloseRequest,
  onClosed,
  closeLabel = "Đóng sheet",
  zIndex = 40,
  height = "85vh",
  wrapTitle = false,
}: BottomSheetProps) {
  const titleId = useId();

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center sheet-backdrop${closing ? " closing" : ""}`}
      style={{ zIndex, overscrollBehavior: "none" }}
      onClick={onCloseRequest}
    >
      <div
        className={`flex w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sheet-panel${closing ? " closing" : ""}`}
        style={{ height, marginBottom: "64px", overscrollBehavior: "contain" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === "sheetSlideDown") {
            onClosed();
          }
        }}
      >
        <div className="sticky top-0 z-20 flex items-center gap-3 rounded-t-3xl border-b border-gray-100 bg-white px-5 py-4">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className={`${wrapTitle ? "whitespace-pre-line text-base leading-snug" : "truncate text-xl"} font-bold text-gray-900`}
            >
              {title}
            </h2>
            {description && <p className="mt-0.5 truncate text-xs text-gray-400">{description}</p>}
          </div>
          <button
            type="button"
            className="flex h-8 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100"
            onClick={onCloseRequest}
            aria-label={closeLabel}
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
