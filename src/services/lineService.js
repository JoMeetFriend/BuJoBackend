import crypto from "crypto";
import prisma from "../lib/prisma.js";

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

export async function createLineAuthorizationUrl() {
  const { channelId, callbackUrl } = getLineConfig();
  const state = randomToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.oAuthAttempt.create({
    data: {
      state_hash: sha256(state),
      expires_at: expiresAt,
    },
  });

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("state", state);

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
    where: {
      state_hash: sha256(state),
    },
  });

  if (!attempt) {
    throw new Error("OAuth state 不存在");
  }

  if (attempt.consumed_at) {
    throw new Error("OAuth state 已使用");
  }

  if (attempt.expires_at <= new Date()) {
    throw new Error("OAuth state 已過期");
  }

  await prisma.oAuthAttempt.update({
    where: {
      id: attempt.id,
    },
    data: {
      consumed_at: new Date(),
    },
  });

  return attempt;
}

export async function findOrCreateLineUser(lineProfile) {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_provider_user_id: {
        provider: "line",
        provider_user_id: lineProfile.sub,
      },
    },
    include: {
      user: true,
    },
  });

  if (identity) {
    return identity.user;
  }

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
}
