"use client";

import { useRef, useLayoutEffect, type ReactNode } from "react";

interface CollapseProps {
  open: boolean;
  children: ReactNode;
  duration?: number;
}

export function Collapse({ open, children, duration = 250 }: CollapseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prevOpen = useRef(open);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No change (initial mount, Strict Mode remount, etc.) — just set state, no animation
    if (prevOpen.current === open) {
      el.style.height = open ? "auto" : "0px";
      return;
    }
    prevOpen.current = open;

    if (open) {
      // Opening: animate from 0 to scrollHeight, then set auto
      el.style.transition = `height ${duration}ms ease`;
      el.style.height = el.scrollHeight + "px";
      const tid = setTimeout(() => {
        el.style.transition = "";
        el.style.height = "auto";
      }, duration);
      return () => clearTimeout(tid);
    } else {
      // Closing: snapshot height, force reflow, then animate to 0
      el.style.transition = "";
      el.style.height = el.scrollHeight + "px";
      void el.offsetHeight; // force reflow
      el.style.transition = `height ${duration}ms ease`;
      el.style.height = "0px";
    }
  }, [open, duration]);

  return (
    <div ref={ref} style={{ overflow: "hidden" }}>
      {children}
    </div>
  );
}
