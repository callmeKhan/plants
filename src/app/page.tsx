"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update(); // sync initial value post-hydration
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const plantCount = useLiveQuery(() => db.plants.count(), [], 0);
  const platformCount = useLiveQuery(() => db.platforms.count(), [], 0);
  const locationCount = useLiveQuery(() => db.plantLocations.count(), [], 0);
  const pendingSync = useLiveQuery(
    () => db.syncQueue.where("status").equals("pending").count(),
    [],
    0,
  );

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">🌱 Plant Manager</h1>
      <div className="space-y-2 text-sm">
        <p>🌿 Plants: {plantCount ?? "..."}</p>
        <p>📦 Platforms: {platformCount ?? "..."}</p>
        <p>🔄 Pending sync: {pendingSync ?? "..."}</p>
      </div>
      <p className="mt-4 text-xs text-gray-500">
        {isOnline ? "🟢 Online" : "🔴 Offline"}
      </p>
    </div>
  );
}
