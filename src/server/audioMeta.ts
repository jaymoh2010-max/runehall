/**
 * Checks the leading bytes of an uploaded audio file against the declared
 * type. This is not a full decoder; it prevents a non-audio payload from being
 * served as a soundtrack under an audio MIME type.
 */
export function inspectAudio(header: Buffer, mime: string): boolean {
  if (mime === "audio/mpeg") {
    return (
      header.subarray(0, 3).toString("ascii") === "ID3" ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
    );
  }
  if (mime === "audio/ogg") return header.subarray(0, 4).toString("ascii") === "OggS";
  if (mime === "audio/wav") {
    return (
      header.subarray(0, 4).toString("ascii") === "RIFF" &&
      header.subarray(8, 12).toString("ascii") === "WAVE"
    );
  }
  if (mime === "audio/webm") {
    return header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  }
  return false;
}
