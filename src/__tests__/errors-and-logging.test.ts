import {
  allLogText,
  INIT_BODY,
  loadSdk,
  MATCH_BODY,
  mockFetch,
  outcome,
  silenceConsole,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

describe("errors, retries, timeouts (JS fallback)", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("SDK-55: DLNError exposes code, status and the server message; the code set is the shared one", async () => {
    const { mod } = loadSdk({ flavor: "none" });
    expect(mod.DLN_ERROR_CODES).toEqual([
      "notInitialized",
      "invalidApiKey",
      "accountInactive",
      "noCredits",
      "rateLimited",
      "badRequest",
      "server",
      "network",
      "invalidResponse",
    ]);
    mockFetch({ init: { status: 401, body: { error: "Invalid API key" } } });
    const { value, lastError: e } = await outcome(
      mod.default,
      mod.default.initialize(KEY)
    );
    expect(value).toBeNull();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(mod.DLNError);
    expect(e.code).toBe("invalidApiKey");
    expect(e.status).toBe(401);
    expect(e.serverMessage).toBe("Invalid API key");
  });

  it("SDK-55: an Expo-style native rejection (no userInfo) still carries the HTTP status", async () => {
    const err = Object.assign(new Error("No credits remaining (HTTP 403)"), {
      code: "noCredits",
    });
    const { sdk } = loadSdk({
      flavor: "expo",
      native: { initializeWithConfig: async () => Promise.reject(err) },
    });
    expect(await outcome(sdk, sdk.initialize(KEY))).toMatchObject({
      value: null,
      lastError: {
        code: "noCredits",
        status: 403,
      },
    });
  });

  it("SDK-53: transient failures (5xx, 429, transport) are retried up to retryAttempts", async () => {
    const fetchMock = mockFetch({
      init: [
        { status: 502, body: {} },
        { status: 429, body: {} },
        { body: INIT_BODY },
      ],
    });
    const { sdk } = loadSdk({ flavor: "none" });
    jest.useFakeTimers();
    const p = sdk.initialize(KEY, { retryAttempts: 2 });
    await jest.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ alias: "myapp" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404, 410])(
    "SDK-53: HTTP %s is not retried",
    async (status) => {
      const fetchMock = mockFetch({ init: { status, body: { error: "x" } } });
      const { sdk } = loadSdk({ flavor: "none" });
      await expect(
        sdk.initialize(KEY, { retryAttempts: 2 })
      ).resolves.toBeNull();
      expect(sdk.lastError).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("SDK-53: Retry-After is honoured (capped at 5 s)", async () => {
    const fetchMock = mockFetch({
      init: [
        { status: 429, body: {}, headers: { "Retry-After": "30" } },
        { body: INIT_BODY },
      ],
    });
    const { sdk } = loadSdk({ flavor: "none" });
    jest.useFakeTimers();
    const p = sdk.initialize(KEY, { retryAttempts: 1 });
    await jest.advanceTimersByTimeAsync(4900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("SDK-52: each request honours the configured timeout and maps to network", async () => {
    (global as any).fetch = jest.fn(
      (_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener?.("abort", () =>
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }))
          );
        })
    );
    const { sdk } = loadSdk({ flavor: "none" });
    jest.useFakeTimers();
    const p = sdk.initialize(KEY, { timeoutMs: 1000, retryAttempts: 0 });
    await jest.advanceTimersByTimeAsync(1001);
    expect(await outcome(sdk, p)).toMatchObject({
      value: null,
      lastError: { code: "network" },
    });
  });

  it("SDK-50: no unhandled rejection escapes when the caller ignores initialize's promise and later calls fail", async () => {
    mockFetch({ init: { status: 500, body: {} } });
    const { sdk } = loadSdk({ flavor: "none" });
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    // SDK-85: no .catch needed; initialize never rejects.
    sdk.initialize(KEY, { retryAttempts: 0 });
    expect(await outcome(sdk, sdk.checkDeferredDeepLink())).toMatchObject({
      value: null,
      lastError: {
        code: "notInitialized",
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("SDK-56: public calls are async (Promise) except parseDeepLink/isValidDomain/isInitialized", () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: MATCH_BODY } });
    const { sdk } = loadSdk({ flavor: "expo" });
    const p = sdk.initialize(KEY);
    expect(p).toBeInstanceOf(Promise);
    expect(typeof sdk.isInitialized()).toBe("boolean");
    return p;
  });
});

describe("privacy and logging", () => {
  let spies: ReturnType<typeof silenceConsole>;
  beforeEach(() => {
    spies = silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("SDK-70: no debug logs when enableLogs is false", async () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: MATCH_BODY } });
    const { sdk } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    await sdk.checkDeferredDeepLink();
    expect(spies.log).not.toHaveBeenCalled();
  });

  it("SDK-70: debug logs use the [DeepLinkNow] prefix when enabled", async () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY, { enableLogs: true });
    expect(spies.log).toHaveBeenCalled();
    for (const call of spies.log.mock.calls) {
      expect(call[0]).toBe("[DeepLinkNow]");
    }
  });

  it("SDK-63 / SDK-71: the key never appears in logs (fallback, enableLogs on, request logging)", async () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: MATCH_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY, { enableLogs: true });
    await sdk.checkDeferredDeepLink();
    await sdk.findDeferredUser();
    const text = allLogText(spies);
    expect(text).not.toContain(KEY);
  });

  it("SDK-72: with enableLogs, the fallback logs each step outcome", async () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: MATCH_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY, { enableLogs: true });
    await sdk.checkDeferredDeepLink();
    expect(allLogText(spies)).toMatch(/fingerprint/i);
  });

  it("SDK-62 / SDK-65: the fallback stores nothing on device and sends no location/carrier/hardware IDs", async () => {
    const fetchMock = mockFetch({
      init: { body: INIT_BODY },
      match: { body: MATCH_BODY },
    });
    const { sdk } = loadSdk({ flavor: "none", os: "android" });
    await sdk.initialize(KEY);
    await sdk.findDeferredUser();
    const body = String(
      (
        fetchMock.mock.calls.find((c) =>
          String(c[0]).endsWith("/match")
        )![1] as any
      ).body
    );
    for (const banned of [
      "latitude",
      "longitude",
      "carrier",
      "imei",
      "serial",
      "mac_address",
      "ip_address",
    ]) {
      expect(body.toLowerCase()).not.toContain(banned);
    }
  });
});
