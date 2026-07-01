import * as friendService from "../services/friend.service.js";

export const requestFriend = async (req, res) => {
  try {
    const { target_id } = req.body;
    const requester_id = req.user.userId;

    if (!target_id || typeof target_id !== "string") {
      return res.status(400).json({ message: "缺少目標使用者 ID" });
    }

    const result = await friendService.createFriendRequest(requester_id, target_id);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(201).json({ message: result.message });
  } catch (error) {
    console.error("Request Friend Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};

export const getPendingRequests = async (req, res) => {
  try {
    const requests = await friendService.getPendingRequests(req.user.userId);
    return res.status(200).json(requests);
  } catch (error) {
    console.error("Get Pending Requests Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await friendService.acceptFriendRequest(id, req.user.userId);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(200).json({ message: result.message });
  } catch (error) {
    console.error("Accept Friend Request Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};

export const rejectFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await friendService.rejectFriendRequest(id, req.user.userId);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(200).json({ message: result.message });
  } catch (error) {
    console.error("Reject Friend Request Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};

export const getFriends = async (req, res) => {
  try {
    const friendsList = await friendService.getAcceptedFriendsList(req.user.userId);
    return res.status(200).json(friendsList);
  } catch (error) {
    console.error("Get Friends Controller Error:", error);
    return res.status(500).json({ message: "伺服器內部錯誤" });
  }
};
