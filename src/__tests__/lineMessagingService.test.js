import { jest } from "@jest/globals";

const { sendLinePushMessage } = await import("../services/lineMessagingService.js");

const ORIGINAL_ENV = process.env;

describe("lineMessagingService", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("LINE_PUSH_ENABLED 不是 true 時會略過且不呼叫 fetch", async () => {
    process.env.LINE_PUSH_ENABLED = "false";
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = "token";
    const fetchImpl = jest.fn();

    const result = await sendLinePushMessage(
      { to: "U123", text: "message text" },
      fetchImpl,
    );

    expect(result).toEqual({ status: "skipped", reason: "disabled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("LINE_PUSH_ENABLED 為 true 時會用正確 endpoint、header 和 body 呼叫 LINE push API", async () => {
    process.env.LINE_PUSH_ENABLED = "true";
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = "channel-token";
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await sendLinePushMessage(
      { to: "U123", text: "message text" },
      fetchImpl,
    );

    expect(result).toEqual({ status: "sent" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer channel-token",
          "Content-Type": "application/json",
        },
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          to: "U123",
          messages: [{ type: "text", text: "message text" }],
        }),
      },
    );
  });

  it("LINE_PUSH_ENABLED 為 true 但缺 token 時回傳 failed 且不呼叫 fetch", async () => {
    process.env.LINE_PUSH_ENABLED = "true";
    delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    const fetchImpl = jest.fn();

    const result = await sendLinePushMessage(
      { to: "U123", text: "message text" },
      fetchImpl,
    );

    expect(result).toEqual({ status: "failed", reason: "missing_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("LINE_PUSH_ENABLED 為 true 但 token 只有空白時回傳 failed 且不呼叫 fetch", async () => {
    process.env.LINE_PUSH_ENABLED = "true";
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = "   ";
    const fetchImpl = jest.fn();

    const result = await sendLinePushMessage(
      { to: "U123", text: "message text" },
      fetchImpl,
    );

    expect(result).toEqual({ status: "failed", reason: "missing_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("LINE API 非 2xx 時回傳 failed delivery result", async () => {
    process.env.LINE_PUSH_ENABLED = "true";
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = "channel-token";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: jest.fn().mockResolvedValue({ message: "rate limited" }),
    });

    const result = await sendLinePushMessage(
      { to: "U123", text: "message text" },
      fetchImpl,
    );

    expect(result).toEqual({
      status: "failed",
      reason: "line_api_error",
      statusCode: 429,
      body: { message: "rate limited" },
    });
  });

  it("fetch throw 時回傳 failed delivery result", async () => {
    process.env.LINE_PUSH_ENABLED = "true";
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = "channel-token";
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));

    const result = await sendLinePushMessage(
      { to: "U123", text: "message text" },
      fetchImpl,
    );

    expect(result).toEqual({
      status: "failed",
      reason: "fetch_error",
      message: "network down",
    });
  });
});
