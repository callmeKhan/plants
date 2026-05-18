"use client";

import { useEffect, useRef } from "react";
import { useLoading } from "@/components/LoadingProvider";

// Symbol used to mark our patched fetch so we never double-wrap
const PATCHED = Symbol("loading-patched");

export default function SyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { increment, decrement } = useLoading();
  const incrementRef = useRef(increment);
  const decrementRef = useRef(decrement);
  incrementRef.current = increment;
  decrementRef.current = decrement;

  useEffect(() => {
    // Guard: do not double-wrap (React StrictMode mounts effects twice in dev)
    if ((window.fetch as typeof fetch & { [PATCHED]?: boolean })[PATCHED]) {
      return;
    }

    const original = window.fetch;

    const patched: typeof fetch = async (...args) => {
      incrementRef.current();
      try {
        return await original(...args);
      } finally {
        decrementRef.current();
      }
    };
    (patched as typeof fetch & { [PATCHED]?: boolean })[PATCHED] = true;

    window.fetch = patched;

    // Register service worker for PWA (skip on localhost to avoid dev cache issues)
    if ("serviceWorker" in navigator && location.hostname !== "localhost") {
      const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "0";
      navigator.serviceWorker.register(`/sw.js?v=${buildTime}`).catch(console.error);
    }

    return () => {
      window.fetch = original;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
