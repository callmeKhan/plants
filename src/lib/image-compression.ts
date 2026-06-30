const MAX_IMAGE_EDGE = 1280;
const IMAGE_QUALITY = 0.55;

export interface CompressedImage {
  blob: Blob;
  contentType: "image/jpeg" | "image/webp";
  width: number;
  height: number;
}

let webpSupport: Promise<boolean> | null = null;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read image"));
    };
    image.src = url;
  });
}

async function canExportWebp() {
  if (!webpSupport) {
    webpSupport = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const blob = await canvasToBlob(canvas, "image/webp", IMAGE_QUALITY);
      return blob?.type === "image/webp";
    })();
  }

  return webpSupport;
}

export async function compressPlantPhoto(file: File): Promise<CompressedImage> {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Cannot compress image");
  context.drawImage(image, 0, 0, width, height);

  const preferredType = await canExportWebp() ? "image/webp" : "image/jpeg";
  const fallbackType = "image/jpeg";
  const blob = await canvasToBlob(canvas, preferredType, IMAGE_QUALITY)
    ?? await canvasToBlob(canvas, fallbackType, IMAGE_QUALITY);

  if (!blob) throw new Error("Cannot compress image");

  return {
    blob,
    contentType: blob.type === "image/webp" ? "image/webp" : "image/jpeg",
    width,
    height,
  };
}
