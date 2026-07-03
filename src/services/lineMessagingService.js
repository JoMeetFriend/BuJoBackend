const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_PUSH_TIMEOUT_MS = 5000;

function isLinePushEnabled() {
  return process.env.LINE_PUSH_ENABLED === "true";
}

function getChannelAccessToken() {
  return process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim();
}

async function readErrorBody(response) {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

export async function sendLinePushMessage(
  { to, text },
  fetchImpl = globalThis.fetch,
) {
  if (!isLinePushEnabled()) {
    return { status: "skipped", reason: "disabled" };
  }

  const channelAccessToken = getChannelAccessToken();
  if (!channelAccessToken) {
    return { status: "failed", reason: "missing_token" };
  }

  if (!to || !text) {
    return { status: "failed", reason: "invalid_message" };
  }

  try {
    const response = await fetchImpl(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(LINE_PUSH_TIMEOUT_MS),
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text }],
      }),
    });

    if (!response.ok) {
      return {
        status: "failed",
        reason: "line_api_error",
        statusCode: response.status,
        body: await readErrorBody(response),
      };
    }

    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed",
      reason: "fetch_error",
      message: error.message,
    };
  }
}
