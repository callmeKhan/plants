export const PLANT_LOCATION_STATUSES = [
  {
    value: "sang chậu",
    label: "Sang chậu",
    icon: "🪴",
    badgeBgColor: "#dbeafe",
    badgeTextColor: "#1d4ed8",
    filterActiveBgColor: "#2563eb",
    iconBgColor: "rgba(162, 203, 255, 1)",
  },
  {
    value: "trồng lại",
    label: "Trồng lại",
    icon: "🌱",
    badgeBgColor: "#fef3c7",
    badgeTextColor: "#92400e",
    filterActiveBgColor: "#f59e0b",
    iconBgColor: "rgba(255, 237, 164, 1)",
  },
  {
    value: "treo",
    label: "Treo",
    icon: "🪝",
    badgeBgColor: "#ccfbf1",
    badgeTextColor: "#0f766e",
    filterActiveBgColor: "#0d9488",
    iconBgColor: "rgba(153, 246, 228, 1)",
  },
] as const;

export type PlantLocationStatus = typeof PLANT_LOCATION_STATUSES[number]["value"];

type PlantLocationStatusMeta = {
  value: string;
  label: string;
  icon: string;
  badgeBgColor: string;
  badgeTextColor: string;
  filterActiveBgColor: string;
  iconBgColor: string;
};

const UNKNOWN_STATUS_STYLE = {
  icon: "",
  badgeBgColor: "#f3f4f6",
  badgeTextColor: "#374151",
  filterActiveBgColor: "#6b7280",
  iconBgColor: "#e5e7eb",
};

export function getPlantLocationStatusMeta(
  status: string | null | undefined,
): PlantLocationStatusMeta | null {
  if (!status) return null;

  return (
    PLANT_LOCATION_STATUSES.find((item) => item.value === status) ?? {
      value: status,
      label: status,
      ...UNKNOWN_STATUS_STYLE,
    }
  );
}
