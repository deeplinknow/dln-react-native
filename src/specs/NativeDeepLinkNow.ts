import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

/**
 * TurboModule spec for the DeepLinkNow native module.
 *
 * Codegen uses this file to generate the native bindings (iOS `NativeDeepLinkNowSpecJSI`,
 * Android `com.deeplinknow.reactnative.NativeDeepLinkNowSpec`). The Expo module and the
 * legacy bridge module implement the same methods by hand (RN-02).
 *
 * Promise-returning methods reject with `code` set to one of the shared SDK error codes
 * (`notInitialized`, `invalidApiKey`, `accountInactive`, `noCredits`, `rateLimited`,
 * `badRequest`, `server`, `network`, `invalidResponse`) and, where available,
 * `userInfo.status` / `userInfo.serverMessage`.
 *
 * Note: File must be prefixed with "Native" for Codegen to work.
 */
export interface Spec extends TurboModule {
  // ============================================
  // Initialization
  // ============================================

  /**
   * Legacy (1.1): fire-and-forget init. Kept for compatibility; the JS layer uses
   * `initializeWithConfig`.
   */
  initialize(apiKey: string, enableLogs: boolean): Promise<boolean>;

  /**
   * Initialize the native SDK and wait for `/api/v1/sdk/init`.
   * @param config `{ enableLogs?: boolean, baseUrl?: string, timeoutMs?: number, retryAttempts?: number }`
   * @returns `DLNAppInfo` `{ id, alias, domains, accountStatus, creditsRemaining, rateLimits }`
   */
  initializeWithConfig(apiKey: string, config: Object): Promise<Object>;

  /** Whether a successful native initialization has completed (sync). */
  isInitialized(): boolean;

  // ============================================
  // Deferred Deep Linking
  // ============================================

  /**
   * Run the platform chain (iOS: pasteboard → fingerprint, Android: referrer → fingerprint).
   * @param options `{ minConfidence?: number, useClipboard?: boolean, force?: boolean }`
   * @returns camelCase `DeferredDeepLink` or null
   */
  checkDeferredDeepLink(options: Object): Promise<Object | null>;

  /** Clear the first-launch flag and the cached referrer (memory + disk). */
  resetDeferredDeepLink(): Promise<boolean>;

  /**
   * All fingerprint candidates from `/sdk/match`, in the server's snake_case wire shape
   * (`confidence_score`, `match_quality`, `match_details`, `deeplink.{target_url,query_params,full_path,…}`,
   * `ttl_seconds`).
   */
  findDeferredUser(): Promise<Object | null>;

  /** Android: await install-referrer processing and return the raw result. iOS: null. */
  getReferrerData(): Promise<Object | null>;

  // ============================================
  // Clipboard
  // ============================================

  /** The pasteboard text if it is one of the app's DLN links, else null. */
  checkClipboard(): Promise<string | null>;

  /** Cheap check that does not trigger a paste prompt. */
  hasDeepLinkToken(): Promise<boolean>;

  /** Internal helper. Not exposed by the JS API (RN-17). */
  getClipboardString(): Promise<string | null>;

  /** Internal helper. Not exposed by the JS API and never used by an SDK flow (RN-17, SDK-43). */
  setClipboardString(content: string): Promise<boolean>;

  /** Internal helper (sync). */
  hasClipboardString(): boolean;

  // ============================================
  // Deep Link Parsing
  // ============================================

  /**
   * Parse a link on the app's domains (sync).
   * @returns `{ path, queryParams, fullPath, url }` or null
   */
  parseDeepLink(url: string): Object | null;

  /** The native host rule (sync). */
  isValidDomain(host: string): boolean;

  // ============================================
  // Legacy Android-only (1.1); iOS returns null/false
  // ============================================

  /** @deprecated Arguments are ignored; use `getReferrerData`. */
  processInstallReferrer(
    apiKey: string,
    enableLogs: boolean
  ): Promise<Object | null>;

  /** Cached referrer data (sync). */
  getCachedReferrerData(): Object | null;

  /** @deprecated Clears the referrer cache (sync). Use `resetDeferredDeepLink`. */
  clearReferrerCache(): boolean;

  /** Cached referrer deep link (sync). */
  getDeferredDeepLink(): Object | null;
}

export default TurboModuleRegistry.get<Spec>("DeepLinkNow");
