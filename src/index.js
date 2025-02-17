import { Platform, NativeModules } from "react-native";
class DeepLinkNow {
  apiKey = null;
  config = {
    enableLogs: false,
  };
  installTime = new Date().toISOString();
  log(...args) {
    if (this.config.enableLogs) {
      console.log("[DeepLinkNow]", ...args);
    }
  }
  warn(...args) {
    console.warn("[DeepLinkNow]", ...args);
  }
  async getFingerprint() {
    const deviceModel = Platform.select({
      ios: NativeModules.DeviceInfo?.deviceName || "unknown",
      android: NativeModules.DeviceInfo?.model || "unknown",
    });
    return {
      user_agent: `DeepLinkNow-ReactNative/${Platform.OS}`,
      platform: Platform.OS === "ios" ? "ios" : "android",
      os_version: String(Platform.Version),
      device_model: deviceModel,
      language: Intl.DateTimeFormat().resolvedOptions().locale || "en",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      installed_at: this.installTime,
      last_opened_at: new Date().toISOString(),
      device_id: null,
      advertising_id: null,
      vendor_id: null,
      hardware_fingerprint: null,
    };
  }
  async makeRequest(endpoint, options = {}) {
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
      return data;
    } catch (error) {
      this.warn("API request failed:", error);
      return null;
    }
  }
  initialize(apiKey, config) {
    if (!apiKey || typeof apiKey !== "string") {
      this.warn("Invalid API key provided");
      return;
    }
    this.apiKey = apiKey;
    this.config = {
      ...this.config,
      ...config,
    };
    this.log("Initialized with config:", this.config);
  }
  async findDeferredUser() {
    this.log("Finding deferred user...");
    const fingerprint = await this.getFingerprint();
    const matchRequest = {
      fingerprint,
    };
    this.log("Sending match request:", matchRequest);
    const response = await this.makeRequest("match", {
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
