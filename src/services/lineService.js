import crypto from "crypto";
import prisma from "../lib/prisma.js";

const LINE_BOT_PROMPTS = new Set(["normal", "aggressive"]);

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getLineConfig() {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;

  if (!channelId || !channelSecret || !callbackUrl) {
    throw new Error("LINE 登入環境變數尚未設定完整");
  }

  return { channelId, channelSecret, callbackUrl };
}

export async function createLineAuthorizationUrl(userId = null, botPrompt = "normal") {
  if (!LINE_BOT_PROMPTS.has(botPrompt)) {
    throw new Error("LINE bot_prompt 無效");
  }

  const { channelId, callbackUrl } = getLineConfig();
  const state = randomToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.oAuthAttempt.deleteMany({
    where: { expires_at: { lt: new Date() } },
  });

  await prisma.oAuthAttempt.create({
    data: {
      state_hash: sha256(state),
      user_id: userId,
      expires_at: expiresAt,
    },
  });

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("state", state);
  url.searchParams.set("bot_prompt", botPrompt);

  return url;
}

export async function exchangeLineCodeForToken(code) {
  const { channelId, channelSecret, callbackUrl } = getLineConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: channelId,
    client_secret: channelSecret,
  });

  const response = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("LINE token exchange failed:", data);
    throw new Error("LINE token exchange failed");
  }

  return data;
}

export async function verifyLineIdToken(idToken) {
  const { channelId } = getLineConfig();

  const body = new URLSearchParams({
    id_token: idToken,
    client_id: channelId,
  });

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("LINE ID token verify failed:", data);
    throw new Error("LINE ID token verify failed");
  }

  return data;
}

export async function verifyLineState(state) {
  if (!state || typeof state !== "string") {
    throw new Error("OAuth state 無效");
  }

  const attempt = await prisma.oAuthAttempt.findUnique({
    where: { state_hash: sha256(state) },
  });

  if (!attempt || attempt.consumed_at || attempt.expires_at < new Date()) {
    throw new Error("OAuth state 不存在、已使用或已過期");
  }

  await prisma.oAuthAttempt.update({
    where: { id: attempt.id },
    data: { consumed_at: new Date() },
  });

  return attempt;
}

async function findLineIdentity(lineUserId) {
  return prisma.userIdentity.findUnique({
    where: {
      provider_provider_user_id: {
        provider: "line",
        provider_user_id: lineUserId,
      },
    },
    include: {
      user: true,
    },
  });
}

export async function linkLineUser(lineProfile, userId) {
  const existing = await prisma.userIdentity.findUnique({
    where: {
      provider_provider_user_id: {
        provider: "line",
        provider_user_id: lineProfile.sub,
      },
    },
  });

  if (existing && existing.user_id !== userId) {
    throw new Error("此 LINE 帳號已綁定其他帳號");
  }
  if (existing) return;

  await prisma.userIdentity.create({
    data: {
      user_id: userId,
      provider: "line",
      provider_user_id: lineProfile.sub,
      email: null,
    },
  });
}

export async function findOrCreateLineUser(lineProfile) {
  const identity = await findLineIdentity(lineProfile.sub);

  if (identity) {
    return identity.user;
  }

  try {
    const user = await prisma.user.create({
      data: {
        display_name: lineProfile.name || "LINE 使用者",
        avatar_url: lineProfile.picture || null,
        identities: {
          create: {
            provider: "line",
            provider_user_id: lineProfile.sub,
            email: null,
          },
        },
      },
    });

    return user;
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const existingIdentity = await findLineIdentity(lineProfile.sub);
    if (!existingIdentity) {
      throw error;
    }

    return existingIdentity.user;
  }
}
