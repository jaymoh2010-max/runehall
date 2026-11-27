import { createWriteStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { db, type AudioLibraryTrackRow, type AudioTrackRow, type CampaignRow } from "../db";
import { globalAssetReferences } from "../assets";
import { newId, now, safeString, uploadsDir } from "../util";
import { inspectImage } from "../imageMeta";
import { inspectAudio } from "../audioMeta";
import { checkUploadQuota } from "../uploadQuota";
import {
  serializeAudioLibraryTrack,
  serializeAudioState,
  serializeAudioTrack,
  touchCampaign,
} from "../serialize";
import type { CampaignAudioTrack } from "../../shared/types";
import crypto from "node:crypto";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};
const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
};
const MAX_DIMENSION = 12_000;
const MAX_PIXELS = 100_000_000;
const MAX_HEADER_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function audioTracksFor(campaignId: string): CampaignAudioTrack[] {
  const rows = db
    .prepare(
      "SELECT * FROM campaign_audio_tracks WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
    )
    .all(campaignId) as AudioTrackRow[];
  return rows.map(serializeAudioTrack);
}

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/uploads", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const campaignHeader = request.headers["x-campaign-id"];
    const campaignId =
      typeof campaignHeader === "string" && campaignHeader.trim() ? campaignHeader.trim() : null;
    if (campaignId && !getCampaignRole(campaignId, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of that campaign." });
    }
    if (!request.isMultipart()) return reply.code(400).send({ error: "Upload an image file." });
    const earlyQuota = checkUploadQuota(campaignId, request.user.id, MAX_IMAGE_BYTES);
    if (!earlyQuota.ok) return reply.code(earlyQuota.status).send({ error: earlyQuota.error });
    let file;
    try {
      file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
    } catch {
      return reply.code(400).send({ error: "Upload an image file smaller than 15 MB." });
    }
    if (!file) return reply.code(400).send({ error: "No file received." });
    const ext = MIME_EXT[file.mimetype];
    if (!ext) return reply.code(415).send({ error: "Use a PNG, JPG, WebP, GIF, or AVIF image." });
    const filename = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const destination = path.join(uploadsDir(), filename);
    const reject = (code: number, error: string) => {
      try {
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
      } catch {}
      return reply.code(code).send({ error });
    };
    try {
      await pipeline(file.file, createWriteStream(destination));
      if (file.file.truncated) {
        return reject(413, "Image is too large (max 15 MB).");
      }
    } catch {
      return reject(500, "Could not save the image.");
    }
    const size = fs.statSync(destination).size;
    if (size === 0) {
      return reject(400, "The image was empty.");
    }
    const quota = checkUploadQuota(campaignId, request.user.id, size);
    if (!quota.ok) return reject(quota.status, quota.error);

    const header = Buffer.alloc(Math.min(MAX_HEADER_BYTES, size));
    try {
      const fd = fs.openSync(destination, "r");
      fs.readSync(fd, header, 0, header.length, 0);
      fs.closeSync(fd);
    } catch {
      return reject(500, "Could not inspect the image.");
    }
    const metadata = inspectImage(header);
    if (!metadata.mime) {
      return reject(415, "That file is not a valid image. Use PNG, JPG, WebP, GIF, or AVIF.");
    }
    if (metadata.mime !== file.mimetype) {
      return reject(415, "The image contents do not match the declared file type.");
    }
    if (
      metadata.width !== null &&
      metadata.height !== null &&
      (metadata.width > MAX_DIMENSION ||
        metadata.height > MAX_DIMENSION ||
        metadata.width * metadata.height > MAX_PIXELS)
    ) {
      return reject(
        413,
        "That image is too large. Keep it under 12,000 pixels per side and 100 megapixels."
      );
    }

    try {
      db.prepare(
        `INSERT INTO uploaded_assets
          (id, filename, original_name, mime_type, size, campaign_id, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("asset"),
        filename,
        safeString(file.filename, "Uploaded image", 200),
        metadata.mime,
        size,
        campaignId,
        request.user.id,
        now()
      );
    } catch {
      return reject(500, "Could not record the uploaded image.");
    }

    return reply.send({
      url: `/uploads/${filename}`,
      filename,
      size,
      mimeType: metadata.mime,
      campaignId,
    });
  });

  app.post("/api/uploads/audio", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const campaignHeader = request.headers["x-campaign-id"];
    const campaignId =
      typeof campaignHeader === "string" && campaignHeader.trim() ? campaignHeader.trim() : null;
    if (!campaignId) return reply.code(400).send({ error: "Choose a campaign first." });
    if (getCampaignRole(campaignId, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can upload soundtracks." });
    }
    if (!request.isMultipart()) return reply.code(400).send({ error: "Upload an audio file." });
    const earlyQuota = checkUploadQuota(campaignId, request.user.id, MAX_AUDIO_BYTES);
    if (!earlyQuota.ok) return reply.code(earlyQuota.status).send({ error: earlyQuota.error });
    let file;
    try {
      file = await request.file({ limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });
    } catch {
      return reply.code(400).send({ error: "Upload an audio file smaller than 25 MB." });
    }
    if (!file) return reply.code(400).send({ error: "No file received." });
    const ext = AUDIO_MIME_EXT[file.mimetype];
    if (!ext) {
      return reply.code(415).send({ error: "Use an MP3, OGG, WAV, or WebM audio file." });
    }
    const filename = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const destination = path.join(uploadsDir(), filename);
    const reject = (code: number, error: string) => {
      try {
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
      } catch {}
      return reply.code(code).send({ error });
    };
    try {
      await pipeline(file.file, createWriteStream(destination));
      if (file.file.truncated) return reject(413, "Audio is too large (max 25 MB).");
    } catch {
      return reject(500, "Could not save the audio file.");
    }
    const size = fs.statSync(destination).size;
    if (size === 0) return reject(400, "The audio file was empty.");
    const quota = checkUploadQuota(campaignId, request.user.id, size);
    if (!quota.ok) return reject(quota.status, quota.error);
    const header = Buffer.alloc(Math.min(512, size));
    try {
      const fd = fs.openSync(destination, "r");
      fs.readSync(fd, header, 0, header.length, 0);
      fs.closeSync(fd);
    } catch {
      return reject(500, "Could not inspect the audio file.");
    }
    if (!inspectAudio(header, file.mimetype)) {
      return reject(415, "The audio contents do not match the declared file type.");
    }
    const ts = now();
    const trackId = newId("audio");
    const name = safeString(file.filename.replace(/\.[^.]+$/, ""), "Soundtrack", 140);
    try {
      db.prepare(
        `INSERT INTO uploaded_assets
          (id, filename, original_name, mime_type, size, campaign_id, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("asset"),
        filename,
        safeString(file.filename, "Soundtrack", 200),
        file.mimetype,
        size,
        campaignId,
        request.user.id,
        ts
      );
      const order = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_audio_tracks WHERE campaign_id = ?"
        )
        .get(campaignId) as { next: number };
      db.prepare(
        `INSERT INTO campaign_audio_tracks
          (id, campaign_id, name, url, mime_type, size, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(trackId, campaignId, name, `/uploads/${filename}`, file.mimetype, size, order.next, ts);
    } catch {
      return reject(500, "Could not record the audio file.");
    }
    const row = db
      .prepare("SELECT * FROM campaign_audio_tracks WHERE id = ?")
      .get(trackId) as AudioTrackRow;
    app.broadcastCampaign(campaignId, "audio:tracks", {
      campaignId,
      tracks: audioTracksFor(campaignId),
    });
    touchCampaign(campaignId);
    return reply.code(201).send({ track: serializeAudioTrack(row) });
  });

  app.get("/api/campaigns/:id/audio/library", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can browse the music library." });
    }
    const rows = db
      .prepare("SELECT * FROM audio_library_tracks ORDER BY sort_order ASC, title ASC")
      .all() as AudioLibraryTrackRow[];
    const campaignUrls = new Set(audioTracksFor(id).map((track) => track.url));
    return reply.send({
      tracks: rows.map((row) => serializeAudioLibraryTrack(row, campaignUrls.has(row.url))),
    });
  });

  app.post("/api/campaigns/:id/audio/library/:libraryId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, libraryId } = request.params as { id: string; libraryId: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can add library music." });
    }
    const libraryTrack = db
      .prepare("SELECT * FROM audio_library_tracks WHERE id = ?")
      .get(libraryId) as AudioLibraryTrackRow | undefined;
    if (!libraryTrack) return reply.code(404).send({ error: "Library track not found." });
    const existing = db
      .prepare("SELECT * FROM campaign_audio_tracks WHERE campaign_id = ? AND url = ?")
      .get(id, libraryTrack.url) as AudioTrackRow | undefined;
    if (existing) {
      return reply.code(409).send({
        error: "That track is already in the campaign soundtrack.",
        track: serializeAudioTrack(existing),
      });
    }
    const ts = now();
    const trackId = newId("audio");
    const order = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_audio_tracks WHERE campaign_id = ?"
      )
      .get(id) as { next: number };
    db.prepare(
      `INSERT INTO campaign_audio_tracks
        (id, campaign_id, name, url, mime_type, size, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      trackId,
      id,
      libraryTrack.title,
      libraryTrack.url,
      libraryTrack.mime_type,
      libraryTrack.size,
      order.next,
      ts
    );
    const row = db
      .prepare("SELECT * FROM campaign_audio_tracks WHERE id = ?")
      .get(trackId) as AudioTrackRow;
    app.broadcastCampaign(id, "audio:tracks", {
      campaignId: id,
      tracks: audioTracksFor(id),
    });
    touchCampaign(id);
    return reply.code(201).send({ track: serializeAudioTrack(row) });
  });

  app.delete("/api/campaigns/:id/audio/:trackId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, trackId } = request.params as { id: string; trackId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can remove soundtracks." });
    }
    const track = db
      .prepare("SELECT * FROM campaign_audio_tracks WHERE id = ? AND campaign_id = ?")
      .get(trackId, id) as AudioTrackRow | undefined;
    if (!track) return reply.code(404).send({ error: "Soundtrack not found." });
    db.prepare("DELETE FROM campaign_audio_tracks WHERE id = ?").run(trackId);
    if (campaign.audio_track_id === trackId) {
      db.prepare(
        "UPDATE campaigns SET audio_track_id = NULL, audio_playing = 0, audio_position = 0, audio_updated_at = ?, updated_at = ? WHERE id = ?"
      ).run(now(), now(), id);
    }
    // Remove the backing file when nothing else references it. If a player is
    // still streaming it, keep the file and let `cleanup-assets` retry later.
    const filename = track.url.startsWith("/uploads/") ? track.url.slice("/uploads/".length) : "";
    const asset =
      filename && /^[A-Za-z0-9._-]+$/.test(filename) && filename !== "." && filename !== ".."
        ? (db
            .prepare("SELECT campaign_id, uploaded_by FROM uploaded_assets WHERE filename = ?")
            .get(filename) as
            { campaign_id: string | null; uploaded_by: string | null } | undefined)
        : undefined;
    const ownsAsset =
      asset &&
      (asset.campaign_id === id ||
        (asset.campaign_id === null && asset.uploaded_by === request.user.id));
    if (filename && ownsAsset && !globalAssetReferences().has(filename)) {
      try {
        fs.rmSync(path.join(uploadsDir(), filename), { force: true });
        db.prepare("DELETE FROM uploaded_assets WHERE filename = ?").run(filename);
      } catch {
        // The operating system may still have the audio file open.
      }
    }
    const updated = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as CampaignRow;
    app.broadcastCampaign(id, "audio:tracks", {
      campaignId: id,
      tracks: audioTracksFor(id),
    });
    app.broadcastCampaign(id, "audio:state", {
      campaignId: id,
      state: serializeAudioState(updated),
    });
    touchCampaign(id);
    return reply.send({ ok: true });
  });
}
