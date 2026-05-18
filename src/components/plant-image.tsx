"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

const PLACEHOLDER_IMAGE = "/plant-placeholder.png";
const ALLOWED_IMAGE_HOST = "lh3.googleusercontent.com";

interface PlantImageProps {
  src?: string | null;
  alt: string;
  sizes: string;
  className?: string;
}

function getSafeImageSrc(src?: string | null) {
  const value = src?.trim();
  if (!value) return PLACEHOLDER_IMAGE;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === ALLOWED_IMAGE_HOST) {
      return value;
    }
  } catch {
    return PLACEHOLDER_IMAGE;
  }

  return PLACEHOLDER_IMAGE;
}

export function PlantImage({ src, alt, sizes, className = "object-cover" }: PlantImageProps) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = failedSrc === safeSrc ? PLACEHOLDER_IMAGE : safeSrc;

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailedSrc(safeSrc)}
    />
  );
}
