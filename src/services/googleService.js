import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma.js";

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error("Google 登入環境變數尚未設定完整");
  }

  return { clientId, clientSecret, callbackUrl };
}

export async function createGoogleAuthorizationUrl(userId = null) {
  const { clientId, callbackUrl } = getGoogleConfig();
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

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return url;
}

export async function exchangeGoogleCodeForToken(code) {
  const { clientId, clientSecret, callbackUrl } = getGoogleConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Google token exchange failed:", data);
    throw new Error("Google token exchange failed");
  }

  return data;
}

export async function verifyGoogleIdToken(idToken) {
  const { clientId } = getGoogleConfig();
  const client = new OAuth2Client(clientId);

  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || payload.email_verified === false) {
    throw new Error("無法取得使用者資訊");
  }

  return payload;
}

export async function verifyGoogleState(state) {
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

async function findGoogleIdentity(googleUserId) {
  return prisma.userIdentity.findUnique({
    where: {
      provider_provider_user_id: {
        provider: "google",
        provider_user_id: googleUserId,
      },
    },
    include: {
      user: true,
    },
  });
}

export async function linkGoogleUser(payload, userId) {
  const existing = await prisma.userIdentity.findUnique({
    where: {
      provider_provider_user_id: {
        provider: "google",
        provider_user_id: payload.sub,
      },
    },
  });

  if (existing && existing.user_id !== userId) {
    throw new Error("此 Google 帳號已綁定其他帳號");
  }
  if (existing) return;

  await prisma.userIdentity.create({
    data: {
      user_id: userId,
      provider: "google",
      provider_user_id: payload.sub,
      email: payload.email,
    },
  });
}

export async function findOrCreateGoogleUser(payload) {
  const identity = await findGoogleIdentity(payload.sub);

  if (identity) {
    return identity.user;
  }

  try {
    const user = await prisma.user.create({
      data: {
        display_name: payload.name,
        avatar_url: payload.picture ?? null,
        identities: {
          create: {
            provider: "google",
            provider_user_id: payload.sub,
            email: payload.email,
          },
        },
      },
    });

    return user;
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const existingIdentity = await findGoogleIdentity(payload.sub);
    if (!existingIdentity) {
      throw error;
    }

    return existingIdentity.user;
  }
}
