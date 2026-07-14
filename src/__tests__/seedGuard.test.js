import { assertDemoSeedAllowed } from "../../prisma/seeds/seedGuard.js";

const LOCAL_DATABASE_URL =
  "postgresql://user:password@localhost:5432/bujo?schema=public";
const REMOTE_DATABASE_URL =
  "postgresql://user:password@database.example.com:5432/bujo?schema=public";

describe("assertDemoSeedAllowed", () => {
  it("非 production 的本機資料庫可直接執行", () => {
    expect(() =>
      assertDemoSeedAllowed({
        databaseUrl: LOCAL_DATABASE_URL,
        nodeEnv: "development",
        allowDemoSeed: undefined,
      }),
    ).not.toThrow();
  });

  it("遠端資料庫未明確授權時拒絕執行", () => {
    expect(() =>
      assertDemoSeedAllowed({
        databaseUrl: REMOTE_DATABASE_URL,
        nodeEnv: "development",
        allowDemoSeed: undefined,
      }),
    ).toThrow(/ALLOW_DEMO_SEED=true/);
  });

  it("production 即使使用 localhost 也必須明確授權", () => {
    expect(() =>
      assertDemoSeedAllowed({
        databaseUrl: LOCAL_DATABASE_URL,
        nodeEnv: "production",
        allowDemoSeed: "false",
      }),
    ).toThrow(/ALLOW_DEMO_SEED=true/);
  });

  it("遠端 Demo 資料庫設定明確授權後可執行", () => {
    expect(() =>
      assertDemoSeedAllowed({
        databaseUrl: REMOTE_DATABASE_URL,
        nodeEnv: "production",
        allowDemoSeed: "true",
      }),
    ).not.toThrow();
  });

  it("DATABASE_URL 缺少或格式無效時拒絕執行", () => {
    expect(() =>
      assertDemoSeedAllowed({
        databaseUrl: undefined,
        nodeEnv: "development",
        allowDemoSeed: undefined,
      }),
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      assertDemoSeedAllowed({
        databaseUrl: "not-a-url",
        nodeEnv: "development",
        allowDemoSeed: undefined,
      }),
    ).toThrow(/DATABASE_URL/);
  });
});
