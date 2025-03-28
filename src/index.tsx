import { Platform, NativeModules } from "react-native";
import type { MatchResponse, Fingerprint, InitResponse } from "./types";

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

  private async getFingerprint(): Promise<Fingerprint> {
    // Get device model using simple platform detection
    const platform = Platform.OS;
    const deviceModel =
      platform === "ios"
        ? "iPhone" // In React Native, we can assume iPhone as default iOS device
        : platform === "android"
          ? "Android"
          : "unknown";

    // Get OS version directly from Platform.Version
    const osVersion = String(Platform.Version);

    // Get language and locale using platform-specific reliable methods
    let language = "en";
    try {
      if (Locale && typeof Locale.getDefault === "function") {
        const localeResult = Locale.getDefault();
        if (typeof localeResult === "string") {
          language = localeResult;
        }
      } else if (
        Platform.OS === "ios" &&
        NativeModules.SettingsManager?.settings
      ) {
        language =
          NativeModules.SettingsManager.settings.AppleLocale ||
          NativeModules.SettingsManager.settings.AppleLanguages?.[0] ||
          "en";
      } else if (Platform.OS === "android" && NativeModules.I18nManager) {
        language = NativeModules.I18nManager.localeIdentifier || "en";
      } else {
        language = Intl?.DateTimeFormat()?.resolvedOptions()?.locale || "en";
      }
    } catch (e) {
      this.warn("Failed to get language:", e);
      language = "en"; // Fallback to English
    }

    // Get timezone using platform-specific reliable methods
    let timezone = "UTC";
    try {
      if (TimeZone && typeof TimeZone.getDefault === "function") {
        const timezoneResult = TimeZone.getDefault();
        if (typeof timezoneResult === "string") {
          timezone = timezoneResult;
        }
      } else if (
        Platform.OS === "ios" &&
        NativeModules.SettingsManager?.settings
      ) {
        timezone =
          NativeModules.SettingsManager.settings.AppleTimeZone || "UTC";
      } else {
        timezone = Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone || "UTC";
      }
    } catch (e) {
      this.warn("Failed to get timezone:", e);
      timezone = "UTC"; // Fallback to UTC
    }

    // Get Android ID if on Android platform
    let deviceId = null;
    if (Platform.OS === "android") {
      try {
        if (NativeModules.DeviceInfo?.getAndroidId) {
          deviceId = await NativeModules.DeviceInfo.getAndroidId();
        }
      } catch (e) {
        this.warn("Failed to get Android ID:", e);
      }
    }

    // Get screen dimensions and pixel ratio
    let screenWidth;
    let screenHeight;
    let pixelRatio;

    try {
      const { Dimensions } = require("react-native");
      const window = Dimensions.get("window");
      screenWidth = window.width;
      screenHeight = window.height;
      pixelRatio = Dimensions.get("screen").scale;
    } catch (e) {
      this.warn("Failed to get screen dimensions:", e);
    }

    // Generate user agent string that matches web format
    const userAgent =
      Platform.select({
        ios: `Mozilla/5.0 (${deviceModel}; CPU ${Platform.OS} ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${osVersion} Mobile/15E148 Safari/604.1`,
        android: `Mozilla/5.0 (Linux; Android ${osVersion}; ${deviceModel}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36`,
      }) || `DeepLinkNow-ReactNative/${Platform.OS}`;

    // Generate hardware fingerprint
    const hardwareFingerprint = this.generateHardwareFingerprint(
      Platform.OS,
      screenWidth,
      screenHeight,
      pixelRatio,
      language,
      timezone,
    );

    return {
      user_agent: userAgent,
      platform: Platform.OS === "ios" ? "ios" : "android",
      os_version: osVersion,
      device_model: deviceModel,
      language,
      timezone,
      installed_at: this.installTime,
      last_opened_at: new Date().toISOString(),
      device_id: deviceId,
      advertising_id: null,
      vendor_id: null,
      hardware_fingerprint: hardwareFingerprint,
      screen_width: screenWidth,
      screen_height: screenHeight,
      pixel_ratio: pixelRatio,
    };
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  private generateHardwareFingerprint(
    platform: string,
    screenWidth: number | null,
    screenHeight: number | null,
    pixelRatio: number | null,
    language: string,
    timezone: string,
  ): string {
    const components = [
      platform,
      String(Platform.Version),
      String(screenWidth),
      String(screenHeight),
      String(pixelRatio),
      language,
      timezone,
    ];

    // Create a deterministic string from components
    const fingerprintString = components.join("|");

    return this.simpleHash(fingerprintString);
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
      response?.app?.custom_domains
        ?.filter(
          (domain: { domain: string | null; verified: boolean | null }) =>
            domain.domain && domain.verified,
        )
        ?.forEach(
          (domain: { domain: string | null; verified: boolean | null }) => {
            if (domain.domain) this.validDomains.add(domain.domain);
          },
        );

      this.log("Init response:", response);
      this.log("Successfully initialized with config:", this.config);
    }
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
    const matchRequest = {
      user_agent: fingerprint.user_agent,
      platform: fingerprint.platform,
      os_version: fingerprint.os_version,
      device_model: fingerprint.device_model,
      language: fingerprint.language,
      timezone: fingerprint.timezone,
      installed_at: fingerprint.installed_at,
      last_opened_at: fingerprint.last_opened_at,
      device_id: fingerprint.device_id,
      advertising_id: fingerprint.advertising_id,
      vendor_id: fingerprint.vendor_id,
      hardware_fingerprint: fingerprint.hardware_fingerprint,
      pixel_ratio: fingerprint.pixel_ratio,
      screen_height: fingerprint.screen_height,
      screen_width: fingerprint.screen_width,
    };

    this.log("Sending match request:", matchRequest);

    const response = await this.makeRequest<MatchResponse>("match", {
      method: "POST",
      body: JSON.stringify({ fingerprint: matchRequest }),
    });

    if (response) {
      this.log("Match response:", response);
    }

    return response;
  }
}

export default new DeepLinkNow();
