import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

export const AVATAR_PUBLIC_PATH = "/uploads/avatars";
export const AVATAR_UPLOAD_DIR = fileURLToPath(
  new URL("../../uploads/avatars/", import.meta.url),
);
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const AVATAR_MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const ensureAvatarUploadDir = () => {
  fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureAvatarUploadDir();
    callback(null, AVATAR_UPLOAD_DIR);
  },
  filename: (req, file, callback) => {
    const extension = AVATAR_MIME_EXTENSIONS.get(file.mimetype);
    const userId = req.user?.userId ?? "unknown";
    callback(
      null,
      `avatar-${userId}-${Date.now()}-${crypto.randomUUID()}${extension}`,
    );
  },
});

const avatarUpload = multer({
  storage,
  limits: {
    fileSize: MAX_AVATAR_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!AVATAR_MIME_EXTENSIONS.has(file.mimetype)) {
      const error = new Error("INVALID_AVATAR_FILE_TYPE");
      error.code = "INVALID_AVATAR_FILE_TYPE";
      callback(error);
      return;
    }

    callback(null, true);
  },
});

const localAvatarPathFromUrl = (avatarUrl) => {
  if (
    typeof avatarUrl !== "string" ||
    !avatarUrl.startsWith(`${AVATAR_PUBLIC_PATH}/`)
  ) {
    return null;
  }

  const filename = path.basename(avatarUrl);
  if (`${AVATAR_PUBLIC_PATH}/${filename}` !== avatarUrl) {
    return null;
  }

  return path.join(AVATAR_UPLOAD_DIR, filename);
};

export const avatarUrlForFilename = (filename) => `${AVATAR_PUBLIC_PATH}/${filename}`;

export const deleteUploadedAvatarFile = async (file) => {
  if (!file?.path) return;

  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("刪除上傳頭像失敗：", error);
    }
  }
};

export const deleteLocalAvatarByUrl = async (avatarUrl) => {
  const filePath = localAvatarPathFromUrl(avatarUrl);
  if (!filePath) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("刪除舊頭像失敗：", error);
    }
  }
};

export const uploadAvatar = (req, res, next) => {
  avatarUpload.single("avatar")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "頭像圖片不可超過 2MB" });
      }

      return res.status(400).json({ message: "頭像上傳失敗" });
    }

    if (error.code === "INVALID_AVATAR_FILE_TYPE") {
      return res.status(400).json({ message: "頭像只支援 JPG、PNG 或 WebP 圖片" });
    }

    next(error);
  });
};
