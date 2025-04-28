# DeepLinkNow React Native SDK Documentation

## Overview

DeepLinkNow React Native SDK provides deferred deep linking capabilities for React Native applications. This SDK allows you to match users who clicked on your deep links on the web before they installed your app, and route them to the correct content when they open your app for the first time.

## Requirements

- React Native 0.60 or higher
- iOS or Android platform

## Installation

```sh
npm install @deeplinknow/react-native
# or
yarn add @deeplinknow/react-native
# or
bun add @deeplinknow/react-native
```

## Getting Started

### Initialize the SDK

The first step is to initialize the SDK with your API key from the DeepLinkNow dashboard:

```typescript
import DeepLinkNow from "@deeplinknow/react-native";

// Initialize with basic configuration
await DeepLinkNow.initialize("your-api-key");

// Or with advanced configuration
await DeepLinkNow.initialize("your-api-key", {
  enableLogs: true, // Optional: Enable detailed logging for debugging
});
```

Initialization loads your app's valid domains and configuration from the DeepLinkNow servers. This includes your app's default domains (`yourapp.deeplinknow.com` and `yourapp.deeplink.now`) as well as any verified custom domains you've configured in your dashboard.

### Deferred Deep Linking

To check for deferred deep links, call `findDeferredUser()` at the appropriate time in your app's lifecycle (typically during initial launch or onboarding):

```typescript
const checkDeferredDeepLink = async () => {
  const matchResponse = await DeepLinkNow.findDeferredUser();

  if (matchResponse && matchResponse.matches.length > 0) {
    // Sort matches by confidence score (highest first) if needed
    const bestMatch = matchResponse.matches[0];

    console.log("Confidence score:", bestMatch.confidence_score);

    // Check if there's a deep link to handle
    if (bestMatch.deeplink) {
      console.log("Target URL:", bestMatch.deeplink.target_url);
      console.log("Metadata:", bestMatch.deeplink.metadata);

      // Route user to the appropriate screen based on the deep link
      navigateToDeepLink(bestMatch.deeplink.target_url);
    }

    // You can also check match details to see what parameters matched
    console.log("Match details:", bestMatch.match_details);
  } else {
    console.log("No deferred deep links found");
  }
};
```

### Confidence Scores

DeepLinkNow uses a confidence scoring system to rate the quality of matches:

- **HIGH (75+)**: Strong match with same IP, recent activity, matching device and locale
- **MEDIUM (50-74)**: Moderate match with same IP but some mismatches or longer time gap
- **LOW (25-49)**: Weak match with different IP but other factors match

You can use these scores to determine how to handle matches:

```typescript
import { CONFIDENCE_THRESHOLDS } from "@deeplinknow/react-native";

const handleMatch = (match) => {
  if (match.confidence_score >= CONFIDENCE_THRESHOLDS.HIGH) {
    // Automatically route to deep link
    navigateToDeepLink(match.deeplink.target_url);
  } else if (match.confidence_score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    // Ask user to confirm
    showConfirmationDialog(match.deeplink.target_url);
  } else {
    // Log but don't take action
    console.log("Low confidence match found:", match);
  }
};
```

### Clipboard Checking

If you don't find a fingerprinted user with `findDeferredUser()`, you can optionally check the user's clipboard for a copied DeepLinkNow link:

```typescript
const checkForClipboardLinks = async () => {
  // First, ask for clipboard permission from the user (implement your own permission flow)
  const hasPermission = await requestClipboardPermission();

  if (hasPermission) {
    const clipboardLink = await DeepLinkNow.checkClipboard();

    if (clipboardLink) {
      console.log("Found deep link in clipboard:", clipboardLink);

      // Parse the deep link
      const parsedLink = DeepLinkNow.parseDeepLink(clipboardLink);
      if (parsedLink) {
        console.log("Path:", parsedLink.path);
        console.log("Parameters:", parsedLink.parameters);

        // Navigate to the appropriate screen
        handleDeepLink(parsedLink);
      }
    } else {
      console.log("No deep links found in clipboard");
    }
  }
};
```

Note: Always ask for user permission before accessing the clipboard, and follow platform-specific best practices for accessing clipboard data.

### Handling Deep Links

The SDK provides a utility to parse deep links from your domains:

```typescript
const handleIncomingLink = (url) => {
  const parsedLink = DeepLinkNow.parseDeepLink(url);

  if (parsedLink) {
    const { path, parameters } = parsedLink;

    // Handle different paths
    switch (path) {
      case "/product":
        const productId = parameters.id;
        navigateToProduct(productId);
        break;
      case "/category":
        navigateToCategory(parameters.name);
        break;
      default:
        console.log("Unknown path:", path);
    }
  }
};
```

## Advanced Features

### Domain Validation

The SDK automatically validates deep links against your app's domains:

- `yourapp.deeplinknow.com`
- `yourapp.deeplink.now`
- Any verified custom domains configured in your dashboard

### Error Handling

The SDK uses a graceful error handling approach, returning `null` for failed operations rather than throwing exceptions:

```typescript
try {
  // Initialize SDK
  await DeepLinkNow.initialize("your-api-key");

  // Check for deferred users
  const matchResponse = await DeepLinkNow.findDeferredUser();
  if (!matchResponse) {
    console.warn("Failed to find deferred users");
  }

  // Check clipboard
  const clipboardLink = await DeepLinkNow.checkClipboard();
  if (!clipboardLink) {
    console.log("No deep links in clipboard");
  }
} catch (error) {
  console.error("Unexpected error:", error);
}
```

Enable logging for detailed debugging information:

```typescript
await DeepLinkNow.initialize("your-api-key", {
  enableLogs: true,
});
```

## API Reference

### DeepLinkNow.initialize(apiKey: string, config?: DeepLinkNowConfig)

Initializes the SDK with your API key and optional configuration.

**Parameters:**

- `apiKey`: Your API key from the DeepLinkNow dashboard
- `config`: Optional configuration object
  - `enableLogs`: Boolean to enable detailed logging
  - `customDomain`: String for a custom API domain

**Returns:** Promise that resolves when initialization is complete

### DeepLinkNow.findDeferredUser(): Promise<MatchResponse | null>

Attempts to match the current device with a user who clicked on your deep link before installing.

**Returns:** Promise that resolves to a MatchResponse object or null if no match is found

### DeepLinkNow.checkClipboard(): Promise<string | null>

Checks the device's clipboard for a valid DeepLinkNow link.

**Returns:** Promise that resolves to the deep link URL if found, or null if not found

### DeepLinkNow.parseDeepLink(url: string): { path: string; parameters: Record<string, string> } | null

Parses a deep link URL into its path and query parameters.

**Parameters:**

- `url`: The deep link URL to parse

**Returns:** An object containing path and parameters, or null if the URL isn't valid

### DeepLinkNow.isValidDomain(domain: string): boolean

Checks if a domain is valid for your app.

**Parameters:**

- `domain`: The domain to check

**Returns:** Boolean indicating if the domain is valid

## Types

### DeepLinkNowConfig

```typescript
interface DeepLinkNowConfig {
  enableLogs?: boolean;
  apiKey?: string;
  customDomain?: string;
}
```

### MatchResponse

```typescript
type MatchResponse = {
  matches: Match[];
  ttl_seconds: number;
};

type Match = {
  confidence_score: number;
  match_details: MatchDetails;
  deeplink?: DeeplinkMatch;
};
```

### DeeplinkMatch

```typescript
type DeeplinkMatch = {
  id: string;
  target_url: string;
  metadata: Record<string, any>;
  campaign_id?: string;
  matched_at: string;
  expires_at: string;
};
```

### MatchDetails

```typescript
type MatchDetails = {
  ip_match: MatchComponentDetails;
  device_match: DeviceMatchDetails;
  time_proximity: TimeProximityDetails;
  locale_match: LocaleMatchDetails;
};
```

## Best Practices

1. **Initialize Early**: Initialize the SDK as early as possible in your app lifecycle
2. **Permission Management**: Always request permission before accessing the clipboard
3. **Error Handling**: Implement proper error handling for all async operations
4. **Confidence Thresholds**: Use confidence scores to determine how to handle matches
5. **Logging**: Enable logs during development, disable in production

## Support

- Email: support@deeplinknow.com
- Documentation: [docs.deeplinknow.com](https://docs.deeplinknow.com)
- Website: [deeplinknow.com](https://deeplinknow.com)

## License

MIT
