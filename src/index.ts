import { requireNativeModule } from "expo-modules-core";
import { NativeModules, Platform } from "react-native";

import type { Fingerprint, InitResponse, MatchResponse } from "./types";

// Import the Expo module
const DeepLinkNowModule = requireNativeModule("DeepLinkNow");

// Platform-specific modules for locale/timezone
const { Locale, TimeZone } = NativeModules;

// Export all types that consumers might need
export type {
  DeeplinkMatch,
  Fingerprint,
  FingerprintMatch,
  InitResponse,
  MatchRequestBody,
  MatchResponse,
} from "./types";

export interface DeepLinkNowConfig {
  enableLogs?: boolean;
  apiKey?: string;
}

export type DeferredUserResponse = MatchResponse;

export interface ReferrerData {
  referrerString: string;
  fpId?: string;
  deeplinkId?: string;
  deeplinkData?: ReferrerDeeplinkMatch;
  processedAt: number;
}

export interface ReferrerDeeplinkMatch {
  id: string;
  targetUrl: string;
  metadata: Record<string, any>;
  campaignId?: string;
  matchedAt: string;
  expiresAt: string;
}

class DeepLinkNow {
  private apiKey: string | null = null;
  private config: DeepLinkNowConfig = {
    enableLogs: false,
  };
  private installTime: string = new Date().toISOString();

  private validDomains: Set<string> = new Set([]);

  private log(...args: any[]) {
    if (this.config.enableLogs) {
      console.log("[DeepLinkNow]", ...args);
    }
  }

  private warn(...args: any[]) {
    console.warn("[DeepLinkNow]", ...args);
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

    // Initialize native SDKs
    if (DeepLinkNowModule) {
      try {
        await DeepLinkNowModule.initialize(
          apiKey,
          this.config.enableLogs || false,
        );
        this.log("Successfully initialized native SDK");
      } catch (error) {
        this.warn("Failed to initialize native SDK:", error);
      }
    }

    // Also initialize via REST API for domain validation
    const response = await this.makeRequest<InitResponse>("init", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (response) {
      const appName = response.app.alias;

      // Set up the base domains
      this.validDomains.add(`${appName}.deeplinknow.com`);
      this.validDomains.add(`${appName}.deeplink.now`);

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

  async hasDeepLinkToken(): Promise<boolean> {
    try {
      const content = await DeepLinkNowModule.getClipboardString();
      return content?.startsWith("dln://") ?? false;
    } catch (e) {
      this.warn("Failed to check clipboard:", e);
      return false;
    }
  }

  async checkClipboard(): Promise<string | null> {
    if (!this.apiKey) {
      this.warn("SDK not initialized. Call initialize() first");
      return null;
    }

    // Use native SDK if available
    if (DeepLinkNowModule) {
      try {
        const content = await DeepLinkNowModule.checkClipboard();
        if (content) {
          this.log("Found deep link token in clipboard via native SDK");
          return content;
        }
      } catch (error) {
        this.warn("Failed to check clipboard via native SDK:", error);
      }
    }

    // Fallback to manual clipboard check
    try {
      const content = await DeepLinkNowModule.getClipboardString();
      // example content = https://test-app.deeplinknow.com/params?1234n4
      const domain = content?.split("://")?.[1]?.split("/")?.[0];
      if (
        domain &&
        (domain?.includes("deeplinknow.com") ||
          domain?.includes("deeplink.now") ||
          this.validDomains.has(domain))
      ) {
        this.log("Found deep link token in clipboard");
        return content;
      }
    } catch (e) {
      this.warn("Failed to read clipboard:", e);
    }

    return null;
  }

  parseDeepLink(
    url: string,
  ): { path: string; parameters: Record<string, string> } | null {
    // Use native SDK if available
    if (DeepLinkNowModule) {
      try {
        const result = DeepLinkNowModule.parseDeepLink(url);
        if (result) {
          return result;
        }
      } catch (error) {
        this.warn("Failed to parse deep link via native SDK:", error);
      }
    }

    // Fallback to manual parsing
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

  private async getFingerprint(): Promise<Fingerprint> {
    // Get device model using simple platform detection
    const platform = Platform.OS;
    const deviceModel =
      platform === "ios"
        ? "iPhone" // In React Native, we can assume iPhone as default iOS device
        : platform === "android"
          ? "Android"
          : "unknown";

    // Get OS version
    // On iOS, Platform.Version is a number (e.g., 17), so we need to get the full version string
    // On Android, Platform.Version is already a string (e.g., "14")
    let osVersion: string;
    if (Platform.OS === "ios") {
      // Try to get full iOS version from PlatformConstants (e.g., "17.4.1")
      try {
        osVersion =
          NativeModules.PlatformConstants?.osVersion || String(Platform.Version);
      } catch (e) {
        osVersion = String(Platform.Version);
        this.warn("Failed to get full iOS version, using major version:", e);
      }
    } else {
      osVersion = String(Platform.Version);
    }

    // Get full locale identifier (e.g., "en-US" instead of just "en") to match web/iOS/Android format
    let language = "en-US";
    try {
      // First try Intl API which should return full locale like "en-US"
      if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
        const locale = Intl.DateTimeFormat().resolvedOptions().locale;
        if (locale) {
          language = locale;
        }
      }
      // Fallback to platform-specific methods if Intl doesn't work
      else if (Locale && typeof Locale.getDefault === "function") {
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
          "en-US";
      } else if (Platform.OS === "android" && NativeModules.I18nManager) {
        language = NativeModules.I18nManager.localeIdentifier || "en-US";
      }
    } catch (e) {
      this.warn("Failed to get language:", e);
      language = "en-US"; // Fallback to en-US
    }

    // Get timezone using platform-specific reliable methods
    let timezone = "UTC";
    try {
      // First try Intl API which should work on most modern environments
      if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) {
          timezone = tz;
        }
      }
      // Fallback to platform-specific methods if Intl doesn't work
      else if (TimeZone && typeof TimeZone.getDefault === "function") {
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
      const scale = Dimensions.get("screen").scale;

      // Use LOGICAL pixels (CSS pixels) to match web behavior
      // window.screen.width on iOS Safari returns logical/CSS pixels, NOT physical
      // Database analysis: production stores 393×852 (logical), not 1179×2556 (physical)
      // Example: iPhone 14 Pro logical=393, physical=393×3=1179
      screenWidth = window.width;
      screenHeight = window.height;
      pixelRatio = scale;
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

  async findDeferredUser(): Promise<MatchResponse | null> {
    this.log("Finding deferred user...");

    // Use native SDK if available
    if (DeepLinkNowModule) {
      try {
        const response = await DeepLinkNowModule.findDeferredUser();
        if (response) {
          this.log("Native SDK match response:", response);
          return response;
        }
      } catch (error) {
        this.warn("Failed to find deferred user via native SDK:", error);
      }
    }

    // Fallback to REST API
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

  async checkDeferredDeepLink(): Promise<ReferrerDeeplinkMatch | null> {
    if (!this.apiKey) {
      this.warn("SDK not initialized. Call initialize() first");
      return null;
    }

    // Only process referrer on Android
    if (Platform.OS !== "android") {
      this.log("Install referrer only available on Android");
      return null;
    }

    if (!DeepLinkNowModule) {
      this.warn("DeepLinkNow native module not found");
      return null;
    }

    try {
      this.log("Checking for deferred deep link...");

      const referrerData: ReferrerData | null =
        await DeepLinkNowModule.processInstallReferrer(
          this.apiKey,
          this.config.enableLogs || false,
        );

      if (referrerData?.deeplinkData) {
        this.log("Found deferred deep link:", referrerData.deeplinkData);
        return referrerData.deeplinkData;
      }
      this.log("No deferred deep link found");
      return null;
    } catch (e) {
      this.warn("Failed to check deferred deep link:", e);
      return null;
    }
  }

  async getReferrerData(): Promise<ReferrerData | null> {
    if (!this.apiKey) {
      this.warn("SDK not initialized. Call initialize() first");
      return null;
    }

    // Only process referrer on Android
    if (Platform.OS !== "android") {
      this.log("Install referrer only available on Android");
      return null;
    }

    if (!DeepLinkNowModule) {
      this.warn("DeepLinkNow native module not found");
      return null;
    }

    try {
      this.log("Getting referrer data...");

      const referrerData: ReferrerData | null =
        await DeepLinkNowModule.getCachedReferrerData();

      if (referrerData) {
        this.log("Found referrer data:", referrerData);
        return referrerData;
      }
      this.log("No referrer data found");
      return null;
    } catch (e) {
      this.warn("Failed to get referrer data:", e);
      return null;
    }
  }

  async clearReferrerCache(): Promise<boolean> {
    if (!this.apiKey) {
      this.warn("SDK not initialized. Call initialize() first");
      return false;
    }

    // Only process referrer on Android
    if (Platform.OS !== "android") {
      this.log("Install referrer only available on Android");
      return false;
    }

    if (!DeepLinkNowModule) {
      this.warn("DeepLinkNow native module not found");
      return false;
    }

    try {
      this.log("Clearing referrer cache...");

      const result: boolean = await DeepLinkNowModule.clearReferrerCache();

      if (result) {
        this.log("Referrer cache cleared successfully");
      } else {
        this.warn("Failed to clear referrer cache");
      }

      return result;
    } catch (e) {
      this.warn("Failed to clear referrer cache:", e);
      return false;
    }
  }
}

export default new DeepLinkNow();
