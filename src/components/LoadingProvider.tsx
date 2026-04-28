"use client";

import { createContext, useContext, useRef, useState, useCallback } from "react";

// ─── Context ────────────────────────────────────────────────────────────────

interface LoadingCtx {
  increment: () => void;
  decrement: () => void;
}

const Ctx = createContext<LoadingCtx>({ increment: () => {}, decrement: () => {} });

export function useLoading() {
  return useContext(Ctx);
}

// ─── Loading Circle ──────────────────────────────────────────────────────────

function LoadingCircle({ active }: { active: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: active ? "auto" : "none",
        opacity: active ? 1 : 0,
        transition: active ? "opacity 0.1s" : "opacity 0.3s 0.05s",
        backgroundColor: active ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0)",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "3px solid #d1fae5",
          borderTopColor: "#059669",
          animation: "spin 0.7s linear infinite",
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

const MIN_DISPLAY_MS = 600;

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const count = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef<number | null>(null);

  const increment = useCallback(() => {
    count.current += 1;
    if (count.current === 1) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      shownAt.current = Date.now();
      setActive(true);
    }
  }, []);

  const decrement = useCallback(() => {
    count.current = Math.max(0, count.current - 1);
    if (count.current === 0) {
      const elapsed = shownAt.current ? Date.now() - shownAt.current : MIN_DISPLAY_MS;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      hideTimer.current = setTimeout(() => {
        setActive(false);
        shownAt.current = null;
      }, remaining);
    }
  }, []);

  return (
    <Ctx.Provider value={{ increment, decrement }}>
      <LoadingCircle active={active} />
      {children}
    </Ctx.Provider>
  );
}
