import {
  INIT_BODY,
  loadSdk,
  MATCH_BODY,
  mockFetch,
  omit,
  silenceConsole,
  wireMatch,
} from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

describe("findDeferredUser", () => {
  beforeEach(() => {
    silenceConsole();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["expo", "ios"],
    ["expo", "android"],
    ["turbo", "ios"],
    ["turbo", "android"],
    ["bridge", "ios"],
    ["bridge", "android"],
  ] as const)(
    "RN-03 / SDK-81: %s on %s returns the snake_case wire shape incl. match_quality, query_params, full_path",
    async (flavor, os) => {
      const { sdk } = loadSdk({ flavor, os });
      await sdk.initialize(KEY);
      const res = await sdk.findDeferredUser();
      expect(res).toEqual(MATCH_BODY);
      const [m] = res.matches;
      expect(m.confidence_score).toBe(87);
      expect(m.match_quality).toBe("HIGH");
      expect(m.match_details.ip_match).toEqual({ matched: true, score: 100 });
      expect(m.deeplink.target_url).toBeDefined();
      expect(m.deeplink.query_params).toEqual({
        ref: "newsletter",
        code: "SAVE20",
      });
      expect(m.deeplink.full_path).toBe(
        "/products/123?ref=newsletter&code=SAVE20"
      );
      expect(res.ttl_seconds).toBe(3600);
    }
  );

  it("RN-03: a camelCase payload from native is rejected as invalidResponse, not passed through", async () => {
    const { sdk } = loadSdk({
      flavor: "expo",
      native: {
        findDeferredUser: async () => ({
          ttlSeconds: 3600,
          matches: [{ confidenceScore: 80, matchDetails: {} }],
        }),
      },
    });
    await sdk.initialize(KEY);
    await expect(sdk.findDeferredUser()).rejects.toMatchObject({
      code: "invalidResponse",
    });
  });

  it("RN-03: the fallback returns the same snake_case shape as native", async () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: MATCH_BODY } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    await expect(sdk.findDeferredUser()).resolves.toEqual(MATCH_BODY);
  });

  it("SDK-20: every candidate is returned, unfiltered and in server order, incl. ones without a deeplink", async () => {
    const body = {
      matches: [wireMatch(31, {}, null), wireMatch(90), wireMatch(45)],
      ttl_seconds: 3600,
    };
    mockFetch({ init: { body: INIT_BODY }, match: { body } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    const res = await sdk.findDeferredUser();
    expect(res.matches.map((m: any) => m.confidence_score)).toEqual([
      31, 90, 45,
    ]);
  });

  it("SDK-20: zero matches is a successful empty response", async () => {
    mockFetch({
      init: { body: INIT_BODY },
      match: { body: { matches: [], ttl_seconds: 3600 } },
    });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    await expect(sdk.findDeferredUser()).resolves.toEqual({
      matches: [],
      ttl_seconds: 3600,
    });
  });

  it("SDK-16: the fallback derives match_quality when an older server omits it", async () => {
    const ms = [wireMatch(80), wireMatch(55), wireMatch(31)].map((m) =>
      omit(m, "match_quality")
    );
    mockFetch({
      init: { body: INIT_BODY },
      match: { body: { matches: ms, ttl_seconds: 3600 } },
    });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    const res = await sdk.findDeferredUser();
    expect(res.matches.map((m: any) => m.match_quality)).toEqual([
      "HIGH",
      "MEDIUM",
      "LOW",
    ]);
  });

  it("SDK-51: malformed /match body rejects invalidResponse", async () => {
    mockFetch({ init: { body: INIT_BODY }, match: { body: { nope: true } } });
    const { sdk } = loadSdk({ flavor: "none" });
    await sdk.initialize(KEY);
    await expect(sdk.findDeferredUser()).rejects.toMatchObject({
      code: "invalidResponse",
    });
  });

  it("SDK-06: findDeferredUser waits for an in-flight fallback init", async () => {
    const fetchMock = mockFetch({
      init: { body: INIT_BODY },
      match: { body: MATCH_BODY },
    });
    const { sdk } = loadSdk({ flavor: "none" });
    sdk.initialize(KEY);
    await expect(sdk.findDeferredUser()).resolves.toEqual(MATCH_BODY);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/init$/);
  });

  it("CONFIDENCE_THRESHOLDS matches the server labels (HIGH 75, MEDIUM 50, LOW floor 30)", () => {
    const { mod } = loadSdk({ flavor: "expo" });
    expect(mod.CONFIDENCE_THRESHOLDS).toEqual({
      HIGH: 75,
      MEDIUM: 50,
      LOW: 30,
    });
  });
});
