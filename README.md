# @deeplinknow/react-native

React Native SDK for DeepLink Now - handle deferred deep linking in your React Native app.

## Installation

```sh
bun add @deeplinknow/react-native
// or
yarn add @deeplinknow/react-native
// or
npm install @deeplinknow/react-native
```

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

## Requirements

- React Native 0.60 or later

## License

MIT
