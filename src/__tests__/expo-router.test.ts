/**
 * Expo Router integration (`@deeplinknow/react-native/expo-router`) and
 * `useDeferredDeepLink()`: RN-26..RN-35.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  deferredLink,
  INIT_BODY,
  type LoadOptions,
  loadSdk,
  mockFetch,
  silenceConsole,
} from "./support/helpers";

const ROOT = resolve(__dirname, "../..");
const KEY = "dln_live_supersecretkey_9876";
const ROOT_URL = "dlnexample:///";
const LINK_URL = "https://myapp.deeplinknow.com/products/123?ref=newsletter";

/** A native parseDeepLink that knows the app's DLN domain (the real rule lives in native). */
function nativeParse(url: string) {
  const m = /^https:\/\/myapp\.deeplinknow\.com(\/[^?#]*)?(\?[^#]*)?/i.exec(
    url
  );
  if (!m) {
    return null;
  }
  const path = m[1] ?? "/";
  return {
    path,
    queryParams: { ref: "newsletter" },
    fullPath: `${path}${m[2] ?? ""}`,
    url,
  };
}

/** Loads the SDK with the given native mocks, then the Expo Router module and the session. */
function load(opts: LoadOptions = {}) {
  const loaded = loadSdk({
    ...opts,
    native:
      opts.flavor === "none"
        ? undefined
        : { parseDeepLink: nativeParse, ...opts.native },
  });
  const router = require("../expo-router");
  const session = require("../link-session");
  return { ...loaded, router, session };
}

/** A minimal React for calling the hook outside a renderer: effects run immediately. */
function mockReact() {
  jest.doMock("react", () => ({
    useRef: (current: unknown) => ({ current }),
    useEffect: (fn: () => void) => {
      fn();
    },
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
  }));
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("Expo Router helper", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock("react");
  });

  describe("RN-26: packaging", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

    it("RN-26: package.json exports ./expo-router from build, with a folder shim for older resolvers", () => {
      expect(pkg.exports["./expo-router"]).toEqual({
        types: "./build/expo-router.d.ts",
        default: "./build/expo-router.js",
      });
      const shim = JSON.parse(
        readFileSync(join(ROOT, "expo-router/package.json"), "utf8")
      );
      expect(shim).toMatchObject({
        main: "../build/expo-router.js",
        types: "../build/expo-router.d.ts",
      });
      expect(pkg.files).toContain("expo-router/package.json");
    });

    it("RN-26: the helper has no runtime dependency on expo-router or React", () => {
      const src = readFileSync(join(ROOT, "src/expo-router.ts"), "utf8");
      const session = readFileSync(join(ROOT, "src/link-session.ts"), "utf8");
      for (const code of [src, session]) {
        expect(code).not.toMatch(/from "expo-router"|require\("expo-router"\)/);
        expect(code).not.toMatch(/from "react"/);
      }
    });

    it("RN-26: createRedirectSystemPath returns a redirectSystemPath bound to the options", async () => {
      const { router, native } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      const redirectSystemPath = router.createRedirectSystemPath({
        apiKey: KEY,
      });
      await expect(
        redirectSystemPath({ path: ROOT_URL, initial: true })
      ).resolves.toBe("/products/123?ref=newsletter&code=SAVE20");
      expect(native.initializeWithConfig).toHaveBeenCalledWith(KEY, {});
    });
  });

  describe("RN-27: first launch", () => {
    it("RN-27: first launch with a deferred link initializes, checks and returns the link's fullPath", async () => {
      const { router, native, sdk } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      const path = await router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        { apiKey: KEY, config: { enableLogs: false } }
      );
      expect(path).toBe("/products/123?ref=newsletter&code=SAVE20");
      expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
      expect(native.initializeWithConfig).toHaveBeenCalledWith(KEY, {
        enableLogs: false,
      });
      expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
      expect(sdk.isInitialized()).toBe(true);
    });

    it("RN-27 / RN-12: minConfidence and useClipboard reach checkDeferredDeepLink unchanged", async () => {
      const { router, native } = load({
        native: { checkDeferredDeepLink: async () => null },
      });
      await router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        { apiKey: KEY, minConfidence: 75, useClipboard: false }
      );
      expect(native.checkDeferredDeepLink).toHaveBeenCalledWith({
        minConfidence: 75,
        useClipboard: false,
      });
    });

    it("RN-27: first launch without a deferred link keeps the incoming path", async () => {
      const { router, native } = load({
        native: { checkDeferredDeepLink: async () => null },
      });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe(ROOT_URL);
      expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    });

    it("RN-27: an SDK that is already initialized is not initialized again", async () => {
      const { router, native, sdk } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      await sdk.initialize(KEY);
      await router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        { apiKey: KEY }
      );
      expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
    });

    it("RN-27: mapLink turns the deferred link into a route; null keeps the incoming path", async () => {
      const { router } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      const mapLink = jest.fn(
        (link: { path: string }, source: string) =>
          `/shop${link.path}?from=${source}`
      );
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY, mapLink }
        )
      ).resolves.toBe("/shop/products/123?from=deferred");

      const second = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      await expect(
        second.router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY, mapLink: () => null }
        )
      ).resolves.toBe(ROOT_URL);
    });

    it("RN-27: the deferred link is routed once per process, then the incoming path passes through", async () => {
      const { router, native } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      const opts = { apiKey: KEY };
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          opts
        )
      ).resolves.toBe("/products/123?ref=newsletter&code=SAVE20");
      // e.g. a development reload re-runs the initial redirect
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          opts
        )
      ).resolves.toBe(ROOT_URL);
      expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["", true],
      ["/", true],
      ["dlnexample:///", true],
      ["dlnexample://", true],
      ["exp+dln-example://192.168.1.5:8081/--/", true],
      ["exp://127.0.0.1:8081/--/", true],
      ["dlnexample:///#top", true],
      ["dlnexample://products/1", false],
      ["dlnexample:///?promo=1", false],
      ["/products/1", false],
      ["exp+dln-example://192.168.1.5:8081/--/products/1", false],
      ["https://myapp.deeplinknow.com/", false],
      ["http://example.com", false],
    ])("RN-27: isLaunchWithoutLink(%j) is %s", (path, expected) => {
      const { router } = load();
      expect(router.isLaunchWithoutLink(path)).toBe(expected);
    });
  });

  describe("RN-28: bounded, never throws", () => {
    it("RN-28: on timeout it returns the incoming path, and a late link goes to useDeferredDeepLink", async () => {
      mockReact();
      let release: (v: unknown) => void = () => {};
      const { router, native, mod } = load({
        native: {
          checkDeferredDeepLink: () =>
            new Promise((r) => {
              release = r;
            }),
        },
      });
      const started = Date.now();
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY, timeoutMs: 30 }
        )
      ).resolves.toBe(ROOT_URL);
      expect(Date.now() - started).toBeLessThan(1000);

      expect(mod.useDeferredDeepLink()).toMatchObject({
        link: null,
        isLoading: true,
      });
      release(deferredLink());
      await tick();
      const res = mod.useDeferredDeepLink();
      expect(res).toMatchObject({
        isLoading: false,
        link: { fullPath: "/products/123?ref=newsletter&code=SAVE20" },
      });
      // One check per process: the hook reused the helper's.
      expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    });

    it("RN-28: the default timeout is 3000 ms, and timeoutMs: 0 never waits", async () => {
      const { router } = load({
        native: { checkDeferredDeepLink: () => new Promise(() => {}) },
      });
      expect(router.DEFAULT_DEFERRED_TIMEOUT_MS).toBe(3000);
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY, timeoutMs: 0 }
        )
      ).resolves.toBe(ROOT_URL);
    });

    it("RN-28: an init that never finishes is bounded by timeoutMs too", async () => {
      const { router, native } = load({
        native: { initializeWithConfig: () => new Promise(() => {}) },
      });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY, timeoutMs: 20 }
        )
      ).resolves.toBe(ROOT_URL);
      expect(native.checkDeferredDeepLink).not.toHaveBeenCalled();
    });

    it("RN-28 / SDK-85: a failing init or check resolves the incoming path and records lastError", async () => {
      const failingInit = load({
        native: {
          initializeWithConfig: async () => {
            throw Object.assign(new Error("bad key"), {
              code: "invalidApiKey",
            });
          },
        },
      });
      await expect(
        failingInit.router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe(ROOT_URL);
      expect(failingInit.sdk.lastError).toBeTruthy();

      const failingCheck = load({
        native: {
          checkDeferredDeepLink: async () => {
            throw Object.assign(new Error("offline"), { code: "network" });
          },
        },
      });
      await expect(
        failingCheck.router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe(ROOT_URL);
      expect(failingCheck.sdk.lastError?.code).toBe("network");
    });

    it("RN-28: a throwing mapLink or a malformed event never rejects", async () => {
      const { router } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          {
            apiKey: KEY,
            mapLink: () => {
              throw new Error("boom");
            },
          }
        )
      ).resolves.toBe(ROOT_URL);
      await expect(
        router.redirectSystemPathWithDeferredLink(null, { apiKey: KEY })
      ).resolves.toBe("/");
    });

    it("RN-28: no API key and no init: resolves the incoming path (notInitialized in lastError)", async () => {
      const { router, sdk } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          {}
        )
      ).resolves.toBe(ROOT_URL);
      expect(sdk.lastError?.code).toBe("notInitialized");
    });
  });

  describe("RN-29: later launches and warm links", () => {
    it("RN-29: a non-initial path never runs the deferred chain and passes through unchanged", async () => {
      const { router, native, sdk } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      await sdk.initialize(KEY);
      for (const path of [
        "dlnexample://settings",
        "/settings?tab=2",
        "https://example.com/products/1",
        ROOT_URL,
      ]) {
        await expect(
          router.redirectSystemPathWithDeferredLink(
            { path, initial: false },
            { apiKey: KEY }
          )
        ).resolves.toBe(path);
      }
      expect(native.checkDeferredDeepLink).not.toHaveBeenCalled();
    });

    it("RN-29: a later cold launch (native first-launch flag set) keeps the incoming path", async () => {
      // The native SDK returns null on every launch after the first (SDK-26).
      const { router, native } = load({
        native: { checkDeferredDeepLink: async () => null },
      });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: ROOT_URL, initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe(ROOT_URL);
      expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    });
  });

  describe("RN-30: Universal Link / App Link mapping", () => {
    it("RN-30: a warm DLN link maps to its in-app fullPath; other https hosts are untouched", async () => {
      const { router, sdk } = load();
      await sdk.initialize(KEY);
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: LINK_URL, initial: false },
          { apiKey: KEY }
        )
      ).resolves.toBe("/products/123?ref=newsletter");
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: "https://evil.com/products/123", initial: false },
          { apiKey: KEY }
        )
      ).resolves.toBe("https://evil.com/products/123");
    });

    it("RN-30: mapUniversalLinks: false leaves DLN links to Expo Router", async () => {
      const { router, sdk } = load();
      await sdk.initialize(KEY);
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: LINK_URL, initial: false },
          { apiKey: KEY, mapUniversalLinks: false }
        )
      ).resolves.toBe(LINK_URL);
    });

    it("RN-30: mapLink also maps universal links", async () => {
      const { router, sdk } = load();
      await sdk.initialize(KEY);
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: LINK_URL, initial: false },
          {
            apiKey: KEY,
            mapLink: (link: { path: string }, source: string) =>
              `${source}:${link.path}`,
          }
        )
      ).resolves.toBe("universal:/products/123");
    });

    it("RN-30: a cold launch from a DLN link waits for init, maps it, and skips the deferred chain", async () => {
      mockReact();
      const { router, native, mod } = load({
        native: { checkDeferredDeepLink: async () => deferredLink() },
      });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: LINK_URL, initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe("/products/123?ref=newsletter");
      expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
      // The tapped link wins: no deferred check now, and the hook doesn't start one later.
      expect(mod.useDeferredDeepLink()).toEqual(
        expect.objectContaining({ link: null, isLoading: false })
      );
      await tick();
      expect(native.checkDeferredDeepLink).not.toHaveBeenCalled();
    });

    it("RN-30: a cold launch from a custom-scheme link passes through without init or check", async () => {
      const { router, native } = load();
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: "dlnexample://products/1", initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe("dlnexample://products/1");
      expect(native.initializeWithConfig).not.toHaveBeenCalled();
      expect(native.checkDeferredDeepLink).not.toHaveBeenCalled();
    });

    it("RN-30 / RN-04: without a native module the JS host rule maps links on verified custom domains", async () => {
      mockFetch({ init: { body: INIT_BODY } });
      const { router } = load({ flavor: "none" });
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: "https://go.myapp.com/sale?x=1", initial: true },
          { apiKey: KEY }
        )
      ).resolves.toBe("/sale?x=1");
      await expect(
        router.redirectSystemPathWithDeferredLink(
          { path: "https://pending.myapp.com/sale", initial: false },
          { apiKey: KEY }
        )
      ).resolves.toBe("https://pending.myapp.com/sale");
    });
  });
});

describe("RN-31: useDeferredDeepLink", () => {
  beforeEach(() => {
    silenceConsole();
    mockReact();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock("react");
  });

  it("RN-31: starts one check (initializing with apiKey), exposes the link until clear()", async () => {
    const { mod, native, session } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    expect(mod.useDeferredDeepLink({ apiKey: KEY, minConfidence: 50 })).toEqual(
      expect.objectContaining({ link: null, isLoading: true })
    );
    const listener = jest.fn();
    session.subscribeDeferredSession(listener);
    await tick();
    const res = mod.useDeferredDeepLink({ apiKey: KEY });
    expect(res.isLoading).toBe(false);
    expect(res.link).toMatchObject({ path: "/products/123" });
    expect(listener).toHaveBeenCalled();
    expect(native.initializeWithConfig).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledWith({
      minConfidence: 50,
    });

    res.clear();
    expect(mod.useDeferredDeepLink().link).toBeNull();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("RN-31: a link the Expo Router helper already routed is not handed out again", async () => {
    const { mod, router } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    await router.redirectSystemPathWithDeferredLink(
      { path: ROOT_URL, initial: true },
      { apiKey: KEY }
    );
    expect(mod.useDeferredDeepLink()).toMatchObject({
      link: null,
      isLoading: false,
    });
  });

  it("RN-31: enabled: false doesn't start the check", async () => {
    const { mod, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    expect(mod.useDeferredDeepLink({ apiKey: KEY, enabled: false })).toEqual(
      expect.objectContaining({ link: null, isLoading: false })
    );
    await tick();
    expect(native.initializeWithConfig).not.toHaveBeenCalled();
    expect(native.checkDeferredDeepLink).not.toHaveBeenCalled();
  });

  it("RN-31 / SDK-85: a failed check settles with no link and never throws", async () => {
    const { mod, sdk } = load({
      native: {
        checkDeferredDeepLink: async () => {
          throw Object.assign(new Error("offline"), { code: "network" });
        },
      },
    });
    mod.useDeferredDeepLink({ apiKey: KEY });
    await tick();
    expect(mod.useDeferredDeepLink()).toMatchObject({
      link: null,
      isLoading: false,
    });
    expect(sdk.lastError?.code).toBe("network");
  });
});

describe("RN-33..35: auth gate (hold the link until sign-in)", () => {
  beforeEach(() => {
    silenceConsole();
    mockReact();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock("react");
  });

  it("RN-33: while hold is true the check still runs, link is null and heldLink has it", async () => {
    const { mod, native } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    mod.useDeferredDeepLink({ apiKey: KEY, hold: true });
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
    const held = mod.useDeferredDeepLink({ apiKey: KEY, hold: true });
    expect(held).toMatchObject({ link: null, isLoading: false });
    expect(held.heldLink).toMatchObject({ path: "/products/123" });
  });

  it("RN-33: a link held through a delayed sign-in is delivered when hold turns false", async () => {
    const { mod } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    let isSignedIn = false;
    mod.useDeferredDeepLink({ apiKey: KEY, hold: !isSignedIn });
    await tick();
    // The user spends a while on the sign-in screen; re-renders keep holding.
    await tick(5);
    expect(mod.useDeferredDeepLink({ hold: !isSignedIn }).link).toBeNull();
    await tick(5);
    expect(
      mod.useDeferredDeepLink({ hold: !isSignedIn }).heldLink
    ).not.toBeNull();
    isSignedIn = true;
    const res = mod.useDeferredDeepLink({ hold: !isSignedIn });
    expect(res.link).toMatchObject({
      fullPath: "/products/123?ref=newsletter&code=SAVE20",
    });
    expect(res.heldLink).toBeNull();
    res.clear();
    expect(mod.useDeferredDeepLink({ hold: false }).link).toBeNull();
  });

  it("RN-33: clear() while held drops the link: nothing is delivered after sign-in", async () => {
    const { mod } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const onLink = jest.fn();
    mod.useDeferredDeepLink({ apiKey: KEY, hold: true, onLink });
    await tick();
    mod.useDeferredDeepLink({ hold: true, onLink }).clear();
    const after = mod.useDeferredDeepLink({ hold: false, onLink });
    expect(after).toMatchObject({ link: null, heldLink: null });
    expect(onLink).not.toHaveBeenCalled();
  });

  it("RN-33: without hold the hook behaves as in 1.3.0 (heldLink stays null)", async () => {
    const { mod } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    mod.useDeferredDeepLink({ apiKey: KEY });
    await tick();
    const res = mod.useDeferredDeepLink();
    expect(res.link).toMatchObject({ path: "/products/123" });
    expect(res.heldLink).toBeNull();
    // Not consumed by reading it: still there until clear().
    expect(mod.useDeferredDeepLink().link).not.toBeNull();
  });

  it("RN-34: onLink is called exactly once, after the gate opens, and marks the link handled", async () => {
    const { mod, session } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    const onLink = jest.fn();
    mod.useDeferredDeepLink({ apiKey: KEY, hold: true, onLink });
    await tick();
    mod.useDeferredDeepLink({ hold: true, onLink });
    expect(onLink).not.toHaveBeenCalled();

    mod.useDeferredDeepLink({ hold: false, onLink });
    // Re-renders and a second component with its own onLink don't deliver it again.
    mod.useDeferredDeepLink({ hold: false, onLink });
    const other = jest.fn();
    mod.useDeferredDeepLink({ hold: false, onLink: other });
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onLink).toHaveBeenCalledWith(
      expect.objectContaining({
        fullPath: "/products/123?ref=newsletter&code=SAVE20",
      })
    );
    expect(other).not.toHaveBeenCalled();
    expect(session.getDeferredSessionState().handled).toBe(true);
  });

  it("RN-34 / SDK-85: an onLink that throws never breaks the hook", async () => {
    const { mod } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    mod.useDeferredDeepLink({ apiKey: KEY, hold: true });
    await tick();
    const onLink = jest.fn(() => {
      throw new Error("navigation not ready");
    });
    expect(() => mod.useDeferredDeepLink({ onLink })).not.toThrow();
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(mod.useDeferredDeepLink({ onLink }).link).toBeNull();
  });

  it("RN-35: routeDeferredLink: false starts the check, returns at once and leaves the link to the hook", async () => {
    let release: (v: unknown) => void = () => {};
    const { mod, router, native } = load({
      native: {
        checkDeferredDeepLink: () =>
          new Promise((r) => {
            release = r;
          }),
      },
    });
    const opts = { apiKey: KEY, routeDeferredLink: false };
    const started = Date.now();
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        opts
      )
    ).resolves.toBe(ROOT_URL);
    expect(Date.now() - started).toBeLessThan(500);
    await tick();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);

    release(deferredLink());
    await tick();
    // A development reload re-runs the initial redirect: still no routing at launch.
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        opts
      )
    ).resolves.toBe(ROOT_URL);

    const onLink = jest.fn();
    mod.useDeferredDeepLink({ hold: true, onLink });
    expect(onLink).not.toHaveBeenCalled();
    mod.useDeferredDeepLink({ hold: false, onLink });
    mod.useDeferredDeepLink({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(native.checkDeferredDeepLink).toHaveBeenCalledTimes(1);
  });

  it("RN-35: a link mapLink returns null for stays available to the hook", async () => {
    const { mod, router } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        { apiKey: KEY, mapLink: () => null }
      )
    ).resolves.toBe(ROOT_URL);
    const onLink = jest.fn();
    mod.useDeferredDeepLink({ onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("RN-35: a link the helper routed at launch is never delivered again by a gated hook", async () => {
    const { mod, router } = load({
      native: { checkDeferredDeepLink: async () => deferredLink() },
    });
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        { apiKey: KEY }
      )
    ).resolves.toBe("/products/123?ref=newsletter&code=SAVE20");
    const onLink = jest.fn();
    expect(mod.useDeferredDeepLink({ hold: true, onLink }).heldLink).toBeNull();
    mod.useDeferredDeepLink({ hold: false, onLink });
    expect(onLink).not.toHaveBeenCalled();
  });

  it("RN-35 / SDK-85: routeDeferredLink: false with a failing check never rejects", async () => {
    const { router, mod } = load({
      native: {
        checkDeferredDeepLink: async () => {
          throw Object.assign(new Error("offline"), { code: "network" });
        },
      },
    });
    await expect(
      router.redirectSystemPathWithDeferredLink(
        { path: ROOT_URL, initial: true },
        { apiKey: KEY, routeDeferredLink: false }
      )
    ).resolves.toBe(ROOT_URL);
    await tick();
    expect(mod.useDeferredDeepLink({ hold: false })).toMatchObject({
      link: null,
      heldLink: null,
      isLoading: false,
    });
  });
});

describe("RN-32: example app", () => {
  it("RN-32: dln-example's +native-intent uses the Expo Router helper from the subpath", () => {
    const src = readFileSync(
      join(ROOT, "dln-example/app/+native-intent.tsx"),
      "utf8"
    );
    expect(src).toContain('from "@deeplinknow/react-native/expo-router"');
    expect(src).toMatch(/export const redirectSystemPath\s*=/);
  });
});
