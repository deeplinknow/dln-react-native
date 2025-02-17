export type Fingerprint = {
  ip_address: string;
  user_agent: string;
  platform: 'ios' | 'android';
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
  platform: 'ios' | 'android';
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
  fingerprint: Omit<FingerprintMatch, 'created_at'>;
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
