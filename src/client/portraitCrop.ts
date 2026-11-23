export interface PortraitOffset {
  x: number;
  y: number;
}

export interface PortraitDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function portraitDrawRect(
  imageWidth: number,
  imageHeight: number,
  size: number,
  zoom: number,
  offset: PortraitOffset
): PortraitDrawRect {
  const scale = Math.max(size / imageWidth, size / imageHeight) * Math.max(1, zoom);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (size - width) / 2 + offset.x,
    y: (size - height) / 2 + offset.y,
    width,
    height,
  };
}

export function clampPortraitOffset(
  imageWidth: number,
  imageHeight: number,
  size: number,
  zoom: number,
  offset: PortraitOffset
): PortraitOffset {
  const rect = portraitDrawRect(imageWidth, imageHeight, size, zoom, { x: 0, y: 0 });
  const maxX = Math.max(0, (rect.width - size) / 2);
  const maxY = Math.max(0, (rect.height - size) / 2);
  return {
    x: maxX === 0 ? 0 : clamp(offset.x, -maxX, maxX),
    y: maxY === 0 ? 0 : clamp(offset.y, -maxY, maxY),
  };
}
