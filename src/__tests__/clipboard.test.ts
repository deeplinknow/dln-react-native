import {
  allLogText,
  INIT_BODY,
  loadSdk,
  mockFetch,
  silenceConsole,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

describe("clipboard", () => {
  let spies: ReturnType<typeof silenceConsole>;
  beforeEach(() => {
    spies = silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("RN-14 / SDK-41: hasDeepLinkToken calls the native no-prompt check and never reads the raw clipboard", async () => {
    const { sdk, native } = loadSdk({
      flavor: "expo",
      native: {
        hasDeepLinkToken: async () => true,
        getClipboardString: async () => "dln://whatever",
      },
    });
    await expect(sdk.hasDeepLinkToken()).resolves.toBe(true);
    expect(native.hasDeepLinkToken).toHaveBeenCalledTimes(1);
    expect(native.getClipboardString).not.toHaveBeenCalled();
  });

  it("RN-14: a `dln://` clipboard does not make hasDeepLinkToken true by itself", async () => {
    const { sdk } = loadSdk({
      flavor: "turbo",
      native: {
        hasDeepLinkToken: async () => false,
        getClipboardString: async () => "dln://x",
      },
    });
    await expect(sdk.hasDeepLinkToken()).resolves.toBe(false);
  });

  it("RN-14: without a native module hasDeepLinkToken resolves false", async () => {
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(sdk.hasDeepLinkToken()).resolves.toBe(false);
  });

  it("RN-15 / SDK-40: checkClipboard returns the native result only", async () => {
    const { sdk, native } = loadSdk({
      flavor: "expo",
      native: {
        checkClipboard: async () => "https://myapp.deeplinknow.com/p?x=1",
      },
    });
    await expect(sdk.checkClipboard()).resolves.toBe(
      "https://myapp.deeplinknow.com/p?x=1"
    );
    expect(native.getClipboardString).not.toHaveBeenCalled();
  });

  it("RN-15 / SDK-33: no JS substring fallback when native returns null (lookalike stays rejected)", async () => {
    mockFetch({ init: { body: INIT_BODY } });
    const { sdk, native } = loadSdk({
      flavor: "bridge",
      native: {
        checkClipboard: async () => null,
        getClipboardString: async () => "https://deeplinknow.com.evil.com/x",
      },
    });
    await sdk.initialize(KEY);
    await expect(sdk.checkClipboard()).resolves.toBeNull();
    expect(native.getClipboardString).not.toHaveBeenCalled();
  });

  it("RN-15: a native checkClipboard rejection does not fall back to reading the clipboard from JS", async () => {
    const { sdk, native } = loadSdk({
      flavor: "bridge",
      native: { checkClipboard: async () => Promise.reject(new Error("x")) },
    });
    await expect(sdk.checkClipboard()).resolves.toBeNull();
    expect(native.getClipboardString).not.toHaveBeenCalled();
  });

  it("SDK-40: with no native module checkClipboard resolves null", async () => {
    const { sdk } = loadSdk({ flavor: "none" });
    await expect(sdk.checkClipboard()).resolves.toBeNull();
  });

  it("RN-17 / SDK-43: no SDK flow writes to the clipboard", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    await sdk.checkDeferredDeepLink();
    await sdk.checkClipboard();
    await sdk.hasDeepLinkToken();
    await sdk.findDeferredUser();
    await sdk.resetDeferredDeepLink();
    expect(native.setClipboardString).not.toHaveBeenCalled();
  });

  it("SDK-42: the JS layer never reads clipboard content at init or on its own", async () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    await sdk.initialize(KEY);
    await sdk.findDeferredUser();
    expect(native.checkClipboard).not.toHaveBeenCalled();
    expect(native.getClipboardString).not.toHaveBeenCalled();
  });

  it("SDK-44: non-DLN clipboard content is never logged", async () => {
    const secret = "my bank password 1234";
    const { sdk } = loadSdk({
      flavor: "expo",
      native: { getClipboardString: async () => secret },
    });
    await sdk.initialize(KEY, { enableLogs: true });
    await sdk.checkClipboard();
    await sdk.hasDeepLinkToken();
    expect(allLogText(spies)).not.toContain(secret);
  });

  it("SDK-45: useClipboard is forwarded so native can skip/continue; a declined paste is not an error at JS level", async () => {
    const { sdk, native } = loadSdk({
      flavor: "expo",
      native: { checkDeferredDeepLink: async () => null },
    });
    await sdk.initialize(KEY);
    await expect(
      sdk.checkDeferredDeepLink({ useClipboard: true })
    ).resolves.toBeNull();
    expect(native.checkDeferredDeepLink).toHaveBeenCalledWith({
      useClipboard: true,
    });
  });
});
