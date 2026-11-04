export interface ImageMetadata {
  mime: string | null;
  width: number | null;
  height: number | null;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * Inspect the leading bytes of an uploaded image. The declared multipart MIME
 * is client-controlled, so the server checks the actual signature before
 * accepting a file. Dimensions are best-effort: JPEGs may store the frame
 * header beyond the inspected window.
 */
export function inspectImage(buffer: Buffer): ImageMetadata {
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      mime: "image/png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if ((gifHeader === "GIF87a" || gifHeader === "GIF89a") && buffer.length >= 10) {
    return {
      mime: "image/gif",
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      if (marker === 0xda) break;
      if (offset + 4 > buffer.length) break;
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;
      if (JPEG_SOF_MARKERS.has(marker)) {
        return {
          mime: "image/jpeg",
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
    return { mime: "image/jpeg", width: null, height: null };
  }

  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        mime: "image/webp",
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return {
        mime: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8 ") {
      return {
        mime: "image/webp",
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    return { mime: "image/webp", width: null, height: null };
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (["avif", "avis", "mif1", "msf1"].includes(brand)) {
      return { mime: "image/avif", width: null, height: null };
    }
  }

  return { mime: null, width: null, height: null };
}
