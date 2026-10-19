import {
  INIT_BODY,
  loadSdk,
  mockFetch,
  silenceConsole,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

describe("parseDeepLink / isValidDomain (native)", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it("RN-16 / SDK-30: returns the native result synchronously and adds the deprecated `parameters` alias", () => {
    const parsed = {
      path: "/t",
      queryParams: { tag: ["a", "b"], debug: true, q: "x" },
      fullPath: "/t?tag=a&tag=b&debug&q=x",
      url: "https://myapp.deeplinknow.com/t?tag=a&tag=b&debug&q=x",
    };
    const { sdk, native } = loadSdk({
      flavor: "expo",
      native: { parseDeepLink: () => parsed },
    });
    const res = sdk.parseDeepLink(parsed.url);
    expect(res).not.toBeInstanceOf(Promise);
    expect(res).toMatchObject(parsed);
    expect(res.parameters).toEqual({ tag: "b", debug: "", q: "x" });
    expect(native.parseDeepLink).toHaveBeenCalledWith(parsed.url);
  });

  it("RN-16: a Promise or a wrongly-shaped object from native is not treated as a result", () => {
    const a = loadSdk({
      flavor: "bridge",
      native: { parseDeepLink: () => Promise.resolve({}) },
    });
    expect(a.sdk.parseDeepLink("https://myapp.deeplinknow.com/x")).toBeNull();
    const b = loadSdk({
      flavor: "bridge",
      native: { parseDeepLink: () => ({ foo: 1 }) },
    });
    expect(b.sdk.parseDeepLink("https://myapp.deeplinknow.com/x")).toBeNull();
  });

  it("RN-16 / SDK-31: native null is final; no JS host check runs behind it", async () => {
    mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({
      flavor: "expo",
      native: { parseDeepLink: () => null },
    });
    await sdk.initialize(KEY);
    expect(sdk.parseDeepLink("https://myapp.deeplinknow.com/x")).toBeNull();
  });

  it("RN-16: a throwing native parseDeepLink returns null instead of crashing (SDK-50)", () => {
    const { sdk } = loadSdk({
      flavor: "turbo",
      native: {
        parseDeepLink: () => {
          throw new Error("sync methods unavailable under remote debugging");
        },
      },
    });
    expect(sdk.parseDeepLink("https://myapp.deeplinknow.com/x")).toBeNull();
  });

  it("SDK-38: isValidDomain delegates to the native host rule", () => {
    const { sdk, native } = loadSdk({ flavor: "expo" });
    expect(sdk.isValidDomain("MyApp.DeepLinkNow.com")).toBe(true);
    expect(native.isValidDomain).toHaveBeenCalledWith("MyApp.DeepLinkNow.com");
  });
});

describe("parseDeepLink / isValidDomain (JS fallback)", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  async function initialized() {
    mockFetch({ init: { body: INIT_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    return sdk;
  }

  // FLOW-56 worked examples (docs/product/deferred-deep-linking.md §2.7)
  it.each([
    [
      "/products/123?ref=newsletter&code=SAVE20",
      "/products/123",
      { ref: "newsletter", code: "SAVE20" },
    ],
    ["/s?q=red+shoes", "/s", { q: "red shoes" }],
    ["/s?q=a%2Bb", "/s", { q: "a+b" }],
    ["/caf%C3%A9?n=Jos%C3%A9", "/caf%C3%A9", { n: "José" }],
    ["/t?tag=a&tag=b&tag=", "/t", { tag: ["a", "b", ""] }],
    ["/promo?debug&code=X", "/promo", { debug: true, code: "X" }],
    ["/b?z=1&a=2", "/b", { z: "1", a: "2" }],
    ["/u@x/a,b;c?e=%40", "/u@x/a,b;c", { e: "@" }],
    ["/", "/", {}],
  ])(
    "SDK-34 / SDK-35 / SDK-36: %s → path %s",
    async (raw, path, queryParams) => {
      const sdk = await initialized();
      const url = `https://myapp.deeplinknow.com${raw}`;
      const res = sdk.parseDeepLink(url);
      expect(res).toMatchObject({ path, queryParams, fullPath: raw, url });
      expect(Object.keys(res.queryParams)).toEqual(Object.keys(queryParams));
    }
  );

  it("SDK-34: an empty path becomes /, a trailing slash is kept, the fragment is excluded", async () => {
    const sdk = await initialized();
    expect(sdk.parseDeepLink("https://myapp.deeplinknow.com")).toMatchObject({
      path: "/",
      fullPath: "/",
    });
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com?a=1")
    ).toMatchObject({
      path: "/",
      fullPath: "/?a=1",
      queryParams: { a: "1" },
    });
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com/a/b/#frag?x=1")
    ).toMatchObject({
      path: "/a/b/",
      fullPath: "/a/b/",
      queryParams: {},
    });
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com/a?x=1#y=2")
    ).toMatchObject({
      fullPath: "/a?x=1",
      queryParams: { x: "1" },
    });
  });

  it("SDK-35: keys are case-sensitive; ?k= is a flag; invalid percent escapes don't throw", async () => {
    const sdk = await initialized();
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com/?A=1&a=2&k=")!
        .queryParams
    ).toEqual({
      A: "1",
      a: "2",
      k: true,
    });
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com/?p=100%&q=%E0%A4%A")!
        .queryParams
    ).toEqual({
      p: "100%",
      q: "\uFFFD%A",
    });
  });

  it("SDK-36: malformed input returns null and never throws", async () => {
    const sdk = await initialized();
    for (const bad of [
      "",
      "   ",
      "not a url",
      "https://",
      "https:///path",
      "https://my app.deeplinknow.com/",
      null,
      undefined,
      42,
    ]) {
      expect(() => sdk.parseDeepLink(bad as any)).not.toThrow();
      expect(sdk.parseDeepLink(bad as any)).toBeNull();
    }
  });

  it("SDK-31: host is matched case-insensitively, ignoring a trailing dot and port", async () => {
    const sdk = await initialized();
    expect(sdk.parseDeepLink("https://MyApp.DeepLinkNow.COM/x")).not.toBeNull();
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com./x")
    ).not.toBeNull();
    expect(sdk.parseDeepLink("https://go.myapp.com:443/x")).not.toBeNull();
    expect(sdk.isValidDomain("GO.MYAPP.COM")).toBe(true);
    expect(sdk.isValidDomain("myapp.deeplinknow.com.")).toBe(true);
  });

  it("SDK-31: other tenants, apex, reserved subdomains and *.deeplink.now are rejected after init", async () => {
    const sdk = await initialized();
    for (const host of [
      "otherapp.deeplinknow.com",
      "deeplinknow.com",
      "www.deeplinknow.com",
      "app.deeplinknow.com",
      "api.deeplinknow.com",
      "docs.deeplinknow.com",
      "m.deeplinknow.com",
      "mail.deeplinknow.com",
      "myapp.deeplink.now",
      "deeplink.now",
      "pending.myapp.com",
    ]) {
      expect(sdk.isValidDomain(host)).toBe(false);
      expect(sdk.parseDeepLink(`https://${host}/x`)).toBeNull();
    }
  });

  it("SDK-32: only http(s) schemes are accepted", async () => {
    const sdk = await initialized();
    expect(sdk.parseDeepLink("http://myapp.deeplinknow.com/x")).not.toBeNull();
    for (const u of [
      "myapp://myapp.deeplinknow.com/x",
      "dln://myapp.deeplinknow.com/x",
      "mailto:a@myapp.deeplinknow.com",
      "/relative/path",
      "myapp.deeplinknow.com/x",
      "//myapp.deeplinknow.com/x",
    ]) {
      expect(sdk.parseDeepLink(u)).toBeNull();
    }
  });

  it("SDK-33: lookalike hosts are rejected (parsed host, no substring checks)", async () => {
    const sdk = await initialized();
    for (const u of [
      "https://deeplinknow.com.evil.com/x",
      "https://evil-deeplinknow.com/x",
      "https://evildeeplinknow.com/x",
      "https://evil.com/?u=x.deeplinknow.com",
      "https://evil.com#a.deeplinknow.com",
      "https://a.deeplinknow.com@evil.com/",
      "https://myapp.deeplinknow.com@evil.com/",
      "https://go.myapp.com.evil.com/",
      "https://myapp.deeplink.now/",
      "https://otherapp.deeplinknow.com/",
    ]) {
      expect(sdk.parseDeepLink(u)).toBeNull();
    }
  });

  it("SDK-37: before init, any non-reserved *.deeplinknow.com host is provisionally accepted; custom domains and deeplink.now are not", () => {
    const { sdk } = loadSdk({ flavor: "none" });
    expect(sdk.isValidDomain("anyapp.deeplinknow.com")).toBe(true);
    expect(sdk.isValidDomain("AnyApp.DeepLinkNow.com")).toBe(true);
    expect(
      sdk.parseDeepLink("https://anyapp.deeplinknow.com/p?x=1")
    ).toMatchObject({ path: "/p" });
    for (const host of [
      "deeplinknow.com",
      "www.deeplinknow.com",
      "api.deeplinknow.com",
      "go.myapp.com",
      "myapp.deeplink.now",
      "evildeeplinknow.com",
    ]) {
      expect(sdk.isValidDomain(host)).toBe(false);
    }
  });

  it("SDK-38: isValidDomain applies exactly the parseDeepLink host rule", async () => {
    const sdk = await initialized();
    for (const host of [
      "myapp.deeplinknow.com",
      "go.myapp.com",
      "x.deeplinknow.com",
      "evil.com",
    ]) {
      expect(sdk.isValidDomain(host)).toBe(
        sdk.parseDeepLink(`https://${host}/`) !== null
      );
    }
  });

  it("SDK-30: parseDeepLink makes no network request and reads no clipboard", async () => {
    const sdk = await initialized();
    const fetchMock = (global as any).fetch as jest.Mock;
    const before = fetchMock.mock.calls.length;
    sdk.parseDeepLink("https://myapp.deeplinknow.com/x");
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("RN-16: legacy `parameters` alias is a flat string map (last value wins, flags are empty strings)", async () => {
    const sdk = await initialized();
    expect(
      sdk.parseDeepLink("https://myapp.deeplinknow.com/t?a=1&a=2&f")!.parameters
    ).toEqual({
      a: "2",
      f: "",
    });
  });
});
