"use client";

import { useEffect } from "react";
import { startSyncWorker } from "@/lib/sync";

export default function SyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    const cleanup = startSyncWorker();
    return cleanup;
  }, []);

  return <>{children}</>;
}
