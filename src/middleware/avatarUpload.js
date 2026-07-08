import multer from "multer";

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!AVATAR_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("INVALID_AVATAR_FILE_TYPE");
      error.code = "INVALID_AVATAR_FILE_TYPE";
      callback(error);
      return;
    }

    callback(null, true);
  },
});

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
