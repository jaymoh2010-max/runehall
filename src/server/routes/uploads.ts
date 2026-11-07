import { createWriteStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { getCampaignRole } from "../access";
import { db } from "../db";
import { newId, now, safeString, uploadsDir } from "../util";
import { inspectImage } from "../imageMeta";
import crypto from "node:crypto";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};
const MAX_DIMENSION = 12_000;
const MAX_PIXELS = 100_000_000;
const MAX_HEADER_BYTES = 2 * 1024 * 1024;

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
    let file;
    try {
      file = await request.file({ limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
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
}
