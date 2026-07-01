import * as userService from "../services/user.service.js";

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
