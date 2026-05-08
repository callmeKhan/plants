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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    // No change — just set final state, no animation
    if (prevOpen.current === open) {
      el.style.height = open ? "auto" : "0px";
      el.style.overflow = open ? "" : "hidden";
      return;
    }
    prevOpen.current = open;

    if (open) {
      // Opening: animate from 0 to scrollHeight, keep overflow hidden
      // during transition, then release so dropdowns aren't clipped
      el.style.overflow = "hidden";
      el.style.transition = `height ${duration}ms ease`;
      el.style.height = el.scrollHeight + "px";
      timerRef.current = setTimeout(() => {
        el.style.transition = "";
        el.style.height = "auto";
        el.style.overflow = "";
      }, duration);
    } else {
      // Closing: snapshot height, force reflow, then animate to 0
      el.style.overflow = "hidden";
      el.style.transition = "";
      el.style.height = el.scrollHeight + "px";
      void el.offsetHeight;
      el.style.transition = `height ${duration}ms ease`;
      el.style.height = "0px";
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, duration]);

  return <div ref={ref}>{children}</div>;
}
