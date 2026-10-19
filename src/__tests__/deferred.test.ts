import {
  deferredLink,
  INIT_BODY,
  loadSdk,
  MATCH_BODY,
  mockFetch,
  omit,
  silenceConsole,
  wireMatch,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

describe("checkDeferredDeepLink (native)", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("RN-10: on iOS it delegates to native and returns the clipboard result (not null because iOS)", async () => {
    const link = deferredLink({ source: "clipboard", deeplinkId: undefined });
    const { sdk, native } = loadSdk({
      flavor: "expo",
      os: "ios",
      native: { checkDeferredDeepLink: async () => link },
    });
    await sdk.initialize(KEY);
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      source: "clipboard",
      path: "/products/123",
      confidenceScore: 100,
      matchQuality: "HIGH",
    });
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it.each(["expo", "turbo", "bridge"] as const)(
    "RN-10 / RN-03: %s flavor returns the camelCase DeferredDeepLink on Android",
    async (flavor) => {
      const link = deferredLink();
      const { sdk } = loadSdk({
        flavor,
        os: "android",
        native: { checkDeferredDeepLink: async () => link },
      });
      await sdk.initialize(KEY);
      const res = await sdk.checkDeferredDeepLink();
      expect(res).toMatchObject(link);
      expect(res).not.toHaveProperty("target_url");
      expect(res).not.toHaveProperty("confidence_score");
    }
  );

  it("RN-11: Android awaits native referrer processing (no fixed delay race)", async () => {
    let release: (v: unknown) => void = () => {};
    const { sdk } = loadSdk({
      flavor: "turbo",
      os: "android",
      native: {
        checkDeferredDeepLink: () =>
          new Promise((r) => {
            release = r;
          }),
      },
    });
    await sdk.initialize(KEY);
    const p = sdk.checkDeferredDeepLink();
    await new Promise((r) => setTimeout(r, 150));
    let settled = false;
    p.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release(deferredLink());
    await expect(p).resolves.toMatchObject({ source: "referrer" });
  });

  it("RN-12 / SDK-14 / SDK-23: minConfidence, useClipboard and force are passed to native unchanged", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    await sdk.checkDeferredDeepLink({
      minConfidence: 60,
      useClipboard: false,
      force: true,
    });
    expect(native.checkDeferredDeepLink).toHaveBeenLastCalledWith({
      minConfidence: 60,
      useClipboard: false,
      force: true,
    });
    await sdk.checkDeferredDeepLink();
    expect(native.checkDeferredDeepLink).toHaveBeenLastCalledWith({});
  });

  it("SDK-10 / SDK-55: a native rejection surfaces as a DLNError with the same code", async () => {
    const err = Object.assign(new Error("Too many"), {
      code: "rateLimited",
      userInfo: { status: 429 },
    });
    const { sdk, mod } = loadSdk({
      flavor: "expo",
      native: { checkDeferredDeepLink: async () => Promise.reject(err) },
    });
    await sdk.initialize(KEY);
    const p = sdk.checkDeferredDeepLink();
    await expect(p).rejects.toBeInstanceOf(mod.DLNError);
    await expect(p).rejects.toMatchObject({ code: "rateLimited", status: 429 });
  });

  it("SDK-51: an unknown native error code maps to a known DLNError code", async () => {
    const err = Object.assign(new Error("boom"), { code: "ERR_UNEXPECTED" });
    const { sdk, mod } = loadSdk({
      flavor: "expo",
      native: { checkDeferredDeepLink: async () => Promise.reject(err) },
    });
    await sdk.initialize(KEY);
    const e = await sdk.checkDeferredDeepLink().catch((x: any) => x);
    expect(mod.DLN_ERROR_CODES).toContain(e.code);
  });

  it("SDK-15: a native result that is not a DeferredDeepLink shape is rejected as invalidResponse", async () => {
    const { sdk } = loadSdk({
      flavor: "expo",
      native: {
        checkDeferredDeepLink: async () => ({ id: "x", targetUrl: "/a" }),
      },
    });
    await sdk.initialize(KEY);
    await expect(sdk.checkDeferredDeepLink()).rejects.toMatchObject({
      code: "invalidResponse",
    });
  });

  it("SDK-10: native null resolves to null (no link)", async () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    await expect(sdk.checkDeferredDeepLink()).resolves.toBeNull();
  });

  it("SDK-19 (deprecated alias): the result keeps `id` for callers of the old referrer shape", async () => {
    const { sdk } = loadSdk({
      flavor: "expo",
      os: "android",
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    await sdk.initialize(KEY);
    const res = await sdk.checkDeferredDeepLink();
    expect(res.id).toBe("dl-1");
    expect(res.deeplinkId).toBe("dl-1");
  });

  it("RN-13 / SDK-26: resetDeferredDeepLink clears native state; clearReferrerCache is a deprecated alias", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo", os: "android" });
    await sdk.initialize(KEY);
    await sdk.resetDeferredDeepLink();
    expect(native.resetDeferredDeepLink).toHaveBeenCalledTimes(1);
    await expect(sdk.clearReferrerCache()).resolves.toBe(true);
    expect(native.resetDeferredDeepLink).toHaveBeenCalledTimes(2);
    expect(native.clearReferrerCache).not.toHaveBeenCalled();
  });

  it("RN-13: resetDeferredDeepLink works on iOS too", async () => {
    const { sdk, native } = loadSdk({ flavor: "turbo", os: "ios" });
    await sdk.initialize(KEY);
    await sdk.resetDeferredDeepLink();
    expect(native.resetDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("SDK-27: concurrent calls resolve every caller with the same result", async () => {
    const link = deferredLink();
    const { sdk } = loadSdk({
      flavor: "expo",
      native: { checkDeferredDeepLink: async () => link },
    });
    await sdk.initialize(KEY);
    const [a, b] = await Promise.all([
      sdk.checkDeferredDeepLink(),
      sdk.checkDeferredDeepLink(),
    ]);
    expect(a).toEqual(b);
  });

  it("getReferrerData: Android awaits native referrer data; iOS resolves null", async () => {
    const data = { referrerString: "fp_id=abc", fpId: "abc", processedAt: 1 };
    const android = loadSdk({
      flavor: "expo",
      os: "android",
      native: { getReferrerData: async () => data },
    });
    await android.sdk.initialize(KEY);
    await expect(android.sdk.getReferrerData()).resolves.toEqual(data);

    const ios = loadSdk({ flavor: "expo", os: "ios" });
    await ios.sdk.initialize(KEY);
    await expect(ios.sdk.getReferrerData()).resolves.toBeNull();
  });
});

describe("checkDeferredDeepLink (JS fallback: fingerprint step only)", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  async function setup(match: any, os: "ios" | "android" = "ios") {
    const fetchMock = mockFetch({ init: { body: INIT_BODY }, match });
    const { sdk } = loadSdk({ flavor: "none", os });
    await sdk.initialize(KEY, { retryAttempts: 0 });
    return { sdk, fetchMock };
  }

  it("SDK-13: picks the first candidate in server order that has a deeplink", async () => {
    const { sdk } = await setup({
      body: {
        matches: [
          wireMatch(90, {}, null),
          wireMatch(40, {}, { id: "second", full_path: "/b?x=1" }),
          wireMatch(80, {}, { id: "third" }),
        ],
        ttl_seconds: 3600,
      },
    });
    const res = await sdk.checkDeferredDeepLink();
    expect(res.deeplinkId).toBe("second");
    expect(res.path).toBe("/b");
  });

  it("SDK-14: minConfidence is off by default (a LOW candidate is returned)", async () => {
    const { sdk } = await setup({
      body: { matches: [wireMatch(35)], ttl_seconds: 3600 },
    });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      confidenceScore: 35,
      matchQuality: "LOW",
    });
  });

  it("SDK-14: with minConfidence, lower candidates are discarded", async () => {
    const { sdk } = await setup({
      body: { matches: [wireMatch(45), wireMatch(40)], ttl_seconds: 3600 },
    });
    await expect(
      sdk.checkDeferredDeepLink({ minConfidence: 50 })
    ).resolves.toBeNull();
  });

  it("SDK-15 / SDK-16 / SDK-19: the fingerprint result has the DeferredDeepLink shape with server score/quality unchanged", async () => {
    const { sdk } = await setup({ body: MATCH_BODY });
    const res = await sdk.checkDeferredDeepLink();
    expect(res).toEqual({
      path: "/products/123",
      queryParams: { ref: "newsletter", code: "SAVE20" },
      fullPath: "/products/123?ref=newsletter&code=SAVE20",
      url: "https://go.myapp.com/products/123?ref=newsletter&code=SAVE20",
      source: "fingerprint",
      confidenceScore: 87,
      matchQuality: "HIGH",
      deeplinkId: "dl-87",
      id: "dl-87",
      targetUrl: "products/123?code=SAVE20&ref=newsletter",
      campaignId: "camp-1",
      metadata: { title: "Product" },
      matchedAt: "2026-10-18T10:05:00Z",
      expiresAt: "2026-10-18T11:00:00Z",
      matchDetails: MATCH_BODY.matches[0].match_details,
    });
  });

  it("SDK-16: when an older server omits match_quality, it is derived from the server thresholds", async () => {
    const m = omit(wireMatch(60), "match_quality");
    const { sdk } = await setup({ body: { matches: [m], ttl_seconds: 3600 } });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      matchQuality: "MEDIUM",
    });
  });

  it("SDK-17: without full_path, falls back to target_url when it is a path, and parses query_params from it", async () => {
    const m = wireMatch(80, {}, { target_url: "/s?q=red+shoes&t=a&t=b" });
    m.deeplink = omit(m.deeplink!, "full_path", "query_params");
    const { sdk } = await setup({ body: { matches: [m], ttl_seconds: 3600 } });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      fullPath: "/s?q=red+shoes&t=a&t=b",
      path: "/s",
      queryParams: { q: "red shoes", t: ["a", "b"] },
    });
  });

  it("SDK-17: without full_path, a target_url without a leading slash gets one (on-demand links)", async () => {
    const m = wireMatch(80, {}, { target_url: "promo?code=SAVE20" });
    m.deeplink = omit(m.deeplink!, "full_path", "query_params");
    const { sdk } = await setup({ body: { matches: [m], ttl_seconds: 3600 } });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      fullPath: "/promo?code=SAVE20",
      path: "/promo",
      queryParams: { code: "SAVE20" },
    });
  });

  it("SDK-17: without full_path and without target_url, fullPath is /", async () => {
    const m = wireMatch(80, {}, {});
    m.deeplink = omit(m.deeplink!, "full_path", "query_params", "target_url");
    const { sdk } = await setup({ body: { matches: [m], ttl_seconds: 3600 } });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      fullPath: "/",
      path: "/",
      queryParams: {},
    });
  });

  it("SDK-17: full_path wins over target_url when present", async () => {
    const { sdk } = await setup({
      body: {
        matches: [
          wireMatch(
            80,
            {},
            { target_url: "/canonical", full_path: "/raw?b=2&a=1" }
          ),
        ],
        ttl_seconds: 3600,
      },
    });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      fullPath: "/raw?b=2&a=1",
    });
  });

  it("SDK-18: url is target_url when it is an absolute https URL on a link domain", async () => {
    const { sdk } = await setup({
      body: {
        matches: [
          wireMatch(
            80,
            {},
            { target_url: "https://myapp.deeplinknow.com/abs?x=1" }
          ),
        ],
        ttl_seconds: 3600,
      },
    });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      url: "https://myapp.deeplinknow.com/abs?x=1",
    });
  });

  it("SDK-18: url falls back to the primary domain when target_url is on another host", async () => {
    const { sdk } = await setup({
      body: {
        matches: [
          wireMatch(
            80,
            {},
            { target_url: "https://evil.com/x", full_path: "/p" }
          ),
        ],
        ttl_seconds: 3600,
      },
    });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      url: "https://go.myapp.com/p",
    });
  });

  it("SDK-21 / SDK-60 / SDK-61: the /match body has every required key, no ip_address, advertising_id null", async () => {
    const { sdk, fetchMock } = await setup({ body: MATCH_BODY }, "android");
    await sdk.checkDeferredDeepLink();
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/match")
    )!;
    const body = JSON.parse((call[1] as any).body);
    const fp = body.fingerprint;
    for (const k of [
      "user_agent",
      "platform",
      "os_version",
      "device_model",
      "language",
      "timezone",
      "installed_at",
      "last_opened_at",
    ]) {
      expect(typeof fp[k]).toBe("string");
    }
    for (const k of [
      "device_id",
      "advertising_id",
      "vendor_id",
      "hardware_fingerprint",
    ]) {
      expect(fp).toHaveProperty(k);
    }
    expect(fp.advertising_id).toBeNull();
    expect(fp.platform).toBe("android");
    expect(fp.installed_at).toMatch(/Z$/);
    expect(fp.last_opened_at).toMatch(/Z$/);
    expect(typeof fp.screen_width).toBe("number");
    expect(typeof fp.pixel_ratio).toBe("number");
    expect(JSON.stringify(body)).not.toContain("ip_address");
  });

  it("SDK-22: fingerprint values are web-comparable (hyphenated language, IANA timezone, logical points)", async () => {
    const { sdk, fetchMock } = await setup({ body: MATCH_BODY }, "ios");
    await sdk.checkDeferredDeepLink();
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/match")
    )!;
    const fp = JSON.parse((call[1] as any).body).fingerprint;
    expect(fp.language).toMatch(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/);
    expect(fp.language).not.toContain("_");
    expect(fp.timezone).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$|^UTC$/);
    expect(fp.screen_width).toBe(393);
    expect(fp.pixel_ratio).toBe(3);
    expect(fp.device_model).toBe("iPhone");
  });

  it("SDK-23: after a definitive outcome, later calls resolve null without network unless force", async () => {
    const { sdk, fetchMock } = await setup({ body: MATCH_BODY });
    expect(await sdk.checkDeferredDeepLink()).not.toBeNull();
    const before = fetchMock.mock.calls.length;
    expect(await sdk.checkDeferredDeepLink()).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(await sdk.checkDeferredDeepLink({ force: true })).not.toBeNull();
  });

  it("SDK-23: an empty /match is definitive too", async () => {
    const { sdk, fetchMock } = await setup({
      body: { matches: [], ttl_seconds: 3600 },
    });
    expect(await sdk.checkDeferredDeepLink()).toBeNull();
    const before = fetchMock.mock.calls.length;
    expect(await sdk.checkDeferredDeepLink()).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("SDK-24 / SDK-54: errors (5xx, network) reject and do not set the flag", async () => {
    const { sdk, fetchMock } = await setup([
      { status: 503, body: { error: "down" } },
      { body: MATCH_BODY },
    ]);
    await expect(sdk.checkDeferredDeepLink()).rejects.toMatchObject({
      code: "server",
    });
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      source: "fingerprint",
    });
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/match"))
    ).toHaveLength(2);
  });

  it("SDK-26: resetDeferredDeepLink clears the flag", async () => {
    const { sdk } = await setup({ body: MATCH_BODY });
    await sdk.checkDeferredDeepLink();
    expect(await sdk.checkDeferredDeepLink()).toBeNull();
    await sdk.resetDeferredDeepLink();
    expect(await sdk.checkDeferredDeepLink()).not.toBeNull();
  });

  it("SDK-27: concurrent calls do the work once", async () => {
    const { sdk, fetchMock } = await setup({ body: MATCH_BODY });
    const [a, b] = await Promise.all([
      sdk.checkDeferredDeepLink(),
      sdk.checkDeferredDeepLink(),
    ]);
    expect(a).toEqual(b);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/match"))
    ).toHaveLength(1);
  });

  it("SDK-11 / SDK-12: the fallback never reads the clipboard (no native code) and still returns fingerprint results", async () => {
    const { sdk } = await setup({ body: MATCH_BODY }, "android");
    await expect(
      sdk.checkDeferredDeepLink({ useClipboard: true })
    ).resolves.toMatchObject({
      source: "fingerprint",
    });
  });
});
