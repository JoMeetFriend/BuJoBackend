import { jest } from "@jest/globals";

const { searchAddress, clearAddressCache } = await import("../services/placesService.js");

const ORIGINAL_ENV = process.env;

describe("placesService", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    clearAddressCache();
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

  it("同樣查詢字串在快取有效期內第二次呼叫不會再打 LocationIQ API", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ display_name: "快取測試地址" }],
    });

    const first = await searchAddress("快取測試", fetchImpl);
    const second = await searchAddress("快取測試", fetchImpl);

    expect(first).toEqual({ status: "ok", results: ["快取測試地址"] });
    expect(second).toEqual({ status: "ok", results: ["快取測試地址"] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("查詢字串忽略大小寫與前後空白差異，共用同一份快取", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ display_name: "大小寫測試地址" }],
    });

    await searchAddress("Cache Test", fetchImpl);
    const second = await searchAddress("  cache test  ", fetchImpl);

    expect(second).toEqual({ status: "ok", results: ["大小寫測試地址"] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("查無結果（404）的查詢也會被快取，不會重複打 API", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await searchAddress("查無此地址快取測試", fetchImpl);
    await searchAddress("查無此地址快取測試", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("查詢失敗不會被快取，下次呼叫會重新打 API", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ display_name: "重試成功地址" }],
      });

    const first = await searchAddress("重試查詢", fetchImpl);
    const second = await searchAddress("重試查詢", fetchImpl);

    expect(first.status).toBe("failed");
    expect(second).toEqual({ status: "ok", results: ["重試成功地址"] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("clearAddressCache 會清空快取，下次呼叫重新打 API", async () => {
    process.env.LOCATIONIQ_API_KEY = "test-key";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ display_name: "清快取測試地址" }],
    });

    await searchAddress("清快取測試", fetchImpl);
    clearAddressCache();
    await searchAddress("清快取測試", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
