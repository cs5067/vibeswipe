"use client";

import { useState, useEffect } from "react";

interface AlbumColors {
  primary: string;
  secondary: string;
  isDark: boolean;
}

const colorCache = new Map<string, AlbumColors>();

const DEFAULT_COLORS: AlbumColors = {
  primary: "#6366f1",
  secondary: "#8b5cf6",
  isDark: true,
};

function extractColorsFromImage(imageUrl: string): Promise<AlbumColors> {
  return new Promise((resolve) => {
    if (colorCache.has(imageUrl)) {
      resolve(colorCache.get(imageUrl)!);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(DEFAULT_COLORS);
          return;
        }

        // Sample at small size for performance
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size).data;

        // Simple dominant color extraction using color bucketing
        const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        for (let i = 0; i < imageData.length; i += 16) { // Sample every 4th pixel
          const r = Math.round(imageData[i] / 32) * 32;
          const g = Math.round(imageData[i + 1] / 32) * 32;
          const b = Math.round(imageData[i + 2] / 32) * 32;
          const key = `${r},${g},${b}`;

          if (colorBuckets.has(key)) {
            const bucket = colorBuckets.get(key)!;
            bucket.count++;
            bucket.r = (bucket.r + imageData[i]) / 2;
            bucket.g = (bucket.g + imageData[i + 1]) / 2;
            bucket.b = (bucket.b + imageData[i + 2]) / 2;
          } else {
            colorBuckets.set(key, { r: imageData[i], g: imageData[i + 1], b: imageData[i + 2], count: 1 });
          }
        }

        // Sort by count and pick top 2 distinct colors
        const sorted = Array.from(colorBuckets.values())
          .sort((a, b) => b.count - a.count)
          .filter((c) => {
            // Skip very dark and very light colors
            const brightness = (c.r + c.g + c.b) / 3;
            return brightness > 30 && brightness < 230;
          });

        const primary = sorted[0] || { r: 99, g: 102, b: 241 };
        const secondary = sorted[1] || sorted[0] || { r: 139, g: 92, b: 246 };

        const primaryBrightness = (primary.r + primary.g + primary.b) / 3;

        const colors: AlbumColors = {
          primary: `rgb(${Math.round(primary.r)}, ${Math.round(primary.g)}, ${Math.round(primary.b)})`,
          secondary: `rgb(${Math.round(secondary.r)}, ${Math.round(secondary.g)}, ${Math.round(secondary.b)})`,
          isDark: primaryBrightness < 128,
        };

        colorCache.set(imageUrl, colors);
        resolve(colors);
      } catch {
        resolve(DEFAULT_COLORS);
      }
    };

    img.onerror = () => resolve(DEFAULT_COLORS);
    img.src = imageUrl;
  });
}

export function useAlbumColors(imageUrl: string | null): AlbumColors {
  const [colors, setColors] = useState<AlbumColors>(DEFAULT_COLORS);

  useEffect(() => {
    if (!imageUrl) return;

    extractColorsFromImage(imageUrl).then(setColors);
  }, [imageUrl]);

  return imageUrl ? colors : DEFAULT_COLORS;
}
