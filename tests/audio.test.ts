import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { inspectAudio } from "../src/server/audioMeta";
import { AUDIO_MOODS, audioMoodLabel, isAudioMood } from "../src/shared/audio";

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

  it("is counted by the standalone orphan-cleanup scan", () => {
    const cleanup = fs.readFileSync(path.resolve("scripts", "cleanup-assets.mjs"), "utf8");
    expect(cleanup).toContain('"campaign_audio_tracks"');
  });
});

describe("bundled music library", () => {
  it("exposes stable mood filters", () => {
    expect(AUDIO_MOODS.map((mood) => mood.id)).toEqual([
      "battle",
      "exploration",
      "tavern",
      "relaxing",
      "mystery",
    ]);
    expect(audioMoodLabel("battle")).toBe("Battle");
    expect(isAudioMood("tavern")).toBe(true);
    expect(isAudioMood("boss")).toBe(false);
  });

  it("ships valid MP3 and OGG files for every library track", () => {
    const directory = path.resolve("public", "audio-library");
    const files = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".mp3") || file.endsWith(".ogg"));
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const file of files) {
      const header = fs.readFileSync(path.join(directory, file)).subarray(0, 12);
      const mime = file.endsWith(".mp3") ? "audio/mpeg" : "audio/ogg";
      expect(inspectAudio(header, mime), file).toBe(true);
    }
  });
});
