"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ConfirmState = { message: string; onConfirm: () => void } | null;

// ── Hook ─────────────────────────────────────────────────────────────────────

/** Returns [openConfirm fn, <ConfirmModal /> element] */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(null);

  function openConfirm(message: string, onConfirm: () => void) {
    setState({ message, onConfirm });
  }

  function close() {
    setState(null);
  }

  const modal = state ? (
    <ConfirmModal
      message={state.message}
      onConfirm={() => { state.onConfirm(); close(); }}
      onCancel={close}
    />
  ) : null;

  return [openConfirm, modal] as const;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Tailwind / inline colour for the icon background. Default: "#fffbeb" */
  iconBg?: string;
  /** Colour of the AlertCircle icon. Default: "#f59e0b" */
  iconColor?: string;
  /** Background colour of the confirm button. Default: "#059669" */
  confirmBg?: string;
  /** Label for confirm button. Default: "Xác nhận" */
  confirmLabel?: string;
  /** Label for cancel button. Default: "Huỷ" */
  cancelLabel?: string;
}

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  iconBg = "#fffbeb",
  iconColor = "#f59e0b",
  confirmBg = "#059669",
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
}: ConfirmModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-5"
      style={{ zIndex: 200, backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: iconBg }}
        >
          <AlertCircle className="w-6 h-6" style={{ color: iconColor }} />
        </div>
        <p className="text-sm text-gray-700 mb-6 text-center leading-relaxed whitespace-pre-line">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className="flex-1 h-11 rounded-xl text-sm text-white font-semibold"
            style={{ backgroundColor: confirmBg }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
