import { describe, expect, it } from "vitest";
import { collectUploadUrls, remapMessageRequestId } from "../src/shared/campaignArchive";

describe("campaign archive helpers", () => {
  it("collects nested and duplicate upload URLs from an archive slice", () => {
    const urls = collectUploadUrls({
      scenes: [
        {
          imageUrl: "/uploads/map.png",
          thumbnailUrl: "/uploads/map-thumb.png",
          props: [{ imageUrl: "/uploads/chair.webp" }],
        },
      ],
      journal: [
        {
          attachments: [{ url: "/uploads/handout.png" }, { url: "/uploads/handout.png" }],
        },
      ],
      external: "https://example.com/not-an-upload.png",
    });
    expect(urls).toEqual([
      "/uploads/map.png",
      "/uploads/map-thumb.png",
      "/uploads/chair.webp",
      "/uploads/handout.png",
    ]);
  });

  it("remaps a known request id and leaves other data alone", () => {
    const ids = new Map([["msg_old", "msg_new"]]);
    expect(remapMessageRequestId({ requestId: "msg_old", total: 12 }, ids)).toEqual({
      requestId: "msg_new",
      total: 12,
    });
    expect(remapMessageRequestId({ requestId: "msg_missing" }, ids)).toEqual({
      requestId: "msg_missing",
    });
    expect(remapMessageRequestId(null, ids)).toBeNull();
    expect(remapMessageRequestId([{ requestId: "msg_old" }], ids)).toEqual([
      { requestId: "msg_old" },
    ]);
  });
});
