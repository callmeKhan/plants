export type SpecialPlantLocationStatus = "trồng lại" | "sang chậu";

type PlatformLike = {
  name?: string | null;
};

function normalizePlatformName(name: string) {
  return name.trim().toLocaleLowerCase("vi");
}

const SPECIAL_STATUS_BY_PLATFORM_NAME: Record<string, SpecialPlantLocationStatus> = {
  [normalizePlatformName("Chờ Trồng lại")]: "trồng lại",
  [normalizePlatformName("Chờ Sang chậu")]: "sang chậu",
};

export function getSpecialPlatformStatus(platform: PlatformLike | null | undefined) {
  if (!platform?.name) return null;
  return SPECIAL_STATUS_BY_PLATFORM_NAME[normalizePlatformName(platform.name)] ?? null;
}
