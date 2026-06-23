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
