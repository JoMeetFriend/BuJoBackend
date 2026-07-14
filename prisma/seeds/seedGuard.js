const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertDemoSeedAllowed({
  databaseUrl,
  nodeEnv,
  allowDemoSeed,
}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未設定，停止執行 Demo seed");
  }

  let databaseHost;
  try {
    databaseHost = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL 格式無效，停止執行 Demo seed");
  }

  const isLocalDevelopment =
    nodeEnv !== "production" && LOCAL_DATABASE_HOSTS.has(databaseHost);
  const isExplicitlyAllowed = allowDemoSeed === "true";

  if (!isLocalDevelopment && !isExplicitlyAllowed) {
    throw new Error(
      "拒絕執行 Demo seed：遠端或 production 環境必須明確設定 ALLOW_DEMO_SEED=true",
    );
  }
}
