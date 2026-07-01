import * as friendService from "../services/friend.service.js";

export const requestFriend = async (req, res) => {
  try {
    const { target_id } = req.body;
    const requester_id = req.user.userId;

    if (!target_id) {
      return res.status(400).json({ message: "缺少目標使用者 ID" }); // TODO: i18n
    }

    const result = await friendService.createFriendRequest(
      requester_id,
      target_id,
    );

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    res.status(201).json({ message: result.message });
  } catch (error) {
    console.error("Request Friend Controller Error:", error);
    res.status(500).json({ message: "伺服器內部錯誤" }); // TODO: i18n
  }
};

export const getFriends = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const friendsList =
      await friendService.getAcceptedFriendsList(currentUserId);

    res.status(200).json(friendsList);
  } catch (error) {
    console.error("Get Friends Controller Error:", error);
    res.status(500).json({ message: "伺服器內部錯誤" }); // TODO: i18n
  }
};
