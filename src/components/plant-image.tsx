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

function forceStandardFormat(googleUrl: string) {
  // Force WebP output from Google's CDN to strip HDR gain maps
  // that crash some Android devices.
  const url = new URL(googleUrl);
  const pathSegments = url.pathname.split("/");
  const last = pathSegments[pathSegments.length - 1];

  // Google image params live in the last path segment (e.g. =w1281-h1281-s-no-gm)
  if (last.includes("=")) {
    pathSegments[pathSegments.length - 1] = last + "-rw";
  } else {
    pathSegments[pathSegments.length - 1] = last + "=rw";
  }

  url.pathname = pathSegments.join("/");
  return url.toString();
}

function getSafeImageSrc(src?: string | null) {
  const value = src?.trim();
  if (!value) return PLACEHOLDER_IMAGE;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === ALLOWED_IMAGE_HOST) {
      return forceStandardFormat(value);
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
  const isRemote = imageSrc.startsWith("https://");

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={isRemote}
      className={className}
      onError={() => setFailedSrc(safeSrc)}
    />
  );
}
