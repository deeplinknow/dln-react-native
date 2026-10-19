/**
 * Test helpers for the React Native SDK.
 *
 * The SDK picks its native module once, at import time (Expo → Turbo → bridge → none),
 * so every test loads a fresh copy of `src/index.ts` with `loadSdk()` and mocks
 * `react-native` / `expo-modules-core` for the flavor under test.
 */

export type Flavor = "expo" | "turbo" | "bridge" | "none";

export interface LoadOptions {
  flavor?: Flavor;
  native?: Record<string, any>;
  os?: "ios" | "android";
}

export const APP_INFO = {
  id: "app-1",
  alias: "myapp",
  domains: ["myapp.deeplinknow.com", "go.myapp.com"],
  accountStatus: "active",
  creditsRemaining: 1000,
  rateLimits: { matches_per_second: 10, matches_per_day: 10_000 },
};

export const INIT_BODY = {
  app: {
    id: "app-1",
    alias: "myapp",
    name: "My App",
    timezone: "UTC",
    android_package_name: "com.myapp",
    android_sha256_cert: null,
    android_sha256_certificates: [],
    ios_bundle_id: "com.myapp",
    ios_app_store_id: "123",
    ios_app_prefix: "ABCDE12345",
    custom_domains: [
      { domain: "Go.MyApp.com", verified: true },
      { domain: "pending.myapp.com", verified: false },
      { domain: "null.myapp.com", verified: null },
    ],
  },
  account: {
    status: "active",
    credits_remaining: 1000,
    rate_limits: { matches_per_second: 10, matches_per_day: 10_000 },
  },
};

export const MATCH_DETAILS = {
  ip_match: { matched: true, score: 100 },
  device_match: {
    matched: true,
    score: 75,
    components: {
      platform: true,
      os_version: true,
      device_model: true,
      hardware_fingerprint: false,
    },
  },
  time_proximity: { score: 90, time_difference_minutes: 3 },
  locale_match: {
    matched: true,
    score: 20,
    components: { language: true, timezone: true },
  },
};

/** A copy of `obj` without `keys`, in the same key order (an older server omitting fields). */
export function omit<T extends object>(obj: T, ...keys: string[]): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keys.includes(k))
  ) as T;
}

export function wireMatch(
  score: number,
  overrides: Record<string, any> = {},
  deeplinkOverrides: Record<string, any> | null = {}
) {
  return {
    confidence_score: score,
    match_quality: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    match_details: MATCH_DETAILS,
    deeplink:
      deeplinkOverrides === null
        ? undefined
        : {
            id: `dl-${score}`,
            target_url: "products/123?code=SAVE20&ref=newsletter",
            metadata: { title: "Product" },
            campaign_id: "camp-1",
            matched_at: "2026-10-18T10:05:00Z",
            expires_at: "2026-10-18T11:00:00Z",
            query_params: { ref: "newsletter", code: "SAVE20" },
            full_path: "/products/123?ref=newsletter&code=SAVE20",
            ...deeplinkOverrides,
          },
    ...overrides,
  };
}

export const MATCH_BODY = {
  matches: [wireMatch(87), wireMatch(55)],
  ttl_seconds: 3600,
};

export function deferredLink(overrides: Record<string, any> = {}) {
  return {
    path: "/products/123",
    queryParams: { ref: "newsletter", code: "SAVE20" },
    fullPath: "/products/123?ref=newsletter&code=SAVE20",
    url: "https://myapp.deeplinknow.com/products/123?ref=newsletter&code=SAVE20",
    source: "referrer",
    confidenceScore: 100,
    matchQuality: "HIGH",
    deeplinkId: "dl-1",
    targetUrl: "products/123?code=SAVE20&ref=newsletter",
    campaignId: "camp-1",
    metadata: {},
    matchedAt: "2026-10-18T10:05:00Z",
    expiresAt: "2026-10-18T11:00:00Z",
    ...overrides,
  };
}

/** A mock of every method in src/specs/NativeDeepLinkNow.ts. */
export function createNativeMock(overrides: Record<string, any> = {}) {
  let initialized = false;
  const mock: Record<string, jest.Mock> = {
    // legacy
    initialize: jest.fn(async () => true),
    // new
    initializeWithConfig: jest.fn(async () => {
      initialized = true;
      return APP_INFO;
    }),
    isInitialized: jest.fn(() => initialized),
    checkDeferredDeepLink: jest.fn(async () => null),
    resetDeferredDeepLink: jest.fn(async () => true),
    findDeferredUser: jest.fn(async () => MATCH_BODY),
    getReferrerData: jest.fn(async () => null),
    isValidDomain: jest.fn(
      (host: string) => host.toLowerCase() === "myapp.deeplinknow.com"
    ),
    checkClipboard: jest.fn(async () => null),
    hasDeepLinkToken: jest.fn(async () => false),
    parseDeepLink: jest.fn(() => null),
    getClipboardString: jest.fn(async () => "https://evil.com"),
    setClipboardString: jest.fn(async () => true),
    hasClipboardString: jest.fn(() => true),
    processInstallReferrer: jest.fn(async () => null),
    getCachedReferrerData: jest.fn(() => null),
    clearReferrerCache: jest.fn(() => true),
    getDeferredDeepLink: jest.fn(() => null),
  };
  for (const [k, v] of Object.entries(overrides)) {
    mock[k] =
      typeof v === "function" && !jest.isMockFunction(v) ? jest.fn(v) : v;
  }
  return mock;
}

export interface FakeResponseInit {
  body?: any;
  headers?: Record<string, string>;
  raw?: string;
  status?: number;
}

export function fakeResponse({
  status = 200,
  body,
  headers = {},
  raw,
}: FakeResponseInit) {
  const text = raw ?? (body === undefined ? "" : JSON.stringify(body));
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

/** Installs a fetch mock that answers by endpoint (`init`, `match`, …). */
export function mockFetch(
  routes: Record<string, FakeResponseInit | FakeResponseInit[] | Error>
) {
  const counters: Record<string, number> = {};
  const fn = jest.fn(async (url: string) => {
    const endpoint = String(url).split("/api/v1/sdk/")[1]?.split("?")[0] ?? "";
    const route = routes[endpoint];
    if (route === undefined) {
      throw new Error(`unexpected fetch ${url}`);
    }
    if (route instanceof Error) {
      throw route;
    }
    if (Array.isArray(route)) {
      const i = counters[endpoint] ?? 0;
      counters[endpoint] = i + 1;
      const r = route[Math.min(i, route.length - 1)];
      return fakeResponse(r);
    }
    return fakeResponse(route);
  });
  (global as any).fetch = fn;
  return fn;
}

export function loadSdk(opts: LoadOptions = {}) {
  const flavor: Flavor = opts.flavor ?? "expo";
  const os = opts.os ?? "ios";
  const native = flavor === "none" ? null : createNativeMock(opts.native);

  jest.resetModules();

  jest.doMock("expo-modules-core", () => ({
    requireOptionalNativeModule: jest.fn((name: string) =>
      flavor === "expo" && name === "DeepLinkNow" ? native : null
    ),
    requireNativeModule: jest.fn((name: string) => {
      if (flavor === "expo" && name === "DeepLinkNow") {
        return native;
      }
      throw new Error(`Cannot find native module '${name}'`);
    }),
  }));

  jest.doMock("react-native", () => ({
    Platform: {
      OS: os,
      Version: os === "ios" ? "17.4" : 34,
      select: (o: Record<string, any>) => (os in o ? o[os] : o.default),
    },
    NativeModules: {
      DeepLinkNow: flavor === "bridge" ? native : undefined,
      PlatformConstants: { osVersion: "17.4.1" },
    },
    TurboModuleRegistry: {
      get: jest.fn((name: string) =>
        flavor === "turbo" && name === "DeepLinkNow" ? native : null
      ),
      getEnforcing: jest.fn((name: string) => {
        if (flavor === "turbo" && name === "DeepLinkNow") {
          return native;
        }
        throw new Error(`TurboModuleRegistry.getEnforcing(...): '${name}'`);
      }),
    },
    Dimensions: {
      get: () => ({ width: 393, height: 852, scale: 3 }),
    },
  }));

  (global as any).__turboModuleProxy =
    flavor === "turbo" ? () => null : undefined;

  const mod = require("../../index");
  return { sdk: mod.default, mod, native: native as Record<string, jest.Mock> };
}

export function silenceConsole() {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  return { warn, log, error };
}

export function allLogText(spies: ReturnType<typeof silenceConsole>) {
  return [spies.warn, spies.log, spies.error]
    .flatMap((s) => s.mock.calls)
    .map((args) =>
      args
        .map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ")
    )
    .join("\n");
}
