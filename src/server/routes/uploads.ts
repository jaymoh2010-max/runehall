import { createWriteStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { uploadsDir } from "../util";
import crypto from "node:crypto";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/uploads", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
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
    try {
      await pipeline(file.file, createWriteStream(destination));
      if (file.file.truncated) {
        fs.unlinkSync(destination);
        return reply.code(413).send({ error: "Image is too large (max 15 MB)." });
      }
    } catch {
      try {
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
      } catch {}
      return reply.code(500).send({ error: "Could not save the image." });
    }
    const size = fs.statSync(destination).size;
    if (size === 0) {
      fs.unlinkSync(destination);
      return reply.code(400).send({ error: "The image was empty." });
    }
    return reply.send({ url: `/uploads/${filename}`, filename, size, mimeType: file.mimetype });
  });
}
