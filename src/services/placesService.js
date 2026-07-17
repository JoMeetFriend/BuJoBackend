const LOCATIONIQ_AUTOCOMPLETE_ENDPOINT = "https://api.locationiq.com/v1/autocomplete";
const LOCATIONIQ_TIMEOUT_MS = 5000;

export async function searchAddress(query, fetchImpl = globalThis.fetch) {
  const apiKey = process.env.LOCATIONIQ_API_KEY;
  if (!apiKey) {
    return { status: "failed", reason: "missing_api_key" };
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
    return { status: "ok", results: data.map((item) => item.display_name) };
  } catch (error) {
    return { status: "failed", reason: "fetch_error", message: error.message };
  }
}
