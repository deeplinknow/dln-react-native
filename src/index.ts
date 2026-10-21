import { NativeModules, Platform } from "react-native";

import {
  deferredFromMatch,
  isDeferredDeepLinkShape,
  isMatchResponseShape,
  isParsedDeepLinkShape,
  isTrustedHost,
  normalizeHost,
  parseDeepLinkJS,
  qualityForScore,
  toLegacyParameters,
} from "./deeplink";
import { codeForStatus, DLNError, toDLNError } from "./errors";
import type {
  DeferredDeepLink,
  DeferredDeepLinkOptions,
  DLNAppInfo,
  Fingerprint,
  InitResponse,
  MatchResponse,
  ParsedDeepLink,
  ReferrerData,
} from "./types";
import {
  type UseDeferredDeepLinkOptions,
  type UseDeferredDeepLinkResult,
  useDeferredDeepLinkFor,
} from "./use-deferred-deep-link";

// ============================================
// Module Detection: Expo → TurboModule → Bridge
// ============================================

type ModuleType = "expo" | "turbo" | "bridge" | "none";

/** `NativeModules` can be missing outside a React Native runtime (web or test shims). */
const nativeModules: typeof NativeModules | undefined = NativeModules;

/**
 * The JS surface shared by the Expo, TurboModule and bridge modules. Results cross the
 * native boundary, so each call site validates what comes back.
 */
interface NativeDeepLinkNowModule {
  checkClipboard: () => Promise<unknown>;
  checkDeferredDeepLink: (options: DeferredDeepLinkOptions) => Promise<unknown>;
  findDeferredUser: () => Promise<unknown>;
  getReferrerData: () => Promise<unknown>;
  hasDeepLinkToken: () => Promise<unknown>;
  initializeWithConfig: (
    apiKey: string,
    config: Record<string, unknown>
  ) => Promise<unknown>;
  isInitialized?: () => unknown;
  isValidDomain: (host: string) => unknown;
  parseDeepLink: (url: string) => unknown;
  resetDeferredDeepLink: () => Promise<unknown>;
}

interface NativeModuleResult {
  module: NativeDeepLinkNowModule | null;
  type: ModuleType;
}

/** Globals that only exist when the New Architecture's TurboModule system is active. */
interface TurboModuleGlobals {
  __turboModuleProxy?: unknown;
  RN$Bridgeless?: unknown;
}

function getNativeModule(): NativeModuleResult {
  // 1. Expo module (Expo projects, incl. bare apps using expo-modules-core)
  try {
    // Dynamic require so non-Expo apps don't need expo-modules-core.
    const core = require("expo-modules-core");
    const ExpoModule =
      typeof core.requireOptionalNativeModule === "function"
        ? core.requireOptionalNativeModule("DeepLinkNow")
        : core.requireNativeModule("DeepLinkNow");
    if (ExpoModule) {
      return { module: ExpoModule, type: "expo" };
    }
  } catch {
    // expo-modules-core not installed or module not registered
  }

  // 2. TurboModule (New Architecture). Only when the TurboModule system is active,
  //    so a legacy bridge module is not reported as "turbo".
  try {
    const g = globalThis as TurboModuleGlobals;
    if (
      (g.__turboModuleProxy !== undefined && g.__turboModuleProxy !== null) ||
      g.RN$Bridgeless === true
    ) {
      const NativeDeepLinkNow = require("./specs/NativeDeepLinkNow").default;
      if (NativeDeepLinkNow) {
        return { module: NativeDeepLinkNow, type: "turbo" };
      }
    }
  } catch {
    // TurboModule not available
  }

  // 3. Legacy NativeModules (Old Architecture)
  if (nativeModules?.DeepLinkNow) {
    return { module: nativeModules.DeepLinkNow, type: "bridge" };
  }

  // 4. None (e.g. Expo Go): degraded JS REST fallback
  return { module: null, type: "none" };
}

const { module: DeepLinkNowModule, type: moduleType } = getNativeModule();

/**
 * Get the type of native module being used.
 * @returns "expo" | "turbo" | "bridge" | "none"
 */
export function getModuleType(): ModuleType {
  return moduleType;
}

/**
 * Whether a native module is linked. When false (e.g. Expo Go), the SDK runs a degraded
 * JS-only mode: fingerprint matching works, install referrer and clipboard do not.
 */
export function isNativeModuleAvailable(): boolean {
  return moduleType !== "none";
}

export type { DLNErrorCode } from "./errors";
export { DLN_ERROR_CODES, DLNError } from "./errors";
export type {
  ConfidenceLevel,
  DeeplinkMatch,
  DeferredDeepLink,
  DeferredDeepLinkOptions,
  DeferredDeepLinkSource,
  DLNAppInfo,
  Fingerprint,
  FingerprintMatch,
  InitResponse,
  Match,
  MatchDetails,
  MatchQuality,
  MatchRequestBody,
  MatchResponse,
  ParsedDeepLink,
  QueryParams,
  QueryValue,
  ReferrerData,
  ReferrerDeeplinkMatch,
} from "./types";
export { CONFIDENCE_THRESHOLDS } from "./types";
export type {
  UseDeferredDeepLinkOptions,
  UseDeferredDeepLinkResult,
} from "./use-deferred-deep-link";

export interface DeepLinkNowConfig {
  /** @deprecated Ignored. Pass the key as the first argument of `initialize`. */
  apiKey?: string;
  /** API base URL. Default `https://deeplinknow.com`. A trailing `/` is fine. */
  baseUrl?: string;
  /** Debug logs with the `[DeepLinkNow]` prefix. Default false. */
  enableLogs?: boolean;
  /** Retries for transient failures (network, 5xx, 429). Default 2. */
  retryAttempts?: number;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
}

export type DeferredUserResponse = MatchResponse;

const DEFAULTS = {
  enableLogs: false,
  baseUrl: "https://deeplinknow.com",
  timeoutMs: 10_000,
  retryAttempts: 2,
};

/**
 * `/init` as received. `request()` guarantees an object; every field is checked before use,
 * so nothing in it is assumed present.
 */
interface InitWireResponse {
  account?: Partial<InitResponse["account"]>;
  app?: Partial<InitResponse["app"]>;
}

const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

function maskKey(key: string): string {
  if (!key) {
    return "";
  }
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "…";
}

/** The everyday entry points whose failures are recorded in `lastError` (SDK-85). */
type FailureKind = "initialize" | "checkDeferredDeepLink" | "findDeferredUser";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

class DeepLinkNow {
  private config = { ...DEFAULTS };
  private apiKey: string | null = null;

  /** The internal init, which rejects on failure (used by `ensureInitialized`). */
  private initPromise: Promise<DLNAppInfo> | null = null;
  /** What `initialize` hands back for `initPromise`: never rejects (SDK-85). */
  private publicInitPromise: Promise<DLNAppInfo | null> | null = null;
  private initSignature: string | null = null;
  private appInfo: DLNAppInfo | null = null;
  private initError: DLNError | null = null;
  private lastFailure: { kind: FailureKind; error: DLNError } | null = null;

  // JS fallback state (no native module)
  private fallbackDomains: Set<string> | null = null;
  private fallbackDeferredDone = false;
  private fallbackInFlight: Promise<DeferredDeepLink | null> | null = null;
  private degradedWarned = false;
  private readonly installTime: string = new Date().toISOString();

  private log(...args: unknown[]) {
    if (this.config.enableLogs) {
      console.log("[DeepLinkNow]", ...args);
    }
  }

  private warn(...args: unknown[]) {
    console.warn("[DeepLinkNow]", ...args);
  }

  private warnDegradedOnce() {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive; Biome types the field as its `false` initializer, but the next line sets it to true.
    if (this.degradedWarned) {
      return;
    }
    this.degradedWarned = true;
    this.warn(
      "Native module not available (e.g. Expo Go, or the app was not rebuilt after installing). " +
        "Running in degraded JS mode: install referrer and clipboard are unavailable, " +
        "only fingerprint matching works." +
        Platform.select({
          ios: " Run 'cd ios && pod install' and rebuild.",
          default: "",
        })
    );
  }

  // ============================================
  // Errors (SDK-85)
  // ============================================

  /**
   * The typed error (SDK-55) from the most recent failed `initialize`,
   * `checkDeferredDeepLink` or `findDeferredUser`, or null. Those calls never reject: they
   * resolve null on failure and record the error here. The next successful call of the same
   * kind clears it.
   */
  get lastError(): DLNError | null {
    return this.lastFailure?.error ?? null;
  }

  private recordFailure(kind: FailureKind, e: unknown): null {
    const error = toDLNError(e);
    this.lastFailure = { kind, error };
    this.warn(`${kind} failed (${error.code}): ${error.message}`);
    return null;
  }

  private recordSuccess(kind: FailureKind) {
    if (this.lastFailure?.kind === kind) {
      this.lastFailure = null;
    }
  }

  // ============================================
  // Initialization
  // ============================================

  /**
   * Validates the API key and loads the app's link domains. Makes exactly one `/init`
   * request (through the native SDK when it is linked).
   *
   * Resolves with the app info, or with null on failure. It never rejects (SDK-85): the
   * failure is logged as a warning and kept in `lastError` (`invalidApiKey`,
   * `accountInactive`, `noCredits`, `rateLimited`, `network`, `server`, `invalidResponse`).
   */
  initialize(
    apiKey: string,
    config?: DeepLinkNowConfig
  ): Promise<DLNAppInfo | null> {
    if (!apiKey || typeof apiKey !== "string") {
      return Promise.resolve(
        this.recordFailure(
          "initialize",
          new DLNError(
            "invalidApiKey",
            "initialize() requires a non-empty API key"
          )
        )
      );
    }

    const passed: Record<string, unknown> = {};
    if (config?.enableLogs !== undefined) {
      passed.enableLogs = !!config.enableLogs;
    }
    if (config?.baseUrl !== undefined) {
      passed.baseUrl = config.baseUrl;
    }
    if (config?.timeoutMs !== undefined) {
      passed.timeoutMs = config.timeoutMs;
    }
    if (config?.retryAttempts !== undefined) {
      passed.retryAttempts = config.retryAttempts;
    }

    const signature = `${apiKey}\u0000${JSON.stringify(passed)}`;
    if (
      this.initPromise &&
      this.publicInitPromise &&
      this.initSignature === signature &&
      !this.appInfo &&
      !this.initError
    ) {
      // SDK-07: share an identical in-flight request.
      return this.publicInitPromise;
    }

    this.config = { ...DEFAULTS, ...(passed as Partial<typeof DEFAULTS>) };
    this.apiKey = apiKey;
    this.appInfo = null;
    this.initError = null;
    this.log(`Initializing (module: ${moduleType}, key: ${maskKey(apiKey)})`);

    const run = DeepLinkNowModule
      ? this.nativeInit(DeepLinkNowModule, apiKey, passed)
      : this.restInit();

    const p: Promise<DLNAppInfo> = run.then(
      (info) => {
        if (this.initPromise === p) {
          this.appInfo = info;
          this.initError = null;
        }
        this.log(
          `Initialized app "${info.alias}" (domains: ${info.domains.join(", ")})`
        );
        return info;
      },
      (err) => {
        const e = toDLNError(err);
        if (this.initPromise === p) {
          this.appInfo = null;
          this.initError = e;
        }
        throw e;
      }
    );
    const publicPromise: Promise<DLNAppInfo | null> = p.then(
      (info) => {
        if (this.initPromise === p) {
          this.recordSuccess("initialize");
        }
        return info;
      },
      (err: unknown) => {
        if (this.initPromise === p) {
          return this.recordFailure("initialize", err);
        }
        // Superseded by a newer initialize: warn, but don't overwrite its outcome.
        this.warn(`Earlier initialize failed (${toDLNError(err).code})`);
        return null;
      }
    );
    this.initPromise = p;
    this.publicInitPromise = publicPromise;
    this.initSignature = signature;
    return publicPromise;
  }

  /** Whether a successful initialization has completed. */
  isInitialized(): boolean {
    if (this.initError) {
      return false;
    }
    if (this.appInfo) {
      return true;
    }
    if (DeepLinkNowModule && !this.initPromise) {
      // e.g. after a JS reload while native state survived
      try {
        return DeepLinkNowModule.isInitialized?.() === true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private async nativeInit(
    native: NativeDeepLinkNowModule,
    apiKey: string,
    passed: Record<string, unknown>
  ): Promise<DLNAppInfo> {
    let info: Partial<Record<keyof DLNAppInfo, unknown>> | null | undefined;
    try {
      info = (await native.initializeWithConfig(apiKey, passed)) as typeof info;
    } catch (e) {
      throw toDLNError(e);
    }
    if (
      !info ||
      typeof info.id !== "string" ||
      typeof info.alias !== "string" ||
      !Array.isArray(info.domains)
    ) {
      throw new DLNError(
        "invalidResponse",
        "Native init returned an unexpected value"
      );
    }
    return info as DLNAppInfo;
  }

  private async restInit(): Promise<DLNAppInfo> {
    this.warnDegradedOnce();
    this.baseUrl(); // validates (SDK-64)
    // BILL-20: no stable install-scoped id without native code, so send null and let the
    // server fall back to its header hash for MAU. Never invent or persist an id.
    const body = (await this.request("init", "POST", {
      device_id: null,
    })) as InitWireResponse;
    const { app } = body;
    if (
      !app ||
      typeof app.id !== "string" ||
      typeof app.alias !== "string" ||
      !app.alias
    ) {
      throw new DLNError("invalidResponse", "Unexpected /init response");
    }
    const domains: string[] = [`${app.alias.toLowerCase()}.deeplinknow.com`];
    for (const d of Array.isArray(app.custom_domains)
      ? app.custom_domains
      : []) {
      if (d && d.verified === true && typeof d.domain === "string") {
        const h = normalizeHost(d.domain);
        if (h && !domains.includes(h)) {
          domains.push(h);
        }
      }
    }
    this.fallbackDomains = new Set(domains);
    return {
      id: app.id,
      alias: app.alias,
      domains,
      accountStatus: body.account?.status ?? "active",
      creditsRemaining:
        typeof body.account?.credits_remaining === "number"
          ? body.account.credits_remaining
          : null,
      rateLimits: body.account?.rate_limits ?? null,
    };
  }

  /**
   * SDK-06 / SDK-04: wait for an in-flight init; reject `notInitialized` if there is no
   * successful init (carrying the init failure as `cause`).
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise && !this.appInfo && !this.initError) {
      try {
        await this.initPromise;
      } catch {
        // handled below
      }
    }
    if (this.isInitialized()) {
      return;
    }
    throw new DLNError(
      "notInitialized",
      this.initError
        ? `DeepLinkNow failed to initialize: ${this.initError.message}`
        : "Call DeepLinkNow.initialize(apiKey) first",
      { cause: this.initError ?? undefined }
    );
  }

  // ============================================
  // Deferred deep link
  // ============================================

  /**
   * The one call: runs the platform chain once per install and returns the deferred deep
   * link, or null when there is none. iOS: pasteboard → fingerprint. Android: install
   * referrer → fingerprint. Never rejects (SDK-85): a failure (offline, invalid key, not
   * initialized, …) also resolves null, is logged as a warning and is kept in `lastError`.
   */
  async checkDeferredDeepLink(
    // JS callers may pass null.
    options: DeferredDeepLinkOptions | null = {}
  ): Promise<DeferredDeepLink | null> {
    try {
      const link = await this.runCheckDeferredDeepLink(options);
      this.recordSuccess("checkDeferredDeepLink");
      return link;
    } catch (e) {
      return this.recordFailure("checkDeferredDeepLink", e);
    }
  }

  private async runCheckDeferredDeepLink(
    options: DeferredDeepLinkOptions | null
  ): Promise<DeferredDeepLink | null> {
    await this.ensureInitialized();

    const opts: DeferredDeepLinkOptions = {};
    if (options?.minConfidence !== undefined) {
      opts.minConfidence = options.minConfidence;
    }
    if (options?.useClipboard !== undefined) {
      opts.useClipboard = options.useClipboard;
    }
    if (options?.force !== undefined) {
      opts.force = options.force;
    }

    if (!DeepLinkNowModule) {
      return this.fallbackCheckDeferredDeepLink(opts);
    }

    let res: unknown;
    try {
      res = await DeepLinkNowModule.checkDeferredDeepLink(opts);
    } catch (e) {
      throw toDLNError(e);
    }
    if (res === null || res === undefined) {
      this.log("checkDeferredDeepLink: no deferred deep link");
      return null;
    }
    if (!isDeferredDeepLinkShape(res)) {
      throw new DLNError(
        "invalidResponse",
        "Native module returned an unexpected deferred deep link"
      );
    }
    const link: DeferredDeepLink = { ...res };
    if (link.deeplinkId && link.id === undefined) {
      link.id = link.deeplinkId;
    }
    this.log(
      `checkDeferredDeepLink: ${link.source} ${link.path} (confidence ${link.confidenceScore}, ${link.matchQuality})`
    );
    return link;
  }

  private fallbackCheckDeferredDeepLink(
    opts: DeferredDeepLinkOptions
  ): Promise<DeferredDeepLink | null> {
    this.warnDegradedOnce();
    if (!opts.force && this.fallbackDeferredDone) {
      this.log(
        "checkDeferredDeepLink: already checked on this launch (use force: true)"
      );
      return Promise.resolve(null);
    }
    if (this.fallbackInFlight) {
      return this.fallbackInFlight;
    }

    const run = (async () => {
      const response = await this.restMatch();
      for (const match of response.matches) {
        if (!match.deeplink) {
          continue;
        }
        if (
          opts.minConfidence !== undefined &&
          opts.minConfidence !== null &&
          match.confidence_score < opts.minConfidence
        ) {
          continue;
        }
        const link = deferredFromMatch(match, this.appInfo?.domains ?? []);
        if (!link) {
          continue;
        }
        this.fallbackDeferredDone = true;
        this.log(
          `fingerprint step: found ${link.path} (confidence ${link.confidenceScore}, ${link.matchQuality})`
        );
        return link;
      }
      this.fallbackDeferredDone = true;
      this.log("fingerprint step: no eligible candidate");
      return null;
    })();

    this.fallbackInFlight = run;
    const clear = () => {
      if (this.fallbackInFlight === run) {
        this.fallbackInFlight = null;
      }
    };
    run.then(clear, clear);
    return run;
  }

  /** Clears the first-launch flag and any cached referrer result (memory and disk). */
  async resetDeferredDeepLink(): Promise<void> {
    this.fallbackDeferredDone = false;
    if (!DeepLinkNowModule) {
      return;
    }
    try {
      await DeepLinkNowModule.resetDeferredDeepLink();
    } catch (e) {
      throw toDLNError(e);
    }
  }

  /** @deprecated Use `resetDeferredDeepLink()`. */
  async clearReferrerCache(): Promise<boolean> {
    try {
      await this.resetDeferredDeepLink();
      return true;
    } catch (e) {
      this.warn(
        "Failed to reset deferred deep link state:",
        (e as Error | null | undefined)?.message
      );
      return false;
    }
  }

  /**
   * Low level: every fingerprint candidate from `/sdk/match`, in the server's snake_case
   * shape (`confidence_score`, `match_quality`, `match_details`, `deeplink.full_path`, …).
   * Not filtered or reordered. Never rejects (SDK-85): a failure resolves null, is logged as
   * a warning and is kept in `lastError`. No candidates is `{ matches: [] }`, not null.
   */
  async findDeferredUser(): Promise<MatchResponse | null> {
    try {
      const res = await this.runFindDeferredUser();
      this.recordSuccess("findDeferredUser");
      return res;
    } catch (e) {
      return this.recordFailure("findDeferredUser", e);
    }
  }

  private async runFindDeferredUser(): Promise<MatchResponse> {
    await this.ensureInitialized();
    if (!DeepLinkNowModule) {
      return this.restMatch();
    }
    let res: unknown;
    try {
      res = await DeepLinkNowModule.findDeferredUser();
    } catch (e) {
      throw toDLNError(e);
    }
    if (!isMatchResponseShape(res)) {
      throw new DLNError(
        "invalidResponse",
        "Native module returned an unexpected match response"
      );
    }
    this.log(
      `findDeferredUser: ${(res as MatchResponse).matches.length} candidate(s)`
    );
    return res as MatchResponse;
  }

  /** Android only: the raw Play Install Referrer result. Resolves null on iOS. */
  async getReferrerData(): Promise<ReferrerData | null> {
    if (Platform.OS !== "android" || !DeepLinkNowModule) {
      return null;
    }
    try {
      await this.ensureInitialized();
    } catch (e) {
      this.warn((e as Error).message);
      return null;
    }
    try {
      const data = await DeepLinkNowModule.getReferrerData();
      return (data as ReferrerData | null | undefined) ?? null;
    } catch (e) {
      this.warn("Failed to get referrer data:", toDLNError(e).code);
      return null;
    }
  }

  // ============================================
  // Clipboard
  // ============================================

  /** The clipboard text if it is exactly one of the app's DLN links, else null. */
  async checkClipboard(): Promise<string | null> {
    if (!DeepLinkNowModule) {
      return null;
    }
    try {
      const content = await DeepLinkNowModule.checkClipboard();
      return typeof content === "string" && content ? content : null;
    } catch (e) {
      this.warn("checkClipboard failed:", toDLNError(e).code);
      return null;
    }
  }

  /** Cheap "is there probably a link on the clipboard" check. Never shows a paste prompt. */
  async hasDeepLinkToken(): Promise<boolean> {
    if (!DeepLinkNowModule) {
      return false;
    }
    try {
      return (await DeepLinkNowModule.hasDeepLinkToken()) === true;
    } catch (e) {
      this.warn("hasDeepLinkToken failed:", toDLNError(e).code);
      return false;
    }
  }

  // ============================================
  // Parsing
  // ============================================

  /**
   * Parses a link on the app's domains (synchronous). Returns `{ path, queryParams,
   * fullPath, url }` (plus the deprecated `parameters`), or null.
   */
  parseDeepLink(url: string): ParsedDeepLink | null {
    if (!DeepLinkNowModule) {
      return parseDeepLinkJS(url, this.fallbackDomains);
    }
    let r: unknown;
    try {
      r = DeepLinkNowModule.parseDeepLink(url);
    } catch (e) {
      this.warn(
        "parseDeepLink failed:",
        (e as Error | null | undefined)?.message
      );
      return null;
    }
    if (r === null || r === undefined || !isParsedDeepLinkShape(r)) {
      return null;
    }
    const { queryParams } = r;
    return {
      path: r.path,
      queryParams,
      fullPath: typeof r.fullPath === "string" ? r.fullPath : r.path,
      url: typeof r.url === "string" ? r.url : url,
      parameters: toLegacyParameters(queryParams),
    };
  }

  /** Whether `host` is one of the app's link domains (the rule used by parseDeepLink). */
  isValidDomain(host: string): boolean {
    if (!DeepLinkNowModule) {
      return isTrustedHost(host, this.fallbackDomains);
    }
    try {
      return DeepLinkNowModule.isValidDomain(host) === true;
    } catch {
      return false;
    }
  }

  // ============================================
  // JS REST fallback (no native module)
  // ============================================

  private baseUrl(): string {
    const raw = String(this.config.baseUrl || DEFAULTS.baseUrl).replace(
      /\/+$/,
      ""
    );
    const m = /^(https?):\/\/([^/?#]+)/i.exec(raw);
    if (!m) {
      throw new DLNError("badRequest", `Invalid baseUrl: ${raw}`);
    }
    const host = normalizeHost(m[2]);
    if (m[1].toLowerCase() !== "https" && !(host && DEV_HOSTS.has(host))) {
      throw new DLNError(
        "badRequest",
        "baseUrl must use HTTPS (http is allowed only for localhost, 127.0.0.1 and 10.0.2.2)"
      );
    }
    return raw;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const timeoutMs = Math.max(
      1,
      Number(this.config.timeoutMs) || DEFAULTS.timeoutMs
    );
    const controller =
      typeof AbortController === "undefined" ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(
          new DLNError("network", `Request timed out after ${timeoutMs} ms`)
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        fetch(url, { ...init, signal: controller?.signal }),
        timeout,
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async request(
    endpoint: string,
    method: "GET" | "POST",
    body?: unknown
  ): Promise<unknown> {
    const url = `${this.baseUrl()}/api/v1/sdk/${endpoint}`;
    const retries = Math.max(
      0,
      Math.floor(Number(this.config.retryAttempts ?? 0))
    );
    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        res = await this.fetchWithTimeout(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey ?? "",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        const err =
          e instanceof DLNError
            ? e
            : new DLNError(
                "network",
                (e as Error | null | undefined)?.message ?? "Network error",
                {
                  cause: e,
                }
              );
        if (attempt < retries) {
          this.log(`${endpoint}: ${err.code}, retrying`);
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw err;
      }

      let text = "";
      try {
        text = await res.text();
      } catch {
        text = "";
      }
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }

      if (res.ok) {
        if (!json || typeof json !== "object") {
          throw new DLNError(
            "invalidResponse",
            `Unparseable response from ${endpoint}`,
            { status: res.status }
          );
        }
        return json;
      }

      const payload = json as
        | { error?: unknown; message?: unknown }
        | null
        | undefined;
      const serverMessage =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.message === "string"
            ? payload.message
            : undefined;
      const transient = res.status >= 500 || res.status === 429;
      if (transient && attempt < retries) {
        let delay = 500 * 2 ** attempt;
        const header = res.headers?.get?.("retry-after");
        const retryAfter =
          header === null || header === undefined ? Number.NaN : Number(header);
        if (Number.isFinite(retryAfter) && retryAfter >= 0) {
          delay = Math.min(5000, retryAfter * 1000);
        }
        this.log(`${endpoint}: HTTP ${res.status}, retrying in ${delay} ms`);
        await sleep(delay);
        continue;
      }
      throw new DLNError(
        codeForStatus(res.status, serverMessage),
        serverMessage ?? `HTTP ${res.status}`,
        { status: res.status, serverMessage }
      );
    }
  }

  private async restMatch(): Promise<MatchResponse> {
    const fingerprint = this.getFingerprint();
    this.log("fingerprint step: requesting /match");
    const res = await this.request("match", "POST", { fingerprint });
    if (!isMatchResponseShape(res)) {
      throw new DLNError("invalidResponse", "Unexpected /match response");
    }
    const out = res as MatchResponse;
    out.matches = out.matches.map((m) =>
      m.match_quality
        ? m
        : { ...m, match_quality: qualityForScore(m.confidence_score) }
    );
    this.log(`fingerprint step: ${out.matches.length} candidate(s)`);
    return out;
  }

  private getFingerprint(): Fingerprint {
    const os = Platform.OS === "ios" ? "ios" : "android";

    let osVersion = String(Platform.Version);
    if (os === "ios") {
      try {
        osVersion = nativeModules?.PlatformConstants?.osVersion || osVersion;
      } catch {
        // keep major version
      }
    }

    let language = "en-US";
    let timezone = "UTC";
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions();
      if (resolved.locale) {
        language = resolved.locale.replace(/_/g, "-");
      }
      if (resolved.timeZone) {
        timezone = resolved.timeZone;
      }
    } catch {
      // defaults
    }

    let screenWidth: number | undefined;
    let screenHeight: number | undefined;
    let pixelRatio: number | undefined;
    try {
      const { Dimensions } = require("react-native");
      const win = Dimensions.get("window");
      // Logical points, like window.screen on the web.
      screenWidth = win.width;
      screenHeight = win.height;
      pixelRatio = Dimensions.get("screen").scale ?? win.scale;
    } catch {
      // unknown
    }

    const deviceModel = os === "ios" ? "iPhone" : "Android";
    const userAgent =
      os === "ios"
        ? `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVersion.replace(/\./g, "_")} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${osVersion} Mobile/15E148 Safari/604.1`
        : `Mozilla/5.0 (Linux; Android ${osVersion}; ${deviceModel}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36`;

    return {
      user_agent: userAgent,
      platform: os,
      os_version: osVersion,
      device_model: deviceModel,
      language,
      timezone,
      installed_at: this.installTime,
      last_opened_at: new Date().toISOString(),
      // No native code: no install-scoped ID is available in the fallback.
      device_id: null,
      advertising_id: null,
      vendor_id: null,
      hardware_fingerprint: this.hardwareFingerprint([
        os,
        osVersion,
        String(screenWidth),
        String(screenHeight),
        String(pixelRatio),
        language,
        timezone,
      ]),
      screen_width: screenWidth,
      screen_height: screenHeight,
      pixel_ratio: pixelRatio,
    };
  }

  private hardwareFingerprint(components: string[]): string {
    const str = components.join("|");
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return (hash >>> 0).toString(16);
  }
}

const deepLinkNow = new DeepLinkNow();

/**
 * The deferred deep link as React state (RN-31). Runs `checkDeferredDeepLink` once per app
 * process (initializing first when you pass `apiKey` and the SDK isn't initialized), and
 * shares that one check with the Expo Router helper. `link` stays set until you call
 * `clear()`, so you can navigate once the user has signed in.
 *
 * ```tsx
 * const { link, clear } = useDeferredDeepLink({ apiKey: "YOUR_API_KEY" });
 * useEffect(() => {
 *   if (link && isSignedIn) { clear(); navigate(link.fullPath); }
 * }, [link, isSignedIn]);
 * ```
 */
export function useDeferredDeepLink(
  options?: UseDeferredDeepLinkOptions
): UseDeferredDeepLinkResult {
  return useDeferredDeepLinkFor(deepLinkNow, options);
}

export default deepLinkNow;
