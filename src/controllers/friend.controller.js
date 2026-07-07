import * as friendService from "../services/friend.service.js";

export const getFriends = async (req, res) => {
  try {
    const friendsList = await friendService.getAcceptedFriendsList(req.user.userId);
    return res.status(200).json(friendsList);
  } catch (error) {
    console.error("Get Friends Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};
