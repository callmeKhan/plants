export const DEFAULT_PLANT_MAX_IMAGES = 5;
export const PLANT_MAX_IMAGES_ENV = "NEXT_PUBLIC_PLANT_MAX_IMAGES";

export function parsePlantMaxImages(value?: string | null) {
  const maxImages = Number(value);
  return Number.isInteger(maxImages) && maxImages > 0 ? maxImages : DEFAULT_PLANT_MAX_IMAGES;
}

export function getPlantMaxImages() {
  return parsePlantMaxImages(process.env.NEXT_PUBLIC_PLANT_MAX_IMAGES);
}

export function plantMaxImagesMessage(maxImages = getPlantMaxImages()) {
  return `Mỗi cây chỉ upload tối đa ${maxImages} hình.`;
}

export function plantRemainingImagesMessage(remainingSlots: number, maxImages = getPlantMaxImages()) {
  if (remainingSlots <= 0) return plantMaxImagesMessage(maxImages);
  return `${plantMaxImagesMessage(maxImages)} Còn thêm được ${remainingSlots} hình.`;
}
