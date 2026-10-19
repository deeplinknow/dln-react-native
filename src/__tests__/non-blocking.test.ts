import {
  APP_INFO,
  deferredLink,
  loadSdk,
  MATCH_BODY,
  outcome,
  silenceConsole,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

/** A native method that rejects with `err` on the first call and then resolves `value`. */
function failOnce(err: Error, value: unknown) {
  let calls = 0;
  return () => {
    calls += 1;
    return calls === 1 ? Promise.reject(err) : Promise.resolve(value);
  };
}

function nativeError(message: string, code: string, status?: number) {
  return Object.assign(new Error(message), {
    code,
    userInfo: status === undefined ? {} : { status },
  });
}

/** Runs `fn` and returns the promise rejections that went unhandled meanwhile. */
async function unhandledRejectionsDuring(fn: () => void | Promise<void>) {
  const unhandled = jest.fn();
  process.on("unhandledRejection", unhandled);
  try {
    await fn();
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    process.off("unhandledRejection", unhandled);
  }
  return unhandled.mock.calls;
}

describe("SDK-85: non-blocking by default", () => {
  let spies: ReturnType<typeof silenceConsole>;
  beforeEach(() => {
    spies = silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("SDK-85: lastError is null before any call", () => {
    const { sdk } = loadSdk({ flavor: "expo" });
    expect(sdk.lastError).toBeNull();
  });

  describe("initialize", () => {
    it("SDK-85: a native rejection resolves null, warns and sets lastError (code and message)", async () => {
      const { sdk, mod } = loadSdk({
        flavor: "expo",
        native: {
          initializeWithConfig: async () =>
            Promise.reject(
              nativeError("Invalid API key", "invalidApiKey", 401)
            ),
        },
      });
      expect(await outcome(sdk, sdk.initialize(KEY))).toMatchObject({
        value: null,
        lastError: {
          code: "invalidApiKey",
          message: "Invalid API key",
          status: 401,
        },
      });
      expect(sdk.lastError).toBeInstanceOf(mod.DLNError);
      // Warnings show even with enableLogs off.
      expect(spies.warn).toHaveBeenCalledWith(
        "[DeepLinkNow]",
        expect.stringContaining("invalidApiKey")
      );
    });

    it("SDK-85: a later successful initialize clears lastError", async () => {
      const { sdk } = loadSdk({
        flavor: "expo",
        native: {
          initializeWithConfig: failOnce(
            nativeError("offline", "network"),
            APP_INFO
          ),
        },
      });
      expect(await outcome(sdk, sdk.initialize(KEY))).toMatchObject({
        value: null,
        lastError: {
          code: "network",
          message: "offline",
        },
      });
      await expect(sdk.initialize(KEY)).resolves.toMatchObject({
        alias: APP_INFO.alias,
      });
      expect(sdk.lastError).toBeNull();
      expect(sdk.isInitialized()).toBe(true);
    });

    it("SDK-85: never an unhandled rejection, even when the promise is ignored", async () => {
      const { sdk } = loadSdk({
        flavor: "bridge",
        native: {
          initializeWithConfig: async () =>
            Promise.reject(nativeError("down", "server", 503)),
        },
      });
      const unhandled = await unhandledRejectionsDuring(() => {
        sdk.initialize(KEY);
        sdk.initialize("");
      });
      expect(unhandled).toEqual([]);
      expect(sdk.lastError).not.toBeNull();
    });
  });

  describe("checkDeferredDeepLink", () => {
    it("SDK-85: a native rejection resolves null, warns and sets lastError (code and message)", async () => {
      const { sdk } = loadSdk({
        flavor: "expo",
        native: {
          checkDeferredDeepLink: async () =>
            Promise.reject(
              nativeError("Rate limit exceeded", "rateLimited", 429)
            ),
        },
      });
      await sdk.initialize(KEY);
      expect(await outcome(sdk, sdk.checkDeferredDeepLink())).toMatchObject({
        value: null,
        lastError: {
          code: "rateLimited",
          message: "Rate limit exceeded",
          status: 429,
        },
      });
      expect(spies.warn).toHaveBeenCalledWith(
        "[DeepLinkNow]",
        expect.stringContaining("rateLimited")
      );
    });

    it("SDK-85: a later successful call clears lastError, including one that finds no link", async () => {
      const { sdk } = loadSdk({
        flavor: "turbo",
        os: "android",
        native: {
          checkDeferredDeepLink: failOnce(
            nativeError("offline", "network"),
            null
          ),
        },
      });
      await sdk.initialize(KEY);
      expect(await outcome(sdk, sdk.checkDeferredDeepLink())).toMatchObject({
        value: null,
        lastError: {
          code: "network",
          message: "offline",
        },
      });
      await expect(sdk.checkDeferredDeepLink()).resolves.toBeNull();
      expect(sdk.lastError).toBeNull();
    });

    it("SDK-85: a success clears only an error of the same kind", async () => {
      const { sdk } = loadSdk({
        flavor: "expo",
        native: {
          checkDeferredDeepLink: async () => deferredLink(),
          findDeferredUser: async () =>
            Promise.reject(nativeError("down", "server", 500)),
        },
      });
      await sdk.initialize(KEY);
      expect(await outcome(sdk, sdk.findDeferredUser())).toMatchObject({
        value: null,
        lastError: {
          code: "server",
        },
      });
      await expect(sdk.checkDeferredDeepLink()).resolves.not.toBeNull();
      expect(sdk.lastError).toMatchObject({ code: "server" });
    });

    it("SDK-85: never an unhandled rejection (native failure, or no initialize at all)", async () => {
      const { sdk } = loadSdk({
        flavor: "expo",
        native: {
          checkDeferredDeepLink: async () =>
            Promise.reject(nativeError("offline", "network")),
        },
      });
      const unhandled = await unhandledRejectionsDuring(async () => {
        sdk.checkDeferredDeepLink();
        await sdk.initialize(KEY);
        sdk.checkDeferredDeepLink({ force: true });
      });
      expect(unhandled).toEqual([]);
      expect(sdk.lastError).toMatchObject({ code: "network" });
    });
  });

  describe("findDeferredUser", () => {
    it("SDK-85: a native rejection resolves null, warns and sets lastError (code and message)", async () => {
      const { sdk } = loadSdk({
        flavor: "bridge",
        native: {
          findDeferredUser: async () =>
            Promise.reject(
              nativeError("No credits remaining", "noCredits", 403)
            ),
        },
      });
      await sdk.initialize(KEY);
      expect(await outcome(sdk, sdk.findDeferredUser())).toMatchObject({
        value: null,
        lastError: {
          code: "noCredits",
          message: "No credits remaining",
          status: 403,
        },
      });
      expect(spies.warn).toHaveBeenCalledWith(
        "[DeepLinkNow]",
        expect.stringContaining("noCredits")
      );
    });

    it("SDK-85: a later successful call clears lastError", async () => {
      const { sdk } = loadSdk({
        flavor: "expo",
        native: {
          findDeferredUser: failOnce(
            nativeError("offline", "network"),
            MATCH_BODY
          ),
        },
      });
      await sdk.initialize(KEY);
      expect(await outcome(sdk, sdk.findDeferredUser())).toMatchObject({
        value: null,
        lastError: {
          code: "network",
          message: "offline",
        },
      });
      await expect(sdk.findDeferredUser()).resolves.toEqual(MATCH_BODY);
      expect(sdk.lastError).toBeNull();
    });

    it("SDK-85: never an unhandled rejection", async () => {
      const { sdk } = loadSdk({
        flavor: "turbo",
        native: {
          findDeferredUser: async () =>
            Promise.reject(nativeError("offline", "network")),
        },
      });
      const unhandled = await unhandledRejectionsDuring(async () => {
        sdk.findDeferredUser();
        await sdk.initialize(KEY);
        sdk.findDeferredUser();
      });
      expect(unhandled).toEqual([]);
      expect(sdk.lastError).toMatchObject({ code: "network" });
    });
  });
});
