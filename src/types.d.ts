export type Fingerprint = {
  ip_address: string;
  user_agent: string;
  platform: "ios" | "android";
  os_version: string;
  device_model: string;
  language: string;
  timezone: string;
  installed_at: string;
  last_opened_at: string;
  device_id: string | null;
  advertising_id: string | null;
  vendor_id: string | null;
  hardware_fingerprint: string | null;
  // Screen dimensions
  screen_width: number | null;
  screen_height: number | null;
  // Additional fingerprinting properties
  pixel_ratio: number | null;
  color_depth: number | null;
  browser_name: string | null;
  browser_version: string | null;
  is_tablet: boolean | null;
  connection_type: string | null;
  // Additional mobile-specific properties
  cookies_enabled: boolean | null;
  local_storage_available: boolean | null;
  session_storage_available: boolean | null;
  touch_support: boolean | null;
  cpu_cores: number | null;
  device_memory: number | null;
  // Add timestamp for tracking when fingerprint was generated
  created_at: string;
  // Add a property to identify this as a mobile fingerprint
  source: "mobile";
};
export type FingerprintMatch = {
  platform: "ios" | "android";
  os_version: string;
  device_model: string;
  language: string;
  timezone: string;
  created_at: string;
  device_id: string | null;
  advertising_id: string | null;
  vendor_id: string | null;
  hardware_fingerprint: string | null;
};
export type MatchRequestBody = {
  fingerprint: Omit<FingerprintMatch, "created_at">;
};
export type DeeplinkMatch = {
  id: string;
  target_url: string;
  metadata: Record<string, any>;
  campaign_id?: string;
  matched_at: string;
  expires_at: string;
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
