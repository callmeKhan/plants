import type { PlantLocation, Platform } from "@/lib/data";
import { round2 } from "@/lib/number";

type CapacityPlatform = Pick<Platform, "id" | "name" | "capacity">;
type CapacityLocation = Pick<PlantLocation, "quantity">;

type PlatformCapacityOptions = {
  excludeHanging?: boolean;
};

export function isHangingPlatform(platform: Pick<Platform, "name">) {
  return (
    platform.name.toLocaleLowerCase("vi").startsWith("treo") ||
    platform.name.toLocaleLowerCase("vi").includes("xe") ||
    platform.name.toLocaleLowerCase("vi").includes("chờ")
  );
}

export function getPlatformCapacityStats(
  platforms: readonly CapacityPlatform[],
  locationsByPlatform: ReadonlyMap<string, readonly CapacityLocation[]>,
  { excludeHanging = true }: PlatformCapacityOptions = {},
) {
  const capacityPlatforms = excludeHanging
    ? platforms.filter((platform) => !isHangingPlatform(platform))
    : platforms;

  const used = round2(
    capacityPlatforms.reduce(
      (sum, platform) =>
        sum +
        (locationsByPlatform.get(platform.id) ?? []).reduce(
          (locSum, location) => locSum + location.quantity,
          0,
        ),
      0,
    ),
  );
  const total = round2(capacityPlatforms.reduce((sum, platform) => sum + platform.capacity, 0));

  return {
    used,
    total,
    free: round2(total - used),
  };
}
