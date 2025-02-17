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
