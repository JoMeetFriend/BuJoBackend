import * as userService from "../services/user.service.js";
import {
  deleteAvatarImage,
  uploadAvatarImage,
} from "../services/cloudinaryAvatarService.js";

export const updateMyAvatar = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "請上傳頭像圖片" });
  }

  const currentUserId = req.user.userId;
  let uploadedAvatar;

  try {
    const currentUser = await userService.findUserAvatarById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ message: "用戶不存在" });
    }

    uploadedAvatar = await uploadAvatarImage(req.file);

    const user = await userService.updateUserAvatar(
      currentUserId,
      uploadedAvatar.avatarUrl,
      uploadedAvatar.publicId,
    );

    if (currentUser.avatar_public_id) {
      try {
        await deleteAvatarImage(currentUser.avatar_public_id);
      } catch (error) {
        console.warn("刪除舊 Cloudinary 頭像失敗：", error);
      }
    }

    return res.status(200).json({ user });
  } catch (error) {
    if (uploadedAvatar?.publicId) {
      try {
        await deleteAvatarImage(uploadedAvatar.publicId);
      } catch (cleanupError) {
        console.warn("清理新 Cloudinary 頭像失敗：", cleanupError);
      }
    }

    console.error("Update Avatar Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.userId;

    if (!q || typeof q !== "string" || !/^[a-fA-F0-9]{5}$/.test(q)) {
      return res.status(400).json({ message: "無效的搜尋格式" }); // TODO: i18n
    }

    const sanitizedQ = q.toLowerCase();

    const users = await userService.searchUsersByShortId(
      sanitizedQ,
      currentUserId,
    );

    res.status(200).json(users);
  } catch (error) {
    console.error("Search Users Controller Error:", error);
    res.status(500).json({ message: "伺服器內部錯誤" }); // TODO: i18n
  }
};
