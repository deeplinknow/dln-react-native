# @deeplinknow/react-native

React Native SDK for DeepLink Now - handle deferred deep linking in your React Native app.

## Installation

### For Expo Managed Workflow

```sh
bun add @deeplinknow/react-native
// or
yarn add @deeplinknow/react-native
// or
npm install @deeplinknow/react-native
```

Add the plugin to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": ["@deeplinknow/react-native"]
  }
}
```

Prebuild isn't required for this package. It's a native module and will be automatically linked.

#### NB: This package is not compatible with Expo Go. It requires a full build of the app.

### For Bare React Native

```sh
bun add @deeplinknow/react-native
// or
yarn add @deeplinknow/react-native
// or
npm install @deeplinknow/react-native
```

#### iOS Setup

For iOS, the native module should be automatically linked. If you encounter issues, try:

```sh
cd ios && pod install
```

#### Android Setup

For Android, the native module should be automatically linked through auto-linking. If you encounter issues:

1. Make sure your `android/settings.gradle` includes:

```gradle
include ':@deeplinknow_react-native'
project(':@deeplinknow_react-native').projectDir = new File(rootProject.projectDir, '../node_modules/@deeplinknow/react-native/android')
```

2. Add to your `android/app/build.gradle`:

```gradle
dependencies {
    implementation project(':@deeplinknow_react-native')
}
```

### Requirements

- React Native 0.60 or later
- For Expo: SDK 47 or later
- iOS: iOS 11.0 or later
- Android: API level 21 or later

## Usage

```typescript
import DeepLinkNow from "@deeplinknow/react-native";

// Initialize the SDK
DeepLinkNow.initialize("your-api-key");
```

## API Reference

### initialize(apiKey: string, config?: DeepLinkNowConfig)

Initializes the SDK with your API key and optional configuration.

```typescript
type DeepLinkNowConfig = {
  enableLogs?: boolean; // Enable console logging for debugging
  customDomain?: string; // Custom domain for API endpoints
};

// Example
DeepLinkNow.initialize("your-api-key", {
  enableLogs: true,
});
```

### findDeferredUser(): Promise<MatchResponse | null>

Attempts to find deferred deep link matches for the current user. Returns an array of matches sorted by confidence score.

### checkDeferredDeepLink(): Promise<ReferrerDeeplinkMatch | null>

**Android Only** - Checks for deferred deep links using Google Play Install Referrer. This method processes the install referrer data and returns the original deep link that led to the app installation, if any.

```typescript
const deferredDeeplink = await DeepLinkNow.checkDeferredDeepLink();
if (deferredDeeplink) {
  console.log("User came from:", deferredDeeplink.targetUrl);
  console.log("Campaign:", deferredDeeplink.campaignId);
  // Navigate to the intended destination
}
```

### getReferrerData(): Promise<ReferrerData | null>

**Android Only** - Gets the raw install referrer data including the referrer string and parsed IDs.

```typescript
const referrerData = await DeepLinkNow.getReferrerData();
if (referrerData) {
  console.log("Referrer string:", referrerData.referrerString);
  console.log("Fingerprint ID:", referrerData.fpId);
  console.log("Deeplink ID:", referrerData.deeplinkId);
}
```

### clearReferrerCache(): Promise<boolean>

**Android Only** - Clears the cached install referrer data. Useful for testing or when you need to reprocess the referrer.

```typescript
type MatchResponse = {
  matches: Array<{
    confidence_score: number;
    match_details: {
      ip_match: { matched: boolean; score: number };
      device_match: {
        matched: boolean;
        score: number;
        components: {
          platform: boolean;
          os_version: boolean;
          device_model: boolean;
          hardware_fingerprint: boolean;
        };
      };
      time_proximity: {
        score: number;
        time_difference_minutes: number;
      };
      locale_match: {
        matched: boolean;
        score: number;
        components: {
          language: boolean;
          timezone: boolean;
        };
      };
    };
    deeplink?: {
      id: string;
      target_url: string;
      metadata: Record<string, any>;
      campaign_id?: string;
      matched_at: string;
      expires_at: string;
    };
  }>;
  ttl_seconds: number;
};

// Example
const response = await DeepLinkNow.findDeferredUser();
if (response?.matches.length > 0) {
  const bestMatch = response.matches[0];
  console.log("Confidence score:", bestMatch.confidence_score);
  console.log("Target URL:", bestMatch.deeplink?.target_url);
  console.log("Match details:", bestMatch.match_details);
}
```

Confidence scores are categorized as:

- HIGH: 75+ (Strong match: Same IP, recent, matching device and locale)
- MEDIUM: 50-74 (Moderate match: Same IP, longer time gap or some mismatches)
- LOW: 25-49 (Weak match: Different IP but other factors match)

### parseDeepLink(url: string): { path: string; parameters: Record<string, string> } | null

Parses a deep link URL if it's from a valid domain (deeplinknow.com or deeplink.now). Returns the path and parameters if valid, null otherwise.

```typescript
// Example
const result = DeepLinkNow.parseDeepLink(
  "https://deeplinknow.com/product/123?ref=email",
);
if (result) {
  console.log("Path:", result.path); // "/product/123"
  console.log("Parameters:", result.parameters); // { ref: "email" }
}
```

### Clipboard API (Internal)

The SDK uses native clipboard access for improved performance and reliability. This replaces the deprecated React Native Clipboard API.

- **iOS**: Uses `UIPasteboard` for native clipboard access
- **Android**: Uses `ClipboardManager` for native clipboard access
- **Fallback**: Falls back to community packages or React Native's built-in clipboard if native modules aren't available

The clipboard functionality is used internally by the SDK for fingerprint matching and is not exposed as a public API.

## Requirements

- React Native 0.60 or later
- For Expo: SDK 47 or later
- iOS: iOS 11.0 or later
- Android: API level 21 or later

## License

MIT
