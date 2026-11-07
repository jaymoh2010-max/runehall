import { describe, expect, it } from "vitest";
import { inspectImage } from "../src/server/imageMeta";

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gif(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(13);
  buffer.write("GIF89a", 0, "ascii");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function jpeg(width: number, height: number): Buffer {
  const buffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x00, 0x00,
    0x00, 0x00,
  ]);
  buffer.writeUInt16BE(height, 13);
  buffer.writeUInt16BE(width, 15);
  return buffer;
}

function webpVp8x(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

describe("image metadata", () => {
  it("reads PNG, GIF, JPEG, and WebP dimensions", () => {
    expect(inspectImage(png(640, 480))).toEqual({ mime: "image/png", width: 640, height: 480 });
    expect(inspectImage(gif(120, 90))).toEqual({ mime: "image/gif", width: 120, height: 90 });
    expect(inspectImage(jpeg(1920, 1080))).toEqual({
      mime: "image/jpeg",
      width: 1920,
      height: 1080,
    });
    expect(inspectImage(webpVp8x(800, 600))).toEqual({
      mime: "image/webp",
      width: 800,
      height: 600,
    });
  });

  it("accepts AVIF signatures without parsing dimensions", () => {
    const avif = Buffer.alloc(16);
    avif.write("ftypavif", 4, "ascii");
    expect(inspectImage(avif)).toEqual({ mime: "image/avif", width: null, height: null });
  });

  it("rejects non-image data", () => {
    expect(inspectImage(Buffer.from("<script>alert(1)</script>"))).toEqual({
      mime: null,
      width: null,
      height: null,
    });
  });
});
