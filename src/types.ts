/** A query parameter value (FLOW-53): a string, `true` for a flag (`?k` / `?k=`), or a list for repeated keys. */
export type QueryValue = string | true | string[];
export type QueryParams = Record<string, QueryValue>;

export type MatchQuality = "HIGH" | "MEDIUM" | "LOW";

/** Which signal produced a deferred deep link. */
export type DeferredDeepLinkSource = "referrer" | "clipboard" | "fingerprint";

/**
 * The deferred deep link returned by `checkDeferredDeepLink()` (camelCase on every platform).
 */
export interface DeferredDeepLink {
  campaignId?: string | null;
  /** 0-100. 100 for referrer and clipboard. */
  confidenceScore: number;
  deeplinkId?: string;
  expiresAt?: string;
  /** `/` + path + `?query` exactly as received. */
  fullPath: string;
  /** @deprecated Use `deeplinkId`. Kept for code written against the 1.1 referrer-only result. */
  id?: string;
  /** `match_details` from the server (fingerprint only). */
  matchDetails?: MatchDetails;
  matchedAt?: string;
  /** "HIGH" for referrer and clipboard. */
  matchQuality: MatchQuality;
  // biome-ignore lint/suspicious/noExplicitAny: public type; server metadata is arbitrary JSON and `unknown` would break consumers that read it.
  metadata?: Record<string, any>;
  /** `fullPath` up to the first `?`, not decoded, always starts with `/`. */
  path: string;
  queryParams: QueryParams;
  source: DeferredDeepLinkSource;
  targetUrl?: string;
  /** Absolute https URL of the link. */
  url: string;
}

export interface DeferredDeepLinkOptions {
  /** Ignore the "already checked" first-launch flag. */
  force?: boolean;
  /** Discard fingerprint candidates below this score. Off by default. */
  minConfidence?: number;
  /** iOS only: read the pasteboard first (default true). Ignored on Android. */
  useClipboard?: boolean;
}

/** Result of `parseDeepLink(url)`. */
export interface ParsedDeepLink {
  fullPath: string;
  /** @deprecated Use `queryParams`. Flat string map: last value wins, flags are "". */
  parameters: Record<string, string>;
  path: string;
  queryParams: QueryParams;
  url: string;
}

/** What a successful `initialize()` resolves with. */
export interface DLNAppInfo {
  accountStatus: string;
  alias: string;
  creditsRemaining: number | null;
  /** Trusted link domains: `{alias}.deeplinknow.com` + verified custom domains, lowercased. */
  domains: string[];
  id: string;
  rateLimits?: Record<string, number> | null;
}

/**
 * Base fingerprint type containing all possible fingerprint properties
 */
export interface Fingerprint {
  advertising_id: string | null;
  device_id: string | null;
  device_model: string;
  hardware_fingerprint: string | null;
  installed_at: string; // ISO 8601 datetime
  language: string;
  last_opened_at: string; // ISO 8601 datetime
  os_version: string;
  pixel_ratio?: number;
  platform: "ios" | "android";
  screen_height?: number;
  screen_width?: number;
  timezone: string;
  user_agent: string;
  vendor_id: string | null;
}

/**
 * Type for fingerprint data used in matching
 */
export interface FingerprintMatch {
  advertising_id: string | null;
  created_at: string; // ISO 8601 datetime
  device_id: string | null;
  device_model: string;
  expires_at: string; // ISO 8601 datetime
  hardware_fingerprint: string | null;
  ip_address: string;
  language: string;
  // biome-ignore lint/suspicious/noExplicitAny: public type; server metadata is arbitrary JSON and `unknown` would break consumers that read it.
  metadata?: Record<string, any>;
  os_version: string;
  platform: "ios" | "android";
  timezone: string;
  vendor_id: string | null;
}

/**
 * Detailed match information for each component of the fingerprint
 */
export interface MatchComponentDetails {
  matched: boolean;
  score: number;
}

/**
 * Device match component details
 */
export type DeviceMatchDetails = MatchComponentDetails & {
  components: {
    platform: boolean;
    os_version: boolean;
    device_model: boolean;
    hardware_fingerprint: boolean;
  };
};

/**
 * Locale match component details
 */
export type LocaleMatchDetails = MatchComponentDetails & {
  components: {
    language: boolean;
    timezone: boolean;
  };
};

/**
 * Time proximity details with actual time difference
 */
export interface TimeProximityDetails {
  score: number;
  time_difference_minutes: number;
}

/**
 * Complete match details for all components
 */
export interface MatchDetails {
  device_match: DeviceMatchDetails;
  ip_match: MatchComponentDetails;
  locale_match: LocaleMatchDetails;
  time_proximity: TimeProximityDetails;
}

/**
 * Request body for the match endpoint - exactly matches API requirements
 */
export type MatchRequestBody = Fingerprint;

/**
 * Deeplink information returned in a match
 */
export interface DeeplinkMatch {
  campaign_id?: string | null;
  expires_at: string;
  /** Raw path + query of the tapped link, e.g. `/products/123?ref=nl` (FLOW-51). Always present from current servers. */
  full_path?: string;
  id: string;
  matched_at: string;
  // biome-ignore lint/suspicious/noExplicitAny: public type; server metadata is arbitrary JSON and `unknown` would break consumers that read it.
  metadata: Record<string, any>;
  /** Query parameters of the tapped link (FLOW-53). Always present from current servers. */
  query_params?: QueryParams;
  /** Raw, for compatibility. Route on `full_path` / `query_params` instead (FLOW-55). */
  target_url: string;
}

/**
 * Individual match result with confidence score and details
 */
export interface Match {
  confidence_score: number;
  deeplink?: DeeplinkMatch;
  match_details: MatchDetails;
  /** Server label: HIGH >= 75, MEDIUM >= 50, LOW otherwise. Derived by the SDK if an older server omits it. */
  match_quality?: MatchQuality;
}

/**
 * Complete response from the match endpoint
 */
export interface MatchResponse {
  matches: Match[];
  ttl_seconds: number;
}

/**
 * Response from the init endpoint
 */
export interface InitResponse {
  account: {
    status: "active" | "suspended" | "expired";
    credits_remaining: number;
    rate_limits: {
      matches_per_second: number;
      matches_per_day: number;
    };
  };
  app: {
    android_sha256_certificates?: string[];
    id: string;
    alias: string;
    name: string;
    timezone: string;
    android_package_name: string | null;
    android_sha256_cert: string | null;
    ios_bundle_id: string | null;
    ios_app_store_id: string | null;
    ios_app_prefix: string | null;
    custom_domains: {
      domain: string | null;
      verified: boolean | null;
    }[];
  };
}

/**
 * Confidence score thresholds for match quality
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 75, // match_quality "HIGH"
  MEDIUM: 50, // match_quality "MEDIUM"
  LOW: 30, // match_quality "LOW" (the server never returns candidates below 30)
} as const;

export type ConfidenceLevel = keyof typeof CONFIDENCE_THRESHOLDS;

/**
 * Install referrer data for deferred deep linking
 */
export interface ReferrerData {
  deeplinkData?: ReferrerDeeplinkMatch;
  deeplinkId?: string;
  fpId?: string;
  processedAt: number;
  referrerString: string;
}

/** Deep link resolved from the Android install referrer (camelCase, as returned by the native module). */
export interface ReferrerDeeplinkMatch {
  campaignId?: string;
  expiresAt: string;
  fullPath?: string;
  id: string;
  matchedAt: string;
  // biome-ignore lint/suspicious/noExplicitAny: public type; server metadata is arbitrary JSON and `unknown` would break consumers that read it.
  metadata: Record<string, any>;
  queryParams?: QueryParams;
  targetUrl: string;
}

/**
 * Response from the referrer lookup endpoint
 */
export interface ReferrerLookupResponse {
  deeplink?: DeeplinkMatch;
  message?: string;
  success: boolean;
}
