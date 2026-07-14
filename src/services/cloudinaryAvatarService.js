import { v2 as cloudinary } from "cloudinary";

const AVATAR_FOLDER = process.env.CLOUDINARY_AVATAR_FOLDER || "bujo/avatars";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadAvatarImage = (file, { publicId } = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: AVATAR_FOLDER,
      resource_type: "image",
    };

    if (publicId) {
      Object.assign(uploadOptions, {
        public_id: publicId,
        overwrite: true,
        invalidate: true,
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          avatarUrl: result.secure_url,
          publicId: result.public_id,
        });
      },
    );

    uploadStream.end(file.buffer);
  });
};

export const deleteAvatarImage = async (publicId) => {
  if (!publicId) return;

  await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
  });
};
