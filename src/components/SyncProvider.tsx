"use client";

import { useEffect } from "react";
import { startSyncWorker } from "@/lib/sync";

export default function SyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Register service worker for PWA (skip on localhost to avoid dev cache issues)
    if ("serviceWorker" in navigator && location.hostname !== "localhost") {
      const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "0";
      navigator.serviceWorker.register(`/sw.js?v=${buildTime}`).catch(console.error);
    }

    const cleanup = startSyncWorker();
    return cleanup;
  }, []);

  return <>{children}</>;
}
