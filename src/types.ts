export type Fingerprint = {
  ip_address: string;
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
};

export type FingerprintMatch = {
  platform: "ios" | "android";
  os_version: string;
  device_model: string;
  language: string;
  timezone: string;
  created_at: string; // ISO 8601 datetime
  // These are used in the OR clause for finding matches
  device_id: string | null;
  advertising_id: string | null;
  vendor_id: string | null;
  hardware_fingerprint: string | null;
};

export type MatchRequestBody = {
  fingerprint: Omit<FingerprintMatch, "created_at">;
};

// Response types for completeness
export type DeeplinkMatch = {
  id: string; // UUID
  target_url: string;
  metadata: Record<string, any>;
  campaign_id?: string; // UUID
  matched_at: string; // ISO 8601 datetime
  expires_at: string; // ISO 8601 datetime
};

export type MatchResponse = {
  match: {
    deeplink?: DeeplinkMatch;
    confidence_score: number;
    ttl_seconds: number;
  };
};

export interface InitResponse {
  app: {
    id: string;
    name: string;
    timezone: string;
    android_package_name: string | null;
    android_sha256_cert: string | null;
    ios_bundle_id: string | null;
    ios_app_store_id: string | null;
    ios_app_prefix: string | null;
    custom_domains: Array<{
      domain: string | null;
      verified: boolean | null;
    }>;
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
