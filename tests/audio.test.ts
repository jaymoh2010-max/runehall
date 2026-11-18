import { describe, expect, it } from "vitest";
import { inspectAudio } from "../src/server/audioMeta";

const bytes = (...values: (number | string)[]): Buffer =>
  Buffer.from(
    values.flatMap((value) => (typeof value === "string" ? [...Buffer.from(value)] : [value]))
  );

describe("audio upload signatures", () => {
  it("accepts MP3 ID3 and frame headers", () => {
    expect(inspectAudio(bytes("ID3", 4, 0, 0), "audio/mpeg")).toBe(true);
    expect(inspectAudio(bytes(0xff, 0xfb, 0x90, 0x64), "audio/mpeg")).toBe(true);
  });

  it("accepts OGG, WAV, and WebM signatures", () => {
    expect(inspectAudio(bytes("OggS", 0, 0, 0), "audio/ogg")).toBe(true);
    expect(inspectAudio(bytes("RIFF", 0, 0, 0, 0, "WAVE"), "audio/wav")).toBe(true);
    expect(inspectAudio(bytes(0x1a, 0x45, 0xdf, 0xa3), "audio/webm")).toBe(true);
  });

  it("rejects mismatched or unknown payloads", () => {
    expect(inspectAudio(bytes("RIFF", 0, 0, 0, 0, "WAVE"), "audio/mpeg")).toBe(false);
    expect(inspectAudio(bytes("not audio"), "audio/wav")).toBe(false);
    expect(inspectAudio(bytes("OggS"), "audio/mp4")).toBe(false);
  });
});
