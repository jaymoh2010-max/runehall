const DEFAULT_MAX_WIDTH = 320;

export function thumbnailDimensions(
  width: number,
  height: number,
  maxWidth = DEFAULT_MAX_WIDTH
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const targetWidth = Math.max(1, Math.min(safeWidth, Math.round(maxWidth)));
  return {
    width: targetWidth,
    height: Math.max(1, Math.round((safeHeight / safeWidth) * targetWidth)),
  };
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Build a small local preview for scene pickers. Returns null when the browser
 * cannot decode the image or canvas export is unavailable; the full image is
 * still uploaded and used as the fallback thumbnail.
 */
export async function createThumbnailFile(
  file: File,
  maxWidth = DEFAULT_MAX_WIDTH
): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const size = thumbnailDimensions(bitmap.width, bitmap.height, maxWidth);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    let blob = await canvasBlob(canvas, "image/webp", 0.82);
    let extension = "webp";
    if (!blob) {
      blob = await canvasBlob(canvas, "image/png");
      extension = "png";
    }
    if (!blob) return null;
    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "scene";
    return new File([blob], `${base}-thumb.${extension}`, { type: blob.type });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
