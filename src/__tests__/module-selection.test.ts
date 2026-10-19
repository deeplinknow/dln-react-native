import {
  APP_INFO,
  INIT_BODY,
  loadSdk,
  MATCH_BODY,
  mockFetch,
  silenceConsole,
} from "./support/helpers";

const PUBLIC_METHODS = [
  "initialize",
  "isInitialized",
  "checkDeferredDeepLink",
  "resetDeferredDeepLink",
  "findDeferredUser",
  "getReferrerData",
  "clearReferrerCache",
  "checkClipboard",
  "hasDeepLinkToken",
  "parseDeepLink",
  "isValidDomain",
];

describe("RN-23: Jest tests cover the JS layer (module selection, shapes, errors, fallback)", () => {
  let spies: ReturnType<typeof silenceConsole>;
  beforeEach(() => {
    spies = silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["expo", "expo"],
    ["turbo", "turbo"],
    ["bridge", "bridge"],
    ["none", "none"],
  ] as const)(
    "RN-04: getModuleType() reports %s when only that flavor exists",
    (flavor, expected) => {
      const { mod } = loadSdk({ flavor });
      expect(mod.getModuleType()).toBe(expected);
      expect(mod.isNativeModuleAvailable()).toBe(expected !== "none");
    }
  );

  it("RN-04: loading the SDK never throws when no native module is linked (Expo Go)", () => {
    expect(() => loadSdk({ flavor: "none" })).not.toThrow();
  });

  it("RN-02 / SDK-81: the default export exposes the same method set on every flavor", () => {
    for (const flavor of ["expo", "turbo", "bridge", "none"] as const) {
      for (const os of ["ios", "android"] as const) {
        const { sdk } = loadSdk({ flavor, os });
        for (const m of PUBLIC_METHODS) {
          expect(typeof sdk[m]).toBe("function");
        }
      }
    }
  });

  it("RN-17: clipboard read/write helpers are not part of the JS API", () => {
    const { sdk, mod } = loadSdk({ flavor: "expo" });
    for (const name of [
      "setClipboardString",
      "getClipboardString",
      "hasClipboardString",
    ]) {
      expect(sdk[name]).toBeUndefined();
      expect(mod[name]).toBeUndefined();
    }
  });

  it("RN-01: with a native module, every flow is delegated to native and JS makes no HTTP request", async () => {
    const fetchMock = mockFetch({});
    const { sdk, native } = loadSdk({ flavor: "turbo", os: "android" });
    await sdk.initialize("key_live_abcdef123456");
    await sdk.checkDeferredDeepLink();
    await sdk.findDeferredUser();
    await sdk.checkClipboard();
    await sdk.hasDeepLinkToken();
    sdk.parseDeepLink("https://myapp.deeplinknow.com/x");
    sdk.isValidDomain("myapp.deeplinknow.com");
    await sdk.getReferrerData();
    await sdk.resetDeferredDeepLink();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    expect(native.findDeferredUser).toHaveBeenCalledTimes(1);
    expect(native.checkClipboard).toHaveBeenCalledTimes(1);
    expect(native.hasDeepLinkToken).toHaveBeenCalledTimes(1);
    expect(native.parseDeepLink).toHaveBeenCalledTimes(1);
    expect(native.isValidDomain).toHaveBeenCalledTimes(1);
    expect(native.getReferrerData).toHaveBeenCalledTimes(1);
    expect(native.resetDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("RN-04: the REST fallback is not used after a native call fails for a business reason", async () => {
    const fetchMock = mockFetch({
      init: { body: INIT_BODY },
      match: { body: MATCH_BODY },
    });
    const { sdk } = loadSdk({
      flavor: "expo",
      native: {
        checkDeferredDeepLink: async () => null,
        findDeferredUser: async () => ({ matches: [], ttl_seconds: 3600 }),
      },
    });
    await sdk.initialize("key_live_abcdef123456");
    expect(await sdk.checkDeferredDeepLink()).toBeNull();
    expect(await sdk.findDeferredUser()).toEqual({
      matches: [],
      ttl_seconds: 3600,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("RN-04: the REST fallback is not used after a native call rejects", async () => {
    const fetchMock = mockFetch({
      init: { body: INIT_BODY },
      match: { body: MATCH_BODY },
    });
    const err = Object.assign(new Error("offline"), { code: "network" });
    const { sdk } = loadSdk({
      flavor: "bridge",
      native: { findDeferredUser: async () => Promise.reject(err) },
    });
    await sdk.initialize("key_live_abcdef123456");
    await expect(sdk.findDeferredUser()).rejects.toMatchObject({
      code: "network",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("RN-04: with no native module, the fallback logs exactly one degraded-mode warning and returns the same shapes", async () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: MATCH_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    const info = await sdk.initialize("key_live_abcdef123456");
    expect(info).toMatchObject({ id: APP_INFO.id, alias: APP_INFO.alias });
    const link = await sdk.checkDeferredDeepLink();
    await sdk.checkDeferredDeepLink({ force: true });
    await sdk.findDeferredUser();
    await sdk.checkClipboard();
    expect(link).toMatchObject({
      source: "fingerprint",
      path: "/products/123",
    });
    const degraded = spies.warn.mock.calls.filter((c) =>
      c.join(" ").match(/referrer and clipboard are unavailable/i)
    );
    expect(degraded).toHaveLength(1);
  });

  it("RN-02: Turbo detection does not mistake a legacy bridge module for a TurboModule", () => {
    const { mod } = loadSdk({ flavor: "bridge" });
    expect(mod.getModuleType()).toBe("bridge");
  });
});
