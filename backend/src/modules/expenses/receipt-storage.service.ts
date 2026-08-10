import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { BadRequestException, Injectable } from "@nestjs/common";
import { diskStorage, type FileFilterCallback } from "multer";
import type { Request } from "express";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

/** MIME whitelist → file extension. The extension is derived from this map, never
 * from the client-supplied original filename, so there is no user-controlled path
 * component anywhere in the stored file name. */
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8MB

export function receiptUploadDir(): string {
  const dir = process.env.UPLOAD_DIR ?? "uploads";
  return path.join(process.cwd(), dir, "receipts");
}

function ensureDirExists(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Multer options for `FileInterceptor("file", RECEIPT_MULTER_OPTIONS)` — decorator
 * arguments are evaluated at class-definition time, so this has to be a plain
 * exported constant rather than something resolved through DI. */
export const RECEIPT_MULTER_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_RECEIPT_BYTES },
  fileFilter: (_req: Request, file: Express.Multer.File, callback: FileFilterCallback) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      callback(new BadRequestException(`Unsupported file type "${file.mimetype}". Use JPEG, PNG, WebP, or PDF.`));
      return;
    }
    callback(null, true);
  },
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      const dir = receiptUploadDir();
      ensureDirExists(dir);
      callback(null, dir);
    },
    filename: (_req, file, callback) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype] ?? "";
      callback(null, `${randomUUID()}${ext}`);
    },
  }),
};

@Injectable()
export class ReceiptStorageService {
  filePath(storedName: string): string {
    return path.join(receiptUploadDir(), storedName);
  }

  exists(storedName: string): boolean {
    return fs.existsSync(this.filePath(storedName));
  }

  delete(storedName: string): void {
    const target = this.filePath(storedName);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}
