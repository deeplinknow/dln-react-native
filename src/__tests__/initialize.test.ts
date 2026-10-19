import {
  APP_INFO,
  allLogText,
  INIT_BODY,
  loadSdk,
  MATCH_BODY,
  mockFetch,
  silenceConsole,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

describe("initialize (native module present)", () => {
  let spies: ReturnType<typeof silenceConsole>;
  beforeEach(() => {
    spies = silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("RN-06 / SDK-08: one initialize makes one native init and no JS /init request", async () => {
    const fetchMock = mockFetch({ init: { body: INIT_BODY } });
    const { sdk, native } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
    expect(native.initialize).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("RN-06 / SDK-03: initialize resolves with the app info returned by native", async () => {
    const { sdk } = loadSdk({ flavor: "turbo" });
    await expect(sdk.initialize(KEY)).resolves.toEqual(APP_INFO);
  });

  it("SDK-01: config (enableLogs, baseUrl, timeoutMs, retryAttempts) is passed to native", async () => {
    const { sdk, native } = loadSdk({ flavor: "bridge" });
    await sdk.initialize(KEY, {
      enableLogs: true,
      baseUrl: "https://staging.example.com/",
      timeoutMs: 5000,
      retryAttempts: 1,
    });
    expect(native.initializeWithConfig).toHaveBeenCalledWith(KEY, {
      enableLogs: true,
      baseUrl: "https://staging.example.com/",
      timeoutMs: 5000,
      retryAttempts: 1,
    });
  });

  it("RN-07 / SDK-04: initialize rejects with a DLNError when native init fails", async () => {
    const nativeErr = Object.assign(new Error("Invalid API key"), {
      code: "invalidApiKey",
      userInfo: { status: 401 },
    });
    const { sdk, mod } = loadSdk({
      flavor: "expo",
      native: { initializeWithConfig: async () => Promise.reject(nativeErr) },
    });
    const p = sdk.initialize(KEY);
    await expect(p).rejects.toBeInstanceOf(mod.DLNError);
    await expect(p).rejects.toMatchObject({
      code: "invalidApiKey",
      status: 401,
    });
    expect(sdk.isInitialized()).toBe(false);
  });

  it("RN-07: initialize resolves only after native init completes", async () => {
    let release: (v: unknown) => void = () => {};
    const { sdk } = loadSdk({
      flavor: "turbo",
      os: "android",
      native: {
        initializeWithConfig: () =>
          new Promise((r) => {
            release = r;
          }),
      },
    });
    let done = false;
    const p = sdk.initialize(KEY).then(() => {
      done = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    release(APP_INFO);
    await p;
    expect(done).toBe(true);
  });

  it("RN-07: an invalid API key argument rejects with a DLNError instead of resolving", async () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    await expect(sdk.initialize("")).rejects.toMatchObject({
      code: "invalidApiKey",
    });
    await expect(sdk.initialize(undefined as any)).rejects.toMatchObject({
      code: "invalidApiKey",
    });
  });

  it("SDK-05: isInitialized() is false before and true after a successful init", async () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    expect(sdk.isInitialized()).toBe(false);
    await sdk.initialize(KEY);
    expect(sdk.isInitialized()).toBe(true);
  });

  it("SDK-07: concurrent initialize calls with the same key share one native request", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    const [a, b] = await Promise.all([
      sdk.initialize(KEY),
      sdk.initialize(KEY),
    ]);
    expect(a).toEqual(b);
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
  });

  it("SDK-07: initialize again after completion replaces the config (idempotent re-init)", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    await sdk.initialize(KEY, { enableLogs: true });
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(2);
    expect(native.initializeWithConfig).toHaveBeenLastCalledWith(KEY, {
      enableLogs: true,
    });
  });

  it("RN-08: the API key is passed once, to initialize; deferred calls never re-send it", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo", os: "android" });
    await sdk.initialize(KEY);
    await sdk.checkDeferredDeepLink();
    await sdk.getReferrerData();
    await sdk.findDeferredUser();
    for (const name of [
      "checkDeferredDeepLink",
      "getReferrerData",
      "findDeferredUser",
      "processInstallReferrer",
    ]) {
      for (const call of native[name].mock.calls) {
        expect(JSON.stringify(call)).not.toContain(KEY);
      }
    }
    expect(native.processInstallReferrer).not.toHaveBeenCalled();
    expect(native.initialize).not.toHaveBeenCalled();
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
  });

  it("RN-09 / SDK-63: logs never contain the API key, even with enableLogs and a legacy config.apiKey", async () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY, { enableLogs: true, apiKey: KEY });
    await sdk.checkDeferredDeepLink();
    await sdk.findDeferredUser();
    const text = allLogText(spies);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(KEY);
  });

  it("SDK-09: initialize does not read the clipboard", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    expect(native.checkClipboard).not.toHaveBeenCalled();
    expect(native.getClipboardString).not.toHaveBeenCalled();
    expect(native.hasDeepLinkToken).not.toHaveBeenCalled();
  });

  it("SDK-06: checkDeferredDeepLink called while init is in flight waits for init", async () => {
    let release: (v: unknown) => void = () => {};
    const order: string[] = [];
    const { sdk } = loadSdk({
      flavor: "expo",
      native: {
        initializeWithConfig: () =>
          new Promise((r) => {
            release = (v) => {
              order.push("init");
              r(v);
            };
          }),
        checkDeferredDeepLink: async () => {
          order.push("check");
          return null;
        },
      },
    });
    sdk.initialize(KEY);
    const p = sdk.checkDeferredDeepLink();
    await Promise.resolve();
    expect(order).toEqual([]);
    release(APP_INFO);
    await p;
    expect(order).toEqual(["init", "check"]);
  });

  it("SDK-04: after a failed init, checkDeferredDeepLink and findDeferredUser reject notInitialized with the init failure as cause", async () => {
    const nativeErr = Object.assign(new Error("Account is not active"), {
      code: "accountInactive",
    });
    const { sdk, native } = loadSdk({
      flavor: "expo",
      native: { initializeWithConfig: async () => Promise.reject(nativeErr) },
    });
    await expect(sdk.initialize(KEY)).rejects.toMatchObject({
      code: "accountInactive",
    });
    await expect(sdk.checkDeferredDeepLink()).rejects.toMatchObject({
      code: "notInitialized",
      cause: expect.objectContaining({ code: "accountInactive" }),
    });
    await expect(sdk.findDeferredUser()).rejects.toMatchObject({
      code: "notInitialized",
    });
    expect(native.checkDeferredDeepLink).not.toHaveBeenCalled();
  });

  it("SDK-04: before any initialize, checkDeferredDeepLink rejects notInitialized (not null)", async () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    await expect(sdk.checkDeferredDeepLink()).rejects.toMatchObject({
      code: "notInitialized",
    });
    await expect(sdk.findDeferredUser()).rejects.toMatchObject({
      code: "notInitialized",
    });
  });
});

describe("initialize (JS REST fallback, no native module)", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("SDK-02: POSTs {baseUrl}/api/v1/sdk/init with x-api-key and JSON content type; key not in URL", async () => {
    const fetchMock = mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toBe("https://deeplinknow.com/api/v1/sdk/init");
    expect(url).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe(KEY);
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("SDK-01: a trailing slash on baseUrl is tolerated", async () => {
    const fetchMock = mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY, { baseUrl: "https://staging.example.com/" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://staging.example.com/api/v1/sdk/init"
    );
  });

  it("SDK-64: a non-HTTPS baseUrl is refused unless it is localhost/127.0.0.1/10.0.2.2", async () => {
    const fetchMock = mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(
      sdk.initialize(KEY, { baseUrl: "http://example.com" })
    ).rejects.toMatchObject({ code: "badRequest" });
    expect(fetchMock).not.toHaveBeenCalled();
    await sdk.initialize(KEY, { baseUrl: "http://localhost:3000" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:3000/api/v1/sdk/init"
    );
  });

  it("SDK-03: stores alias + verified custom domains (lowercased); unverified/null domains are not trusted", async () => {
    mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    const info = await sdk.initialize(KEY);
    expect(info.domains).toEqual(["myapp.deeplinknow.com", "go.myapp.com"]);
    expect(info).toMatchObject({
      id: "app-1",
      alias: "myapp",
      accountStatus: "active",
      creditsRemaining: 1000,
    });
    expect(sdk.isValidDomain("go.myapp.com")).toBe(true);
    expect(sdk.isValidDomain("pending.myapp.com")).toBe(false);
    expect(sdk.isValidDomain("null.myapp.com")).toBe(false);
  });

  it("SDK-03 / SDK-51: unknown fields in the init response are ignored", async () => {
    mockFetch({
      init: {
        body: { ...INIT_BODY, extra: 1, app: { ...INIT_BODY.app, foo: "bar" } },
      },
    });
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(sdk.initialize(KEY)).resolves.toMatchObject({
      alias: "myapp",
    });
  });

  it.each([
    [401, { error: "Invalid API key" }, "invalidApiKey"],
    [
      403,
      { error: "Account is not active", status: "suspended" },
      "accountInactive",
    ],
    [403, { error: "No credits remaining" }, "noCredits"],
    [429, { error: "Rate limit exceeded" }, "rateLimited"],
    [400, { error: "Invalid request data" }, "badRequest"],
    [500, { error: "Internal error" }, "server"],
  ])("SDK-04 / SDK-55: HTTP %s maps to %j → %s", async (status, body, code) => {
    mockFetch({ init: { status, body } });
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(
      sdk.initialize(KEY, { retryAttempts: 0 })
    ).rejects.toMatchObject({
      code,
      status,
    });
    expect(sdk.isInitialized()).toBe(false);
  });

  it("SDK-51: an unparseable 2xx (captive portal HTML) rejects invalidResponse", async () => {
    mockFetch({ init: { status: 200, raw: "<html>Login to Wi-Fi</html>" } });
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(sdk.initialize(KEY)).rejects.toMatchObject({
      code: "invalidResponse",
    });
  });

  it("SDK-51: a 2xx missing app.alias rejects invalidResponse", async () => {
    mockFetch({ init: { status: 200, body: { app: { id: "x" } } } });
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(sdk.initialize(KEY)).rejects.toMatchObject({
      code: "invalidResponse",
    });
  });

  it("SDK-54: offline fails fast with network", async () => {
    mockFetch({ init: new TypeError("Network request failed") });
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(
      sdk.initialize(KEY, { retryAttempts: 0 })
    ).rejects.toMatchObject({
      code: "network",
    });
  });

  it("BILL-20: the fallback /init body is {device_id: null} (no invented or persisted id)", async () => {
    const fetchMock = mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    await sdk.initialize(KEY, { enableLogs: false });
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse((call[1] as any).body)).toEqual({ device_id: null });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("SDK-08: one fallback initialize makes exactly one /init request", async () => {
    const fetchMock = mockFetch({
      init: { body: INIT_BODY },
      match: { body: MATCH_BODY },
    });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/init"))
    ).toHaveLength(1);
  });
});
