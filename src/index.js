import { Platform, NativeModules } from "react-native";
// We need to get these from NativeModules since they're platform-specific
const { Locale, TimeZone } = NativeModules;
class DeepLinkNow {
    apiKey = null;
    config = {
        enableLogs: false,
    };
    installTime = new Date().toISOString();
    validDomains = new Set([
        "deeplinknow.com",
        "deeplink.now",
    ]);
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
        // Get Android ID if on Android platform
        let deviceId = null;
        if (Platform.OS === "android" && NativeModules.DeviceInfo?.getAndroidId) {
            try {
                deviceId = await NativeModules.DeviceInfo.getAndroidId();
            }
            catch (e) {
                this.warn("Failed to get Android ID:", e);
            }
        }
        return {
            user_agent: Platform.OS === "android"
                ? `DLN-Android/${Platform.Version}`
                : `DeepLinkNow-ReactNative/${Platform.OS}`,
            platform: Platform.OS === "ios" ? "ios" : "android",
            os_version: String(Platform.Version),
            device_model: deviceModel,
            language: Locale.getDefault?.() ||
                Intl.DateTimeFormat().resolvedOptions().locale ||
                "en",
            timezone: TimeZone.getDefault?.() ||
                Intl.DateTimeFormat().resolvedOptions().timeZone,
            installed_at: this.installTime,
            last_opened_at: new Date().toISOString(),
            device_id: deviceId,
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
            const response = await fetch(`https://deeplinknow.com/api/v1/sdk/${endpoint}`, {
                ...options,
                headers: {
                    ...options.headers,
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey,
                },
            });
            const data = await response.json();
            if (!response.ok) {
                this.warn(`API request failed: ${response.status}`, data);
                return null;
            }
            return data;
        }
        catch (error) {
            this.warn("API request failed:", error);
            return null;
        }
    }
    async initialize(apiKey, config) {
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
        const response = await this.makeRequest("init", {
            method: "POST",
            body: JSON.stringify({ api_key: apiKey }),
        });
        if (response) {
            // Cache valid domains
            response.app.custom_domains
                .filter((domain) => domain.domain && domain.verified)
                .forEach((domain) => {
                if (domain.domain)
                    this.validDomains.add(domain.domain);
            });
            this.log("Init response:", response);
        }
        this.log("Initialized with config:", this.config);
    }
    isValidDomain(domain) {
        return this.validDomains.has(domain);
    }
    parseDeepLink(url) {
        try {
            const urlObj = new URL(url);
            if (!this.isValidDomain(urlObj.hostname)) {
                return null;
            }
            const parameters = {};
            urlObj.searchParams.forEach((value, key) => {
                parameters[key] = value;
            });
            return {
                path: urlObj.pathname,
                parameters,
            };
        }
        catch {
            return null;
        }
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
