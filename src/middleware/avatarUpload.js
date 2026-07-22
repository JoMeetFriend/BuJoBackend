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
        return res.status(413).json({ message: req.t("upload.avatarTooLarge") });
      }

      return res.status(400).json({ message: req.t("upload.avatarUploadFailed") });
    }

    if (error.code === "INVALID_AVATAR_FILE_TYPE") {
      return res.status(400).json({ message: req.t("upload.avatarInvalidType") });
    }

    next(error);
  });
};
