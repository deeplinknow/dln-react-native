/**
 * One link object for every open (SDK-86..SDK-92, RN-36..RN-42): `DeepLinkNow.onLink`,
 * `pendingLink` / `releasePendingLink()` / `clearPendingLink()`, `resolveLink`, the direct
 * opens read from `Linking`, and how they share one session with `checkDeferredDeepLink`,
 * `useDeferredDeepLink()` and the Expo Router helper.
 */
import {
  deferredLink,
  type LoadOptions,
  loadSdk,
  mockFetch,
  silenceConsole,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";
const LINK_URL = "https://myapp.deeplinknow.com/products/123?ref=newsletter";
const OTHER_URL = "https://myapp.deeplinknow.com/invite/abc";

/** A native parseDeepLink that knows the app's DLN domain and keeps the fragment in `url`. */
function nativeParse(url: string) {
  const m =
    /^https:\/\/(?:myapp\.deeplinknow\.com|go\.myapp\.com)(\/[^?#]*)?(\?[^#]*)?/i.exec(
      url
    );
  if (!m) {
    return null;
  }
  const path = m[1] ?? "/";
  const query = m[2] ?? "";
  return {
    path,
    queryParams: query ? { ref: "newsletter" } : {},
    fullPath: `${path}${query}`,
    url,
  };
}

function load(opts: LoadOptions = {}) {
  const loaded = loadSdk({
    ...opts,
    native:
      opts.flavor === "none"
        ? undefined
        : { parseDeepLink: nativeParse, ...opts.native },
  });
  const session = require("../link-session");
  return { ...loaded, session };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A promise the test resolves. */
function later<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("SDK-86 / SDK-87: one handler for deferred and direct opens", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-86 / RN-36: the deferred link arrives as type deferred, with every DeferredDeepLink field", async () => {
    const { sdk, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const handler = jest.fn();
    const unsubscribe = sdk.onLink(handler, { apiKey: KEY });
    expect(typeof unsubscribe).toBe("function");
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      ...deferredLink(),
      type: "deferred",
    });
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("SDK-87 / RN-37: the launch URL from Linking.getInitialURL is delivered as a direct universalLink on iOS", async () => {
    const { sdk } = load({ initialUrl: LINK_URL });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: "direct",
      source: "universalLink",
      path: "/products/123",
      queryParams: { ref: "newsletter" },
      fullPath: "/products/123?ref=newsletter",
      url: LINK_URL,
      confidenceScore: 100,
      matchQuality: "HIGH",
    });
  });

  it("SDK-87 / RN-37: an App Link on Android is source appLink; url events are delivered too", async () => {
    const { sdk, linking } = load({ os: "android" });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    expect(handler).not.toHaveBeenCalled();
    linking.emit(OTHER_URL);
    await tick();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "direct",
        source: "appLink",
        path: "/invite/abc",
      })
    );
  });

  it("SDK-87 / RN-37: a URL on the app's scheme is source scheme; the host is part of the path", async () => {
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, schemes: ["MyApp"] });
    await tick();
    linking.emit("myapp://products/9?code=SAVE20#dln=c1");
    await tick();
    expect(handler).toHaveBeenCalledWith({
      type: "direct",
      source: "scheme",
      path: "/products/9",
      queryParams: { code: "SAVE20" },
      fullPath: "/products/9?code=SAVE20",
      url: "myapp://products/9?code=SAVE20",
      confidenceScore: 100,
      matchQuality: "HIGH",
    });
  });

  it("SDK-87 / RN-37: other hosts, the bare scheme root and Expo dev-client URLs deliver nothing", async () => {
    const { sdk, linking } = load({ initialUrl: "myapp:///" });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    linking.emit("https://evil.com/products/1");
    linking.emit(
      "exp+myapp://expo-development-client/?url=http%3A%2F%2F10.0.0.2"
    );
    linking.emit("https://deeplink.now/products/1");
    await tick();
    expect(handler).not.toHaveBeenCalled();
    linking.emit("exp://127.0.0.1:8081/--/products/1");
    await tick();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ source: "scheme", fullPath: "/products/1" })
    );
  });

  it("SDK-87 / RN-37: a scheme counts only when listed in schemes; system schemes never count", async () => {
    const { sdk, linking } = load({ expoScheme: "expoapp" });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, schemes: ["myapp", "mailto", "tel"] });
    await tick();
    linking.emit("otherapp://products/1");
    linking.emit("expoapp://products/2"); // the list wins over the Expo config
    linking.emit("mailto:someone/x");
    linking.emit("tel:0400000000");
    await tick();
    expect(handler).not.toHaveBeenCalled();
    linking.emit("myapp://products/3");
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ source: "scheme", path: "/products/3" })
    );
  });

  it("SDK-87 / RN-37: without schemes, the Expo config's scheme counts; with neither, no scheme link is delivered", async () => {
    const expo = load({ expoScheme: ["myapp", "MyAppAlt"] });
    const handler = jest.fn();
    expo.sdk.onLink(handler, { apiKey: KEY });
    await tick();
    expo.linking.emit("myappalt://invite/1");
    await tick();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ source: "scheme", path: "/invite/1" })
    );

    const bare = load();
    const bareHandler = jest.fn();
    bare.sdk.onLink(bareHandler, { apiKey: KEY });
    await tick();
    bare.linking.emit("myapp://invite/1");
    await tick();
    expect(bareHandler).not.toHaveBeenCalled();
  });

  it("SDK-87: a launch URL on a custom domain waits for init, so the app's domains are known", async () => {
    const init = later<unknown>();
    const { sdk, native } = load({
      initialUrl: "https://go.myapp.com/sale",
      native: { initializeWithConfig: () => init.promise },
    });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    expect(native.parseDeepLink).not.toHaveBeenCalled();
    init.resolve({
      id: "app-1",
      alias: "myapp",
      domains: ["myapp.deeplinknow.com", "go.myapp.com"],
    });
    await tick();
    expect(native.parseDeepLink).toHaveBeenCalledWith(
      "https://go.myapp.com/sale"
    );
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "direct", path: "/sale" })
    );
  });

  it("SDK-86 / RN-36: unsubscribe stops delivery; a handler that throws is logged and the link stays delivered", async () => {
    const spies = silenceConsole();
    const { sdk, linking } = load();
    const handler = jest.fn();
    const unsubscribe = sdk.onLink(handler, { apiKey: KEY });
    await tick();
    unsubscribe();
    const thrower = jest.fn(() => {
      throw new Error("navigation not ready");
    });
    sdk.onLink(thrower);
    linking.emit(LINK_URL);
    await tick();
    expect(handler).not.toHaveBeenCalled();
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(spies.warn).toHaveBeenCalledWith(
      expect.stringContaining("onLink threw"),
      expect.any(Error)
    );
    expect(sdk.pendingLink).toBeNull();
  });

  it("SDK-85: onLink without a function warns and returns a no-op unsubscribe", () => {
    const spies = silenceConsole();
    const { sdk } = load();
    const unsubscribe = sdk.onLink(undefined as never);
    expect(() => unsubscribe()).not.toThrow();
    expect(spies.warn).toHaveBeenCalled();
  });
});

describe("SDK-88: never the same link twice", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-88 / RN-38: a cold-start URL that the OS also sends as a url event is delivered once (event first)", async () => {
    const { sdk, linking } = load({ initialUrl: LINK_URL });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    linking.emit(LINK_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("SDK-88 / RN-38: a cold-start URL that the OS also sends as a url event is delivered once (initial URL first)", async () => {
    const { sdk, linking } = load({ initialUrl: LINK_URL });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    linking.emit(LINK_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("SDK-88 / RN-38: the same URL tapped again after the replay window is a new open", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const { sdk, linking, session } = load({ initialUrl: LINK_URL });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    now += session.DIRECT_DEDUPE_WINDOW_MS + 1;
    linking.emit(LINK_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(2);
    // The same URL twice within 3 seconds is one open, whatever sent it.
    linking.emit(OTHER_URL);
    linking.emit(OTHER_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(3);
    now += session.DIRECT_DEDUPE_WINDOW_MS + 1;
    linking.emit(OTHER_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it("SDK-88 / RN-38: a deferred link and a direct open on the same first launch are both delivered, deferred first", async () => {
    const check = later<unknown>();
    const { sdk } = load({
      initialUrl: LINK_URL,
      native: { checkDeferredDeepLink: () => check.promise },
    });
    // Nothing is registered yet: both are known when the handler arrives.
    sdk.onLink(jest.fn(), { apiKey: KEY, hold: true });
    await tick();
    check.resolve(deferredLink());
    await tick();
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    expect(handler.mock.calls.map(([l]) => l.type)).toEqual([
      "deferred",
      "direct",
    ]);
  });
});

describe("SDK-86 / SDK-91: one deferred check, shared", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock("react");
  });

  it("SDK-86 / RN-36: two handlers both get the deferred link once; the chain runs once", async () => {
    const { sdk, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const a = jest.fn();
    const b = jest.fn();
    sdk.onLink(a, { apiKey: KEY });
    sdk.onLink(b, { apiKey: KEY });
    await tick();
    await tick();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("SDK-91 / RN-40: checkDeferredDeepLink called while onLink's check runs shares it (one native chain)", async () => {
    const check = later<unknown>();
    const { sdk, native } = load({
      native: { checkDeferredDeepLink: () => check.promise },
    });
    await sdk.initialize(KEY);
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    const direct = sdk.checkDeferredDeepLink();
    check.resolve(deferredLink());
    await expect(direct).resolves.toMatchObject({ path: "/products/123" });
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("SDK-91 / RN-40: checkDeferredDeepLink alone is unchanged (force is never shared)", async () => {
    const { sdk, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    await sdk.initialize(KEY);
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      source: "referrer",
      path: "/products/123",
    });
    await Promise.all([
      sdk.checkDeferredDeepLink({ force: true }),
      sdk.checkDeferredDeepLink({ force: true }),
    ]);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(3);
    expect(sdk.pendingLink).toBeNull();
  });

  it("SDK-91 / RN-40: useDeferredDeepLink and onLink share the check and the handled state", async () => {
    jest.doMock("react", () => ({
      useRef: (current: unknown) => ({ current }),
      useEffect: (fn: () => void) => {
        fn();
      },
      useSyncExternalStore: (_s: unknown, getSnapshot: () => unknown) =>
        getSnapshot(),
    }));
    const { sdk, mod, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    mod.useDeferredDeepLink({ apiKey: KEY });
    await tick();
    expect(mod.useDeferredDeepLink().link).toMatchObject({
      path: "/products/123",
    });
    // Not consumed by the 1.3 hook: a handler registered now gets it, and then the hook
    // sees it as handled.
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mod.useDeferredDeepLink().link).toBeNull();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("SDK-91 / RN-40: a link cleared in useDeferredDeepLink is never delivered to onLink", async () => {
    jest.doMock("react", () => ({
      useRef: (current: unknown) => ({ current }),
      useEffect: (fn: () => void) => {
        fn();
      },
      useSyncExternalStore: (_s: unknown, getSnapshot: () => unknown) =>
        getSnapshot(),
    }));
    const { sdk, mod } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    mod.useDeferredDeepLink({ apiKey: KEY, hold: true });
    await tick();
    expect(mod.useDeferredDeepLink({ hold: true }).heldLink).toMatchObject({
      path: "/products/123",
    });
    mod.useDeferredDeepLink({ hold: true }).clear();
    expect(mod.useDeferredDeepLink({ hold: true }).heldLink).toBeNull();
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("SDK-86: replay to a late handler", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-86 / RN-36: a link that arrived before any handler is replayed once, to the first one", async () => {
    const { sdk } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const session = require("../link-session");
    session.startDeferredCheck(sdk, { apiKey: KEY });
    await tick();
    // SDK-89: waiting for a first handler is not held, so it isn't listed.
    expect(sdk.pendingLinks).toEqual([]);
    expect(sdk.pendingLink).toBeNull();
    const first = jest.fn();
    sdk.onLink(first);
    expect(first).not.toHaveBeenCalled(); // never before onLink returns
    await tick();
    expect(first).toHaveBeenCalledTimes(1);
    const second = jest.fn();
    sdk.onLink(second);
    await tick();
    expect(second).not.toHaveBeenCalled();
    expect(sdk.pendingLink).toBeNull();
  });
});

describe("SDK-89: hold until the app is ready", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-89 / RN-39: hold keeps the link in pendingLink until releasePendingLink delivers it", async () => {
    const { sdk } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, hold: true });
    await tick();
    expect(handler).not.toHaveBeenCalled();
    expect(sdk.pendingLink).toMatchObject({
      type: "deferred",
      path: "/products/123",
    });
    expect(sdk.releasePendingLink()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(sdk.pendingLink).toBeNull();
    expect(sdk.releasePendingLink()).toBe(false);
  });

  it("SDK-89 / RN-39: clearPendingLink drops it: never delivered", async () => {
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, hold: true });
    await tick();
    linking.emit(LINK_URL);
    await tick();
    expect(sdk.pendingLink).toMatchObject({ type: "direct" });
    sdk.clearPendingLink();
    expect(sdk.pendingLink).toBeNull();
    expect(sdk.releasePendingLink()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("SDK-89 / RN-39: releasePendingLink ends the hold: later links go straight to the handler", async () => {
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, hold: true });
    await tick();
    linking.emit(LINK_URL);
    await tick();
    expect(sdk.releasePendingLink()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    linking.emit(OTHER_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(sdk.pendingLink).toBeNull();
  });

  it("SDK-89 / RN-39: releasePendingLink with nothing pending still ends the hold", async () => {
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, hold: true });
    await tick();
    expect(sdk.releasePendingLink()).toBe(false);
    linking.emit(LINK_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("SDK-89 / RN-39: clearPendingLink keeps the hold on: the next link is held too", async () => {
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, hold: true });
    await tick();
    linking.emit(LINK_URL);
    await tick();
    sdk.clearPendingLink();
    linking.emit(OTHER_URL);
    await tick();
    expect(handler).not.toHaveBeenCalled();
    expect(sdk.pendingLink).toMatchObject({ path: "/invite/abc" });
  });

  it("SDK-89 / RN-39: pendingLinks holds the latest of each kind, deferred first; pendingLink is the first", async () => {
    const check = later<unknown>();
    const { sdk, linking } = load({
      native: { checkDeferredDeepLink: () => check.promise },
    });
    expect(sdk.pendingLinks).toEqual([]);
    sdk.onLink(jest.fn(), { apiKey: KEY, hold: true });
    await tick();
    linking.emit(LINK_URL);
    await tick();
    expect(sdk.pendingLinks.map((l: { type: string }) => l.type)).toEqual([
      "direct",
    ]);
    check.resolve(deferredLink());
    await tick();
    linking.emit(OTHER_URL);
    await tick();
    expect(
      sdk.pendingLinks.map((l: { type: string; path: string }) => [
        l.type,
        l.path,
      ])
    ).toEqual([
      ["deferred", "/products/123"],
      ["direct", "/invite/abc"],
    ]);
    expect(sdk.pendingLink).toBe(sdk.pendingLinks[0]);
    expect(Object.isFrozen(sdk.pendingLinks)).toBe(true);
    sdk.clearPendingLink();
    expect(sdk.pendingLinks).toEqual([]);
    expect(sdk.pendingLink).toBeNull();
  });

  it("SDK-89 / RN-39: only the latest direct open is kept while held", async () => {
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, hold: true });
    await tick();
    linking.emit(LINK_URL);
    linking.emit(OTHER_URL);
    await tick();
    expect(sdk.pendingLink).toMatchObject({ path: "/invite/abc" });
    sdk.releasePendingLink();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/invite/abc" })
    );
  });

  it("SDK-89 / RN-39: a handler without hold gets links that another handler holds", async () => {
    const { sdk, linking } = load();
    const holding = jest.fn();
    const open = jest.fn();
    sdk.onLink(holding, { apiKey: KEY, hold: true });
    sdk.onLink(open);
    await tick();
    linking.emit(LINK_URL);
    await tick();
    expect(open).toHaveBeenCalledTimes(1);
    expect(holding).not.toHaveBeenCalled();
    expect(sdk.pendingLink).toBeNull();
  });
});

describe("SDK-90: resolving direct opens", () => {
  const RESOLVED = {
    deeplink: {
      id: "dl-9",
      target_url: "https://yourapp.com/invite/8Fk2",
      metadata: { fdl: { short_link: "https://links.yourapp.com/abc123" } },
      campaign_id: "4b3c2d1e-0000-4000-8000-000000000000",
      matched_at: "2026-10-18T09:20:00.000Z",
      expires_at: "2026-10-18T10:20:00.000Z",
      full_path: "/products/123?ref=newsletter",
      query_params: { ref: "newsletter" },
    },
  };

  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-90 / RN-41: resolve: true fills deeplinkId, targetUrl, campaignId and metadata from a 200", async () => {
    const fetch = mockFetch({ resolve: { status: 200, body: RESOLVED } });
    const { sdk } = load({ initialUrl: LINK_URL });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, resolve: true });
    await tick();
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://deeplinknow.com/api/v1/sdk/resolve?path=%2Fproducts%2F123%3Fref%3Dnewsletter"
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "direct",
        path: "/products/123",
        deeplinkId: "dl-9",
        targetUrl: "https://yourapp.com/invite/8Fk2",
        campaignId: "4b3c2d1e-0000-4000-8000-000000000000",
        metadata: RESOLVED.deeplink.metadata,
      })
    );
  });

  it("SDK-90 / RN-41: a 404 delivers the link unresolved", async () => {
    mockFetch({
      resolve: { status: 404, body: { error: "Deeplink not found" } },
    });
    const { sdk } = load({ initialUrl: LINK_URL });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY, resolve: true });
    await tick();
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    const [[link]] = handler.mock.calls;
    expect(link).toMatchObject({ type: "direct", path: "/products/123" });
    expect(link.deeplinkId).toBeUndefined();
  });

  it("SDK-90 / RN-41: a server that doesn't answer within timeoutMs: delivered unresolved, no later than the timeout", async () => {
    (global as { fetch?: unknown }).fetch = jest.fn(
      () => new Promise(() => undefined)
    );
    const { sdk } = load();
    await sdk.initialize(KEY, { timeoutMs: 50 });
    const started = Date.now();
    const link = await sdk.resolveLink(LINK_URL);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(link).toMatchObject({ type: "direct", path: "/products/123" });
    expect(link?.deeplinkId).toBeUndefined();
  });

  it("SDK-90 / RN-41: a network error delivers unresolved", async () => {
    const fetch = mockFetch({ resolve: new Error("offline") });
    const { sdk } = load();
    await sdk.initialize(KEY);
    const link = await sdk.resolveLink(LINK_URL);
    expect(link).toMatchObject({ path: "/products/123" });
    expect(link?.deeplinkId).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("SDK-90 / RN-41: resolve is off by default: no request on a direct open", async () => {
    const fetch = mockFetch({ resolve: { status: 200, body: RESOLVED } });
    const { sdk, linking } = load();
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    linking.emit(LINK_URL);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].deeplinkId).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("SDK-90 / RN-41: resolveLink returns null for a URL that is not a link, and never calls the server for a scheme URL", async () => {
    const fetch = mockFetch({ resolve: { status: 200, body: RESOLVED } });
    const { sdk } = load({ expoScheme: "myapp" });
    await sdk.initialize(KEY);
    await expect(sdk.resolveLink("https://evil.com/x")).resolves.toBeNull();
    await expect(sdk.resolveLink("myapp://products/1")).resolves.toMatchObject({
      source: "scheme",
      fullPath: "/products/1",
    });
    await expect(sdk.resolveLink(LINK_URL)).resolves.toMatchObject({
      deeplinkId: "dl-9",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("SDK-92: the dln fragment is never part of a link", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-92 / RN-42: the JS parser strips #dln=<id> from url and keeps other fragment parameters", () => {
    const { stripDlnFragment, parseDeepLinkJS } = require("../deeplink");
    expect(stripDlnFragment("https://a.deeplinknow.com/p?x=1#dln=c1")).toBe(
      "https://a.deeplinknow.com/p?x=1"
    );
    expect(stripDlnFragment("https://a.deeplinknow.com/p#top&dln=c1")).toBe(
      "https://a.deeplinknow.com/p#top"
    );
    expect(stripDlnFragment("https://a.deeplinknow.com/p#dlnx=1")).toBe(
      "https://a.deeplinknow.com/p#dlnx=1"
    );
    expect(stripDlnFragment("https://a.deeplinknow.com/p")).toBe(
      "https://a.deeplinknow.com/p"
    );
    expect(
      parseDeepLinkJS(
        "https://myapp.deeplinknow.com/products/1?ref=x#dln=8f2c",
        null
      )
    ).toMatchObject({
      url: "https://myapp.deeplinknow.com/products/1?ref=x",
      fullPath: "/products/1?ref=x",
      path: "/products/1",
    });
  });

  it("SDK-92 / RN-42: parseDeepLink strips it from a native result, and checkDeferredDeepLink from a clipboard link", async () => {
    const { sdk } = load({
      native: {
        checkDeferredDeepLink: async () =>
          deferredLink({
            source: "clipboard",
            url: "https://myapp.deeplinknow.com/products/123?ref=newsletter&code=SAVE20#dln=c1",
          }),
      },
    });
    expect(sdk.parseDeepLink(`${LINK_URL}#dln=c1`)).toMatchObject({
      url: LINK_URL,
      fullPath: "/products/123?ref=newsletter",
    });
    await sdk.initialize(KEY);
    await expect(sdk.checkDeferredDeepLink()).resolves.toMatchObject({
      url: "https://myapp.deeplinknow.com/products/123?ref=newsletter&code=SAVE20",
    });
  });

  it("SDK-92 / RN-42: the JS fallback (Expo Go) strips it from parseDeepLink too", () => {
    const { sdk } = load({ flavor: "none" });
    expect(sdk.parseDeepLink(`${LINK_URL}#dln=c1`)).toMatchObject({
      url: LINK_URL,
    });
  });
});

describe("RN-30 / SDK-88: the Expo Router helper and onLink together", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-88 / RN-38: a launch URL the helper routed is not delivered again to onLink", async () => {
    const { sdk } = load({ initialUrl: LINK_URL });
    const router = require("../expo-router");
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: LINK_URL, initial: true },
        { apiKey: KEY }
      )
    ).resolves.toBe("/products/123?ref=newsletter");
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    expect(handler).not.toHaveBeenCalled();
  });

  it("SDK-88 / RN-38: a warm link the helper handled is not delivered again by the url event", async () => {
    const { sdk, linking } = load();
    const router = require("../expo-router");
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    await router.redirectSystemPathWithDeferredLink(
      { path: OTHER_URL, initial: false },
      { apiKey: KEY }
    );
    linking.emit(OTHER_URL);
    await tick();
    expect(handler).not.toHaveBeenCalled();
  });

  it("RN-27 / RN-36: a deferred link the helper routed at launch is never delivered to onLink", async () => {
    const { sdk } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const router = require("../expo-router");
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: "myapp:///", initial: true },
        { apiKey: KEY }
      )
    ).resolves.toBe("/products/123?ref=newsletter&code=SAVE20");
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("SDK-24: a failed deferred check runs again in this launch", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-24 / RN-44: onLink registered before initialize gets the link once initialize succeeds", async () => {
    const { sdk, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const handler = jest.fn();
    sdk.onLink(handler); // no apiKey, no initialize yet: the check fails (notInitialized)
    await tick();
    expect(handler).not.toHaveBeenCalled();
    expect(sdk.lastError?.code).toBe("notInitialized");
    await sdk.initialize(KEY);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ type: "deferred" });
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    expect(sdk.lastError).toBeNull();
  });

  it("SDK-24 / RN-44: an initialize started elsewhere is waited for, not failed", async () => {
    const { sdk, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const handler = jest.fn();
    const init = sdk.initialize(KEY);
    sdk.onLink(handler);
    await init;
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("SDK-24 / RN-44: an offline check runs again on the next registration", async () => {
    let calls = 0;
    const { sdk, native } = load({
      native: {
        checkDeferredDeepLink: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(
                Object.assign(new Error("offline"), { code: "network" })
              )
            : Promise.resolve(deferredLink());
        },
      },
    });
    const first = jest.fn();
    sdk.onLink(first, { apiKey: KEY });
    await tick();
    expect(first).not.toHaveBeenCalled();
    expect(sdk.lastError?.code).toBe("network");
    const second = jest.fn();
    sdk.onLink(second);
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("SDK-24 / RN-44: an offline check runs again when the app comes to the foreground", async () => {
    let calls = 0;
    const { sdk, native, appState } = load({
      native: {
        checkDeferredDeepLink: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(
                Object.assign(new Error("offline"), { code: "network" })
              )
            : Promise.resolve(deferredLink());
        },
      },
    });
    const handler = jest.fn();
    sdk.onLink(handler, { apiKey: KEY });
    await tick();
    appState.emit("background");
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    appState.emit("active");
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledTimes(1);
    // Done: later foregrounds and registrations don't run it again.
    appState.emit("active");
    sdk.onLink(jest.fn());
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(2);
  });

  it("SDK-23 / RN-44: a check that found no link is not run again", async () => {
    const { sdk, native, appState } = load();
    sdk.onLink(jest.fn(), { apiKey: KEY });
    await tick();
    appState.emit("active");
    await sdk.initialize(KEY, { enableLogs: false });
    sdk.onLink(jest.fn());
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });
});

describe("SDK-89: pendingLinks lists held links only", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-89 / RN-39: a link waiting for a first handler is not held; clearPendingLink keeps it for the handler", async () => {
    const { sdk } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const session = require("../link-session");
    session.startDeferredCheck(sdk, { apiKey: KEY });
    await tick();
    expect(sdk.pendingLinks).toEqual([]);
    sdk.clearPendingLink();
    const holding = jest.fn();
    const unsubscribe = sdk.onLink(holding, { hold: true });
    await tick();
    expect(sdk.pendingLinks.map((l: { type: string }) => l.type)).toEqual([
      "deferred",
    ]);
    unsubscribe();
    expect(sdk.pendingLinks).toEqual([]);
    const handler = jest.fn();
    sdk.onLink(handler);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(holding).not.toHaveBeenCalled();
  });
});
