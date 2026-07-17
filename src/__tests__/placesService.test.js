import { jest } from "@jest/globals";

const { searchAddress } = await import("../services/placesService.js");

const ORIGINAL_ENV = process.env;

describe("placesService", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("缺少 LOCATIONIQ_API_KEY 時回傳 failed 且不呼叫 fetch", async () => {
    delete process.env.LOCATIONIQ_API_KEY;
    const fetchImpl = jest.fn();

    const result = await searchAddress("台北車站", fetchImpl);

    expect(result).toEqual({ status: "failed", reason: "missing_api_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("成功時用正確 endpoint 與參數呼叫 LocationIQ 並回傳地址清單", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { display_name: "台北車站, 中正區, 台北市" },
        { display_name: "台北 101, 信義區, 台北市" },
      ],
    });

    const result = await searchAddress("台北", fetchImpl);

    expect(result).toEqual({
      status: "ok",
      results: ["台北車站, 中正區, 台北市", "台北 101, 信義區, 台北市"],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchImpl.mock.calls[0];
    const url = new URL(calledUrl);
    expect(url.origin + url.pathname).toBe(
      "https://api.locationiq.com/v1/autocomplete",
    );
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("q")).toBe("台北");
    expect(url.searchParams.get("countrycodes")).toBe("tw");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("LocationIQ 回傳 404（查無結果）時回傳空陣列", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await searchAddress("xxxxxxxxx", fetchImpl);

    expect(result).toEqual({ status: "ok", results: [] });
  });

  it("LocationIQ 回傳非 200/404 錯誤時回傳 failed", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await searchAddress("台北", fetchImpl);

    expect(result).toEqual({
      status: "failed",
      reason: "locationiq_api_error",
      statusCode: 500,
    });
  });

  it("fetch 拋出例外時回傳 failed", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));

    const result = await searchAddress("台北", fetchImpl);

    expect(result).toEqual({
      status: "failed",
      reason: "fetch_error",
      message: "network down",
    });
  });
});
