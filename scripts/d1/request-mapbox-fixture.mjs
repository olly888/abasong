// Test-child preload only: keep the production provider and licensing checks,
// but route its one permanent-geocoding request to the disposable local fixture.
const target = new URL(process.env.ABASONG_TEST_PROVIDER_URL ?? "");
if (
  process.env.ABASONG_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  target.hostname !== "127.0.0.1" ||
  target.protocol !== "http:"
)
  throw new Error("Local test provider required");
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === "api.mapbox.com") {
    if (
      url.pathname !== "/search/geocode/v6/forward" ||
      url.searchParams.get("permanent") !== "true"
    )
      throw new Error("Unexpected provider operation in request test");
    url.searchParams.delete("access_token");
    return original(
      new URL("/mapbox-permanent?" + url.searchParams, target),
      init,
    );
  }
  return original(input, init);
};
