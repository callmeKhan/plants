"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, X } from "lucide-react";

export type ToastMsg = { text: string; type: "success" | "error" };

interface ToastProps {
  msg: ToastMsg;
  onClose: () => void;
  duration?: number; // ms, default 5000
}

export function Toast({ msg, onClose, duration = 5000 }: ToastProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fade-out 700ms before auto-close
    const fadeTimer = setTimeout(() => setFading(true), duration - 700);
    const closeTimer = setTimeout(() => onClose(), duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [msg, duration, onClose]);

  const handleClose = () => {
    setFading(true);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={[
        "fixed top-4 left-1/2 -translate-x-1/2",
        "flex items-center gap-2",
        "rounded-xl px-4 py-3 text-sm font-medium border shadow-lg",
        "max-w-sm w-[calc(100%-2rem)]",
        "transition-opacity duration-300",
        fading ? "opacity-0" : "opacity-100",
        msg.type === "success"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200",
      ].join(" ")}
      style={{ zIndex: 70 }}
    >
      {msg.type === "success"
        ? <CheckCircle className="w-4 h-4 shrink-0" />
        : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{msg.text}</span>
      <button
        onClick={handleClose}
        className="ml-1 rounded-full p-0.5 hover:bg-black/10 transition-colors shrink-0"
        aria-label="Đóng"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
