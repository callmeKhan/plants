import type { ComponentPropsWithoutRef } from "react";
import type { PlantLocation, Platform } from "@/lib/data";
import { getPlatformCapacityStats } from "@/lib/platform-capacity";
import { Badge } from "@/components/ui/badge";

type CapacityPlatform = Pick<Platform, "id" | "name" | "capacity">;
type CapacityLocation = Pick<PlantLocation, "quantity">;

type PlatformCapacityBadgeProps = Omit<ComponentPropsWithoutRef<typeof Badge>, "children"> & {
  platforms: readonly CapacityPlatform[];
  locationsByPlatform: ReadonlyMap<string, readonly CapacityLocation[]>;
  excludeHanging?: boolean;
};

export function PlatformCapacityBadge({
  platforms,
  locationsByPlatform,
  excludeHanging = true,
  ...badgeProps
}: PlatformCapacityBadgeProps) {
  const { used, total, free } = getPlatformCapacityStats(platforms, locationsByPlatform, { excludeHanging });

  return (
    <Badge {...badgeProps}>
      {used}/{total} &nbsp;<b>({free})</b>&nbsp; tấm
    </Badge>
  );
}
