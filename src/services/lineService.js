export function getLineConfig() {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;

  if (!channelId || !channelSecret || !callbackUrl) {
    throw new Error("LINE 登入環境變數尚未設定完整");
  }

  return { channelId, channelSecret, callbackUrl };
}

export function createLineAuthorizationUrl() {
  const { channelId, callbackUrl } = getLineConfig();

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("state", "暫時先放測試用-state");

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
