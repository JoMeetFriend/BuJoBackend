import { jest } from "@jest/globals";

const searchAddress = jest.fn();

jest.unstable_mockModule("../services/placesService.js", () => ({
  searchAddress,
}));

const { autocompleteAddress } = await import("../controllers/placesController.js");
const { default: placesRoutes } = await import("../routes/places.js");
const { default: i18next } = await import("../lib/i18n.js");

function makeReq(query = {}) {
  return { query, t: i18next.getFixedT("zh-TW") };
}

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe("autocompleteAddress", () => {
  beforeEach(() => {
    searchAddress.mockReset();
  });

  it("查詢字串少於 2 個字時直接回傳空陣列，不呼叫 service", async () => {
    const req = makeReq({ q: "台" });
    const res = makeRes();

    await autocompleteAddress(req, res);

    expect(searchAddress).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ results: [] });
  });

  it("service 回傳 ok 時把 results 傳給前端，預設 global 為 false", async () => {
    searchAddress.mockResolvedValue({ status: "ok", results: ["台北車站"] });
    const req = makeReq({ q: "台北" });
    const res = makeRes();

    await autocompleteAddress(req, res);

    expect(searchAddress).toHaveBeenCalledWith("台北", { global: false });
    expect(res.json).toHaveBeenCalledWith({ results: ["台北車站"] });
  });

  it("query 帶 global=true 時會把 global: true 傳給 service", async () => {
    searchAddress.mockResolvedValue({ status: "ok", results: ["Tokyo Station"] });
    const req = makeReq({ q: "Tokyo", global: "true" });
    const res = makeRes();

    await autocompleteAddress(req, res);

    expect(searchAddress).toHaveBeenCalledWith("Tokyo", { global: true });
  });

  it("service 失敗時回傳 502", async () => {
    searchAddress.mockResolvedValue({ status: "failed", reason: "fetch_error" });
    const req = makeReq({ q: "台北" });
    const res = makeRes();

    await autocompleteAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ message: "地址搜尋服務暫時無法使用" });
  });
});

describe("/api/places routes", () => {
  it("使用 authenticate middleware 保護地址搜尋 API", () => {
    const route = placesRoutes.stack.find((layer) => layer.route?.path === "/autocomplete");

    expect(route).toBeDefined();
    expect(route.route.methods.get).toBe(true);
  });
});
