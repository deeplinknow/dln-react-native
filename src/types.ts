/**
 * Base fingerprint type containing all possible fingerprint properties
 */
export type Fingerprint = {
  user_agent: string;
  platform: "ios" | "android";
  os_version: string;
  device_model: string;
  language: string;
  timezone: string;
  installed_at: string; // ISO 8601 datetime
  last_opened_at: string; // ISO 8601 datetime
  device_id: string | null;
  advertising_id: string | null;
  vendor_id: string | null;
  hardware_fingerprint: string | null;
  pixel_ratio?: number;
  screen_height?: number;
  screen_width?: number;
};

/**
 * Type for fingerprint data used in matching
 */
export type FingerprintMatch = {
  ip_address: string;
  platform: "ios" | "android";
  os_version: string;
  device_model: string;
  language: string;
  timezone: string;
  created_at: string; // ISO 8601 datetime
  expires_at: string; // ISO 8601 datetime
  device_id: string | null;
  advertising_id: string | null;
  vendor_id: string | null;
  hardware_fingerprint: string | null;
  metadata?: Record<string, any>;
};

/**
 * Detailed match information for each component of the fingerprint
 */
export type MatchComponentDetails = {
  matched: boolean;
  score: number;
};

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
export type TimeProximityDetails = {
  score: number;
  time_difference_minutes: number;
};

/**
 * Complete match details for all components
 */
export type MatchDetails = {
  ip_match: MatchComponentDetails;
  device_match: DeviceMatchDetails;
  time_proximity: TimeProximityDetails;
  locale_match: LocaleMatchDetails;
};

/**
 * Request body for the match endpoint - exactly matches API requirements
 */
export type MatchRequestBody = Fingerprint;

/**
 * Deeplink information returned in a match
 */
export type DeeplinkMatch = {
  id: string;
  target_url: string;
  metadata: Record<string, any>;
  campaign_id?: string;
  matched_at: string;
  expires_at: string;
};

/**
 * Individual match result with confidence score and details
 */
export type Match = {
  confidence_score: number;
  match_details: MatchDetails;
  deeplink?: DeeplinkMatch;
};

/**
 * Complete response from the match endpoint
 */
export type MatchResponse = {
  matches: Match[];
  ttl_seconds: number;
};

/**
 * Response from the init endpoint
 */
export interface InitResponse {
  app: {
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
  account: {
    status: "active" | "suspended" | "expired";
    credits_remaining: number;
    rate_limits: {
      matches_per_second: number;
      matches_per_day: number;
    };
  };
}

/**
 * Confidence score thresholds for match quality
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 75, // Strong match: Same IP, recent, matching device and locale
  MEDIUM: 50, // Moderate match: Same IP, longer time gap or some mismatches
  LOW: 25, // Weak match: Different IP but other factors match
} as const;

export type ConfidenceLevel = keyof typeof CONFIDENCE_THRESHOLDS;

/**
 * Install referrer data for deferred deep linking
 */
export type ReferrerData = {
  referrerString: string;
  fpId?: string;
  deeplinkId?: string;
  deeplinkData?: DeeplinkMatch;
  processedAt: number;
};

/**
 * Response from the referrer lookup endpoint
 */
export type ReferrerLookupResponse = {
  success: boolean;
  deeplink?: DeeplinkMatch;
  message?: string;
};
