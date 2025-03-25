import { Platform, NativeModules } from "react-native";
import type {
  MatchRequestBody,
  MatchResponse,
  Fingerprint,
  InitResponse,
} from "./types";

// We need to get these from NativeModules since they're platform-specific
const { Locale, TimeZone } = NativeModules;

// Export all types that consumers might need
export type {
  MatchRequestBody,
  MatchResponse,
  Fingerprint,
  DeeplinkMatch,
  FingerprintMatch,
  InitResponse,
} from "./types";

export interface DeepLinkNowConfig {
  enableLogs?: boolean;
  apiKey?: string;
  customDomain?: string;
}

export type DeferredUserResponse = MatchResponse;

class DeepLinkNow {
  private apiKey: string | null = null;
  private config: DeepLinkNowConfig = {
    enableLogs: false,
  };
  private installTime: string = new Date().toISOString();

  private validDomains: Set<string> = new Set([
    "deeplinknow.com",
    "deeplink.now",
  ]);

  private log(...args: any[]) {
    if (this.config.enableLogs) {
      console.log("[DeepLinkNow]", ...args);
    }
  }

  private warn(...args: any[]) {
    console.warn("[DeepLinkNow]", ...args);
  }

  private async getFingerprint(): Promise<Omit<Fingerprint, "ip_address">> {
    const deviceModel = Platform.select({
      ios: NativeModules.DeviceInfo?.deviceName || "unknown",
      android: NativeModules.DeviceInfo?.model || "unknown",
    });

    // Get Android ID if on Android platform
    let deviceId = null;
    if (Platform.OS === "android" && NativeModules.DeviceInfo?.getAndroidId) {
      try {
        deviceId = await NativeModules.DeviceInfo.getAndroidId();
      } catch (e) {
        this.warn("Failed to get Android ID:", e);
      }
    }

    return {
      user_agent:
        Platform.OS === "android"
          ? `DLN-Android/${Platform.Version}`
          : `DeepLinkNow-ReactNative/${Platform.OS}`,
      platform: Platform.OS === "ios" ? "ios" : "android",
      os_version: String(Platform.Version),
      device_model: deviceModel,
      language:
        Locale.getDefault?.() ||
        Intl.DateTimeFormat().resolvedOptions().locale ||
        "en",
      timezone:
        TimeZone.getDefault?.() ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      installed_at: this.installTime,
      last_opened_at: new Date().toISOString(),
      device_id: deviceId,
      advertising_id: null,
      vendor_id: null,
      hardware_fingerprint: null,
    };
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T | null> {
    if (!this.apiKey) {
      this.warn("SDK not initialized. Call initialize() first");
      return null;
    }

    try {
      const response = await fetch(
        `https://deeplinknow.com/api/v1/sdk/${endpoint}`,
        {
          ...options,
          headers: {
            ...options.headers,
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        this.warn(`API request failed: ${response.status}`, data);
        return null;
      }

      return data as T;
    } catch (error) {
      this.warn("API request failed:", error);
      return null;
    }
  }

  async initialize(apiKey: string, config?: DeepLinkNowConfig) {
    if (!apiKey || typeof apiKey !== "string") {
      this.warn("Invalid API key provided");
      return;
    }

    this.apiKey = apiKey;
    this.config = {
      ...this.config,
      ...config,
    };

    // Hit the /v1/sdk/init endpoint
    const response = await this.makeRequest<InitResponse>("init", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (response) {
      // Cache valid domains
      response.app.custom_domains
        .filter((domain) => domain.domain && domain.verified)
        .forEach((domain) => {
          if (domain.domain) this.validDomains.add(domain.domain);
        });

      this.log("Init response:", response);
    }

    this.log("Initialized with config:", this.config);
  }

  isValidDomain(domain: string): boolean {
    return this.validDomains.has(domain);
  }

  parseDeepLink(
    url: string,
  ): { path: string; parameters: Record<string, string> } | null {
    try {
      const urlObj = new URL(url);
      if (!this.isValidDomain(urlObj.hostname)) {
        return null;
      }

      const parameters: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        parameters[key] = value;
      });

      return {
        path: urlObj.pathname,
        parameters,
      };
    } catch {
      return null;
    }
  }

  async findDeferredUser(): Promise<MatchResponse | null> {
    this.log("Finding deferred user...");

    const fingerprint = await this.getFingerprint();

    const matchRequest: MatchRequestBody = {
      fingerprint,
    };

    this.log("Sending match request:", matchRequest);

    const response = await this.makeRequest<MatchResponse>("match", {
      method: "POST",
      body: JSON.stringify(matchRequest),
    });

    if (response) {
      this.log("Match response:", response);
    }

    return response;
  }
}

export default new DeepLinkNow();
