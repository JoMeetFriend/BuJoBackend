import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { signup, login, logout, me } from "../controllers/authController.js";
import authenticate from "../middleware/authenticate.js";

import {
  createLineAuthorizationUrl,
  exchangeLineCodeForToken,
  findOrCreateLineUser,
  verifyLineIdToken,
  verifyLineState,
} from "../services/lineService.js";

const router = express.Router();
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticate, me);

router.get("/line", async (req, res) => {
  const url = await createLineAuthorizationUrl();

  res.redirect(url.toString());
});

router.get("/line/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: "缺少 LINE authorization code" });
  }

  try {
    await verifyLineState(state);

    const tokenData = await exchangeLineCodeForToken(code);
    const lineProfile = await verifyLineIdToken(tokenData.id_token);
    const user = await findOrCreateLineUser(lineProfile);
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, AUTH_COOKIE_OPTIONS);

    res.json({
      message: "LINE login success",
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error("LINE callback error:", error);
    res.status(500).json({ error: "LINE 登入失敗" });
  }
});

router.post("/google", async (req, res) => {
  const { token } = req.body;

  try {
    // 步驟一：問 Google 這個 token 是誰的
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const userInfo = await response.json();

    if (!userInfo.email) {
      return res.status(401).json({ error: "無法取得使用者資訊" });
    }

    // 步驟二：在 UserIdentity 找這個 Google 帳號
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_provider_user_id: {
          provider: "google",
          provider_user_id: userInfo.sub,
        },
      },
      include: { user: true },
    });

    let user;
    if (!identity) {
      // 找不到就同時建立 User 和 UserIdentity
      user = await prisma.user.create({
        data: {
          display_name: userInfo.name,
          avatar_url: userInfo.picture,
          identities: {
            create: {
              provider: "google",
              provider_user_id: userInfo.sub,
              email: userInfo.email,
            },
          },
        },
      });
    } else {
      user = identity.user;
    }

    // 步驟三：發我們自己的 JWT
    const ourToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token: ourToken,
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        email: userInfo.email,
      },
    });
  } catch (error) {
    console.error("後端錯誤：", error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

export default router;
