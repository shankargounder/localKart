import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "./db.js";
import { config, supabaseStorageKey } from "./config.js";
import { ApiError, transaction } from "./orders.js";
export const catalogRoot = fileURLToPath(
  new URL("../../../assets/catalog/", import.meta.url),
);
export const uploadRoot = fileURLToPath(
  new URL("../../../.local/uploads/", import.meta.url),
);
export const publicMedia = Router();
publicMedia.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
publicMedia.use(
  "/catalog",
  express.static(catalogRoot, {
    immutable: true,
    maxAge: "1y",
    index: false,
    dotfiles: "deny",
  }),
);
if (config.NODE_ENV !== "production")
  publicMedia.use(
    "/uploads",
    express.static(uploadRoot, {
      immutable: true,
      maxAge: "1y",
      index: false,
      dotfiles: "deny",
    }),
  );
export const imageRouter = Router();
const form = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
}).single("image");
export async function normalizeProductImage(bytes: Buffer, mime: string) {
  const allowed: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!allowed[mime])
    throw new ApiError(400, "Only JPEG, PNG and WebP images are supported");
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 16000000,
    }).metadata();
    if (
      metadata.format !== allowed[mime] ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages && metadata.pages > 1)
    )
      throw new Error();
    const buffer = await sharp(bytes, { limitInputPixels: 16000000 })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    const normalized = await sharp(buffer).metadata();
    return {
      buffer,
      width: normalized.width!,
      height: normalized.height!,
      contentHash: createHash("sha256").update(buffer).digest("hex"),
    };
  } catch {
    throw new ApiError(
      400,
      "Image content is invalid, animated, too large or does not match its declared type",
    );
  }
}
imageRouter.post(
  "/merchant/products/:id/images",
  rateLimit({ windowMs: 60000, limit: 10 }),
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (req.user.role !== "MERCHANT")
        throw new ApiError(403, "Access denied");
      const product = await db.product.findFirst({
        where: {
          id: z.string().uuid().parse(req.params.id),
          shop: { ownerId: req.user.id },
        },
      });
      if (!product) throw new ApiError(404, "Product not found");
      next();
    } catch (e) {
      next(e);
    }
  },
  (req, res, next) =>
    form(req, res, (error) =>
      next(
        error
          ? new ApiError(
              error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
              "Upload one image of at most 5 MB",
            )
          : undefined,
      ),
    ),
  async (req, res) => {
    if (!req.file) throw new ApiError(400, "An image file is required");
    if (req.body.rightsConfirmed !== "true")
      throw new ApiError(
        400,
        "Confirm that you have rights to use this product photograph",
      );
    const product = await db.product.findFirstOrThrow({
      where: { id: String(req.params.id), shop: { ownerId: req.user.id } },
    });
    const image = await normalizeProductImage(
      req.file.buffer,
      req.file.mimetype,
    );
    const prior = await db.productImage.findUnique({
      where: {
        productId_contentHash: {
          productId: product.id,
          contentHash: image.contentHash,
        },
      },
    });
    if (prior) {
      res.json(prior);
      return;
    }
    const key =
      product.shopId + "/" + product.id + "/" + randomUUID() + ".webp";
    let url: string;
    let cleanup: () => Promise<unknown>;
    if (config.UPLOAD_DRIVER === "supabase") {
      if (!config.SUPABASE_URL || !supabaseStorageKey)
        throw new ApiError(503, "Object storage is not configured");
      const storage = createClient(config.SUPABASE_URL, supabaseStorageKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).storage.from(config.SUPABASE_STORAGE_BUCKET);
      const uploaded = await storage.upload(key, image.buffer, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploaded.error)
        throw new ApiError(502, "Object storage rejected the image");
      url = storage.getPublicUrl(key).data.publicUrl;
      cleanup = () => storage.remove([key]);
    } else {
      if (config.NODE_ENV === "production")
        throw new ApiError(
          503,
          "Production uploads require managed object storage",
        );
      await mkdir(uploadRoot, { recursive: true });
      const name = randomUUID() + ".webp";
      const path = resolve(join(uploadRoot, name));
      if (
        !path.startsWith(
          resolve(uploadRoot) + (process.platform === "win32" ? "\\" : "/"),
        )
      )
        throw new ApiError(500, "Invalid upload path");
      await writeFile(path, image.buffer, { flag: "wx" });
      url = "/media/uploads/" + name;
      cleanup = () => unlink(path);
    }
    try {
      const saved = await transaction(async (tx) => {
        const existing = await tx.productImage.findUnique({
          where: {
            productId_contentHash: {
              productId: product.id,
              contentHash: image.contentHash,
            },
          },
        });
        if (existing) return existing;
        const count = await tx.productImage.count({
          where: { productId: product.id },
        });
        if (count >= 8)
          throw new ApiError(409, "A product can have at most eight images");
        return tx.productImage.create({
          data: {
            productId: product.id,
            url,
            contentHash: image.contentHash,
            width: image.width,
            height: image.height,
            alt: product.name + " — merchant-supplied photograph",
            source: "MERCHANT",
            isDemo: false,
            license: "Merchant affirmed permission; not independently verified",
          },
        });
      });
      if (saved.url !== url) await cleanup();
      res.status(201).json(saved);
    } catch (error) {
      await cleanup().catch(() => {});
      throw error;
    }
  },
);
