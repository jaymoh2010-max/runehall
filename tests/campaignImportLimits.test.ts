import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMPAIGN_IMPORT_MAX_MB,
  MAX_CAMPAIGN_IMPORT_MAX_MB,
  base64DecodedBytes,
  campaignImportBodyLimit,
  campaignImportMaxMb,
  preflightCampaignImport,
} from "../src/server/campaignImportLimits";

function archive(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "runehall-campaign",
    campaign: { name: "Test campaign" },
    ...extra,
  };
}

describe("campaign import body limit", () => {
  it("defaults to 128 MB and clamps environment overrides", () => {
    expect(DEFAULT_CAMPAIGN_IMPORT_MAX_MB).toBe(128);
    expect(campaignImportMaxMb({})).toBe(128);
    expect(campaignImportMaxMb({ CAMPAIGN_IMPORT_MAX_MB: "" })).toBe(128);
    expect(campaignImportMaxMb({ CAMPAIGN_IMPORT_MAX_MB: "64" })).toBe(64);
    expect(campaignImportMaxMb({ CAMPAIGN_IMPORT_MAX_MB: "0" })).toBe(1);
    expect(campaignImportMaxMb({ CAMPAIGN_IMPORT_MAX_MB: "9999" })).toBe(
      MAX_CAMPAIGN_IMPORT_MAX_MB
    );
    expect(campaignImportMaxMb({ CAMPAIGN_IMPORT_MAX_MB: "not-a-number" })).toBe(128);
    expect(campaignImportBodyLimit({ CAMPAIGN_IMPORT_MAX_MB: "2" })).toBe(2 * 1024 * 1024);
  });
});

describe("campaign import preflight", () => {
  it("accepts a minimal archive and counts only embedded uploads", () => {
    const encoded = Buffer.alloc(8, 1).toString("base64");
    const result = preflightCampaignImport(
      archive({
        embeddedAssets: {
          "/uploads/portrait.png": encoded,
          "/uploads/notes.txt": encoded,
          "https://example.com/portrait.png": encoded,
          "/uploads/../portrait.png": encoded,
        },
      })
    );
    expect(result).toEqual({ embeddedAssets: 1, embeddedBytes: 8 });
  });

  it("rejects a different archive format and a newer export version", () => {
    expect(() => preflightCampaignImport({ format: "something-else" })).toThrow(
      /not a Runehall campaign export/
    );
    expect(() => preflightCampaignImport(archive({ version: 2 }))).toThrow(
      /newer Runehall version/
    );
  });

  it("rejects too many rows before any import work starts", () => {
    expect(() =>
      preflightCampaignImport(archive({ characters: Array.from({ length: 2_001 }, () => ({})) }))
    ).toThrow(/Too many characters to import/);
  });

  it("rejects an embedded asset over the per-asset limit", () => {
    const encoded = Buffer.alloc(8, 1).toString("base64");
    expect(() =>
      preflightCampaignImport(archive({ embeddedAssets: { "/uploads/map.png": encoded } }), {
        embeddedAssetBytes: 4,
      })
    ).toThrow(/larger than 25 MB/);
  });

  it("rejects embedded assets over the total archive budget", () => {
    const encoded = Buffer.alloc(8, 1).toString("base64");
    expect(() =>
      preflightCampaignImport(
        archive({
          embeddedAssets: {
            "/uploads/map.png": encoded,
            "/uploads/portrait.png": encoded,
          },
        }),
        { embeddedAssetBytes: 100, embeddedTotalBytes: 10 }
      )
    ).toThrow(/exceed the 50 MB import limit/);
  });
});

describe("base64 size estimate", () => {
  it("matches decoded byte counts without allocating the buffer", () => {
    expect(base64DecodedBytes("")).toBe(0);
    expect(base64DecodedBytes(Buffer.alloc(1).toString("base64"))).toBe(1);
    expect(base64DecodedBytes(Buffer.alloc(2).toString("base64"))).toBe(2);
    expect(base64DecodedBytes(Buffer.alloc(8).toString("base64"))).toBe(8);
  });
});
