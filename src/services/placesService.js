const LOCATIONIQ_AUTOCOMPLETE_ENDPOINT = "https://api.locationiq.com/v1/autocomplete";
const LOCATIONIQ_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const addressCache = new Map();

function getCacheKey(query) {
  return query.trim().toLowerCase();
}

function getCachedResults(key) {
  const entry = addressCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    addressCache.delete(key);
    return undefined;
  }
  return entry.results;
}

function setCachedResults(key, results) {
  if (addressCache.size >= CACHE_MAX_ENTRIES) {
    addressCache.delete(addressCache.keys().next().value);
  }
  addressCache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearAddressCache() {
  addressCache.clear();
}

export async function searchAddress(query, fetchImpl = globalThis.fetch) {
  const apiKey = process.env.LOCATIONIQ_API_KEY;
  if (!apiKey) {
    return { status: "failed", reason: "missing_api_key" };
  }

  const cacheKey = getCacheKey(query);
  const cachedResults = getCachedResults(cacheKey);
  if (cachedResults !== undefined) {
    return { status: "ok", results: cachedResults };
  }

  const url = new URL(LOCATIONIQ_AUTOCOMPLETE_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "tw");
  url.searchParams.set("accept-language", "zh-TW");

  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(LOCATIONIQ_TIMEOUT_MS),
    });

    if (response.status === 404) {
      setCachedResults(cacheKey, []);
      return { status: "ok", results: [] };
    }

    if (!response.ok) {
      return {
        status: "failed",
        reason: "locationiq_api_error",
        statusCode: response.status,
      };
    }

    const data = await response.json();
    const results = data.map((item) => item.display_name);
    setCachedResults(cacheKey, results);
    return { status: "ok", results };
  } catch (error) {
    return { status: "failed", reason: "fetch_error", message: error.message };
  }
}
